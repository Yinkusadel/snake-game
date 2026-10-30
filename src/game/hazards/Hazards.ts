import * as THREE from 'three'
import { ARENA_RADIUS } from '../constants'
import { createHoloMaterial } from '../holo'

export type HazardKind = 'thorn' | 'pillar'

/** Seconds of warning before a hazard becomes deadly. */
const THORN_WARN = 1.2
const THORN_SPROUT = 0.7
const PILLAR_WARN = 1.5
const PILLAR_RISE = 1.0
const PILLAR_HEIGHT = 5.4
/** Contact distance between the head and a hazard's centre. */
const THORN_REACH = 1.35
const PILLAR_REACH = 1.35
const THORN_CAP = 10
const PILLAR_CAP = 4

export interface Hazard {
  kind: HazardKind
  group: THREE.Group
  ring: THREE.Mesh
  x: number
  z: number
  t: number
  deadly: boolean
  /** Pillars circle the arena centre. */
  orbit?: { angle: number; radius: number; speed: number }
}

export interface HazardContext {
  score: number
  blocked: (x: number, z: number) => boolean
}

function ease(t: number) {
  const c = Math.min(Math.max(t, 0), 1)
  return 1 - Math.pow(1 - c, 3)
}

/**
 * Thorn vines that sprout and spread as the score climbs, and slow
 * holographic pillars that circle the arena in the later levels.
 */
export class Hazards {
  readonly group = new THREE.Group()

  /** Advance every frame; drives the pillars' scan-lines. */
  readonly time = { value: 0 }

  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly thornPrototype: THREE.Group
  private readonly pillarPrototype: THREE.Group
  private readonly ringGeometry = new THREE.RingGeometry(0.85, 1.1, 40)
  private items: Hazard[] = []
  private cooldown = 2

  constructor() {
    this.thornPrototype = this.buildThorn()
    this.pillarPrototype = this.buildPillar()
  }

  reset() {
    this.items.forEach((item) => this.remove(item))
    this.items = []
    this.cooldown = 2
  }

  update(dt: number, elapsed: number, ctx: HazardContext | null) {
    this.time.value = elapsed

    if (ctx) {
      this.cooldown -= dt
      if (this.cooldown <= 0) {
        const thorns = this.count('thorn')
        const pillars = this.count('pillar')
        const thornTarget = Math.min(THORN_CAP, Math.floor(ctx.score / 60) + (ctx.score >= 20 ? 1 : 0))
        const pillarTarget = ctx.score < 250 ? 0 : Math.min(PILLAR_CAP, 1 + Math.floor((ctx.score - 250) / 150))

        if (pillars < pillarTarget) this.spawnPillar(ctx)
        else if (thorns < thornTarget) this.spawnThorn(ctx)
        this.cooldown = 2.2
      }
    }

    for (const item of this.items) this.step(item, dt, elapsed)
  }

  /** The deadly hazard touching a head at (x, z), if any. */
  hit(x: number, z: number): Hazard | null {
    for (const item of this.items) {
      if (!item.deadly) continue
      const reach = item.kind === 'thorn' ? THORN_REACH : PILLAR_REACH
      if (Math.hypot(item.x - x, item.z - z) < reach) return item
    }
    return null
  }

  destroy(item: Hazard) {
    this.remove(item)
    this.items = this.items.filter((i) => i !== item)
  }

  positions() {
    return this.items.map((i) => ({ x: i.x, z: i.z, kind: i.kind, deadly: i.deadly }))
  }

  dispose() {
    this.reset()
    this.geometries.forEach((g) => g.dispose())
    this.materials.forEach((m) => m.dispose())
    this.ringGeometry.dispose()
  }

