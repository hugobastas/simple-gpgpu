import { Gpu } from "./index"
import {
  Texture,
  WithInitializedGlTexture,
  WithFramebuffer
} from "./texture"

export type Target = "canvas" | Texture & WithFramebuffer

export type GlslValue =
  number |
  [ number, number ] |
  [ number, number, number ] |
  [ number, number, number, number ] |
  Texture & WithInitializedGlTexture

export type Uniform = {
  name: string
  type: "float" | "vec2" | "vec3" | "vec4"
  location: WebGLUniformLocation
  initialized: boolean
} | {
  name: string
  type: "sampler2D"
  location: WebGLUniformLocation
  textureUnit: number
  texture: Texture & WithInitializedGlTexture | null
}

export interface IncompleteProgram {
  _gpu: Gpu
  _vertexShader: WebGLShader
}

export interface Program {
  _gpu: Gpu
  _shaderProgram: WebGLProgram
  _uniforms: Array<Uniform>
  _attributeBuffer: WebGLBuffer
  _attributeLocation: GLint
  _x: number | undefined
  _y: number | undefined
  _width: number | undefined
  _height: number | undefined
}

export interface WithTarget {
  _target: Target
}

export type ProgramFunc<I, O> = <P extends Program>(t: P & I) => P & O

export function newProgram(gpu: Gpu): IncompleteProgram {
  let vertexShader =
    compileShader(gpu._gl, vertexShaderSource, gpu._gl.VERTEX_SHADER)
  return { _gpu: gpu, _vertexShader: vertexShader }
}

export function fragmentShader(source: string): (program: IncompleteProgram) => Program {
  return ({ _gpu, _vertexShader }) => {
    let gl = _gpu._gl

    let fragmentShader = compileShader(gl, source, _gpu._gl.FRAGMENT_SHADER)
    let shaderProgram = linkShaders(gl, _vertexShader, fragmentShader)

    let uniforms = extractUniforms(gl, shaderProgram, source)

    let attributeLocation = gl.getAttribLocation(shaderProgram, "a_position")
    let attributeBuffer = gl.createBuffer() as WebGLBuffer
    gl.bindBuffer(gl.ARRAY_BUFFER, attributeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW)

    return {
      _gpu,
      _shaderProgram: shaderProgram,
      _uniforms: uniforms,
      _attributeBuffer: attributeBuffer,
      _attributeLocation: attributeLocation,
      _x: undefined,
      _y: undefined,
      _width: undefined,
      _height: undefined,
    }
  }
}

export function uniform(name: string, value: GlslValue): ProgramFunc<{}, {}> {
  return function <P extends Program>(p: P) {
    let gl = p._gpu._gl

    gl.useProgram(p._shaderProgram)

    let entry = find(p._uniforms, entry => entry.name === name)

    if (typeof entry == "undefined")
      throw new Error("Invalid uniform name")

    if (typeof value == "number" && entry.type == "float") {
      gl.uniform1f(entry.location, value)
      entry.initialized = true
    } else if (value instanceof Array && entry.type == "vec2") {
      gl.uniform2fv(entry.location, value)
      entry.initialized = true
    } else if (value instanceof Array && entry.type == "vec3") {
      gl.uniform3fv(entry.location, value)
      entry.initialized = true
    } else if (value instanceof Array && entry.type == "vec4") {
      gl.uniform4fv(entry.location, value)
      entry.initialized = true
    } else if (value instanceof Texture && entry.type == "sampler2D") {
      gl.uniform1i(entry.location, entry.textureUnit)
      entry.texture = value
    } else {
      throw new Error(`Invalid argument type. Trying to assign value of type ${typeof value} to argument of type ${entry.type}`)
    }

    return p
  }
}

export function viewport(
  x?: number, y?: number, width?: number, height?: number
): ProgramFunc<{}, {}> {
  return function <P extends Program>(p: P) {
    p._x = x
    p._y = y
    p._width = width
    p._height = height
    return p
  }
}

