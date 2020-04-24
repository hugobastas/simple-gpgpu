export class GPU {
  _gl: WebGLRenderingContext
  _canvas: HTMLCanvasElement | OffscreenCanvas

  constructor(arg?: HTMLCanvasElement | WebGLRenderingContext) {
    if (typeof arg === "undefined") {
      this._canvas = offscreenCanvas()
      this._gl = this._canvas.getContext("webgl") as WebGLRenderingContext
      if (this._gl === null) throw new Error("Webgl not supported")
      return
    }

    if (arg instanceof HTMLCanvasElement) {
      this._canvas = arg
      this._gl = this._canvas.getContext("webgl") as WebGLRenderingContext
      if (this._gl === null) throw new Error("Webgl not supported")
      return
    }

    if (arg instanceof WebGLRenderingContext) {
      this._gl = arg
      this._canvas = arg.canvas
      return
    }

    throw new TypeError()
  }

  texture(width: number, height: number): Texture {
    return new Texture(this, width, height)
  }

  kernel(glsl: string): Kernel {
    return new Kernel(this, glsl)
  }
}

export class Texture {
  _width: number
  _height: number
  _isInitialized: boolean
  _gpu: GPU
  _glTexture: WebGLTexture
  _glFramebuffer: WebGLFramebuffer

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

  get width() { return this._width }
  get height() { return this._height }
  get isInitialized() { return this._isInitialized }

