import * as THREE from 'three'
import { SnakeHead } from './Head'
import { makeBodyTextures, TILE_LENGTH } from './textures'
import { TubeMesh } from './TubeMesh'

/** Distance between body rings. */
const STEP = 0.18
const MAX_RINGS = 800
/** Height of the head above the ground while she rears up. */
export const HEAD_HEIGHT = 1.5
/** How far back along the body the neck rises from the ground. */
const LIFT_LENGTH = 3.4
const MIN_TRAIL_GAP = 0.08
const INITIAL_LENGTH = 8

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

interface TrailPoint {
  x: number
  z: number
}

/**
 * The girl snake: a head that follows the player's input and a body that
 * follows the exact path the head has travelled, rebuilt each frame as a
 * tapered, slithering tube.
 */
export class Snake {
  readonly group = new THREE.Group()

  private readonly head = new SnakeHead()
  private readonly body = new TubeMesh(MAX_RINGS, 20)
  private readonly points = Array.from({ length: MAX_RINGS }, () => new THREE.Vector3())
  private readonly radii = new Float32Array(MAX_RINGS)
  private readonly vs = new Float32Array(MAX_RINGS)
  private readonly sampleX = new Float32Array(MAX_RINGS)
  private readonly sampleZ = new Float32Array(MAX_RINGS)

  /** Newest first. Positions the head has passed through. */
  private readonly trail: TrailPoint[] = []
  private length = INITIAL_LENGTH
  private pending = 0
  private travelled = 0
  private lastX: number
  private lastZ: number
  private roll = 0
  private ringCount = 0

  constructor(x: number, z: number, heading: number) {
    this.lastX = x
    this.lastZ = z

    const textures = makeBodyTextures()
    const material = new THREE.MeshStandardMaterial({
      map: textures.map,
      emissiveMap: textures.emissiveMap,
      emissive: 0xffffff,
      emissiveIntensity: 1.1,
      bumpMap: textures.bumpMap,
      bumpScale: 2,
      roughness: 0.42,
      metalness: 0.12,
    })
    const mesh = new THREE.Mesh(this.body.geometry, material)
    mesh.frustumCulled = false
    this.group.add(mesh, this.head.group, this.head.world)

    // Start with a straight tail behind the head.
    const bx = -Math.sin(heading)
    const bz = -Math.cos(heading)
    for (let d = MIN_TRAIL_GAP; d <= this.length + 2; d += MIN_TRAIL_GAP) {
      this.trail.push({ x: x + bx * d, z: z + bz * d })
    }
  }

  /** Lengthen the snake. The tail stays put while the head moves on. */
  grow(units: number) {
    this.pending += units
  }

  update(dt: number, elapsed: number, x: number, z: number, heading: number, steer: number) {
    const moved = Math.hypot(x - this.lastX, z - this.lastZ)
    this.travelled += moved
    this.lastX = x
    this.lastZ = z

    const newest = this.trail[0]
    if (!newest || Math.hypot(x - newest.x, z - newest.z) >= MIN_TRAIL_GAP) {
      this.trail.unshift({ x, z })
    }

    if (this.pending > 0) {
      const g = Math.min(this.pending, moved)
      this.length += g
      this.pending -= g
    }
    this.length = Math.min(this.length, (MAX_RINGS - 2) * STEP)
    this.trimTrail()

    this.sampleBody(x, z)
    this.buildBody(elapsed)

    this.roll += (-steer * 0.18 - this.roll) * Math.min(1, dt * 6)
    this.head.group.position.set(x, HEAD_HEIGHT + Math.sin(elapsed * 2.1) * 0.025, z)
    this.head.group.rotation.set(0.06, heading, this.roll, 'YXZ')
    this.head.update(dt, elapsed)
  }

  private trimTrail() {
    let acc = 0
    for (let i = 1; i < this.trail.length; i++) {
      acc += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].z - this.trail[i - 1].z)
      if (acc > this.length + 2) {
        this.trail.length = i + 1
        return
      }
    }
  }

  /** Walks the trail, writing evenly spaced ground positions into sampleX/Z. */
  private sampleBody(headX: number, headZ: number) {
    const trail = this.trail
    const px = (i: number) => (i === 0 ? headX : trail[i - 1].x)
    const pz = (i: number) => (i === 0 ? headZ : trail[i - 1].z)
    const last = trail.length

    let seg = 0
    let segStart = 0
    const rings = Math.min(Math.floor(this.length / STEP) + 1, MAX_RINGS)
    this.ringCount = rings

    for (let k = 0; k < rings; k++) {
      const s = k * STEP
      let segLen = 0
      while (seg < last) {
        segLen = Math.hypot(px(seg + 1) - px(seg), pz(seg + 1) - pz(seg))
        if (segStart + segLen >= s) break
        segStart += segLen
        seg++
      }
      if (seg >= last) {
        // Ran out of recorded path: continue straight from the end.
        const dx = px(last) - px(last - 1)
        const dz = pz(last) - pz(last - 1)
        const len = Math.hypot(dx, dz) || 1
        const extra = s - segStart
        this.sampleX[k] = px(last) + (dx / len) * extra
        this.sampleZ[k] = pz(last) + (dz / len) * extra
      } else {
        const t = segLen > 0 ? (s - segStart) / segLen : 0
        this.sampleX[k] = px(seg) + (px(seg + 1) - px(seg)) * t
        this.sampleZ[k] = pz(seg) + (pz(seg + 1) - pz(seg)) * t
      }
    }
  }

  private buildBody(elapsed: number) {
    const n = this.ringCount
    const maxRadius = 0.55 + Math.min(0.15, (this.length - INITIAL_LENGTH) * 0.004)

    for (let i = 0; i < n; i++) {
      const s = i * STEP
      const t = s / this.length

      const tail = 1 - smoothstep(0.5, 1, t) * 0.94
      const neck = 0.78 + 0.22 * smoothstep(0, 2, s)
      const r = Math.max(0.05, maxRadius * tail * neck)
      this.radii[i] = r

      const lift = s < LIFT_LENGTH ? HEAD_HEIGHT * (1 - s / LIFT_LENGTH) ** 2 : 0
      const y = lift + r * 0.85 * smoothstep(0, LIFT_LENGTH, s)

      // Slither: sideways wave that grows away from the neck and fades at the tip.
      const a = Math.max(i - 1, 0)
      const b = Math.min(i + 1, n - 1)
      const dx = this.sampleX[b] - this.sampleX[a]
      const dz = this.sampleZ[b] - this.sampleZ[a]
      const len = Math.hypot(dx, dz) || 1
      const wave = Math.sin(s * 1.3 - elapsed * 4) * 0.12 * smoothstep(0.6, 3, s) * (1 - t * 0.6)

      this.points[i].set(this.sampleX[i] + (-dz / len) * wave, y, this.sampleZ[i] + (dx / len) * wave)
      this.vs[i] = (this.travelled - s) / TILE_LENGTH
    }

    this.body.update(this.points, this.radii, this.vs, n, 0.92)
  }

  dispose() {
    this.group.clear()
  }
}
