import {
  getHalftoneGradientTextureSize,
  paintHalftoneGradientBackground,
  serializeHalftoneBackgroundGradient,
} from "./gradient-background";
import {
  HALFTONE_FRAGMENT_SHADER_SOURCE,
  HALFTONE_VERTEX_SHADER_SOURCE,
} from "./shader";
import {
  getHalftoneDotShapeMode,
  type HalftoneBackgroundGradient,
  type HalftoneParams,
} from "./params";

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Halftone WebGL renderer could not create a shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Halftone shader failed to compile: ${info ?? "unknown error"}`);
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, HALFTONE_VERTEX_SHADER_SOURCE);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, HALFTONE_FRAGMENT_SHADER_SOURCE);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Halftone WebGL renderer could not create a program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Halftone shader program failed to link: ${info ?? "unknown error"}`);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

function hexToRgb01(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const parsed =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(parsed, 16);

  if (!Number.isFinite(value)) {
    return [1, 1, 1];
  }

  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export type HalftoneGLEngine = {
  dispose(): void;
  render(params: HalftoneParams, scale: number): void;
  setSize(cssWidth: number, cssHeight: number, backingWidth: number, backingHeight: number): void;
  setSource(source: TexImageSource): void;
};

/**
 * Owns a single WebGL1 context, program, fullscreen-quad buffer, and source
 * texture. `setSource` (the only pass that re-uploads texture data) runs
 * only when the decoded + cover-fit source bitmap changes -- media import,
 * image transform, or canvas resize. `render` runs on every control change
 * and only updates uniforms plus issues one draw call, so it stays cheap
 * regardless of source resolution.
 */
export function createHalftoneGLEngine(canvas: HTMLCanvasElement): HalftoneGLEngine | null {
  // preserveDrawingBuffer is required so the rendered frame stays readable
  // (canvas snapshot/hash checks, screenshots, drawImage-based export) after
  // the browser composites the next frame instead of being auto-cleared.
  const glContext = (canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  } as WebGLContextAttributes) ??
    canvas.getContext("experimental-webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    })) as WebGLRenderingContext | null;

  if (!glContext) {
    return null;
  }

  const gl: WebGLRenderingContext = glContext;
  const program = createProgram(gl);
  const positionBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const texture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Second texture: the rasterized gradient background (only bound/sampled
  // when Background Style is "gradient"). Re-uploaded only when the
  // gradient's serialized params or aspect-matched texture size change (see
  // `ensureBackgroundGradientTexture` below), never per render call.
  const backgroundTexture = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let backgroundGradientCanvas: HTMLCanvasElement | null = null;
  let backgroundGradientCtx: CanvasRenderingContext2D | null = null;
  let backgroundGradientKey: string | null = null;

  function ensureBackgroundGradientTexture(
    gradient: HalftoneBackgroundGradient,
    backingWidth: number,
    backingHeight: number,
  ): void {
    const size = getHalftoneGradientTextureSize(backingWidth, backingHeight);
    const key = `${serializeHalftoneBackgroundGradient(gradient)}|${size.width}x${size.height}`;

    if (key === backgroundGradientKey) {
      return;
    }

    if (!backgroundGradientCanvas) {
      backgroundGradientCanvas = document.createElement("canvas");
      backgroundGradientCtx = backgroundGradientCanvas.getContext("2d");
    }

    if (!backgroundGradientCtx) {
      return;
    }

    backgroundGradientCanvas.width = size.width;
    backgroundGradientCanvas.height = size.height;
    paintHalftoneGradientBackground(backgroundGradientCtx, size.width, size.height, gradient);

    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, backgroundGradientCanvas);
    backgroundGradientKey = key;
  }

  const uniforms = {
    angleC: gl.getUniformLocation(program, "u_angleC"),
    angleK: gl.getUniformLocation(program, "u_angleK"),
    angleM: gl.getUniformLocation(program, "u_angleM"),
    angleY: gl.getUniformLocation(program, "u_angleY"),
    backgroundColor: gl.getUniformLocation(program, "u_backgroundColor"),
    backgroundStyle: gl.getUniformLocation(program, "u_backgroundStyle"),
    backgroundTexture: gl.getUniformLocation(program, "u_backgroundTexture"),
    brightness: gl.getUniformLocation(program, "u_brightness"),
    contrastFactor: gl.getUniformLocation(program, "u_contrastFactor"),
    dotShape: gl.getUniformLocation(program, "u_dotShape"),
    enabledC: gl.getUniformLocation(program, "u_enabledC"),
    enabledK: gl.getUniformLocation(program, "u_enabledK"),
    enabledM: gl.getUniformLocation(program, "u_enabledM"),
    enabledY: gl.getUniformLocation(program, "u_enabledY"),
    includeBackground: gl.getUniformLocation(program, "u_includeBackground"),
    invert: gl.getUniformLocation(program, "u_invert"),
    kMode: gl.getUniformLocation(program, "u_kMode"),
    maxRadius: gl.getUniformLocation(program, "u_maxRadius"),
    photoZoom: gl.getUniformLocation(program, "u_photoZoom"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    source: gl.getUniformLocation(program, "u_source"),
  };

  let hasSource = false;

  function setSize(
    cssWidth: number,
    cssHeight: number,
    backingWidth: number,
    backingHeight: number,
  ): void {
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const width = Math.max(1, Math.round(backingWidth));
    const height = Math.max(1, Math.round(backingHeight));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function setSource(source: TexImageSource): void {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    hasSource = true;
  }

  function render(params: HalftoneParams, scale: number): void {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!hasSource) {
      return;
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.source, 0);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.maxRadius, Math.max(0.5, params.maxRadiusPx * scale));
    gl.uniform1f(uniforms.photoZoom, Math.max(1, params.photoZoomPercent / 100));
    gl.uniform1f(uniforms.dotShape, getHalftoneDotShapeMode(params.dotShape));
    gl.uniform1f(uniforms.contrastFactor, 1 + params.contrast / 100);
    gl.uniform1f(uniforms.brightness, params.brightness / 100);
    gl.uniform1f(uniforms.invert, params.invert ? 1 : 0);
    gl.uniform1f(uniforms.kMode, params.blackGeneration === "additive" ? 1 : 0);
    gl.uniform1f(uniforms.includeBackground, params.includeBackground ? 1 : 0);

    const [bgR, bgG, bgB] = hexToRgb01(params.backgroundColor);
    gl.uniform3f(uniforms.backgroundColor, bgR, bgG, bgB);

    const useGradientBackground = params.backgroundStyle === "gradient";

    gl.uniform1f(uniforms.backgroundStyle, useGradientBackground ? 1 : 0);

    if (useGradientBackground) {
      ensureBackgroundGradientTexture(params.backgroundGradient, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
      gl.uniform1i(uniforms.backgroundTexture, 1);
    }

    gl.uniform1f(uniforms.enabledC, params.channels.cyan.enabled ? 1 : 0);
    gl.uniform1f(uniforms.enabledM, params.channels.magenta.enabled ? 1 : 0);
    gl.uniform1f(uniforms.enabledY, params.channels.yellow.enabled ? 1 : 0);
    gl.uniform1f(uniforms.enabledK, params.channels.black.enabled ? 1 : 0);
    gl.uniform1f(uniforms.angleC, params.channels.cyan.angleDeg);
    gl.uniform1f(uniforms.angleM, params.channels.magenta.angleDeg);
    gl.uniform1f(uniforms.angleY, params.channels.yellow.angleDeg);
    gl.uniform1f(uniforms.angleK, params.channels.black.angleDeg);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function dispose(): void {
    gl.deleteBuffer(positionBuffer);
    gl.deleteTexture(texture);
    gl.deleteTexture(backgroundTexture);
    gl.deleteProgram(program);
  }

  return { dispose, render, setSize, setSource };
}
