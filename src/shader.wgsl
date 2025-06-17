struct Uniforms {
  resolution : vec2f,
  mouse : vec2f,
  time : f32
}

@binding(0) @group(0) var dataSampler: sampler;
@binding(1) @group(0) var dataTexture: texture_2d<f32>;
@binding(2) @group(0) var<uniform> uniforms : Uniforms;


@vertex fn fsQuadVS(
  @builtin(vertex_index) vertexIndex : u32
) -> @builtin(position) vec4f {
  let pos = array(
    vec2f(-1, 3),  // top center
    vec2f(-1, -1),  // bottom left
    vec2f(3, -1)   // bottom right
  );

  return vec4f(pos[vertexIndex], 0, 1);
}

@fragment fn textureFs(@builtin(position) fragCoord : vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / uniforms.resolution;
  let e = vec3f(-1.0, 0.0, 1.0) / uniforms.resolution.xxy;

  var current = textureSample(dataTexture, dataSampler, uv).x;

  var sum = 0.0;

  sum += textureSample(dataTexture, dataSampler, uv + e.xx).x;
  sum += textureSample(dataTexture, dataSampler, uv + e.xy).x;
  sum += textureSample(dataTexture, dataSampler, uv + e.xz).x;
  sum += textureSample(dataTexture, dataSampler, uv + e.yx).x;
  sum += textureSample(dataTexture, dataSampler, uv + e.yz).x;
  sum += textureSample(dataTexture, dataSampler, uv + e.zx).x;
  sum += textureSample(dataTexture, dataSampler, uv + e.zy).x;
  sum += textureSample(dataTexture, dataSampler, uv + e.zz).x;

  if (distance(uniforms.mouse, uv) < 0.01) {
    current = 1.0;
  } else if (current > 0.5) {
    if (sum < 2 || sum > 3) {
      current = 0.0;
    } else {
      current = 1.0;
    }
  } else {
    if (sum > 2 && sum < 4) {
      current = 1.0;
    } else {
      current = 0.0;
    }
  }

  return vec4f(current, current, current, 1.0);
}

@fragment fn screenFs(@builtin(position) fragCoord : vec4f) -> @location(0) vec4f {
  let uv = fragCoord.xy / uniforms.resolution;// uniforms.resolution;
  return textureSample(dataTexture, dataSampler, uv);
}
