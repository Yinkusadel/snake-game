const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA'])
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD'])

/** Below this fraction of full deflection a drag counts as going straight. */
const DEAD_ZONE = 0.1

/**
 * Steering, taps and key presses.
 *
 * Keyboard steering is full left or right. Touch steering is analog: put a
 * finger down anywhere and drag sideways, and the further you drag the
 * harder she turns. The anchor follows the finger when it goes past full
 * deflection, so swinging back the other way is instant.
 */
export class Input {
  private left = false
  private right = false
  private key = false
  private tap = false
  private pause = false
  private mute = false

  private touchId: number | null = null
  private anchorX = 0
  private touchSteer = 0

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerEnd)
    window.addEventListener('pointercancel', this.onPointerEnd)
  }

  /** -1 (full left) to 1 (full right). */
  get steer(): number {
    const keys = (this.right ? 1 : 0) - (this.left ? 1 : 0)
    return keys !== 0 ? keys : this.touchSteer
  }

  /** True once per Space or Enter press. */
  consumeKey(): boolean {
    const pressed = this.key
    this.key = false
    return pressed
  }

  /** True once per tap or click. */
  consumeTap(): boolean {
    const pressed = this.tap
    this.tap = false
    return pressed
  }

  /** True once per Escape or P press. */
  consumePause(): boolean {
    const pressed = this.pause
    this.pause = false
    return pressed
  }

  /** True once per M press. */
  consumeMute(): boolean {
    const pressed = this.mute
    this.mute = false
    return pressed
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerEnd)
    window.removeEventListener('pointercancel', this.onPointerEnd)
  }

  private onKeyDown = (e: KeyboardEvent) => this.set(e.code, true)
  private onKeyUp = (e: KeyboardEvent) => this.set(e.code, false)

  private onPointerDown = (e: PointerEvent) => {
    this.tap = true
    // A mouse click starts the game but doesn't steer; fingers and pens do.
    if (e.pointerType !== 'mouse' && this.touchId === null) {
      this.touchId = e.pointerId
      this.anchorX = e.clientX
      this.touchSteer = 0
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.touchId) return
    const range = Math.max(40, Math.min(window.innerWidth * 0.1, 80))
    let dx = e.clientX - this.anchorX
    if (dx > range) {
      this.anchorX = e.clientX - range
      dx = range
    } else if (dx < -range) {
      this.anchorX = e.clientX + range
      dx = -range
    }
    const v = dx / range
    this.touchSteer = Math.abs(v) < DEAD_ZONE ? 0 : v
  }

  private onPointerEnd = (e: PointerEvent) => {
    if (e.pointerId !== this.touchId) return
    this.touchId = null
    this.touchSteer = 0
  }

  private set(code: string, down: boolean) {
    if (LEFT_KEYS.has(code)) this.left = down
    else if (RIGHT_KEYS.has(code)) this.right = down
    else if ((code === 'Space' || code === 'Enter') && down) this.key = true
    else if ((code === 'Escape' || code === 'KeyP') && down) this.pause = true
    else if (code === 'KeyM' && down) this.mute = true
  }
}
