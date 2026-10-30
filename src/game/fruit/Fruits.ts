import * as THREE from 'three'
import { ARENA_RADIUS } from '../constants'
import { softDotTexture } from '../dot'
import {
  COMMON_KINDS,
  EXOTIC_KINDS,
  FRUIT_HOVER,
  FRUIT_SPECS,
  FruitFactory,
  type FruitKind,
  type FruitSpec,
} from './FruitModels'

const TARGET_COUNT = 3
const HANG_HEIGHT = 4.5
const GROW_TIME = 0.9
const FADE_TIME = 0.4
const EAT_RADIUS = 1.05
const GRAVITY = 20

type Phase = 'grow' | 'fall' | 'ripe' | 'fade'

interface Item {
  spec: FruitSpec
  group: THREE.Group
  marker: THREE.Mesh
  x: number
  z: number
  /** Height of the fruit's base above the ground. */
  y: number
  vy: number
  bounces: number
  phase: Phase
  /** Time spent in the current phase. */
  t: number
  /** Time spent ripe. */
  age: number
  seed: number
}

export interface SpawnContext {
  /** Returns true if a position is unusable (too close to the snake, say). */
  blocked: (x: number, z: number) => boolean
  score: number
}

export interface Eaten {
  spec: FruitSpec
  x: number
  y: number
  z: number
}

