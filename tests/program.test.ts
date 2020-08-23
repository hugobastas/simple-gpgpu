import * as g from "../src/index"
import { generateTestArray } from "./util"
import newGl from "gl"

var gl: WebGLRenderingContext = newGl(100, 100)

test.only("Valid fragment shader does not throw error", () => {
  g.newGpu(gl)
    |> g.newProgram
    |> g.fragmentShader("void main() { gl_FragColor = vec4(1); }")

  expect.anything()
})


test.only("Invalid fragment shader throws error", () => {
  expect(() => {
    g.newGpu(gl)
      |> g.newProgram
      |> g.fragmentShader("foo")
    }
  ).toThrow(Error)

})

test.only("Fragment shader where with unused uniform throws", () => {
  expect(() => {
    g.newGpu(gl)
      |> g.newProgram
      |> g.fragmentShader(`
        uniform mediump float foo;
        void main() { gl_FragColor = vec4(1); }
      `)
  }).toThrowError(Error)
})

test.only("Fragment shader where uniform is not set throws", () => {
  expect(() => {
    g.newGpu(gl)
      |> g.newProgram
      |> g.fragmentShader(`
        uniform mediump float foo;
        void main() { gl_FragColor = vec4(foo); }
      `)
      |> g.target("canvas")
      |> g.run
  }).toThrowError(Error)
})

test.only("Identity shader", () => {
  let gpu = g.newGpu(gl)

  let sourceTexture = gpu
    |> g.newTexture
    |> g.width(4)
    |> g.height(4)
    |> g.createGlTexture
    |> g.createFramebuffer
    |> g.uploadData(generateTestArray(4, 4))

  let destinationTexture = gpu
    |> g.newTexture
    |> g.width(4)
    |> g.height(4)
    |> g.createGlTexture
    |> g.createFramebuffer
    |> g.fill({ r: 255, g: 0, b: 0, a: 0 })


  gpu
    |> g.newProgram
    |> g.fragmentShader(`
uniform sampler2D sourceTexture;
uniform mediump vec2 output_dimensions;
void main() {
  gl_FragColor = texture2D(
    sourceTexture,
    (gl_FragCoord.xy) / output_dimensions
  );
}`)
    |> g.uniform("sourceTexture", sourceTexture)
    |> g.uniform("output_dimensions", [4, 4])
    |> g.target(destinationTexture)
    |> g.run

  let sourceBuffer = g.downloadData(sourceTexture)
  let destinationBuffer = g.downloadData(destinationTexture)

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
