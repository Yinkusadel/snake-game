import type { GameState } from './game/state'

const REASONS = {
  wall: 'She flew into the thorns.',
  self: 'She tangled herself up.',
} as const

export function Hud({ state }: { state: GameState }) {
  const { phase, score, best, length, combo, multiplier, reason } = state

  return (
    <div className="hud">
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
          <p className="hint">Steer with &larr; &rarr; or A / D</p>
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
