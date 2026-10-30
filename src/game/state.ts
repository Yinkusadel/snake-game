export type Phase = 'ready' | 'playing' | 'paused' | 'over'
export type DeathReason = 'wall' | 'self' | 'thorn' | 'pillar'

/** An effect with a countdown. The HUD animates the bar itself. */
export interface TimedEffect {
  remaining: number
  total: number
  /** Changes each time the effect is picked up, so the HUD can restart its bar. */
  id: number
}

export interface EffectsState {
  shield: boolean
  slow: TimedEffect | null
  magnet: TimedEffect | null
  /** A Lace Dash is stored and ready to use. */
  dash: boolean
}

/** Everything the UI needs to draw the HUD and screens. */
export interface GameState {
  phase: Phase
  score: number
  best: number
  /** Body length in world units. */
  length: number
  /** Fruit eaten this run. */
  eaten: number
  combo: number
  multiplier: number
  level: number
  levelName: string
  effects: EffectsState
  reason?: DeathReason
}
