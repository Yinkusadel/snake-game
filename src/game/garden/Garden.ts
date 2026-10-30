import * as THREE from 'three'
import { ARENA_RADIUS } from '../constants'
import { softDotTexture } from '../dot'
import { mulberry32 } from '../random'

const COLORS = {
  cyan: 0x3ff0ff,
  pink: 0xff4fa3,
  green: 0x5dff9a,
  gold: 0xffc857,
  violet: 0xa06bff,
}

type Rng = () => number

/** Unlit material whose colour is pushed above 1 so the bloom pass picks it up. */
function glowMaterial(color: number, intensity = 2.2) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    toneMapped: false,
  })
}

function range(rng: Rng, min: number, max: number) {
  return min + rng() * (max - min)
}

function polar(radius: number, angle: number) {
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  place: (i: number, dummy: THREE.Object3D) => void,
) {
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    place(i, dummy)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

/**
 * The bioluminescent cyber-garden: glowing ground, thorn wall, flora,
 * holographic ruins, fireflies and stars. Purely visual for now.
 */
export class Garden {
  readonly group = new THREE.Group()

  private rng = mulberry32(2026)
  private time = { value: 0 }
  private dot = softDotTexture()
  private pulsing: { material: THREE.MeshBasicMaterial; base: THREE.Color; speed: number }[] = []
  private fireflies!: THREE.Points
  private fireflyPhase!: Float32Array
  private fireflyHome!: Float32Array
  private petals!: THREE.Points

  constructor() {
    this.addGround()
    this.addThornWall()
    this.addMushrooms()
    this.addRoses()
    this.addVines()
    this.addRuins()
    this.addFireflies()
    this.addPetals()
    this.addStars()
  }

  update(elapsed: number, dt: number) {
    this.time.value = elapsed

    for (const p of this.pulsing) {
      p.material.color.copy(p.base).multiplyScalar(0.75 + 0.25 * Math.sin(elapsed * p.speed))
    }

    const pos = this.fireflies.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const ph = this.fireflyPhase[i]
      pos.setXYZ(
        i,
        this.fireflyHome[i * 3] + Math.sin(elapsed * 0.6 + ph) * 1.2,
        this.fireflyHome[i * 3 + 1] + Math.sin(elapsed * 0.9 + ph * 2) * 0.6,
        this.fireflyHome[i * 3 + 2] + Math.cos(elapsed * 0.5 + ph) * 1.2,
      )
    }
    pos.needsUpdate = true
    ;(this.fireflies.material as THREE.PointsMaterial).opacity = 0.7 + 0.3 * Math.sin(elapsed * 2)

    const pp = this.petals.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pp.count; i++) {
      let y = pp.getY(i) - dt * 0.6
      const x = pp.getX(i) + Math.sin(elapsed + i) * dt * 0.8
      if (y < 0.1) y = 9
      pp.setXYZ(i, x, y, pp.getZ(i) + Math.cos(elapsed * 0.8 + i) * dt * 0.8)
    }
    pp.needsUpdate = true
  }

  private pulse(material: THREE.MeshBasicMaterial, speed = 1.5) {
    this.pulsing.push({ material, base: material.color.clone(), speed })
    return material
  }

  private holoMaterial(color: number) {
    return new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uColor: { value: new THREE.Color(color) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorld;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          vView = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vWorld;
        varying vec3 vView;
        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
          float scan = 0.5 + 0.5 * sin(vWorld.y * 7.0 - uTime * 2.0);
          float alpha = (0.08 + fresnel * 0.8) * (0.35 + 0.65 * scan);
          gl_FragColor = vec4(uColor * 2.2, alpha);
        }
      `,
    })
  }

  private addGround() {
    const rng = this.rng
    const size = 1024

    const base = document.createElement('canvas')
    base.width = base.height = size
    const bg = base.getContext('2d')!
    bg.fillStyle = '#0d2e2e'
    bg.fillRect(0, 0, size, size)
    for (let i = 0; i < 7000; i++) {
      const teal = rng() > 0.5
      bg.fillStyle = teal ? 'rgba(30,110,100,0.18)' : 'rgba(2,12,16,0.35)'
      bg.beginPath()
      bg.arc(rng() * size, rng() * size, range(rng, 1, 6), 0, Math.PI * 2)
      bg.fill()
    }

    const veins = document.createElement('canvas')
    veins.width = veins.height = size
    const vg = veins.getContext('2d')!
    vg.fillStyle = '#000'
    vg.fillRect(0, 0, size, size)
    vg.lineCap = 'round'
    for (let i = 0; i < 70; i++) {
      let x = rng() * size
      let y = rng() * size
      let a = rng() * Math.PI * 2
      vg.strokeStyle = rng() > 0.25 ? 'rgba(70,255,200,0.9)' : 'rgba(190,120,255,0.9)'
      vg.lineWidth = range(rng, 1, 2.5)
      vg.beginPath()
      vg.moveTo(x, y)
      for (let s = 0; s < 30; s++) {
        a += range(rng, -0.6, 0.6)
        x += Math.cos(a) * 14
        y += Math.sin(a) * 14
        vg.lineTo(x, y)
      }
      vg.stroke()
    }

    const baseTex = new THREE.CanvasTexture(base)
    baseTex.colorSpace = THREE.SRGBColorSpace
    baseTex.anisotropy = 8
    const veinTex = new THREE.CanvasTexture(veins)
    veinTex.colorSpace = THREE.SRGBColorSpace
    veinTex.anisotropy = 8

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS + 3, 128),
      new THREE.MeshStandardMaterial({
        map: baseTex,
        emissiveMap: veinTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.4,
        roughness: 0.85,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    this.group.add(ground)

    const outer = new THREE.Mesh(
      new THREE.CircleGeometry(120, 64),
      new THREE.MeshStandardMaterial({ color: 0x07181c, roughness: 1 }),
    )
    outer.rotation.x = -Math.PI / 2
    outer.position.y = -0.03
    this.group.add(outer)

    // Glowing boundary line at the edge of the playfield.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_RADIUS - 0.4, 0.07, 8, 192),
      this.pulse(glowMaterial(COLORS.green, 1.4), 1.2),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.06
    this.group.add(rim)

    // Faint inner rings give the floor a sense of scale and motion.
    for (const r of [10, 20]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.03, 6, 128),
        this.pulse(glowMaterial(COLORS.cyan, 0.9), 0.8 + r * 0.02),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.03
      this.group.add(ring)
    }
  }

  private addThornWall() {
    const rng = this.rng
    const thornGeo = new THREE.ConeGeometry(0.3, 2.4, 6)
    thornGeo.translate(0, 1.2, 0)
    const budGeo = new THREE.SphereGeometry(0.11, 8, 6)
    budGeo.translate(0, 2.45, 0)

    const perRing = 150
    const rings = [0.1, 1.1, 2.1]
    const count = perRing * rings.length
    const matrices: THREE.Matrix4[] = []

    const thorns = makeInstanced(
      thornGeo,
      new THREE.MeshStandardMaterial({ color: 0x1b1030, emissive: 0x2a0f3a, roughness: 0.6 }),
      count,
      (i, d) => {
        const ring = Math.floor(i / perRing)
        const angle = ((i % perRing) / perRing) * Math.PI * 2 + range(rng, -0.02, 0.02)
        const { x, z } = polar(ARENA_RADIUS + rings[ring] + range(rng, -0.2, 0.2), angle)
        const s = range(rng, 0.8, 1.7) * (1 + ring * 0.12)
        d.position.set(x, 0, z)
        d.rotation.set(range(rng, -0.35, 0.35), range(rng, 0, Math.PI), range(rng, -0.35, 0.35))
        d.scale.set(s, s, s)
        d.updateMatrix()
        matrices[i] = d.matrix.clone()
      },
    )
    this.group.add(thorns)

    const budIndices = matrices.map((_, i) => i).filter((i) => i % 4 === 0)
    const buds = new THREE.InstancedMesh(
      budGeo,
      this.pulse(glowMaterial(COLORS.pink, 2.6), 2),
      budIndices.length,
    )
    budIndices.forEach((src, i) => buds.setMatrixAt(i, matrices[src]))
    buds.instanceMatrix.needsUpdate = true
    this.group.add(buds)
  }

  private addMushrooms() {
    const rng = this.rng
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8)
    stemGeo.translate(0, 0.25, 0)
    const capGeo = new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    capGeo.translate(0, 0.5, 0)

    const count = 120
    const palette = [COLORS.cyan, COLORS.violet, COLORS.green]
    const spots: THREE.Matrix4[] = []
    const stems = makeInstanced(
      stemGeo,
      new THREE.MeshStandardMaterial({ color: 0x1a3a3a, roughness: 0.7 }),
      count,
      (i, d) => {
        // Clustered just inside the thorn wall and scattered outside it.
        const inside = i < count / 2
        const radius = inside ? range(rng, ARENA_RADIUS - 4, ARENA_RADIUS - 1.5) : range(rng, ARENA_RADIUS + 4, 70)
        const { x, z } = polar(radius, rng() * Math.PI * 2)
        const s = range(rng, 0.5, 1.6)
        d.position.set(x, 0, z)
        d.rotation.y = rng() * Math.PI * 2
        d.scale.set(s, s, s)
        d.updateMatrix()
        spots[i] = d.matrix.clone()
      },
    )
    const caps = new THREE.InstancedMesh(capGeo, this.pulse(glowMaterial(0xffffff, 0.85), 1.7), count)
    const tint = new THREE.Color()
    spots.forEach((m, i) => {
      caps.setMatrixAt(i, m)
      caps.setColorAt(i, tint.set(palette[Math.floor(rng() * palette.length)]))
    })
    caps.instanceMatrix.needsUpdate = true
    this.group.add(stems, caps)
  }

  private addRoses() {
    const rng = this.rng
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.045, 1.2, 6)
    stemGeo.translate(0, 0.6, 0)
    const headGeo = new THREE.IcosahedronGeometry(0.3, 1)
    headGeo.translate(0, 1.25, 0)

    const count = 90
    const palette = [COLORS.pink, COLORS.pink, COLORS.violet, COLORS.gold]
    const spots: THREE.Matrix4[] = []
    const stems = makeInstanced(
      stemGeo,
      new THREE.MeshStandardMaterial({ color: 0x0f3a24, roughness: 0.8 }),
      count,
      (i, d) => {
        const inside = i < count / 2
        const radius = inside ? range(rng, ARENA_RADIUS - 3.5, ARENA_RADIUS - 1.2) : range(rng, ARENA_RADIUS + 4, 60)
        const { x, z } = polar(radius, rng() * Math.PI * 2)
        const s = range(rng, 0.7, 1.5)
        d.position.set(x, 0, z)
        d.rotation.set(range(rng, -0.15, 0.15), 0, range(rng, -0.15, 0.15))
        d.scale.set(s, s, s)
        d.updateMatrix()
        spots[i] = d.matrix.clone()
      },
    )
    const heads = new THREE.InstancedMesh(headGeo, this.pulse(glowMaterial(0xffffff, 0.95), 1.3), count)
    const tint = new THREE.Color()
    spots.forEach((m, i) => {
      heads.setMatrixAt(i, m)
      heads.setColorAt(i, tint.set(palette[Math.floor(rng() * palette.length)]))
    })
    heads.instanceMatrix.needsUpdate = true
    this.group.add(stems, heads)
  }

  private addVines() {
    const rng = this.rng
    const palette = [COLORS.green, COLORS.cyan, COLORS.violet]
    const materials = palette.map((c) => glowMaterial(c, 2.0))
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2
      const span = range(rng, 0.18, 0.4)
      const r = ARENA_RADIUS + range(rng, 2.5, 5)
      const height = range(rng, 4, 8)
      const points = [0, 0.33, 0.66, 1].map((t, k) => {
        const { x, z } = polar(r + Math.sin(t * Math.PI) * 1.5, a + span * t)
        const y = k === 0 || k === 3 ? 0.1 : height * Math.sin(t * Math.PI) + range(rng, -0.4, 0.4)
        return new THREE.Vector3(x, y, z)
      })
      const curve = new THREE.CatmullRomCurve3(points)
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, range(rng, 0.04, 0.08), 6),
        materials[i % materials.length],
      )
      this.group.add(tube)
    }
  }

  private addRuins() {
    const rng = this.rng
    const stone = new THREE.MeshStandardMaterial({ color: 0x1a2b30, roughness: 0.85 })
    const gold = this.pulse(glowMaterial(COLORS.gold, 2.0), 1.1)
    const holoCyan = this.holoMaterial(COLORS.cyan)
    const holoViolet = this.holoMaterial(COLORS.violet)

    const makePillar = (height: number, holo: THREE.Material) => {
      const pillar = new THREE.Group()
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1, height, 12), stone)
      shaft.position.y = height / 2
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, height + 0.4, 12, 1, true), holo)
      shell.position.y = height / 2
      pillar.add(shaft, shell)
      for (const t of [0.25, 0.75]) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 24), gold)
        band.rotation.x = Math.PI / 2
        band.position.y = height * t
        pillar.add(band)
      }
      return pillar
    }

    // Free-standing pillars, some taller, some broken.
    for (let i = 0; i < 12; i++) {
      const { x, z } = polar(range(rng, ARENA_RADIUS + 7, 58), (i / 12) * Math.PI * 2 + range(rng, -0.2, 0.2))
      const pillar = makePillar(range(rng, 4, 11), i % 2 ? holoCyan : holoViolet)
      pillar.position.set(x, 0, z)
      this.group.add(pillar)
    }

    // Arches facing the arena.
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4
      const { x, z } = polar(ARENA_RADIUS + 14, angle)
      const arch = new THREE.Group()
      const left = makePillar(7, holoCyan)
      const right = makePillar(7, holoCyan)
      left.position.x = -4
      right.position.x = 4
      const curve = new THREE.Mesh(
        new THREE.TorusGeometry(4, 0.22, 10, 48, Math.PI),
        this.pulse(glowMaterial(COLORS.cyan, 2.4), 1.4),
      )
      curve.position.y = 7
      arch.add(left, right, curve)
      arch.position.set(x, 0, z)
      arch.lookAt(0, 0, 0)
      this.group.add(arch)
    }
  }

  private addFireflies() {
    const rng = this.rng
    const count = 260
    const home = new Float32Array(count * 3)
    this.fireflyPhase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const { x, z } = polar(Math.sqrt(rng()) * 55, rng() * Math.PI * 2)
      home.set([x, range(rng, 0.6, 6), z], i * 3)
      this.fireflyPhase[i] = rng() * Math.PI * 2
    }
    this.fireflyHome = home
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(home.slice(), 3))
    this.fireflies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: this.dot,
        color: new THREE.Color(0xb6ff3a).multiplyScalar(1.4),
        size: 0.22,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.group.add(this.fireflies)
  }

  private addPetals() {
    const rng = this.rng
    const count = 140
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const { x, z } = polar(Math.sqrt(rng()) * (ARENA_RADIUS + 10), rng() * Math.PI * 2)
      pos.set([x, range(rng, 0.2, 9), z], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.petals = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: this.dot,
        color: new THREE.Color(COLORS.pink).multiplyScalar(1.8),
        size: 0.3,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.group.add(this.petals)
  }

  private addStars() {
    const rng = this.rng
    const count = 700
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Upper hemisphere only.
      const theta = rng() * Math.PI * 2
      const phi = Math.acos(range(rng, 0.05, 1))
      const r = 220
      pos.set(
        [r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)],
        i * 3,
      )
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.group.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          map: this.dot,
          color: 0xbfd8ff,
          size: 1.6,
          transparent: true,
          depthWrite: false,
          fog: false,
        }),
      ),
    )
  }

  dispose() {
    this.dot.dispose()
  }
}
