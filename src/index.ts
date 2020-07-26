export * from "./texture"
export * from "./kernel"

export interface Gpu {
  _gl: WebGLRenderingContext
}

export function gpu(gl: WebGLRenderingContext): Gpu {
  return { _gl: gl }
}
