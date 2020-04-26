import { newTexture, UnInitializedTexture } from "./texture"
import { Kernel } from "./kernel"

export class GPU {
  _gl: WebGLRenderingContext

  constructor(gl: WebGLRenderingContext) {
    this._gl = gl
  }

  newTexture(width: number, height: number): UnInitializedTexture {
    return newTexture(this, width, height)
  }

  newKernel(glsl: string): Kernel {
    return new Kernel(this, glsl)
  }
}