function easeOutBack(t: number) {
  const c = 1.7
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

/**
 * Fruit that grows on the garden's vines, ripens, drops to the ground and
 * withers if left too long. Common, exotic and golden varieties.
 */
export class Fruits {
  readonly group = new THREE.Group()

  private readonly dot = softDotTexture()
  private readonly factory = new FruitFactory(this.dot)
  private readonly markerGeometry = new THREE.RingGeometry(0.45, 0.6, 40)
  private items: Item[] = []
  private cooldown = 0.5

  reset() {
    this.items.forEach((item) => this.remove(item))
    this.items = []
    this.cooldown = 0.5
  }

  update(dt: number, elapsed: number, spawn: SpawnContext | null) {
    this.factory.update(elapsed)

    if (spawn) {
      this.cooldown -= dt
      const live = this.items.filter((i) => i.phase !== 'fade').length
      if (live < TARGET_COUNT && this.cooldown <= 0) {
        this.spawn(spawn)
        this.cooldown = 0.7 + Math.random() * 0.8
      }
    }

    for (const item of this.items) this.step(item, dt, elapsed)
    this.items = this.items.filter((item) => {
      if (item.phase === 'fade' && item.t >= FADE_TIME) {
        this.remove(item)
        return false
      }
      return true
    })
  }

  /** Pulls ripe fruit within `radius` towards (x, z). */
  attract(x: number, z: number, dt: number, radius: number, speed: number) {
    for (const item of this.items) {
      if (item.phase !== 'ripe') continue
      const dx = x - item.x
      const dz = z - item.z
      const d = Math.hypot(dx, dz)
      if (d > radius || d < 0.01) continue
      // Faster the closer it gets, so it snaps into her mouth.
      const pull = speed * (1.4 - d / radius) * dt
      item.x += (dx / d) * Math.min(pull, d)
      item.z += (dz / d) * Math.min(pull, d)
    }
  }

  /** Ground positions of fruit that can be eaten now or soon. */
  positions() {
    return this.items.filter((i) => i.phase !== 'fade').map((i) => ({ x: i.x, z: i.z, kind: i.spec.kind }))
  }

  /** Eats the first fruit within reach of the given ground position. */
  tryEat(x: number, z: number): Eaten | null {
    for (const item of this.items) {
      const edible = item.phase === 'ripe' || (item.phase === 'fall' && item.y < 1)
      if (!edible) continue
      if (Math.hypot(item.x - x, item.z - z) < EAT_RADIUS) {
        const eaten = { spec: item.spec, x: item.x, y: item.y + FRUIT_HOVER + 0.3, z: item.z }
        this.remove(item)
        this.items = this.items.filter((i) => i !== item)
        return eaten
      }
    }
    return null
  }

  dispose() {
    this.reset()
    this.factory.dispose()
    this.markerGeometry.dispose()
    this.dot.dispose()
  }

  private pickKind(score: number): FruitKind {
    const hasGolden = this.items.some((i) => i.spec.kind === 'golden')
    if (!hasGolden && Math.random() < 0.05) return 'golden'
    const exoticChance = Math.min(0.18 + score / 1500, 0.45)
    const pool = Math.random() < exoticChance ? EXOTIC_KINDS : COMMON_KINDS
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private spawn(ctx: SpawnContext) {
    let x = 0
    let z = 0
    for (let tries = 0; tries < 30; tries++) {
      const r = Math.sqrt(Math.random()) * (ARENA_RADIUS - 5)
      const a = Math.random() * Math.PI * 2
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      const crowded = this.items.some((i) => Math.hypot(i.x - x, i.z - z) < 3)
      if (!crowded && !ctx.blocked(x, z)) break
    }

    const spec = FRUIT_SPECS[this.pickKind(ctx.score)]
    const group = this.factory.build(spec.kind)
    group.scale.setScalar(0.01)
    group.position.set(x, HANG_HEIGHT, z)

    const marker = new THREE.Mesh(
      this.markerGeometry,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(spec.glow).multiplyScalar(1.6),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    )
    marker.rotation.x = -Math.PI / 2
    marker.position.set(x, 0.05, z)

    this.group.add(group, marker)
    this.items.push({
      spec,
      group,
      marker,
      x,
      z,
      y: HANG_HEIGHT - FRUIT_HOVER,
      vy: 0,
      bounces: 0,
      phase: 'grow',
      t: 0,
      age: 0,
      seed: Math.random() * 10,
    })
  }

  private step(item: Item, dt: number, elapsed: number) {
    item.t += dt
    item.group.position.x = item.x
    item.group.position.z = item.z
    item.marker.position.x = item.x
    item.marker.position.z = item.z
    const markerMat = item.marker.material as THREE.MeshBasicMaterial
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 6 + item.seed)

    switch (item.phase) {
      case 'grow': {
        // Swells on the vine.
        const k = Math.min(item.t / GROW_TIME, 1)
        item.group.scale.setScalar(Math.max(0.01, easeOutBack(k)))
        item.group.position.y = HANG_HEIGHT + Math.sin(elapsed * 3 + item.seed) * 0.05
        markerMat.opacity = 0.25 + 0.35 * pulse
        item.marker.scale.setScalar(0.6 + k * 0.4)
        if (k >= 1) {
          item.phase = 'fall'
          item.t = 0
          item.vy = 0
        }
        break
      }
      case 'fall': {
        item.vy -= GRAVITY * dt
        item.y += item.vy * dt
        if (item.y <= 0) {
          item.y = 0
          if (item.bounces < 2) {
            item.vy = -item.vy * 0.4
            item.bounces++
          } else {
            item.phase = 'ripe'
            item.t = 0
          }
        }
        item.group.position.y = item.y + FRUIT_HOVER
        markerMat.opacity = 0.35 + 0.4 * pulse
        break
      }
      case 'ripe': {
        item.age += dt
        const bob = Math.sin(elapsed * 2.2 + item.seed) * 0.08
        item.group.position.y = FRUIT_HOVER + bob
        item.group.rotation.y += dt * 1.2

        // Flickers as it nears the end of its life.
        const remaining = item.spec.life - item.age
        const warn = remaining < 3 ? 1 + 0.12 * Math.sin(elapsed * 16) : 1
        item.group.scale.setScalar(warn)
        markerMat.opacity = 0.22 + 0.12 * pulse
        item.marker.scale.setScalar(1 + 0.08 * pulse)
        if (remaining <= 0) {
          item.phase = 'fade'
          item.t = 0
        }
        break
      }
      case 'fade': {
        const k = 1 - Math.min(item.t / FADE_TIME, 1)
        item.group.scale.setScalar(Math.max(0.001, k))
        markerMat.opacity *= k
        break
      }
    }
  }

  private remove(item: Item) {
    this.group.remove(item.group, item.marker)
    ;(item.marker.material as THREE.Material).dispose()
  }
}
