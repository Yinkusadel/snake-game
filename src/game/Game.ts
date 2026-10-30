import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ARENA_RADIUS } from './constants'
import { softDotTexture } from './dot'
import { Fruits } from './fruit/Fruits'
import { Garden } from './garden/Garden'
import { Input } from './Input'
import { Particles } from './Particles'
import { HEAD_HEIGHT, Snake } from './snake/Snake'
import type { DeathReason, GameState, Phase } from './state'

const STEP = 1 / 60
const MAX_FRAME = 0.25
const BASE_SPEED = 6
const MAX_SPEED_BONUS = 3.5
const TURN_RATE = 2.4
const CAMERA_HEIGHT = 5.2
const CAMERA_DISTANCE = 7.5
const SHOWCASE_DISTANCE = 3.4
/** Head dies when it gets this close to the thorn wall. */
const WALL_LIMIT = ARENA_RADIUS - 1.2
/** Seconds you have to eat again to keep a combo alive. */
const COMBO_WINDOW = 4
const MAX_MULTIPLIER = 5
/** Ignore restart input briefly after dying so a held key doesn't skip the screen. */
const RESTART_DELAY = 0.7
const BEST_KEY = 'ewuraba-best'

export interface GameOptions {
  /**
   * Camera studies the snake's face instead of chasing her, for the title
   * screen and for checking her design. `angle` (degrees, 0 = face on) fixes
   * the view; leave it out to orbit.
   */
  showcase?: { angle?: number }
  /** 'low' drops bloom and multisampling for slow devices. */
  quality?: 'low' | 'high'
  /** Called whenever score, length, combo or phase changes. */
  onState?: (state: GameState) => void
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(best: number) {
  try {
    localStorage.setItem(BEST_KEY, String(best))
  } catch {
    // Storage can be unavailable (private mode); the best score just won't persist.
  }
}

/**
 * Owns the renderer, scene and game loop. Lives outside React state:
 * React only mounts the canvas, listens for state changes and disposes the
 * game on unmount.
 */
export class Game {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300)
  private input = new Input()
  private timer = new THREE.Timer()
  private composer: EffectComposer
  private garden = new Garden()
  private fruits = new Fruits()
  private dot = softDotTexture()
  private particles = new Particles(500, this.dot)
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
  private shake = 0

  private phase: Phase = 'ready'
  private reason: DeathReason | undefined
  private score = 0
  private best = loadBest()
  private eaten = 0
  private combo = 0
  private comboTimer = 0
  private sinceDeath = 0

  private container: HTMLElement

  constructor(container: HTMLElement, options: GameOptions = {}) {
    this.container = container
    this.options = options
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    const low = options.quality === 'low'
    this.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2))
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

    this.scene.add(this.garden.group, this.fruits.group, this.snake.group, this.particles.points)

    // Bloom makes the over-bright emissive materials glow. The multisampled
    // target keeps edges smooth since the renderer's own MSAA is bypassed.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: low ? 0 : 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    if (!low) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 0.9))
    this.composer.addPass(new OutputPass())

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(container)
    this.resize()

    if (import.meta.env.DEV) (window as Window & { __ewuraba?: Game }).__ewuraba = this

    this.snapCamera()
    this.emit()
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
    this.fruits.dispose()
    this.snake.dispose()
    this.dot.dispose()
    this.envMap.dispose()
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  /** Dev-only: lets automated checks steer a bot. Exposed as window.__ewuraba. */
  debugInfo() {
    return {
      phase: this.phase,
      score: this.score,
      x: this.position.x,
      z: this.position.z,
      heading: this.heading,
      fruits: this.fruits.positions(),
    }
  }

  private get multiplier() {
    return Math.min(Math.max(this.combo, 1), MAX_MULTIPLIER)
  }

  private emit() {
    this.options.onState?.({
      phase: this.phase,
      score: this.score,
      best: this.best,
      length: this.snake.size,
      combo: this.combo,
      multiplier: this.multiplier,
      reason: this.reason,
    })
  }

  private speed() {
    return BASE_SPEED + Math.min(this.eaten * 0.1, MAX_SPEED_BONUS)
  }

  private start() {
    this.position.set(0, 0, 0)
    this.heading = 0
    this.steer = 0
    this.snake.reset(0, 0, 0)
    this.fruits.reset()
    this.score = 0
    this.eaten = 0
    this.combo = 0
    this.comboTimer = 0
    this.reason = undefined
    this.phase = 'playing'
    this.emit()
  }

  private die(reason: DeathReason) {
    this.phase = 'over'
    this.reason = reason
    this.sinceDeath = 0
    this.shake = 0.6
    this.combo = 0
    if (this.score > this.best) {
      this.best = this.score
      saveBest(this.best)
    }
    this.particles.burst(this.position.x, HEAD_HEIGHT, this.position.z, 0xff3a6a, 60, 7)
    this.particles.burst(this.position.x, HEAD_HEIGHT, this.position.z, 0x5dff9a, 40, 5)
    this.emit()
  }

  private eat(x: number, y: number, z: number, glow: number, points: number, growth: number) {
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1
    this.comboTimer = COMBO_WINDOW
    this.score += points * this.multiplier
    this.eaten++
    this.snake.grow(growth)
    this.particles.burst(x, y, z, glow, 36, 4.5)
    this.emit()
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME)
    const elapsed = this.timer.getElapsed()

    if (this.input.consumeStart() && !this.options.showcase) {
      if (this.phase === 'ready') this.start()
      else if (this.phase === 'over' && this.sinceDeath > RESTART_DELAY) this.start()
    }
    if (this.phase === 'over') this.sinceDeath += dt

    // Fixed timestep so gameplay is frame-rate independent.
    this.accumulator += dt
    while (this.accumulator >= STEP) {
      this.update(STEP)
      this.accumulator -= STEP
    }

    this.snake.update(dt, elapsed, this.position.x, this.position.z, this.heading, this.steer)
    this.garden.update(elapsed, dt)
    this.particles.update(dt)
    this.fruits.update(
      dt,
      elapsed,
      this.phase === 'playing'
        ? {
            score: this.score,
            blocked: (x, z) =>
              Math.hypot(x - this.position.x, z - this.position.z) < 4 || this.snake.distanceToBody(x, z) < 1.5,
          }
        : null,
    )

    if (this.phase === 'playing') this.resolve(dt)

    this.updateCamera(dt, elapsed)
    this.composer.render()
  }

  /** Fixed-step movement. */
  private update(dt: number) {
    if (this.phase !== 'playing') return

    this.steer = this.input.steer
    this.heading -= this.steer * TURN_RATE * dt
    this.position.x += Math.sin(this.heading) * this.speed() * dt
    this.position.z += Math.cos(this.heading) * this.speed() * dt
  }

  /** Eating and collisions, checked once per frame after everything has moved. */
  private resolve(dt: number) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0 && this.combo > 0) {
        this.combo = 0
        this.emit()
      }
    }

    const eaten = this.fruits.tryEat(this.position.x, this.position.z)
    if (eaten) {
      this.eat(eaten.x, eaten.y, eaten.z, eaten.spec.glow, eaten.spec.points, eaten.spec.growth)
    }

    if (Math.hypot(this.position.x, this.position.z) > WALL_LIMIT) this.die('wall')
    else if (this.snake.hitsSelf()) this.die('self')
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

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt)
      const amp = this.shake * 0.5
      this.camera.position.x += (Math.random() - 0.5) * amp
      this.camera.position.y += (Math.random() - 0.5) * amp
    }
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
