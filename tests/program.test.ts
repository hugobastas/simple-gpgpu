import { newGpu, Gpu } from "../src/gpu"
import {
  newTexture,
  Texture,
  width,
  height,
  createGlTexture,
  createFramebuffer,
  fill,
  uploadData,
  downloadData
} from "../src/texture"
import {
  newProgram,
  Program,
  fragmentShader,
  arg,
  target,
  viewport,
  run,
} from "../src/program"
import { generateTestArray } from "./util"
import newGl from "gl"

var gl: WebGLRenderingContext = newGl(100, 100)

test.only("Valid fragment shader does not throw error", () => {
  newGpu(gl)
    |> newProgram
    |> fragmentShader("void main() { gl_FragColor = vec4(1); }")

  expect.anything()
})


test.only("Invalid fragment shader throws error", () => {
  expect(() => {
    newGpu(gl)
      |> newProgram
      |> fragmentShader("foo")
    }
  ).toThrow(Error)

})

test.only("Fragment shader where with unused uniform throws", () => {
  expect(() => {
    newGpu(gl)
      |> newProgram
      |> fragmentShader(`
        uniform mediump float foo;
        void main() { gl_FragColor = vec4(1); }
      `)
  }).toThrowError(Error)
})

test.only("Identity shader", () => {
  let gpu = newGpu(gl)

  let foo = new Uint8Array(64).fill(0)
  for (let i = 0; i < 16; i++) { foo[0 + i] = 0xaa }
  for (let i = 0; i < 16; i++) { foo[16 + i] = 0xbb }
  for (let i = 0; i < 16; i++) { foo[32 + i] = 0xee }
  for (let i = 0; i < 16; i++) { foo[48 + i] = 0xff }

  let sourceTexture = gpu
    |> newTexture
    |> width(4)
    |> height(4)
    |> createGlTexture
    |> createFramebuffer
    |> uploadData(generateTestArray(4, 4))

  let destinationTexture = gpu
    |> newTexture
    |> width(4)
    |> height(4)
    |> createGlTexture
    |> createFramebuffer
    |> fill({ r: 255, g: 0, b: 0, a: 0 })


  let output = gpu
    |> newProgram
    |> fragmentShader(`
uniform sampler2D sourceTexture;
uniform mediump vec2 output_dimensions;
void main() {
  gl_FragColor = texture2D(
    sourceTexture,
    (gl_FragCoord.xy) / output_dimensions
  );
}`)
    |> arg("sourceTexture", sourceTexture)
    |> arg("output_dimensions", [4, 4])
    |> target(destinationTexture)
    |> run

  let sourceBuffer = downloadData(sourceTexture)
  let destinationBuffer = downloadData(destinationTexture)

  expect(sourceBuffer).toEqualBuffer(destinationBuffer)
})

expect.extend({
  toEqualBuffer(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView) {
    if (a.byteLength != b.byteLength) {
      return {
        message: () => `expected differing byte length. ${a.byteLength} != ${b.byteLength}`,
        pass: false
      }
    }

    //@ts-ignore
    let view1 = new Uint8Array(a.buffer || a, a.byteOffset, a.byteLength)
    //@ts-ignore
    let view2 = new Uint8Array(b.buffer || b, b.byteOffset, b.byteLength)

    let pass = true
    for (let i = 0; i < view1.length; i ++) {
      if (view1[i] != view2[i]) {
        pass = false
        break
      }
    }

    if (pass) {
      return {
        message: () =>
          "expected elements to not match",
        pass: true,
      };
    } else {
      return {
        message: () =>
          "expected elements to match",
        pass: false,
      };
    }
  },
});
