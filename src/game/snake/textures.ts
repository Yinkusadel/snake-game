import * as THREE from 'three'

const SIZE = 512
/** Body length, in world units, that one texture tile covers. */
export const TILE_LENGTH = 1.6

function canvas() {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  return { c, g: c.getContext('2d')! }
}

function toTexture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.beginPath()
  g.moveTo(x, y - h / 2)
  g.lineTo(x + w / 2, y)
  g.lineTo(x, y + h / 2)
  g.lineTo(x - w / 2, y)
  g.closePath()
}

/**
 * Scaled emerald skin with gold diamonds on the back, a ribbed belly and a
 * glowing belly line. U runs around the body (0.25 = back, 0.75 = belly),
 * V runs along it.
 */
export function makeBodyTextures() {
  const color = canvas()
  const emissive = canvas()
  const bump = canvas()

  color.g.fillStyle = '#0c5a33'
  color.g.fillRect(0, 0, SIZE, SIZE)
  emissive.g.fillStyle = '#000'
  emissive.g.fillRect(0, 0, SIZE, SIZE)
  bump.g.fillStyle = '#000'
  bump.g.fillRect(0, 0, SIZE, SIZE)

  // Staggered overlapping scales. Cells are tall because one tile covers far
  // more length than girth.
  const cw = 16
  const ch = 32
  for (let r = -1; r < SIZE / (ch / 2) + 1; r++) {
    const y = r * (ch / 2)
    const offset = (r % 2 ? cw / 2 : 0)
    for (let x = -cw; x < SIZE + cw; x += cw) {
      const cx = x + offset
      const shade = 0.75 + 0.25 * Math.sin(cx * 0.05 + y * 0.03)
      const grad = color.g.createRadialGradient(cx, y, 1, cx, y, ch * 0.55)
      grad.addColorStop(0, `rgb(${Math.round(60 * shade)},${Math.round(200 * shade)},${Math.round(110 * shade)})`)
      grad.addColorStop(0.7, `rgb(${Math.round(18 * shade)},${Math.round(110 * shade)},${Math.round(62 * shade)})`)
      grad.addColorStop(1, 'rgb(6,50,30)')
      color.g.fillStyle = grad
      color.g.beginPath()
      color.g.ellipse(cx, y, cw * 0.62, ch * 0.5, 0, 0, Math.PI * 2)
      color.g.fill()

      const bg = bump.g.createRadialGradient(cx, y, 1, cx, y, ch * 0.5)
      bg.addColorStop(0, '#fff')
      bg.addColorStop(1, '#222')
      bump.g.fillStyle = bg
      bump.g.beginPath()
      bump.g.ellipse(cx, y, cw * 0.62, ch * 0.5, 0, 0, Math.PI * 2)
      bump.g.fill()
    }
  }

  // Belly: pale gold plates with a glowing line down the middle.
  const bx = SIZE * 0.62
  const bw = SIZE * 0.26
  color.g.fillStyle = '#e8cf86'
  color.g.fillRect(bx, 0, bw, SIZE)
  bump.g.fillStyle = '#888'
  bump.g.fillRect(bx, 0, bw, SIZE)
  for (let y = 0; y < SIZE; y += 14) {
    color.g.fillStyle = '#b8924a'
    color.g.fillRect(bx, y, bw, 2)
    bump.g.fillStyle = '#000'
    bump.g.fillRect(bx, y, bw, 3)
  }
  emissive.g.fillStyle = '#27ffa8'
  emissive.g.fillRect(SIZE * 0.75 - 4, 0, 8, SIZE)

  // Gold diamonds along the back, smaller ones on the flanks.
  const marks: [number, number, number, number][] = [
    [SIZE * 0.25, SIZE * 0.5, 70, 190],
    [0, SIZE * 0, 34, 90],
    [SIZE, SIZE * 0, 34, 90],
    [SIZE * 0.5, SIZE * 0, 34, 90],
  ]
  for (const [x, y, w, h] of marks) {
    for (const yy of [y, y + SIZE, y - SIZE]) {
      color.g.fillStyle = '#f0b83c'
      diamond(color.g, x, yy, w, h)
      color.g.fill()
      color.g.strokeStyle = '#6a4a10'
      color.g.lineWidth = 3
      color.g.stroke()
      color.g.fillStyle = '#0f6a3a'
      diamond(color.g, x, yy, w * 0.45, h * 0.45)
      color.g.fill()

      emissive.g.fillStyle = '#6a4208'
      diamond(emissive.g, x, yy, w, h)
      emissive.g.fill()
      emissive.g.fillStyle = '#1affa0'
      diamond(emissive.g, x, yy, w * 0.3, h * 0.3)
      emissive.g.fill()

      bump.g.fillStyle = '#aaa'
      diamond(bump.g, x, yy, w, h)
      bump.g.fill()
    }
  }

  // Thin gold ring at every tile seam.
  color.g.fillStyle = '#f0b83c'
  color.g.fillRect(0, 0, SIZE, 8)
  color.g.fillRect(0, SIZE - 4, SIZE, 4)
  emissive.g.fillStyle = '#7a5008'
  emissive.g.fillRect(0, 0, SIZE, 8)

  return {
    map: toTexture(color.c, true),
    emissiveMap: toTexture(emissive.c, true),
    bumpMap: toTexture(bump.c, false),
  }
}

/** Lace with scalloped edge, floral motifs and a net background. Alpha-cut. */
export function makeLaceTexture() {
  const { c, g } = canvas()
  g.clearRect(0, 0, SIZE, SIZE)
  g.strokeStyle = 'rgba(255,244,236,0.55)'
  g.lineWidth = 2
  for (let i = -SIZE; i < SIZE * 2; i += 22) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + SIZE, SIZE)
    g.moveTo(i + SIZE, 0)
    g.lineTo(i, SIZE)
    g.stroke()
  }

  // Flowers on a grid.
  g.fillStyle = 'rgba(255,248,242,0.95)'
  for (let y = 70; y < SIZE - 100; y += 110) {
    for (let x = 60 + ((y / 110) % 2) * 55; x < SIZE; x += 110) {
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2
        g.beginPath()
        g.ellipse(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 15, 8, a, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = 'rgba(255,214,200,1)'
      g.beginPath()
      g.arc(x, y, 8, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(255,248,242,0.95)'
    }
  }

  // Scalloped border along the bottom edge.
  g.fillStyle = 'rgba(255,248,242,1)'
  for (let x = 0; x < SIZE; x += 64) {
    g.beginPath()
    g.arc(x + 32, SIZE - 56, 32, 0, Math.PI)
    g.fill()
  }
  g.fillRect(0, SIZE - 70, SIZE, 14)

  // Cut the net off below the scallops so the edge reads clearly.
  g.globalCompositeOperation = 'destination-in'
  g.fillStyle = '#fff'
  for (let x = 0; x < SIZE; x += 64) {
    g.beginPath()
    g.arc(x + 32, SIZE - 56, 32, 0, Math.PI)
    g.fill()
  }
  g.fillRect(0, 0, SIZE, SIZE - 56)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