  private count(kind: HazardKind) {
    return this.items.filter((i) => i.kind === kind).length
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g)
    return g
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m)
    return m
  }

  private buildThorn() {
    const group = new THREE.Group()
    const thornMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x24103a, emissive: 0x3a0a4a, roughness: 0.55 }))
    const budMat = this.mat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a7a).multiplyScalar(2.4), toneMapped: false }),
    )
    const bud = this.geo(new THREE.SphereGeometry(0.1, 10, 8))

    const spikes = 8
    for (let i = 0; i < spikes; i++) {
      const center = i === 0
      const a = (i / spikes) * Math.PI * 2
      const dist = center ? 0 : 0.5 + (i % 3) * 0.12
      const height = center ? 2.1 : 1.3 + (i % 3) * 0.25
      const cone = this.geo(new THREE.ConeGeometry(center ? 0.3 : 0.2, height, 7))
      cone.translate(0, height / 2, 0)

      const spike = new THREE.Mesh(cone, thornMat)
      spike.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist)
      spike.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25)
      group.add(spike)

      const tip = new THREE.Mesh(bud, budMat)
      tip.position.set(0, height + 0.05, 0)
      spike.add(tip)
    }
    return group
  }

  private buildPillar() {
    const group = new THREE.Group()
    const stone = this.mat(new THREE.MeshStandardMaterial({ color: 0x1a2b30, roughness: 0.8 }))
    const shaft = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.7, 0.8, PILLAR_HEIGHT, 14)), stone)
    shaft.position.y = PILLAR_HEIGHT / 2
    group.add(shaft)

    const shell = new THREE.Mesh(
      this.geo(new THREE.CylinderGeometry(0.95, 1.05, PILLAR_HEIGHT + 0.3, 14, 1, true)),
      this.mat(createHoloMaterial(this.time, 0x3ff0ff)),
    )
    shell.position.y = PILLAR_HEIGHT / 2
    group.add(shell)

    const gold = this.mat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc857).multiplyScalar(2), toneMapped: false }),
    )
    const band = this.geo(new THREE.TorusGeometry(0.82, 0.06, 6, 24))
    for (const t of [0.2, 0.55, 0.9]) {
      const b = new THREE.Mesh(band, gold)
      b.rotation.x = Math.PI / 2
      b.position.y = PILLAR_HEIGHT * t
      group.add(b)
    }
    return group
  }

  private spawnThorn(ctx: HazardContext) {
    const existing = this.items.filter((i) => i.kind === 'thorn')
    let x = 0
    let z = 0
    for (let tries = 0; tries < 40; tries++) {
      // Often spreads from an existing patch, like a creeping vine.
      if (existing.length && Math.random() < 0.55) {
        const from = existing[Math.floor(Math.random() * existing.length)]
        const a = Math.random() * Math.PI * 2
        const d = 2.4 + Math.random() * 1.4
        x = from.x + Math.cos(a) * d
        z = from.z + Math.sin(a) * d
      } else {
        const r = Math.sqrt(Math.random()) * (ARENA_RADIUS - 5)
        const a = Math.random() * Math.PI * 2
        x = Math.cos(a) * r
        z = Math.sin(a) * r
      }
      if (Math.hypot(x, z) > ARENA_RADIUS - 3.5) continue
      const crowded = this.items.some((i) => Math.hypot(i.x - x, i.z - z) < 2.2)
      if (!crowded && !ctx.blocked(x, z)) {
        this.add('thorn', x, z)
        return
      }
    }
  }

  private spawnPillar(ctx: HazardContext) {
    for (let tries = 0; tries < 40; tries++) {
      const radius = 8 + Math.random() * 12
      const angle = Math.random() * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      if (!ctx.blocked(x, z)) {
        const direction = Math.random() < 0.5 ? -1 : 1
        this.add('pillar', x, z, { angle, radius, speed: direction * (0.1 + Math.random() * 0.08) })
        return
      }
    }
  }

  private add(kind: HazardKind, x: number, z: number, orbit?: Hazard['orbit']) {
    const group = (kind === 'thorn' ? this.thornPrototype : this.pillarPrototype).clone()
    group.position.set(x, kind === 'pillar' ? -PILLAR_HEIGHT - 0.5 : 0, z)
    group.rotation.y = Math.random() * Math.PI * 2
    if (kind === 'thorn') group.scale.set(1, 0.001, 1)

    const ring = new THREE.Mesh(
      this.ringGeometry,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xff2a4a).multiplyScalar(1.8),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.07, z)

    this.group.add(group, ring)
    this.items.push({ kind, group, ring, x, z, t: 0, deadly: false, orbit })
  }

  private step(item: Hazard, dt: number, elapsed: number) {
    item.t += dt
    const ringMat = item.ring.material as THREE.MeshBasicMaterial
    const warn = item.kind === 'thorn' ? THORN_WARN : PILLAR_WARN
    const grow = item.kind === 'thorn' ? THORN_SPROUT : PILLAR_RISE
    const k = ease((item.t - warn) / grow)

    if (item.orbit) {
      item.orbit.angle += item.orbit.speed * dt
      item.x = Math.cos(item.orbit.angle) * item.orbit.radius
      item.z = Math.sin(item.orbit.angle) * item.orbit.radius
      item.ring.position.set(item.x, 0.07, item.z)
    }

    if (item.kind === 'thorn') {
      item.group.scale.set(1, Math.max(0.001, k), 1)
    } else {
      item.group.position.set(item.x, -(PILLAR_HEIGHT + 0.5) * (1 - k), item.z)
    }
    item.deadly = k > 0.7

    // Red warning ring flashes while it builds, then settles to a faint glow.
    if (item.t < warn) {
      ringMat.opacity = 0.35 + 0.35 * Math.sin(elapsed * 14)
      item.ring.scale.setScalar(0.7 + 0.3 * (item.t / warn))
    } else {
      ringMat.opacity = 0.18 + 0.08 * Math.sin(elapsed * 4)
      item.ring.scale.setScalar(1)
    }
  }

  private remove(item: Hazard) {
    this.group.remove(item.group, item.ring)
    ;(item.ring.material as THREE.Material).dispose()
  }
}
