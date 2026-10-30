export type Phase = 'ready' | 'playing' | 'over'
export type DeathReason = 'wall' | 'self'

/** Everything the UI needs to draw the HUD and screens. */
export interface GameState {
  phase: Phase
  score: number
  best: number
  /** Body length in world units. */
  length: number
  combo: number
  multiplier: number
  reason?: DeathReason
}
