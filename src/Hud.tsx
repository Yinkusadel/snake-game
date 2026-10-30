import { POWER_SPECS } from './game/powerups/specs'
import type { GameState, TimedEffect } from './game/state'

const REASONS = {
  wall: 'She flew into the thorn wall.',
  self: 'She tangled herself up.',
  thorn: 'She ran into the thorns.',
  pillar: 'She hit a hologram pillar.',
} as const

const POWERS = Object.values(POWER_SPECS)

/** A power-up chip. Timed ones drain their bar over the time they have left. */
function Chip({
  icon,
  label,
  hint,
  keyboardOnly,
  timed,
}: {
  icon: string
  label: string
  /** Keyboard hint, hidden on touch screens. */
  hint?: string
  /** Hidden on touch screens, where a button does the job. */
  keyboardOnly?: boolean
  timed?: TimedEffect | null
}) {
  return (
    <div className={keyboardOnly ? 'chip chip-keyboard' : 'chip'}>
      <span className="chip-icon">{icon}</span>
      <span className="chip-label">
        {label}
        {hint && <span className="mouse-only">{hint}</span>}
      </span>
      {timed && (
        <span className="chip-bar">
          <span
            key={timed.id}
            className="chip-fill"
            style={{
              width: `${(timed.remaining / timed.total) * 100}%`,
              animationDuration: `${timed.remaining}s`,
            }}
          />
        </span>
      )}
    </div>
  )
}

interface HudProps {
  state: GameState
  onToggleMute: () => void
  onTogglePause: () => void
  onDash: () => void
}

/** Buttons stop pointer events so touching one isn't also a tap or a steer. */
const stopPointer = (e: React.PointerEvent) => e.stopPropagation()

export function Hud({ state, onToggleMute, onTogglePause, onDash }: HudProps) {
  const { muted, phase, score, best, length, eaten, combo, multiplier, reason, effects, level, levelName } = state
  const inRun = phase === 'playing' || phase === 'paused'

  return (
    <div className={`hud${phase === 'playing' && effects.slow ? ' hud-slow' : ''}`}>
      <button
        type="button"
        className="sound-button"
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        aria-pressed={muted}
        title="Sound (M)"
        // Clicking it must not also start or resume the game.
        onPointerDown={stopPointer}
        onClick={(e) => {
          onToggleMute()
          e.currentTarget.blur()
        }}
      >
        {muted ? '\u{1F507}' : '\u{1F50A}'}
      </button>
      {inRun && (
        <>
          <button
            type="button"
            className="pause-button"
            aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
            title="Pause (Esc or P)"
            onPointerDown={stopPointer}
            onClick={(e) => {
              onTogglePause()
              e.currentTarget.blur()
            }}
          >
            {phase === 'paused' ? '▶' : '⏸'}
          </button>
          {phase === 'playing' && effects.dash && (
            <button
              type="button"
              className="dash-button"
              aria-label="Lace Dash"
              onPointerDown={(e) => {
                e.stopPropagation()
                onDash()
              }}
            >
              {POWER_SPECS.dash.icon}
              <span>Dash</span>
            </button>
          )}
          <div className="hud-top">
            <div className="stat">
              <span className="stat-label">Score</span>
              <span className="stat-value">{score}</span>
            </div>
            <div className="stat stat-right">
              <span className="stat-label">Best {best}</span>
              <span className="stat-small">Length {length.toFixed(1)}</span>
            </div>
          </div>
          {level > 0 && (
            <div key={level} className="level-banner">
              {levelName}
            </div>
          )}
          <div className="chips">
            {effects.shield && <Chip icon={POWER_SPECS.shield.icon} label="Shield" />}
            {effects.dash && <Chip icon={POWER_SPECS.dash.icon} label="Dash" hint=": Space" keyboardOnly />}
            {effects.slow && <Chip icon={POWER_SPECS.slow.icon} label="Time Slow" timed={effects.slow} />}
            {effects.magnet && <Chip icon={POWER_SPECS.magnet.icon} label="Magnet" timed={effects.magnet} />}
          </div>
          {combo > 1 && (
            <div key={combo} className="combo">
              x{multiplier} combo
            </div>
          )}
        </>
      )}

      {phase === 'ready' && (
        <div className="screen screen-title">
          <header className="title-block">
            <h1 className="title">EWURABA</h1>
            <p className="subtitle">A naga&rsquo;s garden of glowing fruit</p>
          </header>

          <footer className="title-foot">
            <p className="prompt">
              <span className="mouse-only">Press Space or tap to start</span>
              <span className="touch-only">Tap to start</span>
            </p>

            <div className="legend">
              <div className="legend-row">
                <span className="legend-item">
                  <b>Fruit</b> 10
                </span>
                <span className="legend-item">
                  <b>Exotic</b> 25
                </span>
                <span className="legend-item">
                  <b>Golden</b> 50
                </span>
                <span className="legend-item legend-note">Eat quickly in a row for a combo</span>
              </div>
              <div className="legend-row">
                {POWERS.map((p) => (
                  <span key={p.kind} className="legend-item">
                    <span className="legend-icon">{p.icon}</span>
                    <b>{p.label}</b> {p.blurb}
                  </span>
                ))}
              </div>
            </div>

            <p className="hint mouse-only">
              Steer with &larr; &rarr; or A / D &middot; Esc or P to pause &middot; M for sound &middot; Avoid thorns,
              pillars and yourself
            </p>
            <p className="hint touch-only">Drag left or right to steer &middot; Avoid thorns, pillars and yourself</p>
            {best > 0 && <p className="hint">Best {best}</p>}
          </footer>
        </div>
      )}

      {phase === 'paused' && (
        <div className="screen screen-paused">
          <h2 className="pause-title">Paused</h2>
          <p className="prompt">
            <span className="mouse-only">Press Esc, P, Space or tap to resume</span>
            <span className="touch-only">Tap to resume</span>
          </p>
          <p className="hint">The game also pauses when you switch away.</p>
        </div>
      )}

      {phase === 'over' && (
        <div className="screen screen-over">
          <h2 className="over-title">Game over</h2>
          {reason && <p className="tagline">{REASONS[reason]}</p>}
          <div className="over-stats">
            <div>
              <span className="stat-label">Score</span>
              <span className="stat-value">{score}</span>
            </div>
            <div>
              <span className="stat-label">Best</span>
              <span className="stat-value">{best}</span>
            </div>
          </div>
          <p className="run-summary">
            {eaten} fruit eaten &middot; length {length.toFixed(1)} &middot; reached {levelName}
          </p>
          {score > 0 && score >= best && <p className="record">New best!</p>}
          <p className="prompt">
            <span className="mouse-only">Press Space or tap to play again</span>
            <span className="touch-only">Tap to play again</span>
          </p>
        </div>
      )}
    </div>
  )
}
