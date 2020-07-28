export function generateTestArray(width: number, height: number): ArrayBufferView {
  if (width * height * 4 > 255)
    throw Error("Test data to large")

  let view = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height * 4; i ++) {
    view[i] = i
  }

  return view
}

declare global {
  namespace jest {
    interface Matchers<R> {
      toEqualBuffer(a: ArrayBuffer | ArrayBufferView): R;
    }
  }
}

