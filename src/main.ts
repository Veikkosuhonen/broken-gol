import "./style.css";
import shader from "./shader.wgsl?raw";
// @ts-expect-error
// import slang from "./shader.slang";

// console.log(slang);

async function main() {
  const canvasElement = document.querySelector<HTMLCanvasElement>("#canvas")!;
  const canvasSize = [canvasElement.width, canvasElement.height];

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });

  const device = await adapter!.requestDevice();

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
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  function createBindGroup(textureView: GPUTextureView) {
    console.log(bindGroupLayout);
    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: textureView },
        { binding: 2, resource: uniformBuffer },
      ],
    });
  }

  const uniformValues = new Float32Array([1]);

  let frameCount = 0;

  function render() {
    uniformValues[0] = canvasElement.width;
    // uniformValues[1] = canvasElement.height;
    // uniformValues[2] = performance.now() / 1000;

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
    });
    screenPass.setPipeline(screenPipeline);
    screenPass.setBindGroup(0, createBindGroup(writeTexture.createView()));
    screenPass.draw(3);
    screenPass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    frameCount++;
  }

  function animationFrame() {
    requestAnimationFrame(animationFrame);
    render();
  }

  render();

  // animationFrame();
}

main();
