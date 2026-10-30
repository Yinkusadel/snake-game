import * as THREE from 'three'
import { ARENA_RADIUS } from '../constants'
import { softDotTexture } from '../dot'

export type PowerKind = 'shield' | 'slow' | 'magnet' | 'dash'

export interface PowerSpec {
  kind: PowerKind
  label: string
  icon: string
  color: number
  /** Seconds the effect lasts; 0 for effects that last until used. */
  duration: number
}

export const POWER_SPECS: Record<PowerKind, PowerSpec> = {
  shield: { kind: 'shield', label: 'Shield', icon: '\u{1F6E1}️', color: 0x3ff0ff, duration: 0 },
  slow: { kind: 'slow', label: 'Time Slow', icon: '⏳', color: 0xa06bff, duration: 6 },
  magnet: { kind: 'magnet', label: 'Fruit Magnet', icon: '\u{1F9F2}', color: 0xffc857, duration: 8 },
  dash: { kind: 'dash', label: 'Lace Dash', icon: '⚡', color: 0xfff0e6, duration: 0 },
}

const KINDS = Object.keys(POWER_SPECS) as PowerKind[]
const LIFETIME = 14
const GROW_TIME = 0.5
const FADE_TIME = 0.4
const COLLECT_RADIUS = 1.3
const FIRST_DELAY = 7

interface Item {
  spec: PowerSpec
  group: THREE.Group
  core: THREE.Object3D
  marker: THREE.Mesh
  x: number
  z: number
  age: number
  seed: number
  fading: boolean
  fadeT: number
}

export interface PowerContext {
  blocked: (x: number, z: number) => boolean
}

/**
 * Glowing pickups that grant a temporary ability. At most one lies in the
 * arena at a time, and a new one appears after a short pause.
 */
export class PowerUps {
  readonly group = new THREE.Group()

  private readonly dot = softDotTexture()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly markerGeometry = new THREE.RingGeometry(0.6, 0.78, 40)
  private readonly prototypes = new Map<PowerKind, THREE.Group>()
  private items: Item[] = []
  private cooldown = FIRST_DELAY

  reset() {
    this.items.forEach((item) => this.remove(item))
    this.items = []
    this.cooldown = FIRST_DELAY
  }

  update(dt: number, elapsed: number, ctx: PowerContext | null) {
    if (ctx && this.items.length === 0) {
      this.cooldown -= dt
      if (this.cooldown <= 0) this.spawn(ctx)
    }

    for (const item of this.items) this.step(item, dt, elapsed)
    this.items = this.items.filter((item) => {
      if (item.fading && item.fadeT >= FADE_TIME) {
        this.remove(item)
        this.cooldown = 8 + Math.random() * 6
        return false
      }
      return true
    })
  }

  tryCollect(x: number, z: number): PowerSpec | null {
    for (const item of this.items) {
      if (item.fading || item.age < GROW_TIME) continue
      if (Math.hypot(item.x - x, item.z - z) < COLLECT_RADIUS) {
        this.remove(item)
        this.items = this.items.filter((i) => i !== item)
        this.cooldown = 10 + Math.random() * 8
        return item.spec
      }
    }
    return null
  }

  positions() {
    return this.items.map((i) => ({ x: i.x, z: i.z, kind: i.spec.kind }))
  }

  dispose() {
    this.reset()
    this.geometries.forEach((g) => g.dispose())
    this.materials.forEach((m) => m.dispose())
    this.markerGeometry.dispose()
    this.dot.dispose()
  }

  private spawn(ctx: PowerContext) {
    let x = 0
    let z = 0
    for (let tries = 0; tries < 30; tries++) {
      const r = Math.sqrt(Math.random()) * (ARENA_RADIUS - 6)
      const a = Math.random() * Math.PI * 2
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      if (!ctx.blocked(x, z)) break
    }

    const spec = POWER_SPECS[KINDS[Math.floor(Math.random() * KINDS.length)]]
    const group = this.build(spec).clone()
    group.position.set(x, 0, z)
    group.scale.setScalar(0.01)
    const core = group.getObjectByName('core')!

    const marker = new THREE.Mesh(
      this.markerGeometry,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(spec.color).multiplyScalar(1.6),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    )
    marker.rotation.x = -Math.PI / 2
    marker.position.set(x, 0.06, z)

    this.group.add(group, marker)
    this.items.push({ spec, group, core, marker, x, z, age: 0, seed: Math.random() * 10, fading: false, fadeT: 0 })
  }

