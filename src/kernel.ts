import { GPU } from "./gpu"
import { InitializedTexture, isInitializedTexture } from "./texture"

export type KernelTarget = "canvas" | InitializedTexture

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
    texture: InitializedTexture | null,
    textureUnit: number,
    dimensionsLocation: WebGLUniformLocation | null
  }>
  _specialUniformLocations: {
    outputDimensionsLocation: WebGLUniformLocation | null
  }

  constructor(gpu: GPU, glsl: string) {
    let gl = gpu._gl

    this._gpu = gpu

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

    if (isInitializedTexture(value) && entry.type === "sampler2D") {
      entry.texture = value
      gl.uniform1i(entry.location, entry.textureUnit)
      return this
    }

    throw new TypeError()
  }

  run(target: KernelTarget): void
  run(target: KernelTarget, xOffset: number, yOffset: number): void
  run(target: KernelTarget, xOffset: number, yOffset: number, width: number, height: number): void
  run(target: KernelTarget,...args: number[]): void {
    let gl = this._gpu._gl

    gl.useProgram(this._glProgram)

    let x = args[0] | 0
    let y = args[1] | 0
    let width: number
    let height: number

    if (target == "canvas") {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      width = args[2] || this._gpu._gl.canvas.width
      height = args[3] || this._gpu._gl.canvas.height
    } else if (isInitializedTexture(target)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.glFramebuffer)

      width = args[2] || target.width
      height = args[3] || target.height
    } else {
      throw TypeError()
    }

    for (let { texture, textureUnit, dimensionsLocation } of this._textureUniforms) {
      if (texture === null)
        continue

      gl.activeTexture(gl.TEXTURE0 + textureUnit)
      gl.bindTexture(gl.TEXTURE_2D, texture.glTexture)

      if (dimensionsLocation != null)
        gl.uniform2fv(dimensionsLocation, [texture.width, texture.height])
    }

    let { outputDimensionsLocation } = this._specialUniformLocations
    if (outputDimensionsLocation !== null) {
      gl.uniform2f(outputDimensionsLocation, width, height)
    }

    gl.enableVertexAttribArray(this._attributeLocation)
    gl.bindBuffer(gl.ARRAY_BUFFER, this._attributeBuffer)
    gl.vertexAttribPointer(this._attributeLocation, 2, gl.FLOAT, false, 0, 0)

    gl.viewport(x, y, width, height)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
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

export type GlslType = "float" | "vec2" | "vec3" | "vec4" | "sampler2D"
export type GlslValue = number | number[] | InitializedTexture

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
