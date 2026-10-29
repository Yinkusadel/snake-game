import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ARENA_RADIUS } from './constants'
import { Garden } from './garden/Garden'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Input } from './Input'
import { HEAD_HEIGHT, Snake } from './snake/Snake'

const STEP = 1 / 60
const MAX_FRAME = 0.25
const SPEED = 6
const TURN_RATE = 2.4
const CAMERA_HEIGHT = 5.2
const CAMERA_DISTANCE = 7.5
const SHOWCASE_DISTANCE = 3.4

export interface GameOptions {
  /**
   * Camera studies the snake's face instead of chasing her, for the title
   * screen and for checking her design. `angle` (degrees, 0 = face on) fixes
   * the view; leave it out to orbit.
   */
  showcase?: { angle?: number }
}

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

  private snake = new Snake(0, 0, 0)
  private position = new THREE.Vector3()
  private options: GameOptions
  private envMap: THREE.WebGLRenderTarget
  private heading = 0
  private steer = 0
  private cameraTarget = new THREE.Vector3()

  private container: HTMLElement

  constructor(container: HTMLElement, options: GameOptions = {}) {
    this.container = container
    this.options = options
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

    // Soft studio reflections so the gold and hair catch light.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envMap.texture
    this.scene.environmentIntensity = 0.45
    pmrem.dispose()

    this.scene.add(this.garden.group)

    this.scene.add(this.snake.group)

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
          for (const value of Object.values(m)) {
            if (value instanceof THREE.Texture) value.dispose()
          }
          m.dispose()
        })
      }
    })
    this.garden.dispose()
    this.snake.dispose()
    this.envMap.dispose()
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

    const elapsed = this.timer.getElapsed()
    this.garden.update(elapsed, dt)
    if (this.input.consumeGrow()) this.snake.grow(3)
    this.snake.update(dt, elapsed, this.position.x, this.position.z, this.heading, this.steer)
    this.updateCamera(dt, elapsed)
    this.composer.render()
  }

  private update(dt: number) {
    if (this.options.showcase) return

    this.steer = this.input.steer
    this.heading -= this.steer * TURN_RATE * dt
    this.position.x += Math.sin(this.heading) * SPEED * dt
    this.position.z += Math.cos(this.heading) * SPEED * dt

    // Keep her inside the arena until real collisions exist.
    const dist = Math.hypot(this.position.x, this.position.z)
    const limit = ARENA_RADIUS - 1
    if (dist > limit) {
      this.position.x *= limit / dist
      this.position.z *= limit / dist
    }
  }

  private desiredCameraPosition(out: THREE.Vector3, elapsed = 0) {
    const showcase = this.options.showcase
    if (showcase) {
      const angle = showcase.angle !== undefined ? (showcase.angle * Math.PI) / 180 : elapsed * 0.35
      return out.set(
        this.position.x + Math.sin(angle) * SHOWCASE_DISTANCE,
        HEAD_HEIGHT + 0.25,
        this.position.z + Math.cos(angle) * SHOWCASE_DISTANCE,
      )
    }
    return out.set(
      this.position.x - Math.sin(this.heading) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      this.position.z - Math.cos(this.heading) * CAMERA_DISTANCE,
    )
  }

  private focusPoint(out: THREE.Vector3) {
    return out.set(this.position.x, this.options.showcase ? HEAD_HEIGHT : 1, this.position.z)
  }

  private snapCamera() {
    this.desiredCameraPosition(this.camera.position)
    this.cameraTarget.copy(this.focusPoint(new THREE.Vector3()))
    this.camera.lookAt(this.cameraTarget)
  }

  private updateCamera(dt: number, elapsed: number) {
    const desired = this.desiredCameraPosition(new THREE.Vector3(), elapsed)
    // Frame-rate independent exponential smoothing.
    const t = this.options.showcase ? 1 : 1 - Math.exp(-6 * dt)
    this.camera.position.lerp(desired, t)
    this.cameraTarget.lerp(this.focusPoint(new THREE.Vector3()), 1 - Math.exp(-10 * dt))
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
