import * as THREE from 'three'
import { TubeMesh } from './TubeMesh'
import { createLeafGeometry, createRoseGeometry } from './Rose'
import { makeLaceTexture } from './textures'

const SKIN = 0x5fcf6b
const GRAVITY = new THREE.Vector3(0, -6, 0)
const WIND = 2.6
const UP = new THREE.Vector3(0, 1, 0)

interface HairOptions {
  segments: number
  segment: number
  thickness: number
  flatten: number
  drag: number
  /** 1 = full wind, 0 = hangs straight down. */
  wind: number
  phase: number
}

/** Keeps hair out of the neck: points must stay on the open side of a plane. */
interface NeckPlane {
  point: THREE.Vector3
  /** Horizontal direction the neck runs in. */
  back: THREE.Vector3
  normal: THREE.Vector3
  offset: number
}

/** A hair lock simulated as a chain of points that trails behind the head. */
class HairStrand {
  readonly mesh: THREE.Mesh
  readonly anchor: THREE.Vector3
  readonly options: HairOptions
  private readonly tube: TubeMesh
  private readonly points: THREE.Vector3[]
  private readonly previous: THREE.Vector3[]
  private readonly shown: THREE.Vector3[]
  private readonly radii: Float32Array
  private readonly vs: Float32Array
  private readonly scratch = new THREE.Vector3()

  constructor(anchor: THREE.Vector3, options: HairOptions, material: THREE.Material) {
    this.anchor = anchor
    this.options = options
    const n = options.segments
    this.points = Array.from({ length: n }, () => new THREE.Vector3())
    this.previous = Array.from({ length: n }, () => new THREE.Vector3())
    this.shown = Array.from({ length: n }, () => new THREE.Vector3())
    this.radii = new Float32Array(n)
    this.vs = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      // Full at the root, a fine point at the tip.
      this.radii[i] = options.thickness * (1 - t * t * 0.92)
      this.vs[i] = t
    }
    this.tube = new TubeMesh(n, 6)
    this.mesh = new THREE.Mesh(this.tube.geometry, material)
    this.mesh.frustumCulled = false
  }

  reset(root: THREE.Vector3, backward: THREE.Vector3) {
    this.points.forEach((p, i) => {
      p.copy(root).addScaledVector(backward, i * this.options.segment)
      this.previous[i].copy(p)
    })
  }

  step(
    dt: number,
    elapsed: number,
    root: THREE.Vector3,
    force: THREE.Vector3,
    right: THREE.Vector3,
    neck: NeckPlane,
  ) {
    const p = this.points
    const prev = this.previous
    const { segment, drag } = this.options
    p[0].copy(root)
    prev[0].copy(root)
    const dt2 = dt * dt
    for (let i = 1; i < p.length; i++) {
      const vx = (p[i].x - prev[i].x) * drag
      const vy = (p[i].y - prev[i].y) * drag
      const vz = (p[i].z - prev[i].z) * drag
      prev[i].copy(p[i])
      p[i].x += vx + force.x * dt2
      p[i].y += vy + force.y * dt2
      p[i].z += vz + force.z * dt2
    }
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 1; i < p.length; i++) {
        const dx = p[i].x - p[i - 1].x
        const dy = p[i].y - p[i - 1].y
        const dz = p[i].z - p[i - 1].z
        const len = Math.hypot(dx, dy, dz) || 1
        const k = segment / len
        p[i].set(p[i - 1].x + dx * k, p[i - 1].y + dy * k, p[i - 1].z + dz * k)

        // Only hair behind the face can run into the neck.
        this.scratch.copy(p[i]).sub(neck.point)
        if (this.scratch.dot(neck.back) > 0.25) {
          const depth = this.scratch.dot(neck.normal)
          if (depth < neck.offset) p[i].addScaledVector(neck.normal, neck.offset - depth)
        }
        if (p[i].y < 0.05) p[i].y = 0.05
      }
    }

    // Visual-only ripple so the lock curves instead of hanging like a rod.
    const n = p.length
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1)
      const wave = Math.sin(i * 0.55 - elapsed * 3 + this.options.phase) * 0.09 * Math.pow(t, 0.8)
      this.shown[i].copy(p[i]).addScaledVector(right, wave)
    }
    this.tube.update(this.shown, this.radii, this.vs, n, this.options.flatten)
  }
}

