import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ARENA_RADIUS } from './constants'
import { softDotTexture } from './dot'
import { GameAudio } from './audio/GameAudio'
import { Fruits } from './fruit/Fruits'
import { Garden } from './garden/Garden'
import { Hazards, type Hazard } from './hazards/Hazards'
import { createHoloMaterial } from './holo'
import { Input } from './Input'
import { Particles } from './Particles'
import type { FruitTier } from './audio/GameAudio'
import { POWER_SPECS, PowerUps, type PowerKind } from './powerups/PowerUps'
import { HEAD_HEIGHT, Snake } from './snake/Snake'
import type { DeathReason, EffectsState, GameState, Phase } from './state'

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

/** How much the world slows down under Time Slow. */
const SLOW_FACTOR = 0.45
const DASH_TIME = 0.7
const DASH_SPEED = 1.9
const MAGNET_RADIUS = 11
/** Brief safety after a shield absorbs a hit, so one blow can't hit twice. */
const INVULN_TIME = 1.3

interface Mood {
  name: string
  /** Score at which this mood begins. */
  from: number
  background: number
  sky: number
  ground: number
  moon: number
}

const MOODS: Mood[] = [
  { name: 'Dusk', from: 0, background: 0x0a1c2c, sky: 0x6fe0d0, ground: 0x2a1040, moon: 0xb0a8ff },
  { name: 'Midnight', from: 200, background: 0x040a1a, sky: 0x4a78ff, ground: 0x10082a, moon: 0x8fb0ff },
  { name: 'Aurora', from: 500, background: 0x05201c, sky: 0x55ffb0, ground: 0x3a0a4a, moon: 0xff9fe0 },
]

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
  private audio = new GameAudio()
  private powerUps = new PowerUps()
  private hazards = new Hazards()
  private holoTime = { value: 0 }
  private shieldBubble: THREE.Mesh
  private hemisphere = new THREE.HemisphereLight(0x6fe0d0, 0x2a1040, 0.8)
  private moon = new THREE.DirectionalLight(0xb0a8ff, 1.2)
  private level = 0
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

  private shield = false
  private invuln = 0
  private slowTimer = 0
  private magnetTimer = 0
  private dashReady = false
  private dashTimer = 0
  private pickups = 0

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

    this.scene.background = new THREE.Color(MOODS[0].background)
    this.scene.fog = new THREE.FogExp2(MOODS[0].background, 0.018)

    this.moon.position.set(-20, 30, 10)
    this.scene.add(this.hemisphere, this.moon)

    // Soft studio reflections so the gold and hair catch light.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envMap.texture
    this.scene.environmentIntensity = 0.45
    pmrem.dispose()

    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 32, 20),
      createHoloMaterial(this.holoTime, POWER_SPECS.shield.color),
    )
    this.shieldBubble.visible = false

    this.scene.add(
      this.garden.group,
      this.fruits.group,
      this.powerUps.group,
      this.hazards.group,
      this.snake.group,
      this.particles.points,
      this.shieldBubble,
    )

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
    window.addEventListener('blur', this.pauseIfPlaying)
    window.addEventListener('pointerdown', this.unlockAudio)
    window.addEventListener('keydown', this.unlockAudio)
    document.addEventListener('visibilitychange', this.pauseIfPlaying)

    this.snapCamera()
    this.emit()
    this.frame = requestAnimationFrame(this.loop)
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    window.removeEventListener('blur', this.pauseIfPlaying)
    window.removeEventListener('pointerdown', this.unlockAudio)
    window.removeEventListener('keydown', this.unlockAudio)
    document.removeEventListener('visibilitychange', this.pauseIfPlaying)
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
    this.audio.dispose()
    this.fruits.dispose()
    this.powerUps.dispose()
    this.hazards.dispose()
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
      powerUps: this.powerUps.positions(),
      hazards: this.hazards.positions(),
      effects: this.effects(),
    }
  }

  private get multiplier() {
    return Math.min(Math.max(this.combo, 1), MAX_MULTIPLIER)
  }

  private effects(): EffectsState {
    return {
      shield: this.shield,
      slow:
        this.slowTimer > 0 ? { remaining: this.slowTimer, total: POWER_SPECS.slow.duration, id: this.pickups } : null,
      magnet:
        this.magnetTimer > 0
          ? { remaining: this.magnetTimer, total: POWER_SPECS.magnet.duration, id: this.pickups }
          : null,
      dash: this.dashReady,
    }
  }

  private emit() {
    this.options.onState?.({
      phase: this.phase,
      score: this.score,
      best: this.best,
      length: this.snake.size,
      eaten: this.eaten,
      muted: this.audio.isMuted,
      combo: this.combo,
      multiplier: this.multiplier,
      level: this.level,
      levelName: MOODS[this.level].name,
      effects: this.effects(),
      reason: this.reason,
    })
  }

  private speed() {
    const base = BASE_SPEED + Math.min(this.eaten * 0.1, MAX_SPEED_BONUS)
    return this.dashTimer > 0 ? base * DASH_SPEED : base
  }

  private start() {
    this.position.set(0, 0, 0)
    this.heading = 0
    this.steer = 0
    this.snake.reset(0, 0, 0)
    this.fruits.reset()
    this.powerUps.reset()
    this.hazards.reset()
    this.shield = false
    this.invuln = 0
    this.slowTimer = 0
    this.magnetTimer = 0
    this.dashReady = false
    this.dashTimer = 0
    this.level = 0
    this.audio.setMood(0)
    this.audio.setMode('play')
    this.audio.setSlow(false)
    this.audio.start()
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
    this.slowTimer = 0
    this.magnetTimer = 0
    this.audio.setSlow(false)
    this.audio.setMode('over')
    this.audio.death()
    if (this.score > this.best) {
      this.best = this.score
      saveBest(this.best)
    }
    this.particles.burst(this.position.x, HEAD_HEIGHT, this.position.z, 0xff3a6a, 60, 7)
    this.particles.burst(this.position.x, HEAD_HEIGHT, this.position.z, 0x5dff9a, 40, 5)
    this.emit()
  }

  private eat(x: number, y: number, z: number, glow: number, points: number, growth: number, tier: FruitTier) {
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1
    this.comboTimer = COMBO_WINDOW
    this.score += points * this.multiplier
    this.eaten++
    this.snake.grow(growth)
    this.audio.eat(this.multiplier, tier)
    const level = MOODS.reduce((n, m, i) => (this.score >= m.from ? i : n), 0)
    if (level !== this.level) {
      this.level = level
      this.audio.setMood(level)
      this.audio.levelUp()
      this.particles.burst(this.position.x, HEAD_HEIGHT + 1, this.position.z, 0xffe39a, 70, 8)
    }
    this.particles.burst(x, y, z, glow, 36, 4.5)
    this.emit()
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop)
    this.timer.update()
    // Everything stands still while paused; only the camera and render run.
    const dt = this.phase === 'paused' ? 0 : Math.min(this.timer.getDelta(), MAX_FRAME)
    const elapsed = this.timer.getElapsed()

    if (this.input.consumeMute()) this.toggleMute()
    if (this.input.consumePause() && !this.options.showcase) {
      if (this.phase === 'playing') this.setPaused(true)
      else if (this.phase === 'paused') this.setPaused(false)
    }
    if (this.input.consumeStart() && !this.options.showcase) {
      if (this.phase === 'ready') this.start()
      else if (this.phase === 'over' && this.sinceDeath > RESTART_DELAY) this.start()
      else if (this.phase === 'paused') this.setPaused(false)
      else if (this.phase === 'playing') this.dash()
    }
    if (this.phase === 'over') this.sinceDeath += dt

    // Fixed timestep so gameplay is frame-rate independent.
    this.accumulator += dt
    while (this.accumulator >= STEP) {
      this.update(STEP)
      this.accumulator -= STEP
    }

    // Time Slow slows the world (fruit, pickups, hazards) but not her.
    const worldDt = this.slowTimer > 0 ? dt * SLOW_FACTOR : dt
    this.holoTime.value = elapsed

    this.snake.update(dt, elapsed, this.position.x, this.position.z, this.heading, this.steer)
    this.garden.update(elapsed, worldDt)
    this.particles.update(dt)

    const playing = this.phase === 'playing'
    const blocked = (x: number, z: number) =>
      Math.hypot(x - this.position.x, z - this.position.z) < 6 || this.snake.distanceToBody(x, z) < 1.5
    this.fruits.update(worldDt, elapsed, playing ? { score: this.score, blocked } : null)
    this.powerUps.update(worldDt, elapsed, playing ? { blocked } : null)
    this.hazards.update(worldDt, elapsed, playing ? { score: this.score, blocked } : null)

    if (playing) {
      if (this.magnetTimer > 0) {
        this.fruits.attract(this.position.x, this.position.z, dt, MAGNET_RADIUS, 12)
      }
      this.resolve(dt)
    }

    this.updateShield(elapsed)
    this.updateMood(dt)
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

  private unlockAudio = () => {
    this.audio.unlock()
  }

  /** Called by the HUD's sound button and the M key. */
  toggleMute() {
    this.audio.setMuted(!this.audio.isMuted)
    this.emit()
  }

  private setPaused(paused: boolean) {
    this.audio.setMode(paused ? 'pause' : 'play')
    this.audio.pause(paused)
    this.phase = paused ? 'paused' : 'playing'
    // Don't let the time spent paused run through the fixed-step loop on resume.
    this.accumulator = 0
    this.emit()
  }

  private pauseIfPlaying = () => {
    if (this.phase === 'playing') this.setPaused(true)
  }

  private dash() {
    if (!this.dashReady || this.dashTimer > 0) return
    this.dashReady = false
    this.dashTimer = DASH_TIME
    this.audio.dash()
    this.particles.burst(this.position.x, HEAD_HEIGHT, this.position.z, POWER_SPECS.dash.color, 30, 6)
    this.emit()
  }

  private collect(kind: PowerKind) {
    const spec = POWER_SPECS[kind]
    this.pickups++
    this.audio.power(kind)
    switch (kind) {
      case 'shield':
        this.shield = true
        break
      case 'slow':
        this.slowTimer = spec.duration
        this.audio.setSlow(true)
        break
      case 'magnet':
        this.magnetTimer = spec.duration
        break
      case 'dash':
        this.dashReady = true
        break
    }
    this.particles.burst(this.position.x, HEAD_HEIGHT, this.position.z, spec.color, 40, 5)
    this.emit()
  }

  /** What is killing her right now, if anything. */
  private lethal(): { reason: DeathReason; hazard?: Hazard } | null {
    if (Math.hypot(this.position.x, this.position.z) > WALL_LIMIT) return { reason: 'wall' }
    const hazard = this.hazards.hit(this.position.x, this.position.z)
    if (hazard) return { reason: hazard.kind, hazard }
    if (this.snake.hitsSelf()) return { reason: 'self' }
    return null
  }

  /** A shield (or its grace period) turns a deadly hit into a harmless one. */
  private absorb(hit: { reason: DeathReason; hazard?: Hazard }) {
    if (hit.reason === 'wall') {
      // Bounce off the thorns and head back towards the middle.
      this.heading = Math.atan2(-this.position.x, -this.position.z)
      const dist = Math.hypot(this.position.x, this.position.z)
      const limit = WALL_LIMIT - 0.4
      this.position.x *= limit / dist
      this.position.z *= limit / dist
    } else if (hit.hazard?.kind === 'thorn') {
      this.hazards.destroy(hit.hazard)
      this.particles.burst(hit.hazard.x, 1, hit.hazard.z, 0xff3a7a, 30, 5)
    }
  }

  /** Eating and collisions, checked once per frame after everything has moved. */
  private resolve(dt: number) {
    let changed = false

    if (this.comboTimer > 0) {
      this.comboTimer -= dt
      if (this.comboTimer <= 0 && this.combo > 0) {
        this.combo = 0
        changed = true
      }
    }
    for (const key of ['slowTimer', 'magnetTimer'] as const) {
      if (this[key] > 0) {
        this[key] -= dt
        if (this[key] <= 0) {
          this[key] = 0
          changed = true
          if (key === 'slowTimer') {
            this.audio.setSlow(false)
            this.audio.slowEnd()
          }
        }
      }
    }
    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt)
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt)
    if (changed) this.emit()

    const eaten = this.fruits.tryEat(this.position.x, this.position.z)
    if (eaten) {
      this.eat(eaten.x, eaten.y, eaten.z, eaten.spec.glow, eaten.spec.points, eaten.spec.growth, eaten.spec.tier)
    }
    const power = this.powerUps.tryCollect(this.position.x, this.position.z)
    if (power) this.collect(power.kind)

    const hit = this.lethal()
    if (!hit) return
    if (this.invuln > 0) {
      this.absorb(hit)
    } else if (this.shield) {
      this.shield = false
      this.invuln = INVULN_TIME
      this.audio.shieldBreak()
      this.particles.burst(this.position.x, HEAD_HEIGHT, this.position.z, POWER_SPECS.shield.color, 50, 7)
      this.absorb(hit)
      this.emit()
    } else {
      this.die(hit.reason)
    }
  }

  private updateShield(elapsed: number) {
    const active = this.phase === 'playing' && (this.shield || this.invuln > 0)
    // Flickers while the grace period runs out.
    const blink = this.shield || Math.sin(elapsed * 40) > 0
    this.shieldBubble.visible = active && blink
    this.shieldBubble.position.set(this.position.x, HEAD_HEIGHT - 0.1, this.position.z)
  }

  private moodTarget = {
    background: new THREE.Color(MOODS[0].background),
    sky: new THREE.Color(MOODS[0].sky),
    ground: new THREE.Color(MOODS[0].ground),
    moon: new THREE.Color(MOODS[0].moon),
  }

  /** Eases the sky, fog and light colours towards the current level's mood. */
  private updateMood(dt: number) {
    const mood = MOODS[this.level]
    this.moodTarget.background.set(mood.background)
    this.moodTarget.sky.set(mood.sky)
    this.moodTarget.ground.set(mood.ground)
    this.moodTarget.moon.set(mood.moon)

    const k = 1 - Math.exp(-dt * 1.2)
    const background = this.scene.background as THREE.Color
    background.lerp(this.moodTarget.background, k)
    ;(this.scene.fog as THREE.FogExp2).color.copy(background)
    this.hemisphere.color.lerp(this.moodTarget.sky, k)
    this.hemisphere.groundColor.lerp(this.moodTarget.ground, k)
    this.moon.color.lerp(this.moodTarget.moon, k)
  }

  private desiredCameraPosition(out: THREE.Vector3, elapsed = 0) {
    const showcase = this.options.showcase
    // The title screen slowly orbits her face; showcase mode does the same.
    if (showcase || this.phase === 'ready') {
      const angle = showcase?.angle !== undefined ? (showcase.angle * Math.PI) / 180 : elapsed * 0.3
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
    const lookAtFace = this.options.showcase || this.phase === 'ready'
    return out.set(this.position.x, lookAtFace ? HEAD_HEIGHT : 1, this.position.z)
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
