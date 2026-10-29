const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA'])
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD'])

/** Tracks steering input. Returns -1 (left) to 1 (right). */
export class Input {
  private left = false
  private right = false
  private grow = false

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  get steer(): number {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0)
  }

  /** Dev aid until fruit exists: G lengthens the snake. */
  consumeGrow(): boolean {
    const pressed = this.grow
    this.grow = false
    return pressed
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }

  private onKeyDown = (e: KeyboardEvent) => this.set(e.code, true)
  private onKeyUp = (e: KeyboardEvent) => this.set(e.code, false)

  private set(code: string, down: boolean) {
    if (LEFT_KEYS.has(code)) this.left = down
    else if (RIGHT_KEYS.has(code)) this.right = down
    else if (code === 'KeyG' && down) this.grow = true
  }
}
