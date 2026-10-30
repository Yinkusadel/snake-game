import * as THREE from 'three'
import { createLeafGeometry } from '../snake/Rose'

export type FruitKind = 'berry' | 'apple' | 'pear' | 'dragonfruit' | 'starfruit' | 'pomegranate' | 'golden'
export type FruitTier = 'common' | 'exotic' | 'golden'

export interface FruitSpec {
  kind: FruitKind
  tier: FruitTier
  points: number
  /** Body length gained, in world units. */
  growth: number
  glow: number
  /** Seconds it stays ripe before it withers. */
  life: number
}

export const FRUIT_SPECS: Record<FruitKind, FruitSpec> = {
  berry: { kind: 'berry', tier: 'common', points: 10, growth: 1.2, glow: 0x7a5cff, life: 16 },
  apple: { kind: 'apple', tier: 'common', points: 10, growth: 1.5, glow: 0xff3355, life: 16 },
  pear: { kind: 'pear', tier: 'common', points: 10, growth: 1.5, glow: 0xc8ff3a, life: 16 },
  dragonfruit: { kind: 'dragonfruit', tier: 'exotic', points: 25, growth: 2.5, glow: 0xff2fa0, life: 13 },
  starfruit: { kind: 'starfruit', tier: 'exotic', points: 25, growth: 2.5, glow: 0xffe14d, life: 13 },
  pomegranate: { kind: 'pomegranate', tier: 'exotic', points: 25, growth: 2.5, glow: 0xe0184a, life: 13 },
  golden: { kind: 'golden', tier: 'golden', points: 50, growth: 4, glow: 0xffc233, life: 7 },
}

export const COMMON_KINDS: FruitKind[] = ['berry', 'apple', 'pear']
export const EXOTIC_KINDS: FruitKind[] = ['dragonfruit', 'starfruit', 'pomegranate']

/** Height the models float above the ground so they read as ripe, not dropped. */
export const FRUIT_HOVER = 0.3

/**
 * Builds the glowing fruit models. Each kind is built once as a prototype and
 * cloned per fruit, so all fruit share geometry and materials.
 */
export class FruitFactory {
  private readonly prototypes = new Map<FruitKind, THREE.Group>()
  private readonly sprites = new Map<number, THREE.SpriteMaterial>()
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly pulsing: THREE.MeshStandardMaterial[] = []
  private readonly dot: THREE.Texture

  constructor(dot: THREE.Texture) {
    this.dot = dot
  }

  build(kind: FruitKind): THREE.Group {
    let proto = this.prototypes.get(kind)
    if (!proto) {
      proto = this.make(kind)
      this.prototypes.set(kind, proto)
    }
    const fruit = proto.clone()
    const spec = FRUIT_SPECS[kind]

    const halo = new THREE.Sprite(this.spriteMaterial(spec.glow))
    halo.scale.setScalar(spec.tier === 'golden' ? 2.0 : 1.3)
    halo.position.y = 0.38
    fruit.add(halo)
    return fruit
  }