  private step(item: Item, dt: number, elapsed: number) {
    item.age += dt
    const grow = Math.min(item.age / GROW_TIME, 1)
    let scale = grow
    const remaining = LIFETIME - item.age
    if (remaining < 3 && !item.fading) scale *= 1 + 0.1 * Math.sin(elapsed * 16)
    if (remaining <= 0 && !item.fading) item.fading = true

    if (item.fading) {
      item.fadeT += dt
      scale = Math.max(0.001, 1 - item.fadeT / FADE_TIME)
    }

    item.group.scale.setScalar(Math.max(0.01, scale))
    item.core.position.y = 1.1 + Math.sin(elapsed * 2.4 + item.seed) * 0.15
    item.core.rotation.y += dt * 1.8
    const markerMat = item.marker.material as THREE.MeshBasicMaterial
    markerMat.opacity = (0.3 + 0.2 * Math.sin(elapsed * 5 + item.seed)) * scale
    item.marker.scale.setScalar(Math.max(0.01, scale))
  }

  private remove(item: Item) {
    this.group.remove(item.group, item.marker)
    ;(item.marker.material as THREE.Material).dispose()
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g)
    return g
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m)
    return m
  }

  private build(spec: PowerSpec): THREE.Group {
    const cached = this.prototypes.get(spec.kind)
    if (cached) return cached

    const color = new THREE.Color(spec.color)
    const glow = this.mat(
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.25 }),
    )
    const bright = this.mat(
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), toneMapped: false }),
    )

    const group = new THREE.Group()
    const core = new THREE.Group()
    core.name = 'core'
    group.add(core)

    switch (spec.kind) {
      case 'shield': {
        core.add(new THREE.Mesh(this.geo(new THREE.DodecahedronGeometry(0.42)), glow))
        const ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.62, 0.025, 8, 40)), bright)
        ring.rotation.x = Math.PI / 2
        core.add(ring)
        break
      }
      case 'slow': {
        const gem = new THREE.Mesh(this.geo(new THREE.OctahedronGeometry(0.42)), glow)
        gem.scale.y = 1.3
        core.add(gem)
        const ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.66, 0.025, 8, 40)), bright)
        core.add(ring)
        break
      }
      case 'magnet': {
        const arc = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.32, 0.11, 12, 28, Math.PI)), glow)
        arc.position.y = 0.05
        core.add(arc)
        const tip = this.geo(new THREE.BoxGeometry(0.22, 0.2, 0.22))
        const white = this.mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }))
        for (const s of [-1, 1]) {
          const t = new THREE.Mesh(tip, white)
          t.position.set(s * 0.32, -0.05, 0)
          core.add(t)
        }
        break
      }
      case 'dash': {
        const arrow = new THREE.Mesh(this.geo(new THREE.ConeGeometry(0.34, 0.9, 4)), glow)
        core.add(arrow)
        const ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(0.58, 0.025, 8, 40)), bright)
        ring.rotation.x = Math.PI / 2
        ring.position.y = -0.3
        core.add(ring)
        break
      }
    }

    // A faint column of light so it can be spotted across the arena.
    const beam = new THREE.Mesh(
      this.geo(new THREE.CylinderGeometry(0.22, 0.22, 6, 14, 1, true)),
      this.mat(
        new THREE.MeshBasicMaterial({
          color: color.clone().multiplyScalar(1.6),
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      ),
    )
    beam.position.y = 3
    group.add(beam)

    const halo = new THREE.Sprite(
      this.mat(
        new THREE.SpriteMaterial({
          map: this.dot,
          color: color.clone().multiplyScalar(1.4),
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ),
    )
    halo.scale.setScalar(2.2)
    halo.position.y = 1.1
    group.add(halo)

    this.prototypes.set(spec.kind, group)
    return group
  }
}
