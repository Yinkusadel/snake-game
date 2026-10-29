# EWURABA — Design Document

A futuristic 3D snake game. The player controls a girl-headed naga snake gliding through a bioluminescent cyber-garden.

## 1. Vision
- Not a classic grid snake. Smooth free movement, real 3D, glow and particles.
- The snake is a character: a stylized female face with a rose-and-lace crown on a scaled emerald body.
- The garden is the second hero: a glowing night garden with holographic ruins.

## 2. Tech stack
- Vite + React + TypeScript (already in the repo).
- Three.js for rendering (consider `@react-three/fiber` + `@react-three/drei` for React integration).
- Post-processing (bloom, vignette) via `postprocessing` / `@react-three/postprocessing`.
- Web Audio API for generated music and effects (no audio files).
- `localStorage` for best score.
- React handles UI (menu, HUD, game over); the game loop and 3D scene live outside React state.

## 3. The snake
**Reference:** green naga, gold jewelry, tiara, glowing yellow-green eyes, pointed ears.

| Part | Spec |
| --- | --- |
| Head | Stylized female face, glowing yellow-green eyes, pointed ears, long dark flowing hair |
| Crown | Roses and lace woven into the hair; gold tiara with emerald gems |
| Jewelry | Gold earrings, armbands and body bands |
| Body | Smooth spline-based segments, tapering toward the tail; emerald scales with a gold pattern and a glowing belly stripe |
| Animation | Body follows the head along its path, gentle idle sway, eyes glow brighter when power-ups are active |

The model is built in code. If a `.glb` character model is supplied later, it replaces the generated head or body without changing gameplay code.

## 4. The garden (bioluminescent cyber-garden)
- Night setting with a dark teal-to-violet sky and drifting fog.
- Glowing roses, neon vines, luminous mushrooms and floating petals/fireflies.
- Holographic ruin pillars and arches in gold and cyan.
- Reflective, softly lit ground with pulsing light trails.
- Level moods: dusk, midnight, aurora (palette and lighting change as score rises).
- Arena edge: thick glowing thorn hedge walls.

## 5. Gameplay
- **Movement:** continuous glide; the player steers left and right, and the head turns with smooth turn-rate limits. The body follows the head's path.
- **Camera:** third-person chase camera, angled above and behind, with a smooth follow and slight look-ahead.
- **Food:** dynamic glowing fruits. Each one lengthens her and adds score. Fruits grow on garden vines and trees, ripen, then drop or float within reach. A fruit left too long overripens and fades.
  - Common: glowing berries, apples, pears. Small growth, base score.
  - Exotic: dragonfruit, starfruit, pomegranate. More growth and score.
  - Rare golden fruit: big bonus, appears briefly.
  - Fruit varies by level mood (for example, night-blooming fruits at midnight, aurora fruits at the aurora level).
- **Power-ups:**
  - Shield: survive one collision.
  - Time Slow: the world slows for a few seconds.
  - Fruit Magnet: nearby fruits fly toward her.
  - Lace Dash: short speed burst.
- **Hazards:** thorn vines that grow and spread as score rises; holographic pillars appear in later levels.
- **Game over:** collision with a thorn, pillar, arena wall or her own body (unless shielded).
- **Progression:** speed and hazards scale with score; moods change per level.
- **Scoring:** common fruit = 10, exotic fruit = 25, golden fruit = 50, with a combo multiplier for eating quickly in a row. Best score saved locally.

## 6. Controls
- Keyboard: arrow keys or A/D (WASD) to steer, Space to use Lace Dash, P/Esc to pause.
- Mobile: swipe or on-screen joystick, with a dash button.

## 7. Audio
- Ambient synth pad generated with Web Audio.
- Sound effects: fruit pickup, power-up, dash, shield break, game over.
- Mute toggle.

## 8. UI
- Title screen with the EWURABA logo over the animated garden.
- HUD: score, best, length, active power-up timers.
- Pause and game-over screens with restart.
- Futuristic styling: glass panels, gold and emerald accents, glow.

## 9. Build plan
1. Project setup: add Three.js, base scene, camera, game loop.
2. Garden environment: ground, lighting, fog, bloom, props.
3. Snake: path-following body, head with face, crown, jewelry.
4. Gameplay: steering, fruits, growth, collisions, scoring.
5. Power-ups and hazards.
6. UI screens and HUD.
7. Audio.
8. Mobile controls, performance tuning, polish.

## 10. Open questions
- Whether to supply a `.glb` character model for the head or body.
- Target performance on low-end devices, which determines the quality settings.
