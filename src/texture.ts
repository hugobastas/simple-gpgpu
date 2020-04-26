import { GPU } from "./gpu"

export function newTexture(gpu: GPU, width: number, height: number): UnInitializedTexture {
  return new Texture(gpu, width, height) as UnInitializedTexture
}

export function isUnInitializedTexture(v: any): v is UnInitializedTexture {
  return v instanceof Texture && !v.isInitialized
}

export function isInitializedTexture(v: any): v is InitializedTexture {
  return v instanceof Texture && v.isInitialized
}

export interface UnInitializedTexture {
  width: number
  height: number
  isInitialized: false
  gpu: GPU
  glTexture: WebGLTexture
  glFramebuffer: WebGLFramebuffer
  fill(n?: number): InitializedTexture
  uploadData(v: Uint8Array | ((col: number, row: number) => Pixel)): InitializedTexture
  uploadData(v: Uint8Array | ((col: number, row: number) => Pixel), xOffset: number, yOffset: number, width: number, height: number): InitializedTexture
}

export interface InitializedTexture {
  width: number
  height: number
  isInitialized: true
  gpu: GPU
  glTexture: WebGLTexture
  glFramebuffer: WebGLFramebuffer
  fill(n?: number): InitializedTexture
  uploadData(v: Uint8Array | ((col: number, row: number) => Pixel)): InitializedTexture
  uploadData(v: Uint8Array | ((col: number, row: number) => Pixel), xOffset: number, yOffset: number, width: number, height: number): InitializedTexture
  downloadData(): Uint8Array
  downloadData(data: Uint8Array): void
  downloadData(x: number, y: number, width: number, height: number, data: Uint8Array): void
  downloadData(x: number, y: number, width: number, height: number): Uint8Array
}

export type Pixel = {
  r: number,
  g: number,
  b: number,
  a: number,
}

class Texture {
  private _width: number
  private _height: number
  private _isInitialized: boolean
  private _gpu: GPU
  private _glTexture: WebGLTexture
  private _glFramebuffer: WebGLFramebuffer

  get width() { return this._width }
  get height() { return this._height }
  get isInitialized() { return this._isInitialized }
  get gpu() { return this._gpu }
  get glTexture() { return this._glTexture }
  get glFramebuffer() { return this._glFramebuffer }

  constructor(gpu: GPU, width: number, height: number) {
    this._width = width
    this._height = height
    this._isInitialized = false
    this._gpu = gpu

    let gl = gpu._gl

    this._glTexture = gl.createTexture() as WebGLTexture
    this._glFramebuffer = gl.createFramebuffer() as WebGLFramebuffer

    gl.bindTexture(gl.TEXTURE_2D, this._glTexture)

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  fill(n?: number): Texture {
    if (typeof n === "undefined" || n === 0) {
      let gl = this._gpu._gl

      const target = gl.TEXTURE_2D
      const format = gl.RGBA
      const type = gl.UNSIGNED_BYTE

      gl.bindTexture(target, this._glTexture)
      gl.texImage2D(target, 0, format, this.width, this.height, 0, format, type, null)

      if (!this.isInitialized) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._glFramebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._glTexture, 0)
        this._isInitialized = true
      }

      return this
    }

    this.uploadData(new Uint8Array(this.width * this.height * 4).fill(n || 0))
    return this
  }

  uploadData(v: Uint8Array | ((col: number, row: number) => Pixel)): Texture
  uploadData(v: Uint8Array | ((col: number, row: number) => Pixel), xOffset: number, yOffset: number, width: number, height: number): Texture
  uploadData(v: Uint8Array | ((col: number, row: number) => Pixel), ...args: any[]): Texture {
    let data: Uint8Array
    if (typeof v === "function") {
      data = new Uint8Array(this.width * this.height * 4)
      for (let row = 0; row < this.height; row ++) {
        for (let col = 0; col < this.width; col ++) {
          let { r, g, b, a } = v(col, row)
          let index = (row * this.width + col) * 4
          data[index] = r
          data[index + 1] = g
          data[index + 2] = b
          data[index + 3] = a
        }
      }
    } else {
      data = v
    }

    let gl = this._gpu._gl

    const target = gl.TEXTURE_2D
    const format = gl.RGBA
    const type = gl.UNSIGNED_BYTE

    gl.bindTexture(gl.TEXTURE_2D, this._glTexture)

    if (args.length === 1) {
      if (data.length < this.width * this.height * 4)
        throw new Error("Not enough data")

      gl.texImage2D(target, 0, format, this.width, this.height, 0, format, type, data)
    } else {
      let [xOffset, yOffset, width, height] = args

      if (data.length < width * height)
        throw new Error("Not enough data")

      if (!this.isInitialized)
        throw new Error("Texture in not initialized")

      gl.texSubImage2D(target, 0, xOffset, yOffset, width, height, format, type, data)
    }

    if (!this.isInitialized) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._glFramebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._glTexture, 0)
      this._isInitialized = true
    }

    return this
  }

  downloadData(): Uint8Array
  downloadData(data: Uint8Array): void
  downloadData(x: number, y: number, width: number, height: number, data: Uint8Array): void
  downloadData(x: number, y: number, width: number, height: number): Uint8Array
  downloadData(...args: any): Uint8Array | undefined {
    let _x, _y, _width, _height: number
    let _data: Uint8Array
    let _return: boolean

    if (typeof args[0] === "undefined") {
      [_x, _y, _width, _height] = [0, 0, this.width, this.height]
      _data = new Uint8Array(this.width * this.height * 4)
      _return = true
    }

    else if (args[0] instanceof Uint8Array) {
      [_x, _y, _width, _height] = [0, 0, this.width, this.height]
      _data = args[0];
      _return = false
    }

    else if (typeof args[0] === "number") {
      [_x, _y, _width, _height] = args

      if (args[4]) {
        _data = args[4]
        _return = false
      } else {
        _data = new Uint8Array(_width * _height * 4)
        _return = true
      }
    }

    else {
      throw new TypeError()
    }

    let gl = this._gpu._gl

    const format = gl.RGBA
    const type = gl.UNSIGNED_BYTE

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._glFramebuffer)
    gl.readPixels(_x, _y, _width, _height, format, type, _data);

    if (_return)
      return _data

    return
  }
}

