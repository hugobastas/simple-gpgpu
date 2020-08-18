import * as _ from "../src/index"
import { generateTestArray } from "./util"
import newGl from "gl"

var gl: WebGLRenderingContext = newGl(100, 100)

test("Uploading data with unexpected length should result in an error", () => {
  let gpu = _.newGpu(gl)

  let threeByFourTexture = gpu
    |> _.newTexture
    |> _.width(2)
    |> _.height(3)
    |> _.createGlTexture

  expect(() =>
    threeByFourTexture
      |> _.uploadData(generateTestArray(2, 3))
  ).not.toThrow()

  expect(() =>
    threeByFourTexture
      |> _.uploadData(generateTestArray(1, 2))
  ).toThrow()

  expect(() =>
    threeByFourTexture
      |> _.uploadData(generateTestArray(4, 4))
  ).toThrow()

  expect(() =>
    threeByFourTexture
      |> _.uploadData(generateTestArray(1, 10))
  ).toThrow()
})

test("Uploading then downloading should result in identical data", () => {
  let gpu = _.newGpu(gl)
  let data: ArrayBuffer

  data = gpu
    |> _.newTexture
    |> _.width(0)
    |> _.height(0)
    |> _.createGlTexture
    |> _.createFramebuffer
    |> _.uploadData(generateTestArray(0, 0))
    |> _.downloadData

  //@ts-ignore
  expect(data).toEqualBuffer(generateTestArray(0, 0))

  data = gpu
    |> _.newTexture
    |> _.width(4)
    |> _.height(3)
    |> _.createGlTexture
    |> _.createFramebuffer
    |> _.uploadData(generateTestArray(4, 3))
    |> _.downloadData

  //@ts-ignore
  expect(data).toEqualBuffer(generateTestArray(4, 3))
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

