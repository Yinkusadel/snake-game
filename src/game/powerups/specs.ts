/** Power-up definitions. Plain data, so the HUD can use it without loading Three.js. */

export type PowerKind = 'shield' | 'slow' | 'magnet' | 'dash'

export interface PowerSpec {
  kind: PowerKind
  label: string
  icon: string
  /** One line for the how-to-play legend. */
  blurb: string
  color: number
  /** Seconds the effect lasts; 0 for effects that last until used. */
  duration: number
}

export const POWER_SPECS: Record<PowerKind, PowerSpec> = {
  shield: {
    kind: 'shield',
    label: 'Shield',
    icon: '\u{1F6E1}️',
    blurb: 'Survive one hit',
    color: 0x3ff0ff,
    duration: 0,
  },
  slow: {
    kind: 'slow',
    label: 'Time Slow',
    icon: '⏳',
    blurb: 'The world slows down',
    color: 0xa06bff,
    duration: 6,
  },
  magnet: {
    kind: 'magnet',
    label: 'Fruit Magnet',
    icon: '\u{1F9F2}',
    blurb: 'Fruit flies to you',
    color: 0xffc857,
    duration: 8,
  },
  dash: {
    kind: 'dash',
    label: 'Lace Dash',
    icon: '⚡',
    blurb: 'Space to burst forward',
    color: 0xfff0e6,
    duration: 0,
  },
}
