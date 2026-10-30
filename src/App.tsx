import { useEffect, useRef, useState } from 'react'
import type { Game } from './game/Game'
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

/** ?quality=low or ?quality=high forces a setting; otherwise it adapts. */
function readQuality(params: URLSearchParams) {
  const quality = params.get('quality')
  return quality === 'low' || quality === 'high' ? quality : undefined
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [state, setState] = useState<GameState>(INITIAL)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false
    let game: Game | null = null

    // The 3D engine is the bulk of the download, so load it after the page
    // has painted and show a loading message meanwhile.
    import('./game/Game')
      .then(({ Game }) => {
        if (cancelled) return
        const params = new URLSearchParams(window.location.search)
        const showcase = params.get('showcase')
        const angle = Number(showcase)
        game = new Game(containerRef.current!, {
          showcase:
            showcase === null ? undefined : { angle: showcase === '' || Number.isNaN(angle) ? undefined : angle },
          quality: readQuality(params),
          onState: setState,
        })
        gameRef.current = game
        setStatus('ready')
      })
      .catch((error: unknown) => {
        console.error(error)
        if (!cancelled) setStatus('failed')
      })

    return () => {
      cancelled = true
      game?.dispose()
      gameRef.current = null
    }
  }, [])

  const showcase = new URLSearchParams(window.location.search).has('showcase')

  return (
    <>
      <div ref={containerRef} className="game-canvas" />
      {status === 'loading' && (
        <div className="notice">
          <h1 className="title">EWURABA</h1>
          <p className="prompt">Growing the garden&hellip;</p>
        </div>
      )}
      {status === 'failed' && (
        <div className="notice">
          <h1 className="title">EWURABA</h1>
          <p className="tagline">
            The game couldn&rsquo;t start. It needs a browser with WebGL enabled. Try updating your browser or turning
            on hardware acceleration, then reload.
          </p>
        </div>
      )}
      {status === 'ready' && !showcase && (
        <Hud
          state={state}
          onToggleMute={() => gameRef.current?.toggleMute()}
          onTogglePause={() => gameRef.current?.togglePause()}
          onDash={() => gameRef.current?.triggerDash()}
        />
      )}
    </>
  )
}

export default App