/**
 * The girl's head: stylised green skin, glowing slit-pupil eyes, rose-and-lace
 * crown, gold tiara and jewellery, a lace veil and simulated flowing hair.
 * Local space: +Z is forward, +Y up, origin at the middle of the skull.
 */
export class SnakeHead {
  /** Follows the snake's head position and heading. */
  readonly group = new THREE.Group()
  /** Hair lives in world space so it can trail behind. */
  readonly world = new THREE.Group()

  private readonly veilTime = { value: 0 }
  private readonly hair: HairStrand[] = []
  private readonly rootWorld = new THREE.Vector3()
  private readonly backward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly strandForce = new THREE.Vector3()
  private readonly neck: NeckPlane = {
    point: new THREE.Vector3(),
    back: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    offset: 0.5,
  }
  private primed = false

  constructor() {
    const skin = new THREE.MeshStandardMaterial({
      color: SKIN,
      roughness: 0.5,
      emissive: 0x0b3b16,
      emissiveIntensity: 0.7,
    })
    const gold = new THREE.MeshStandardMaterial({
      color: 0xf5b940,
      metalness: 1,
      roughness: 0.28,
      emissive: 0x3a2500,
    })
    const gem = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x2bff8a).multiplyScalar(1.5),
      toneMapped: false,
    })
    const eyeGlow = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xd8ff2e).multiplyScalar(1.4),
      toneMapped: false,
    })
    const dark = new THREE.MeshStandardMaterial({ color: 0x0a0610, roughness: 0.6 })
    const lip = new THREE.MeshStandardMaterial({
      color: 0xc83a68,
      roughness: 0.25,
      emissive: 0x40081c,
    })
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x0e0716,
      roughness: 0.7,
      emissive: 0x06140f,
      envMapIntensity: 0.35,
      side: THREE.DoubleSide,
    })

    this.buildFace(skin, eyeGlow, dark, lip)
    this.buildEars(skin, gold, gem)
    this.buildHairCap(hairMat)
    this.buildCrown(gold, gem)
    this.buildCollar(gold, gem)
    this.buildVeil()
    this.buildHair(hairMat)

    const glow = new THREE.PointLight(0x9bff6a, 1.2, 6, 2)
    glow.position.set(0, 0.1, 1.6)
    this.group.add(glow)
  }

  private add<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number) {
    obj.position.set(x, y, z)
    this.group.add(obj)
    return obj
  }

  private buildFace(
    skin: THREE.Material,
    eyeGlow: THREE.Material,
    dark: THREE.Material,
    lip: THREE.Material,
  ) {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 32), skin)
    skull.scale.set(0.92, 1.0, 0.98)
    this.add(skull, 0, 0, 0)

    // A narrower, pointed jaw gives her a more elegant face.
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 28), skin)
    jaw.scale.set(0.66, 0.82, 0.8)
    this.add(jaw, 0, -0.32, 0.14)

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), skin)
    nose.scale.set(0.9, 1, 1.25)
    this.add(nose, 0, -0.1, 0.6)

    // Eyes: glowing, cat-shaped, with slit pupils, liner and lashes.
    for (const s of [-1, 1]) {
      const eye = new THREE.Group()
      eye.position.set(s * 0.24, 0.1, 0.5)
      eye.rotation.set(0, s * 0.45, s * -0.22)
      this.group.add(eye)

      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), eyeGlow)
      ball.scale.set(1.3, 0.8, 0.5)
      eye.add(ball)

      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.15, 0.01), dark)
      pupil.position.z = 0.075
      eye.add(pupil)

      const liner = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 6, 24, Math.PI * 0.95), dark)
      liner.scale.set(1.15, 0.72, 1)
      liner.position.set(0, 0.0, 0.03)
      liner.rotation.z = Math.PI * 0.03
      eye.add(liner)

      for (let i = 0; i < 3; i++) {
        const lash = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.11, 4), dark)
        lash.position.set(s * (0.13 + i * 0.012), 0.06 + i * 0.045, 0.035)
        lash.rotation.z = s * -(0.9 + i * 0.35)
        eye.add(lash)
      }

      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.2, 4, 8), dark)
      brow.position.set(s * 0.25, 0.27, 0.46)
      brow.rotation.set(0, s * 0.4, Math.PI / 2 + s * 0.22)
      this.group.add(brow)
    }

    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), lip)
    upper.scale.set(1.5, 0.45, 0.7)
    this.add(upper, 0, -0.3, 0.55)
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), lip)
    lower.scale.set(1.3, 0.5, 0.7)
    this.add(lower, 0, -0.34, 0.545)
  }

  private buildEars(skin: THREE.Material, gold: THREE.Material, gem: THREE.Material) {
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 12), skin)
      ear.position.set(s * 0.58, 0.14, -0.04)
      ear.rotation.set(-0.35, 0, s * -1.15)
      this.group.add(ear)

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 8, 18), gold)
      ring.position.set(s * 0.6, -0.1, -0.03)
      ring.rotation.y = Math.PI / 2
      this.group.add(ring)

      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), gold)
      chain.position.set(s * 0.6, -0.2, -0.03)
      this.group.add(chain)

      const drop = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), gem)
      drop.scale.set(0.8, 1.3, 0.8)
      drop.position.set(s * 0.6, -0.3, -0.03)
      this.group.add(drop)
    }
  }

  private buildHairCap(hairMat: THREE.Material) {
    const r = 0.665
    // Back and sides, leaving the face open.
    const back = new THREE.Mesh(
      new THREE.SphereGeometry(r, 40, 28, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.8),
      hairMat,
    )
    back.scale.set(0.95, 1.03, 1.0)
    this.add(back, 0, 0.0, -0.01)

    // Crown of the head down to the hairline.
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.24), hairMat)
    top.scale.set(0.95, 1.03, 1.0)
    this.add(top, 0, 0.0, -0.01)
  }

  private buildCrown(gold: THREE.Material, gem: THREE.Material) {
    const tiara = new THREE.Group()
    tiara.rotation.x = 0.6
    this.group.add(tiara)

    const R = 0.66
    const band = new THREE.Mesh(new THREE.TorusGeometry(R, 0.03, 10, 48, Math.PI), gold)
    tiara.add(band)

    // Points and gems along the band.
    const spots = [0.12, 0.26, 0.38, 0.5, 0.62, 0.74, 0.88]
    spots.forEach((t, i) => {
      const a = t * Math.PI
      const big = i === 3
      const spikeR = R + (big ? 0.1 : 0.06)
      const spike = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.06 : 0.035, big ? 0.2 : 0.12, 8), gold)
      spike.position.set(Math.cos(a) * spikeR, Math.sin(a) * spikeR, 0)
      spike.rotation.z = a - Math.PI / 2
      tiara.add(spike)

      const tipR = R + (big ? 0.21 : 0.12)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.04 : 0.022, 10, 8), gem)
      tip.position.set(Math.cos(a) * tipR, Math.sin(a) * tipR, 0)
      tiara.add(tip)
    })

    // Forehead jewel hanging from the centre of the band.
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6), gold)
    chain.position.set(0, R - 0.07, 0)
    tiara.add(chain)
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), gem)
    jewel.scale.set(0.8, 1.2, 0.6)
    jewel.position.set(0, R - 0.17, 0.02)
    tiara.add(jewel)

    // Roses and leaves woven along the band.
    const roseGeo = createRoseGeometry()
    const leafGeo = createLeafGeometry()
    const pinkMat = new THREE.MeshStandardMaterial({
      color: 0xff3a7a,
      roughness: 0.4,
      vertexColors: true,
      emissive: 0x4a0620,
      side: THREE.DoubleSide,
    })
    const creamMat = new THREE.MeshStandardMaterial({
      color: 0xfff0e6,
      roughness: 0.45,
      vertexColors: true,
      emissive: 0x2a2018,
      side: THREE.DoubleSide,
    })
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f8a46, roughness: 0.5, emissive: 0x04200c })

    const roses: [number, number, THREE.Material][] = [
      [0.17, 0.42, creamMat],
      [0.33, 0.48, pinkMat],
      [0.5, 0.62, pinkMat],
      [0.67, 0.48, pinkMat],
      [0.83, 0.42, creamMat],
    ]
    roses.forEach(([t, scale, mat]) => {
      const a = t * Math.PI
      const rose = new THREE.Mesh(roseGeo, mat)
      rose.position.set(Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0.06)
      // Face outward along the band's radial direction.
      rose.rotation.set(0, 0, a - Math.PI / 2)
      rose.rotateX(Math.PI / 2)
      rose.scale.setScalar(scale)
      tiara.add(rose)
    })
    for (const t of [0.25, 0.41, 0.59, 0.75]) {
      const a = t * Math.PI
      for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(leafGeo, leafMat)
        leaf.position.set(Math.cos(a) * (R + 0.04), Math.sin(a) * (R + 0.04), 0.04 * side)
        leaf.rotation.set(0, side * 0.7, a - Math.PI / 2)
        leaf.rotateX(Math.PI / 2 - 0.4)
        leaf.scale.setScalar(1.1)
        tiara.add(leaf)
      }
    }
  }

  private buildCollar(gold: THREE.Material, gem: THREE.Material) {
    // The neck leaves the head back-and-down; the ruff's axis follows it.
    const collar = new THREE.Group()
    collar.position.set(0, -0.46, -0.52)
    collar.rotation.x = 0.78
    this.group.add(collar)

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.035, 10, 48), gold)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.17
    collar.add(ring)

    const lace = makeLaceTexture()
    lace.wrapS = THREE.RepeatWrapping
    lace.repeat.set(3, 1)
    const ruff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 0.42, 48, 1, true),
      new THREE.MeshBasicMaterial({
        map: lace,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        color: new THREE.Color(0xfff0e6).multiplyScalar(0.8),
      }),
    )
    collar.add(ruff)

    for (const a of [-0.45, 0, 0.45]) {
      const g = new THREE.Mesh(new THREE.OctahedronGeometry(a === 0 ? 0.075 : 0.045), gem)
      g.position.set(Math.sin(a) * 0.49, 0.17, Math.cos(a) * 0.49)
      collar.add(g)
    }
  }

  private buildVeil() {
    const w = 1.5
    const h = 1.9
    const geo = new THREE.PlaneGeometry(w, h, 14, 18)
    geo.translate(0, -h / 2, 0)
    const veil = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.veilTime, uMap: { value: makeLaceTexture() } },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            float hang = 1.0 - uv.y;
            p.z += sin(hang * 6.0 - uTime * 2.6 + uv.x * 3.0) * 0.07 * hang;
            p.x += sin(hang * 4.0 - uTime * 2.0) * 0.05 * hang;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          varying vec2 vUv;
          void main() {
            vec4 t = texture2D(uMap, vUv);
            if (t.a < 0.05) discard;
            gl_FragColor = vec4(t.rgb * 0.8, t.a * 0.85);
          }
        `,
      }),
    )
    veil.position.set(0, 0.72, -0.12)
    veil.rotation.x = 1.15
    this.group.add(veil)
  }

  private buildHair(hairMat: THREE.Material) {
    // Broad flowing locks rooted around the back of the skull...
    const locks = 11
    for (let i = 0; i < locks; i++) {
      const t = i / (locks - 1)
      const a = Math.PI * (0.92 + 1.16 * t)
      const y = 0.12 + Math.abs(Math.sin(t * 5)) * 0.3
      this.addStrand(
        new THREE.Vector3(Math.cos(a) * 0.58, y, Math.sin(a) * 0.6),
        {
          segments: 16,
          segment: 0.15 + (i % 3) * 0.02,
          thickness: 0.15,
          flatten: 0.3,
          drag: 0.95,
          wind: 1,
          phase: i * 0.8,
        },
        hairMat,
      )
    }
    // ...with finer strands between them for volume.
    const fine = 18
    for (let i = 0; i < fine; i++) {
      const t = (i + 0.5) / fine
      const a = Math.PI * (0.9 + 1.2 * t)
      this.addStrand(
        new THREE.Vector3(Math.cos(a) * 0.6, 0.05 + ((i * 7) % 5) * 0.08, Math.sin(a) * 0.62),
        {
          segments: 14,
          segment: 0.14 + (i % 4) * 0.02,
          thickness: 0.06,
          flatten: 0.5,
          drag: 0.94,
          wind: 1,
          phase: i * 1.7,
        },
        hairMat,
      )
    }
    // Locks framing the face fall forward over the shoulders.
    for (const s of [-1, 1]) {
      this.addStrand(
        new THREE.Vector3(s * 0.56, 0.3, 0.12),
        { segments: 12, segment: 0.13, thickness: 0.09, flatten: 0.35, drag: 0.9, wind: 0.1, phase: s },
        hairMat,
      )
      this.addStrand(
        new THREE.Vector3(s * 0.59, 0.12, 0.0),
        { segments: 12, segment: 0.14, thickness: 0.08, flatten: 0.35, drag: 0.9, wind: 0.1, phase: s * 2 },
        hairMat,
      )
    }
  }

  private addStrand(anchor: THREE.Vector3, options: HairOptions, material: THREE.Material) {
    const strand = new HairStrand(anchor, options, material)
    this.hair.push(strand)
    this.world.add(strand.mesh)
  }

  /** Hair snaps back to its rest pose on the next update. */
  reset() {
    this.primed = false
  }

  update(dt: number, elapsed: number) {
    this.veilTime.value = elapsed
    this.group.updateMatrixWorld(true)

    // The neck leaves the head backwards and downwards at about 41 degrees;
    // keep the hair on its upper side.
    this.backward.set(0, 0, -1).transformDirection(this.group.matrixWorld).setY(0).normalize()
    this.neck.point.setFromMatrixPosition(this.group.matrixWorld)
    this.neck.back.copy(this.backward)
    this.neck.normal.copy(this.backward).multiplyScalar(0.66).addScaledVector(UP, 0.75).normalize()
    this.right.set(1, 0, 0).transformDirection(this.group.matrixWorld)

    const step = Math.min(dt, 1 / 30)
    for (const [i, strand] of this.hair.entries()) {
      this.rootWorld.copy(strand.anchor).applyMatrix4(this.group.matrixWorld)
      if (!this.primed) strand.reset(this.rootWorld, this.backward)

      this.strandForce
        .copy(this.backward)
        .multiplyScalar(WIND * strand.options.wind)
        .add(GRAVITY)
        // Ripple each strand a little differently so the hair looks alive.
        .addScaledVector(this.right, Math.sin(elapsed * 2.4 + i * 0.9) * 2.2 * strand.options.wind)
        .addScaledVector(UP, Math.sin(elapsed * 1.9 + i * 1.3) * 1.2)
      strand.step(step, elapsed, this.rootWorld, this.strandForce, this.right, this.neck)
    }
    this.primed = true
  }
}
