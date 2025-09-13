export const UniformSizes = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
  mat2: 4,
  mat3: 9,
  mat4: 16,
};

export type UniformType = keyof typeof UniformSizes;

export type UniformBufferDescriptor = Record<string, UniformType>;

export const createUniformBuffer = (
  device: GPUDevice,
  uniforms: UniformBufferDescriptor,
) => {
  const offsets = {} as Record<string, number>;

  let size = 0;

  for (const [name, type] of Object.entries(uniforms)) {
    offsets[name] = size;
    size += UniformSizes[type];
  }

  const clientBuffer = new Float32Array(size);

  const byteSize = size * 4;

  const buffer = device.createBuffer({
    size: byteSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
};
