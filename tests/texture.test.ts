import * as _ from "../src/index"
import newGl from "gl"

var gl: WebGLRenderingContext = newGl(100, 100)

test("Uploading data with unexpected length should result in an error", () => {
  let gpu = _.newGpu(gl)

  let threeByFourTexture = gpu
    |> _.newTexture
    |> _.width(2)
    |> _.height(3)
    |> _.createTexture

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
    |> _.createTexture
    |> _.createBoundFramebuffer
    |> _.uploadData(generateTestArray(0, 0))
    |> _.downloadData

  //@ts-ignore
  expect(data).toEqualBuffer(generateTestArray(0, 0))

  data = gpu
    |> _.newTexture
    |> _.width(4)
    |> _.height(3)
    |> _.createTexture
    |> _.createBoundFramebuffer
    |> _.uploadData(generateTestArray(4, 3))
    |> _.downloadData

  //@ts-ignore
  expect(data).toEqualBuffer(generateTestArray(4, 3))
})

function generateTestArray(width: number, height: number): ArrayBufferView {
  if (width * height * 4 > 255)
    throw Error("Test data to large")

  let view = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height * 4; i ++) {
    view[i] = i
  }

  return view
}

expect.extend({
  toEqualBuffer(received: ArrayBuffer | ArrayBufferView, buffer: ArrayBuffer | ArrayBufferView) {
    if (received.byteLength != buffer.byteLength) {
      return {
        message: () => `expected same byte length. ${received.byteLength} != ${buffer.byteLength}`,
        pass: false
      }
    }

    let view1: Uint8Array
    let view2: Uint8Array

    if (received instanceof ArrayBuffer)
      view1 = new Uint8Array(received)
    else
      view1 = new Uint8Array(received.buffer, received.byteOffset, received.byteLength)

    if (buffer instanceof ArrayBuffer)
      view2 = new Uint8Array(buffer)
    else
      view2 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)

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

