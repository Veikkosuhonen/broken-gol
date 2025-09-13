import "./style.css";
import shaderCode from "./shader.wgsl?raw";
import { createTimestampQueries } from "./query";
import { createShader } from "./shader";

// @ts-expect-error
// import slang from "./shader.slang";

// console.log(slang);

async function main() {
  const infoElement = document.querySelector<HTMLPreElement>("#info")!;
  const canvasElement = document.querySelector<HTMLCanvasElement>("#canvas")!;

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const canvas = entry.target as HTMLCanvasElement;
      const width = entry.contentBoxSize[0].inlineSize;
      const height = entry.contentBoxSize[0].blockSize;
      canvas.width = Math.max(
        1,
        Math.min(width, device.limits.maxTextureDimension2D),
      );
      canvas.height = Math.max(
        1,
        Math.min(height, device.limits.maxTextureDimension2D),
      );
    }
  });
  observer.observe(canvasElement);

  canvasElement.width = window.innerWidth;
  canvasElement.height = window.innerHeight;
  const canvasSize = [window.innerWidth, window.innerHeight];

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });

  const device = await adapter!.requestDevice({
    requiredFeatures: ["timestamp-query", "shader-f16"],
  });

  const context = canvasElement.getContext("webgpu")!;
  if (!context) {
    throw new Error("WebGPU not supported");
  }

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  console.log(presentationFormat);
  context.configure({
    device,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const shader = createShader(device, shaderCode);
  console.log(shader.defs);

  function createPingPongTexture() {
    return device.createTexture({
      size: canvasSize,
      format: presentationFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  const textureA = createPingPongTexture();
  const textureB = createPingPongTexture();
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
      module: shader.module,
      entryPoint: "fsQuadVS",
    },
    fragment: {
      module: shader.module,
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
      module: shader.module,
      entryPoint: "fsQuadVS",
    },
    fragment: {
      module: shader.module,
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

  const queries = createTimestampQueries({ device, count: 2 });

  const uniformValues = new Float32Array([1, 1, 0, 0, 0]);

  let mouseX = 0;
  let mouseY = 0;

  window.addEventListener("mousemove", (event) => {
    const rect = canvasElement.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width;
    mouseY = (event.clientY - rect.top) / rect.height; // Flip Y coordinate
  });

  let frameCount = 0;
  let startTime = performance.now();

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
      timestampWrites: queries.timeStampWrites[0],
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
      timestampWrites: queries.timeStampWrites[1],
    });
    screenPass.setPipeline(screenPipeline);
    screenPass.setBindGroup(0, createBindGroup(writeTexture.createView()));
    screenPass.draw(3);
    screenPass.end();

    queries.resolve(encoder);

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    [readTexture, writeTexture] = [writeTexture, readTexture];
    frameCount++;
    const now = performance.now();
    const jsTime = now - jsTimeStart;
    const frameTime = now - startTime;
    const frameRate = 1000 / frameTime;
    startTime = now;

    queries.read().then(([gpuTime0, gpuTime1]) => {
      infoElement.textContent = `FPS: ${frameRate.toFixed(2)} | JS Time: ${jsTime.toFixed(2)}ms | Frame Time: ${frameTime.toFixed(2)}ms | GPU Time: ${gpuTime0.toFixed(2)}ms + ${gpuTime1.toFixed(2)}ms`;
    });
  }

  function animationFrame() {
    requestAnimationFrame(animationFrame);
    render();
  }

  animationFrame();
}

main();
