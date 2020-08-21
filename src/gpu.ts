export class Gpu {
  _gl: WebGLRenderingContext
  constructor(gl: WebGLRenderingContext) { this._gl = gl }

  get canvas(): HTMLCanvasElement | OffscreenCanvas {
    return this._gl.canvas
  }
}

export function newGpu(gl: WebGLRenderingContext): Gpu {
  return new Gpu(gl)
}
