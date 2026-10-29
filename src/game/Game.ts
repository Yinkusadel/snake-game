import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ARENA_RADIUS } from './constants'
import { Garden } from './garden/Garden'
import { Input } from './Input'

const STEP = 1 / 60
const MAX_FRAME = 0.25
const SPEED = 6
const TURN_RATE = 2.4
const CAMERA_HEIGHT = 7
const CAMERA_DISTANCE = 10

/**
 * Owns the renderer, scene and game loop. Lives outside React state:
 * React only mounts the canvas and disposes the game on unmount.
 */
export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300)
  private input = new Input()
  private timer = new THREE.Timer()
  private composer: EffectComposer
  private garden = new Garden()
  private resizeObserver: ResizeObserver
  private frame = 0
  private accumulator = 0

  // Placeholder head; replaced by the snake in stage 3.
  private head: THREE.Mesh
  private heading = 0
  private cameraTarget = new THREE.Vector3()

  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x06121a)
    this.scene.fog = new THREE.FogExp2(0x06121a, 0.018)

    this.scene.add(new THREE.HemisphereLight(0x5fd6c8, 0x1a0f2e, 0.8))
    const moon = new THREE.DirectionalLight(0x9fb8ff, 1.2)
    moon.position.set(-20, 30, 10)
    this.scene.add(moon)

    this.scene.add(this.garden.group)

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 32, 16),
      new THREE.MeshStandardMaterial({
        color: 0x1fcf7a,
        emissive: 0x0a5a35,
        roughness: 0.4,
      }),
    )
    this.head.position.y = 0.7
    this.scene.add(this.head)

    // Bloom makes the over-bright emissive materials glow. The multisampled
    // target keeps edges smooth since the renderer's own MSAA is bypassed.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 0.9))
    this.composer.addPass(new OutputPass())

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(container)
    this.resize()

    this.snapCamera()
    this.frame = requestAnimationFrame(this.loop)
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.input.dispose()
    this.timer.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose()
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((m) => {
          m.map?.dispose()
          m.emissiveMap?.dispose()
          m.dispose()
        })
      }
    })
    this.garden.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME)

    // Fixed timestep so gameplay is frame-rate independent.
    this.accumulator += dt
    while (this.accumulator >= STEP) {
      this.update(STEP)
      this.accumulator -= STEP
    }

    this.garden.update(this.timer.getElapsed(), dt)
    this.updateCamera(dt)
    this.composer.render()
  }

  private update(dt: number) {
    this.heading -= this.input.steer * TURN_RATE * dt
    this.head.position.x += Math.sin(this.heading) * SPEED * dt
    this.head.position.z += Math.cos(this.heading) * SPEED * dt

    // Keep the placeholder inside the arena until real collisions exist.
    const dist = Math.hypot(this.head.position.x, this.head.position.z)
    const limit = ARENA_RADIUS - 1
    if (dist > limit) {
      this.head.position.x *= limit / dist
      this.head.position.z *= limit / dist
    }
  }

  private desiredCameraPosition(out: THREE.Vector3) {
    return out.set(
      this.head.position.x - Math.sin(this.heading) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      this.head.position.z - Math.cos(this.heading) * CAMERA_DISTANCE,
    )
  }

  private snapCamera() {
    this.desiredCameraPosition(this.camera.position)
    this.cameraTarget.copy(this.head.position)
    this.camera.lookAt(this.cameraTarget)
  }

  private updateCamera(dt: number) {
    const desired = this.desiredCameraPosition(new THREE.Vector3())
    // Frame-rate independent exponential smoothing.
    const t = 1 - Math.exp(-6 * dt)
    this.camera.position.lerp(desired, t)
    this.cameraTarget.lerp(this.head.position, 1 - Math.exp(-10 * dt))
    this.camera.lookAt(this.cameraTarget)
  }

  private resize = () => {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }
}
