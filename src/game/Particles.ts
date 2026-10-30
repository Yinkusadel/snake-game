import * as THREE from 'three'

/** A pooled burst emitter for pickups and crashes. */
export class Particles {
  readonly points: THREE.Points

  private readonly count: number
  private readonly positions: Float32Array
  private readonly colors: Float32Array
  private readonly base: Float32Array
  private readonly velocity: Float32Array
  private readonly life: Float32Array
  private readonly maxLife: Float32Array
  private next = 0

  constructor(count: number, dot: THREE.Texture) {
    this.count = count
    this.positions = new Float32Array(count * 3).fill(-1000)
    this.colors = new Float32Array(count * 3)
    this.base = new Float32Array(count * 3)
    this.velocity = new Float32Array(count * 3)
    this.life = new Float32Array(count)
    this.maxLife = new Float32Array(count).fill(1)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: dot,
        size: 0.28,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.points.frustumCulled = false
  }

  burst(x: number, y: number, z: number, color: number, amount: number, speed: number) {
    const c = new THREE.Color(color).multiplyScalar(2)
    for (let n = 0; n < amount; n++) {
      const i = this.next
      this.next = (this.next + 1) % this.count

      // Random direction on a sphere, biased upwards.
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const s = speed * (0.4 + Math.random() * 0.6)
      this.positions.set([x, y, z], i * 3)
      this.velocity.set([Math.cos(a) * r * s, Math.abs(u) * s + speed * 0.3, Math.sin(a) * r * s], i * 3)
      this.base.set([c.r, c.g, c.b], i * 3)
      this.maxLife[i] = 0.6 + Math.random() * 0.6
      this.life[i] = this.maxLife[i]
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0
        continue
      }
      this.life[i] -= dt
      this.velocity[i * 3 + 1] -= 7 * dt
      const drag = Math.max(0, 1 - 1.5 * dt)
      this.velocity[i * 3] *= drag
      this.velocity[i * 3 + 2] *= drag
      for (let k = 0; k < 3; k++) this.positions[i * 3 + k] += this.velocity[i * 3 + k] * dt
      if (this.positions[i * 3 + 1] < 0.05) {
        this.positions[i * 3 + 1] = 0.05
        this.velocity[i * 3 + 1] *= -0.3
      }
      const fade = Math.max(0, this.life[i] / this.maxLife[i])
      for (let k = 0; k < 3; k++) this.colors[i * 3 + k] = this.base[i * 3 + k] * fade
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
  }
}
