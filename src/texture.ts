import { Gpu } from "./gpu"

export type DataF = (col: number, row: number) => Pixel

export type Pixel = {
  r: number,
  g: number,
  b: number,
  a: number,
}

export class Texture {
  _gpu: Gpu

  constructor(gpu: Gpu) { this._gpu = gpu }
}

export interface WithWidth {
  _width: number
}

export interface WithHeight {
  _height: number
}

export interface WithGlTexture extends WithWidth, WithHeight {
  _glTexture: WebGLTexture
}

export interface WithoutGlTexture {
  _glTexture?: never
}

export interface WithGlTextureInitialized extends WithGlTexture {
  _textureInitialized: true
}

export interface WithBoundFramebuffer extends WithGlTexture {
  _glFramebuffer: WebGLFramebuffer
}

export interface WithoutBoundFrameBuffer {
  _glFramebuffer?: never
}

export function newTexture(gpu: Gpu): Texture {
  return new Texture(gpu)
}

export type TextureFunc<I, O> = <T extends Texture>(t: T & I) => T & O

export function width(w: number): TextureFunc<WithoutGlTexture, WithWidth> {
  return function <T extends Texture>(t: T) {
    let nt = t as T & WithWidth
    nt._width = w
   return nt
  }
}

export function height(h: number): <T extends Texture>(t: T & WithoutGlTexture) => T & WithHeight {
  return function <T extends Texture>(t: T) {
    let nt = t as T & WithHeight
    nt._height = h
    return nt
  }
}

export function createTexture<T extends Texture>(t: T & WithWidth & WithHeight & WithoutGlTexture): T & WithGlTexture {
  let gl = t._gpu._gl

  let glTexture = gl.createTexture() as WebGLTexture
  gl.bindTexture(gl.TEXTURE_2D, glTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  //@ts-ignore
  let nt = t as T & WithGlTexture
  nt._glTexture = glTexture
  return nt
}

export function createBoundFramebuffer<T extends Texture>(t: T & WithGlTexture & WithoutBoundFrameBuffer): T & WithBoundFramebuffer {
  let gl = t._gpu._gl

  //@ts-ignore
  let framebuffer: WebGLFramebuffer = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t._glTexture, 0)

  //@ts-ignore
  let nt = t as T & WithBoundFramebuffer
  nt._glFramebuffer = framebuffer
  return nt
}

export function fill({r, g, b, a}: Pixel): <T extends Texture>(t: T & WithGlTexture) => T & WithGlTextureInitialized {
  return function <T extends Texture & WithGlTexture>(t: T): T & WithGlTextureInitialized {
    let data: null | Uint8Array | Uint32Array
    if (r == 0 && g == 0 && b == 0 && a == 0) {
      data = null
    } else {
      let v = r + (g << 8) + (b << 16) + (a << 24)
      data = new Uint32Array(t._width * t._height).fill(v)
    }

    let gl = t._gpu._gl

    const target = gl.TEXTURE_2D
    const format = gl.RGBA
    const type = gl.UNSIGNED_BYTE

    gl.bindTexture(target, t._glTexture)
    gl.texImage2D(target, 0, format, t._width, t._height, 0, format, type, data)

    let nt = t as T & WithGlTextureInitialized
    nt._textureInitialized = true
    return nt
  }
}

export function uploadData(a: ArrayBufferView | DataF): <T extends Texture & WithGlTexture>(t: T) => T & WithGlTextureInitialized {
  return function <T extends Texture & WithGlTexture>(t: T): T & WithGlTextureInitialized {
    let data: ArrayBufferView

    if (typeof a === "function") {
      let u8Data = new Uint8Array(t._width * t._height * 4)
      for (let col = 0; col < t._width; col++) {
        for (let row = 0; row < t._height; row++) {
          let i = (row * t._width + col) * 4
          let pixel = a(col, row)

          u8Data[i] = pixel.r
          u8Data[i+1] = pixel.g
          u8Data[i+2] = pixel.b
          u8Data[i+3] = pixel.a
        }
      }

      data = u8Data
    } else {
      let expectedBytes = t._width * t._height * 4
      if (a.byteLength != expectedBytes) {
        throw new Error(`Invalid data length: Expected ${expectedBytes} bytes, got ${a.byteLength} bytes.`)
      }

      data = a
    }

    let gl = t._gpu._gl

    const target = gl.TEXTURE_2D
    const format = gl.RGBA
    const type = gl.UNSIGNED_BYTE

    gl.bindTexture(target, t._glTexture)
    gl.texImage2D(target, 0, format, t._width, t._height, 0, format, type, data)

    let nt = t as T & WithGlTextureInitialized
    nt._textureInitialized = true
    return nt
  }
}

