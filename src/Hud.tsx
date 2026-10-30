import { POWER_SPECS } from './game/powerups/PowerUps'
import type { GameState, TimedEffect } from './game/state'

const REASONS = {
  wall: 'She flew into the thorn wall.',
  self: 'She tangled herself up.',
  thorn: 'She ran into the thorns.',
  pillar: 'She hit a hologram pillar.',
} as const

/** A power-up chip. Timed ones drain their bar over the time they have left. */
function Chip({ icon, label, timed }: { icon: string; label: string; timed?: TimedEffect | null }) {
  return (
    <div className="chip">
      <span className="chip-icon">{icon}</span>
      <span className="chip-label">{label}</span>
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

export function Hud({ state }: { state: GameState }) {
  const { phase, score, best, length, combo, multiplier, reason, effects, level, levelName } = state

  return (
    <div className={`hud${phase === 'playing' && effects.slow ? ' hud-slow' : ''}`}>
      {phase === 'playing' && (
        <>
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
            {effects.dash && <Chip icon={POWER_SPECS.dash.icon} label="Dash: Space" />}
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
        <div className="screen">
          <h1 className="title">EWURABA</h1>
          <p className="tagline">Eat the glowing fruit. Avoid the thorns. Don&rsquo;t tie yourself in knots.</p>
          <p className="prompt">Press Space or tap to start</p>
          <p className="hint">Steer with &larr; &rarr; or A / D. Space uses a stored Lace Dash.</p>
          {best > 0 && <p className="hint">Best {best}</p>}
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
          {score > 0 && score >= best && <p className="record">New best!</p>}
          <p className="prompt">Press Space or tap to play again</p>
        </div>
      )}
    </div>
  )
}
