import { makeShaderDataDefinitions } from "webgpu-utils";

export const createShader = (device: GPUDevice, code: string) => {
  const defs = makeShaderDataDefinitions(code);
  const module = device.createShaderModule({
    code,
  });

  return { defs, module };
};
