import { useEffect, useRef } from 'react'
import { Game } from './game/Game'

function App() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const game = new Game(containerRef.current!)
    return () => game.dispose()
  }, [])

  return <div ref={containerRef} className="game-canvas" />
}

export default App
