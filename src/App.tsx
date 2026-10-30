import { useEffect, useRef, useState } from 'react'
import { Game } from './game/Game'
import type { GameState } from './game/state'
import { Hud } from './Hud'

const INITIAL: GameState = {
  phase: 'ready',
  score: 0,
  best: 0,
  length: 0,
  eaten: 0,
  muted: false,
  combo: 0,
  multiplier: 1,
  level: 0,
  levelName: 'Dusk',
  effects: { shield: false, slow: null, magnet: null, dash: false },
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [state, setState] = useState<GameState>(INITIAL)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const showcase = params.get('showcase')
    const angle = Number(showcase)
    const game = new Game(containerRef.current!, {
      showcase: showcase === null ? undefined : { angle: showcase === '' || Number.isNaN(angle) ? undefined : angle },
      quality: params.get('quality') === 'low' ? 'low' : 'high',
      onState: setState,
    })
    gameRef.current = game
    return () => {
      game.dispose()
      gameRef.current = null
    }
  }, [])

  const showcase = new URLSearchParams(window.location.search).has('showcase')

  return (
    <>
      <div ref={containerRef} className="game-canvas" />
      {!showcase && <Hud state={state} onToggleMute={() => gameRef.current?.toggleMute()} />}
    </>
  )
}

export default App
