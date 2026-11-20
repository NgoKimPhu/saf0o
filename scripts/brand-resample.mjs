import { PNG } from 'pngjs'

// Lanczos3, separable, on premultiplied alpha so transparent corners do not bleed colour.
const lanczos = (x) => {
  if (x === 0) return 1
  if (Math.abs(x) >= 3) return 0
  const px = Math.PI * x
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px)
}

const pass = (src, srcW, srcH, dstW, dstH) => {
  const horizontal = dstH === srcH
  const [from, to] = horizontal ? [srcW, dstW] : [srcH, dstH]
  const scale = to / from
  const support = 3 * Math.max(1, 1 / scale)
  const out = new Float32Array(dstW * dstH * 4)
  for (let d = 0; d < to; d += 1) {
    const centre = (d + 0.5) / scale - 0.5
    const weights = []
    let total = 0
    for (let s = Math.ceil(centre - support); s <= Math.floor(centre + support); s += 1) {
      const w = lanczos((s - centre) * Math.min(1, scale))
      weights.push([Math.min(from - 1, Math.max(0, s)), w])
      total += w
    }
    for (let line = 0; line < (horizontal ? srcH : srcW); line += 1) {
      for (let c = 0; c < 4; c += 1) {
        let acc = 0
        for (const [s, w] of weights) {
          acc += w * src[(horizontal ? line * srcW + s : s * srcW + line) * 4 + c]
        }
        out[(horizontal ? line * dstW + d : d * dstW + line) * 4 + c] = acc / total
      }
    }
  }
  return out
}

// Resize a pngjs PNG to size x size (square). Returns a new PNG.
export const resizePng = (png, size) => {
  const premultiplied = new Float32Array(png.width * png.height * 4)
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255
    for (let c = 0; c < 3; c += 1) premultiplied[i + c] = png.data[i + c] * a
    premultiplied[i + 3] = png.data[i + 3]
  }
  const wide = pass(premultiplied, png.width, png.height, size, png.height)
  const tall = pass(wide, size, png.height, size, size)
  const out = new PNG({ width: size, height: size })
  for (let i = 0; i < tall.length; i += 4) {
    const a = Math.min(255, Math.max(0, tall[i + 3]))
    for (let c = 0; c < 3; c += 1) {
      out.data[i + c] = a === 0 ? 0 : Math.min(255, Math.max(0, Math.round((tall[i + c] * 255) / a)))
    }
    out.data[i + 3] = Math.round(a)
  }
  return out
}

export const resizedPngBuffer = (png, size) => PNG.sync.write(resizePng(png, size))
