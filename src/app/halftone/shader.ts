// GLSL ES 1.00 (WebGL1) shader source for the CMY(K) color halftone effect.
//
// Renderer technique: each output pixel independently evaluates up to four
// rotated dot-screen grids (Cyan, Magenta, Yellow, Black). For a given
// channel, the fragment first rotates its own screen-space coordinate by
// that channel's screen angle, finds which grid cell it falls in, then
// samples the *source* image color back at that cell's un-rotated center to
// read the ink density for that channel at that cell. The dot radius for the
// cell is proportional to ink density (amplitude-modulated halftone), and
// the four channel colors are combined with a multiply blend, matching how
// real ink layers absorb light. This keeps the whole effect a single
// fullscreen-quad draw call: every control (radius, angle, channel enable,
// black-generation mode, dot shape, contrast, brightness, invert,
// background) is a uniform, so dragging any slider only updates uniforms
// and redraws -- there is no per-pixel work on the CPU and no re-decoding
// of the source image.

export const HALFTONE_VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const HALFTONE_FRAGMENT_SHADER_SOURCE = `
precision highp float;

uniform sampler2D u_source;
uniform vec2 u_resolution;
uniform float u_maxRadius;
uniform float u_dotShape;
uniform float u_contrastFactor;
uniform float u_brightness;
uniform float u_invert;
uniform float u_kMode;
uniform float u_includeBackground;
uniform vec3 u_backgroundColor;
uniform float u_backgroundStyle;
uniform sampler2D u_backgroundTexture;
uniform float u_photoZoom;

uniform float u_enabledC;
uniform float u_enabledM;
uniform float u_enabledY;
uniform float u_enabledK;
uniform float u_angleC;
uniform float u_angleM;
uniform float u_angleY;
uniform float u_angleK;

// Zoom (the Zoom section) is deliberately implemented as a pure UV transform
// on the already-baked cover-fit source texture -- not a CPU re-render -- so
// dragging it only updates a cheap shader uniform, matching this app's
// established "cover-fit runs once, controls only touch uniforms" performance
// architecture (see gl-engine.ts/halftone-canvas.tsx). Zoom scales uv in
// around the texture center (0.5, 0.5).
vec2 transformPhotoUv(vec2 uv) {
  float zoom = max(u_photoZoom, 1.0);

  return (uv - 0.5) / zoom + 0.5;
}

vec4 sampleInk(vec2 uv) {
  vec2 photoUv = transformPhotoUv(uv);
  vec3 rgb = texture2D(u_source, clamp(photoUv, 0.0, 1.0)).rgb;

  if (u_invert > 0.5) {
    rgb = vec3(1.0) - rgb;
  }

  rgb = (rgb - 0.5) * u_contrastFactor + 0.5 + u_brightness;
  rgb = clamp(rgb, 0.0, 1.0);

  vec3 cmy = vec3(1.0) - rgb;
  float k = min(cmy.r, min(cmy.g, cmy.b));
  vec3 cmyReduced = k < 0.999 ? (cmy - vec3(k)) / (1.0 - k) : vec3(0.0);
  vec3 cmyFinal = mix(cmyReduced, cmy, u_kMode);

  return vec4(cmyFinal, k);
}

float dotDistance(vec2 localPos, float shapeMode) {
  if (shapeMode < 0.5) {
    return length(localPos);
  }
  if (shapeMode < 1.5) {
    return max(abs(localPos.x), abs(localPos.y));
  }
  if (shapeMode < 2.5) {
    return abs(localPos.x) + abs(localPos.y);
  }
  return abs(localPos.y);
}

// channelMask is a one-hot vec4 (e.g. vec4(1,0,0,0) for Cyan) used with
// dot() to pick the ink component for this channel. This intentionally
// avoids selecting a vector component via an int equality/ternary chain:
// that pattern is a known source of GPU-driver-dependent miscompilation on
// some ANGLE/D3D and mobile GLSL compilers (branch-flattening or dead-code
// elimination can collapse the chain to a single branch), which would make
// every channel silently read the same ink value -- exactly the symptom of
// a color halftone rendering as grayscale (only one channel's dots ever
// showing distinct coverage). dot() against a one-hot mask is branch-free
// and has no such portability risk.
float channelCoverage(vec2 fragPx, float angleDeg, float shapeMode, vec4 channelMask) {
  float angle = radians(angleDeg);
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 rp = vec2(ca * fragPx.x - sa * fragPx.y, sa * fragPx.x + ca * fragPx.y);

  float gridSize = max(u_maxRadius * 2.0, 2.0);
  vec2 cellIndex = floor(rp / gridSize);
  vec2 cellCenterRot = (cellIndex + 0.5) * gridSize;
  vec2 cellCenterOriginal = vec2(
    ca * cellCenterRot.x + sa * cellCenterRot.y,
    -sa * cellCenterRot.x + ca * cellCenterRot.y
  );
  vec2 uv = cellCenterOriginal / u_resolution;
  vec4 cmyk = sampleInk(uv);
  float ink = dot(cmyk, channelMask);

  vec2 localPos = rp - cellCenterRot;
  float radius = clamp(ink, 0.0, 1.0) * u_maxRadius;
  float dist = dotDistance(localPos, shapeMode);
  float aa = max(1.0, u_maxRadius * 0.06);

  return 1.0 - smoothstep(radius - aa, radius + aa, dist);
}

void main() {
  vec2 fragPx = gl_FragCoord.xy;
  // The background texture (when Fill Style is "gradient") is a small
  // offscreen-rasterized bitmap re-uploaded only when the gradient
  // type/angle/stops change (see gl-engine.ts), sampled here per-pixel just
  // like the source photo texture. Gradient stops with reduced opacity blend
  // toward the flat Background color (mix by the sampled alpha) instead of
  // toward black, so that solid color control stays a meaningful backdrop
  // even while Gradient is the active fill style.
  vec3 baseBackground = u_backgroundColor;
  if (u_backgroundStyle > 0.5) {
    vec2 backgroundUv = fragPx / u_resolution;
    vec4 backgroundSample = texture2D(u_backgroundTexture, backgroundUv);
    baseBackground = mix(u_backgroundColor, backgroundSample.rgb, backgroundSample.a);
  }
  vec3 resultRGB = u_includeBackground > 0.5 ? baseBackground : vec3(1.0);
  float alpha = u_includeBackground;

  if (u_enabledC > 0.5) {
    float cov = channelCoverage(fragPx, u_angleC, u_dotShape, vec4(1.0, 0.0, 0.0, 0.0));
    resultRGB = mix(resultRGB, resultRGB * vec3(0.0, 1.0, 1.0), cov);
    alpha = max(alpha, cov);
  }

  if (u_enabledM > 0.5) {
    float cov = channelCoverage(fragPx, u_angleM, u_dotShape, vec4(0.0, 1.0, 0.0, 0.0));
    resultRGB = mix(resultRGB, resultRGB * vec3(1.0, 0.0, 1.0), cov);
    alpha = max(alpha, cov);
  }

  if (u_enabledY > 0.5) {
    float cov = channelCoverage(fragPx, u_angleY, u_dotShape, vec4(0.0, 0.0, 1.0, 0.0));
    resultRGB = mix(resultRGB, resultRGB * vec3(1.0, 1.0, 0.0), cov);
    alpha = max(alpha, cov);
  }

  if (u_enabledK > 0.5) {
    float cov = channelCoverage(fragPx, u_angleK, u_dotShape, vec4(0.0, 0.0, 0.0, 1.0));
    resultRGB = mix(resultRGB, resultRGB * vec3(0.0, 0.0, 0.0), cov);
    alpha = max(alpha, cov);
  }

  gl_FragColor = vec4(resultRGB * alpha, alpha);
}
`;
