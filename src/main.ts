import "./style.css";
import shader from "./shader.wgsl?raw";
// @ts-expect-error
// import slang from "./shader.slang";

// console.log(slang);

async function main() {
  const infoElement = document.querySelector<HTMLPreElement>("#info")!;
  const canvasElement = document.querySelector<HTMLCanvasElement>("#canvas")!;
  const canvasSize = [canvasElement.width, canvasElement.height];

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });

  const device = await adapter!.requestDevice({
    requiredFeatures: ["timestamp-query"],
  });

  const context = canvasElement.getContext("webgpu")!;
  if (!context) {
    throw new Error("WebGPU not supported");
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const module = device.createShaderModule({
    label: "shaders",
    code: shader,
  });

  function createPingPongTexture() {
    return device.createTexture({
      size: canvasSize,
      format: presentationFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  let textureA = createPingPongTexture();
  let textureB = createPingPongTexture();
  let readTexture = textureA;
  let writeTexture = textureB;

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  const texturePipeline = device.createRenderPipeline({
    label: "texture pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module,
      entryPoint: "fsQuadVS",
    },
    fragment: {
      module,
      entryPoint: "textureFs",
      targets: [{ format: presentationFormat }],
    },
  });

  const sampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  const screenPipeline = device.createRenderPipeline({
    label: "screen pipeline",
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module,
      entryPoint: "fsQuadVS",
    },
    fragment: {
      module,
      entryPoint: "screenFs",
      targets: [{ format: presentationFormat }],
    },
  });

  const uniformBuffer = device.createBuffer({
    label: "uniforms buffer",
    size: 4 * 6,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  function createBindGroup(textureView: GPUTextureView) {
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: textureView },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });
  }

  const uniformValues = new Float32Array([1, 1, 0, 0, 0]);

  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener("mousemove", (event) => {
    mouseX = event.clientX / window.innerWidth;
    mouseY = event.clientY / window.innerHeight;
  });

  const querySet = device.createQuerySet({
    type: "timestamp",
    count: 4,
  });

  const queryResolveBuffer = device.createBuffer({
    size: querySet.count * 8,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });

  const queryResultBuffer = device.createBuffer({
    size: queryResolveBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  let frameCount = 0;
  let startTime = performance.now();
  let gpuTime0 = 0;
  let gpuTime1 = 0;

  function render() {
    const jsTimeStart = performance.now();

    uniformValues[0] = canvasElement.width;
    uniformValues[1] = canvasElement.height;
    uniformValues[2] = mouseX;
    uniformValues[3] = mouseY;
    uniformValues[4] = frameCount;

    device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

    const encoder = device.createCommandEncoder({ label: "our encoder" });

    const texturePass = encoder.beginRenderPass({
      label: "our texture renderPass",
      colorAttachments: [
        {
          view: writeTexture.createView(),
          clearValue: [0, 0, 0, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      timestampWrites: {
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      },
    });
    texturePass.setPipeline(texturePipeline);
    texturePass.setBindGroup(0, createBindGroup(readTexture.createView()));
    texturePass.draw(3);
    texturePass.end();

    const screenPass = encoder.beginRenderPass({
      label: "our basic canvas renderPass",
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [1, 0, 1, 1],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      timestampWrites: {
        querySet,
        beginningOfPassWriteIndex: 2,
        endOfPassWriteIndex: 3,
      },
    });
    screenPass.setPipeline(screenPipeline);
    screenPass.setBindGroup(0, createBindGroup(writeTexture.createView()));
    screenPass.draw(3);
    screenPass.end();

    encoder.resolveQuerySet(querySet, 0, querySet.count, queryResolveBuffer, 0);
    if (queryResultBuffer.mapState === "unmapped") {
      encoder.copyBufferToBuffer(
        queryResolveBuffer,
        0,
        queryResultBuffer,
        0,
        queryResultBuffer.size,
      );
    }

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    if (queryResultBuffer.mapState === "unmapped") {
      queryResultBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const times = new BigInt64Array(queryResultBuffer.getMappedRange());
        gpuTime0 = Number(times[1] - times[0]) / 1e6;
        gpuTime1 = Number(times[3] - times[2]) / 1e6;
        queryResultBuffer.unmap();
      });
    }

    [readTexture, writeTexture] = [writeTexture, readTexture];
    frameCount++;
    const now = performance.now();
    const jsTime = now - jsTimeStart;
    const frameTime = now - startTime;
    const frameRate = 1000 / frameTime;
    startTime = now;
    infoElement.textContent = `FPS: ${frameRate.toFixed(2)} | JS Time: ${jsTime.toFixed(2)}ms | Frame Time: ${frameTime.toFixed(2)}ms | GPU Time: ${gpuTime0.toFixed(2)}ms + ${gpuTime1.toFixed(2)}ms`;
  }

  function animationFrame() {
    requestAnimationFrame(animationFrame);
    render();
  }

  animationFrame();
}

main();