export function target(target: Target): ProgramFunc<{}, WithTarget> {
  return function <P extends Program>(p: P) {
    let np = p as P & WithTarget
    np._target = target

    return np
  }
}

export function run(p: Program & WithTarget) {
  let gl = p._gpu._gl

  gl.useProgram(p._shaderProgram)

  if (p._target == "canvas")
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  else
    gl.bindFramebuffer(gl.FRAMEBUFFER, p._target._glFramebuffer)

  for (let uniform of p._uniforms) {
    // @ts-ignore
    if (uniform.type != "sampler2D" && uniform.initialized)
      continue

    if (uniform.type == "sampler2D" && uniform.texture !== null) {
      gl.activeTexture(gl.TEXTURE0 + uniform.textureUnit)
      gl.bindTexture(gl.TEXTURE_2D, uniform.texture._glTexture)
      continue
    }

    throw new Error(`Uniform ${uniform.name} has not been assigned a value`)
  }

  let x = typeof p._x == "undefined" ? 0 : p._x
  let y = typeof p._y == "undefined" ? 0 : p._y

  let width: number
  let height: number

  if (p._target == "canvas") {
    width = typeof p._width == "undefined" ? p._gpu._gl.canvas.width : p._width
    height = typeof p._height == "undefined" ? p._gpu._gl.canvas.height : p._height
  } else {
    width = typeof p._width == "undefined" ? p._target._width : p._width
    height = typeof p._height == "undefined" ? p._target._height : p._height
  }

  gl.enableVertexAttribArray(p._attributeLocation)
  gl.bindBuffer(gl.ARRAY_BUFFER, p._attributeBuffer)
  gl.vertexAttribPointer(p._attributeLocation, 2, gl.FLOAT, false, 0, 0)

  gl.viewport(x, y, width, height)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

const vertexShaderSource = `
attribute vec4 a_position;
void main() {
    gl_Position = a_position;
}`

function compileShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader {
  let shader = gl.createShader(type) as WebGLShader
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS)
  if(!success) {
    let info = gl.getShaderInfoLog(shader)
    if (type == gl.VERTEX_SHADER)
      throw new Error("Could not compile vertex shader:\n\n" + info)
    else
      throw new Error("Could not compile fragment shader:\n\n" + info)
  }

  return shader
}

function linkShaders(gl: WebGLRenderingContext, vert: WebGLShader, frag: WebGLShader): WebGLProgram {
  let program = gl.createProgram() as WebGLProgram
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  let success = gl.getProgramParameter(program, gl.LINK_STATUS)
  if (!success) {
    let info = gl.getProgramInfoLog(program)
    throw new Error("Could not link WebGL program:\n\n" + info)
  }

  return program
}

function extractUniforms(gl: WebGLRenderingContext, program: WebGLProgram, source: string): Array<Uniform> {
  let uniforms: Array<Uniform> = []
  let textureUnit = 0

  let lines = source.split("\n")
  for (let line of lines) {
    let words = line.trimLeft().split(" ").filter(w => w != "")

    let type: string
    let name: string

    if (words[0] == "void")
      break

    if (words[0] != "uniform")
      continue

    if (words[1] == "lowp" || words[1] == "mediump" || words[1] == "highp") {
      type = words[2]
      name = words[3].slice(0, words[3].length - 1)
    } else {
      type = words[1]
      name = words[2].slice(0, words[2].length - 1)
    }

    let location = gl.getUniformLocation(program, name)
    if (location === null)
      throw new Error(`Unused uniform in shader program: ${name}`)

    if (type == "float" || type == "vec2" || type == "vec3" || type == "vec4") {
      uniforms.push({
        name,
        type,
        location,
        initialized: false
      })
    }

    if (type == "sampler2D") {
      uniforms.push({
        name,
        type,
        location,
        textureUnit: textureUnit ++,
        texture: null,
      })
    }
  }

  return uniforms
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