export function uploadPartialData(
  a: ArrayBufferView | DataF,
  x: number,
  y: number,
  width: number,
  height: number
): <T extends Texture & WithGlTextureInitialized>(t: T) => T {
  return function <T extends Texture & WithGlTextureInitialized>(t: T): T {
    if (x + width > t._width)
      throw new Error("Invalid x and/or width")

    if (y + height > t._height)
      throw new Error("Invalid y and/or height")

    let data: ArrayBufferView

    if (typeof a === "function") {
      let u8Data = new Uint8Array(width * height * 4)
      for (let col = 0; col < width; col++) {
        for (let row = 0; row < height; row++) {
          let i = (row * t._width + col) * 4
          let pixel = a(col, row)

          u8Data[i] = pixel.r
          u8Data[i+1] = pixel.g
          u8Data[i+2] = pixel.b
          u8Data[i+3] = pixel.a
        }
      }

      data = u8Data
    } else {
      let expectedBytes = width * height * 4
      if (a.byteLength != expectedBytes) {
        throw new Error(`Invalid data length: Expected ${expectedBytes} bytes, got ${a.byteLength} bytes.`)
      }

      data = a
    }

    let gl = t._gpu._gl

    const target = gl.TEXTURE_2D
    const format = gl.RGBA
    const type = gl.UNSIGNED_BYTE

    gl.bindTexture(target, t._glTexture)
    gl.texSubImage2D(target, 0, x, y, width, height, format, type, data)

    return t
  }
}

export function downloadData(t: Texture & WithBoundFramebuffer): ArrayBuffer {
  let arrayBufferView = new Uint8Array(t._width * t._height * 4)
  downloadSubDataTo_(t, arrayBufferView, 0, 0, t._width, t._height)
  return arrayBufferView.buffer
}

export function downloadSubData(
  x: number, y: number, width: number, height: number
): (t: Texture & WithBoundFramebuffer) => ArrayBuffer {
  return t => {
    verifyWithinBounds(t, x, y, width, height)

    let arrayBufferView = new Uint8Array(width * height * 4)
    downloadSubDataTo_(t, arrayBufferView, x, y, width, height)
    return arrayBufferView.buffer
  }
}

export function downloadDataTo(d: ArrayBufferView): (t: Texture & WithBoundFramebuffer) => void {
  return t => {
    verifyBufferViewSize(d, t._width * t._height * 4)

    downloadSubDataTo_(t, d, 0, 0, t._width, t._height)
  }
}

export function downloadSubDataTo(
  x: number, y: number, width: number, height: number, d: ArrayBufferView
): (t: Texture & WithBoundFramebuffer) => void {
  return t => {
    verifyWithinBounds(t, x, y, width, height)
    verifyBufferViewSize(d, width * height * 4)

    downloadSubDataTo_(t, d, x, y, width, height)
  }
}

function downloadSubDataTo_(
  t: Texture & WithBoundFramebuffer,
  d: ArrayBufferView,
  x: number,
  y: number,
  width: number,
  height: number
) {
  let gl = t._gpu._gl

  const format = gl.RGBA
  const type = gl.UNSIGNED_BYTE

  gl.bindFramebuffer(gl.FRAMEBUFFER, t._glFramebuffer)
  gl.readPixels(x, y, width, height, format, type, d);
}

function verifyBufferViewSize(view: ArrayBufferView, expectedBytes: number) {
  if (view.byteLength != expectedBytes)
    throw new InvalidBufferViewSize(view, expectedBytes)
}

class InvalidBufferViewSize extends Error {
  constructor(view: ArrayBufferView, expectedBytes: number) {
    super(`Invalid BufferView size. Expected ${expectedBytes} bytes, is ${view.byteLength} bytes`)
  }
}

function verifyWithinBounds(
  t: WithWidth & WithHeight,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (x + width > t._width)
    throw new InvalidXAndOrWidth()

  if (y + height > t._height)
    throw new InvalidYAndOrHeight()
}

class InvalidXAndOrWidth extends Error {
  constructor() {
    super("Invalid x and/or width")
  }
}

class InvalidYAndOrHeight extends Error {
  constructor() {
    super("Invalid y and/or height")
  }
}