  fill(n?: number): Texture {
    if (typeof n === "undefined" || n === 0) {
      let gl = this._gpu._gl

      const target = gl.TEXTURE_2D
      const format = gl.RGBA
      const type = gl.UNSIGNED_BYTE

      gl.bindTexture(gl.TEXTURE_2D, this._glTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, format, this.width, this.height, 0, format, type, null)

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

  uploadData(data: number[] | Uint8Array): Texture
  uploadData(data: number[] | Uint8Array, xOffset: number, yOffset: number, width: number, height: number): Texture
  uploadData(data: number[] | Uint8Array, ...args: any[]): Texture {
    if (data instanceof Array)
      data = new Uint8Array(data)

    let gl = this._gpu._gl

    const target = gl.TEXTURE_2D
    const format = gl.RGBA
    const type = gl.UNSIGNED_BYTE

    gl.bindTexture(gl.TEXTURE_2D, this._glTexture)

    if (args.length === 0) {
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

export type KernelTarget = "texture" | "canvas" | Texture

export class Kernel {
  _gpu: GPU
  _glProgram: WebGLProgram
  _attributeBuffer: WebGLBuffer
  _attributeLocation: number
  _uniforms: Array<{
    name: string,
    type: "float" | "vec2" | "vec3" | "vec4",
    location: WebGLUniformLocation,
  }>
  _textureUniforms: Array<{
    name: string
    type: "sampler2D"
    location: WebGLUniformLocation
    texture: Texture | null,
    textureUnit: number,
    dimensionsLocation: WebGLUniformLocation | null
  }>
  _specialUniformLocations: {
    outputDimensionsLocation: WebGLUniformLocation | null
  }
  _output: {
    target: KernelTarget
    x: number | null
    y: number | null
    width: number | null
    height: number | null
  }

  constructor(gpu: GPU, glsl: string) {
    let gl = gpu._gl

    this._gpu = gpu

    this._output = {
      target: "texture",
      x: null, y: null, width: null, height: null
    }

    let vertexShader = compileShader(gl, Kernel._vertexSource, gl.VERTEX_SHADER)
    let fragmentShader = compileShader(gl, glsl, gl.FRAGMENT_SHADER)
    let program = linkShaders(gl, vertexShader, fragmentShader)

    this._glProgram = program
    this._attributeLocation = gl.getAttribLocation(program, "a_position")

    this._attributeBuffer = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this._attributeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW)

    let nextTextureUnit = 0
    this._uniforms = []
    this._textureUniforms = []

    for (let { name, type } of extractUniforms(glsl)) {
      let location = gl.getUniformLocation(this._glProgram, name)
      if (location === null)
        continue

      if (name === "output")
        throw Error("Uniform name output is reserved")

      if (startsWith(name, "glu_"))
        continue

      if (type === "sampler2D") {
        this._textureUniforms.push({
          name,
          type: "sampler2D",
          location,
          texture: null,
          textureUnit: nextTextureUnit++,
          dimensionsLocation: gl.getUniformLocation(program, `glu_${name}_dimensions`),
        })
      } else {
        this._uniforms.push({
          name,
          type,
          location,
        })
      }
    }

    this._specialUniformLocations = {
      outputDimensionsLocation: gl.getUniformLocation(program, "glu_output_dimensions"),
    }
  }

  getArgType(name: string): GlslType | null {
    let uniformsEntry = find(this._uniforms, entry => entry.name === name)
    let textureUniformsEntry = find(this._textureUniforms, entry => entry.name === name)
    let entry = uniformsEntry || textureUniformsEntry

    if (entry)
      return entry.type
    else
      return null
  }

  arg(name: string, value: GlslValue): Kernel {
    let gl = this._gpu._gl

    gl.useProgram(this._glProgram)

    let uniformsEntry = find(this._uniforms, entry => entry.name === name)
    let textureUniformsEntry = find(this._textureUniforms, entry => entry.name === name)
    let entry = uniformsEntry || textureUniformsEntry

    if (entry === undefined || startsWith(name, "glu_"))
      throw new Error("Invalid uniform name")

    if (typeof value === "number" && entry.type === "float") {
      gl.uniform1f(entry.location, value)
      return this
    }

    if (value instanceof Array && entry.type === `vec${value.length}`) {
      // @ts-ignore
      gl[`uniform${value.length}fv`](entry.location, value)
      return this
    }

    if (value instanceof Texture && entry.type === "sampler2D") {
      if (!value.isInitialized)
        value.fill()

      entry.texture = value
      gl.uniform1i(entry.location, entry.textureUnit)
      return this
    }

    throw new TypeError()
  }

  output(target: KernelTarget): Kernel
  output(x: number, y: number, width?: number, height?: number): Kernel
  output(target: KernelTarget, x: number, y: number, width?: number, height?: number): Kernel
  output(...args: any): Kernel {
    if (typeof args[0] == "number") {
      this._output.x = args[0]
      this._output.y = args[1]
      this._output.width = args[2] || this._output.width
      this._output.height = args[3] || this._output.height

      return this
    }

    if (args[0] == "canvas" || args[0] instanceof Texture) {
      this._output.target = args[0]

      if (this._output.target instanceof Texture && !this._output.target.isInitialized)
        this._output.target.fill()

      if (typeof args[1] == "number") {
        this._output.x = args[1]
        this._output.y = args[2]
        this._output.width = args[3] || this._output.width
        this._output.height = args[4] || this._output.height
      }

      return this
    }

    throw new Error("Invalid arguments")
  }

  run(): Texture | undefined {
    let gl = this._gpu._gl

    gl.useProgram(this._glProgram)

    let x = this._output.x || 0
    let y = this._output.y || 0
    let width, height: number

    let newTexture: Texture | null = null

    if (this._output.target == "canvas") {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      width = this._output.width || this._gpu._canvas.width
      height = this._output.height || this._gpu._canvas.height
    }

    if (this._output.target == "texture") {
      if (this._output.width == null || this._output.height == null)
        throw new Error("Width and/or height not set")

      width = this._output.width
      height = this._output.height

      newTexture = this._gpu
        .texture(width, height)
        .uploadData(new Uint8Array(width * height * 4))
    }

    if (this._output.target instanceof Texture) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._output.target._glFramebuffer)

      width = this._output.width || this._output.target.width
      height = this._output.height || this._output.target.height
    }

    for (let { texture, textureUnit, dimensionsLocation } of this._textureUniforms) {
      if (texture === null)
        continue

      gl.activeTexture(gl.TEXTURE0 + textureUnit)
      gl.bindTexture(gl.TEXTURE_2D, texture._glTexture)

      if (dimensionsLocation != null)
        gl.uniform2fv(dimensionsLocation, [texture.width, texture.height])
    }

    let { outputDimensionsLocation } = this._specialUniformLocations
    if (outputDimensionsLocation !== null) {
      // @ts-ignore
      gl.uniform2f(outputDimensionsLocation, width, height)
    }

    gl.enableVertexAttribArray(this._attributeLocation)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._attributeBuffer)
    gl.vertexAttribPointer(this._attributeLocation, 2, gl.FLOAT, false, 0, 0)

    // @ts-ignore
    gl.viewport(x, y, width, height)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    if (newTexture)
      return newTexture

    return
  }

  static _vertexSource = `
attribute vec4 a_position;
varying float glu_x;
varying float glu_y;
varying float glu_x_normalized;
varying float glu_y_normalized;
uniform vec2 glu_output_dimensions;
void main() {
  glu_x_normalized = (a_position.x + 1.0) * .5;
  glu_y_normalized = (a_position.y + 1.0) * .5;

  glu_x = glu_x_normalized * glu_output_dimensions.x;
  glu_y = glu_y_normalized * glu_output_dimensions.y;

  gl_Position = a_position;
}
`
}

function offscreenCanvas(): HTMLCanvasElement {
  let canvas = document.createElement("canvas")
  canvas.style.display = "fixed"
  canvas.style.left = "-1000px"
  canvas.style.top = "-1000px"
  document.body.appendChild(canvas)
  return canvas
}

export type GlslType = "float" | "vec2" | "vec3" | "vec4" | "sampler2D"
export type GlslValue = number | number[] | Texture

function extractUniforms(glsl: string): Array<{ name: string, type: GlslType }> {
  let uniforms = []

  let lines = glsl.split("\n")
  for (let line of lines) {
    // @ts-ignore
    let words = line.trimLeft().split(" ").filter(w => w != "")

    if (words[0] == "uniform") {
      let type = words[1] as GlslType
      let name = words[2].slice(0, words[2].length - 1)
      uniforms.push({ type, name })
    }

    if (words[0] == "void") {
      return uniforms
    }
  }

  return uniforms
}

function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader {
  let shader = gl.createShader(type) as WebGLShader
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
  if (!success)
    throw new Error(gl.getShaderInfoLog(shader) || "")

  return shader
}

function linkShaders(gl: WebGLRenderingContext, vert: WebGLShader, frag: WebGLShader): WebGLProgram {
  let program = gl.createProgram() as WebGLProgram
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  let success = gl.getProgramParameter(program, gl.LINK_STATUS)
  if (!success)
    throw new Error(gl.getProgramInfoLog(program) || "")

  return program
}

function startsWith(o: string, search: string, pos?: number): boolean {
  pos = !pos || pos < 0 ? 0 : +pos
  return o.substring(pos, pos + search.length) === search
}

function find<T>(o: Array<T>, predicate: (_: T) => boolean): T | undefined {
  for (let e of o) {
    if (predicate(e))
      return e
  }
  return undefined
}