  /** Gentle shared glow pulse. */
  update(elapsed: number) {
    const k = 0.85 + 0.15 * Math.sin(elapsed * 3)
    for (const m of this.pulsing) m.emissiveIntensity = (m.userData.base as number) * k
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose())
    this.materials.forEach((m) => m.dispose())
    this.sprites.forEach((m) => m.dispose())
  }

  private spriteMaterial(color: number) {
    let m = this.sprites.get(color)
    if (!m) {
      m = new THREE.SpriteMaterial({
        map: this.dot,
        color: new THREE.Color(color).multiplyScalar(1.4),
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      this.sprites.set(color, m)
    }
    return m
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g)
    return g
  }

  private glow(color: number, intensity = 1, extra: THREE.MeshStandardMaterialParameters = {}) {
    const m = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.35,
      ...extra,
    })
    m.userData.base = intensity
    this.materials.push(m)
    this.pulsing.push(m)
    return m
  }

  private plain(color: number, emissive = 0x000000) {
    const m = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.6 })
    this.materials.push(m)
    return m
  }

  private stem(group: THREE.Group, y: number, height = 0.18) {
    const stem = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.018, 0.026, height, 6)), this.plain(0x3a2a14))
    stem.position.y = y + height / 2
    group.add(stem)
  }

  private leaf(group: THREE.Group, x: number, y: number, rotY: number) {
    const leaf = new THREE.Mesh(this.geo(createLeafGeometry()), this.plain(0x2fbf5a, 0x0a3a18))
    leaf.position.set(x, y, 0)
    leaf.rotation.set(-0.3, rotY, 0)
    leaf.scale.setScalar(1.8)
    group.add(leaf)
  }

  private make(kind: FruitKind): THREE.Group {
    const group = new THREE.Group()
    const spec = FRUIT_SPECS[kind]

    switch (kind) {
      case 'berry': {
        const mat = this.glow(spec.glow, 1.1)
        const sphere = this.geo(new THREE.SphereGeometry(0.15, 16, 12))
        const spots: [number, number, number][] = [
          [0, 0.16, 0],
          [0.17, 0.2, 0.05],
          [-0.15, 0.22, 0.08],
          [0.05, 0.2, -0.17],
          [-0.06, 0.38, 0.0],
          [0.12, 0.4, -0.06],
          [-0.12, 0.4, -0.08],
        ]
        for (const [x, y, z] of spots) {
          const b = new THREE.Mesh(sphere, mat)
          b.position.set(x, y, z)
          group.add(b)
        }
        this.leaf(group, 0, 0.52, 0.4)
        break
      }
      case 'apple':
      case 'golden': {
        const golden = kind === 'golden'
        const body = new THREE.Mesh(
          this.geo(new THREE.SphereGeometry(golden ? 0.36 : 0.38, 28, 20)),
          golden
            ? this.glow(0xffb81f, 1.3, { metalness: 0.85, roughness: 0.2 })
            : this.glow(spec.glow, 0.9),
        )
        body.scale.y = 0.92
        body.position.y = 0.36
        group.add(body)
        this.stem(group, 0.68)
        this.leaf(group, 0.02, 0.76, 0.2)
        if (golden) {
          const ring = new THREE.Mesh(
            this.geo(new THREE.TorusGeometry(0.58, 0.018, 8, 48)),
            this.glow(0xfff2a0, 2, { emissive: 0xfff2a0 }),
          )
          ring.rotation.x = Math.PI / 2.3
          ring.position.y = 0.4
          group.add(ring)
        }
        break
      }
      case 'pear': {
        const profile = [
          [0, 0],
          [0.19, 0.03],
          [0.31, 0.15],
          [0.33, 0.3],
          [0.25, 0.5],
          [0.16, 0.66],
          [0.14, 0.8],
          [0, 0.85],
        ].map(([x, y]) => new THREE.Vector2(x, y))
        const body = new THREE.Mesh(this.geo(new THREE.LatheGeometry(profile, 24)), this.glow(spec.glow, 0.9))
        group.add(body)
        this.stem(group, 0.82, 0.16)
        this.leaf(group, 0.03, 0.9, -0.3)
        break
      }
      case 'dragonfruit': {
        const body = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.3, 24, 18)), this.glow(spec.glow, 0.9))
        body.scale.y = 1.3
        body.position.y = 0.4
        group.add(body)

        const cone = this.geo(new THREE.ConeGeometry(0.05, 0.2, 6))
        cone.translate(0, 0.1, 0)
        const scaleMat = this.glow(0x3aff7a, 0.8)
        const count = 24
        const golden = Math.PI * (3 - Math.sqrt(5))
        const up = new THREE.Vector3(0, 1, 0)
        const normal = new THREE.Vector3()
        for (let k = 0; k < count; k++) {
          const y = 1 - ((k + 0.5) / count) * 2
          const r = Math.sqrt(1 - y * y)
          const phi = k * golden
          normal.set(Math.cos(phi) * r, y, Math.sin(phi) * r)
          const spike = new THREE.Mesh(cone, scaleMat)
          spike.position.set(normal.x * 0.3, 0.4 + normal.y * 0.39, normal.z * 0.3)
          spike.quaternion.setFromUnitVectors(up, normal.clone().normalize())
          group.add(spike)
        }
        break
      }
      case 'starfruit': {
        const shape = new THREE.Shape()
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 0.17 : 0.32
          const a = (i / 10) * Math.PI * 2
          const x = Math.cos(a) * r
          const y = Math.sin(a) * r
          if (i === 0) shape.moveTo(x, y)
          else shape.lineTo(x, y)
        }
        shape.closePath()
        const g = this.geo(
          new THREE.ExtrudeGeometry(shape, {
            depth: 0.6,
            bevelEnabled: true,
            bevelThickness: 0.04,
            bevelSize: 0.04,
            bevelSegments: 2,
          }),
        )
        g.center()
        g.rotateY(Math.PI / 2)
        const body = new THREE.Mesh(g, this.glow(spec.glow, 0.9))
        body.position.y = 0.4
        body.rotation.z = 0.35
        group.add(body)
        break
      }
      case 'pomegranate': {
        const body = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.34, 26, 18)), this.glow(spec.glow, 0.9))
        body.position.y = 0.34
        group.add(body)

        const crownMat = this.glow(spec.glow, 0.9)
        const tooth = this.geo(new THREE.ConeGeometry(0.05, 0.14, 5))
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2
          const t = new THREE.Mesh(tooth, crownMat)
          t.position.set(Math.cos(a) * 0.09, 0.7, Math.sin(a) * 0.09)
          t.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4)
          group.add(t)
        }
        break
      }
    }
    return group
  }
}
