import * as THREE from 'three'
import { Input } from './Input'

const ARENA_RADIUS = 30
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
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

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS, 96),
      new THREE.MeshStandardMaterial({ color: 0x0b2a2a, roughness: 0.9 }),
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    const grid = new THREE.PolarGridHelper(ARENA_RADIUS, 12, 10, 96, 0x1f6f66, 0x123c3c)
    grid.position.y = 0.01
    this.scene.add(grid)

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
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((m) => m.dispose())
      }
    })
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

    this.updateCamera(dt)
    this.renderer.render(this.scene, this.camera)
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
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }
}
