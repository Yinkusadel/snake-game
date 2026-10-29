import { useEffect, useRef } from 'react'
import { Game } from './game/Game'

function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const showcase = params.get('showcase')
    const angle = Number(showcase)
    const game = new Game(containerRef.current!, {
      showcase: showcase === null ? undefined : { angle: showcase === '' || Number.isNaN(angle) ? undefined : angle },
    })
    return () => game.dispose()
  }, [])

  return <div ref={containerRef} className="game-canvas" />
}

export default App
