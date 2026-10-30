# EWURABA

A futuristic 3D snake game. You play a girl-headed naga with a rose-and-lace crown, gliding through a bioluminescent cyber-garden, eating glowing fruits and dodging thorns.

> **Status:** complete first version. Everything in the [design document](docs/DESIGN.md) is built, with the exceptions listed in its "As built" section.

## How to play

- Press **Space** or tap to start.
- Press **M** (or click the speaker button) to mute. The soundtrack and every effect are generated in code, so there are no audio files.
- Press **Esc** or **P** to pause. The game also pauses when you switch away.
- Steer with **← →** or **A / D**. On a touch screen, put a finger down and drag left or right; the further you drag, the harder she turns.
- Eat the glowing fruit to grow and score. Exotic fruit is worth more, and golden fruit is rare and brief. Eat quickly in a row for a combo multiplier.
- Don't hit the thorn wall, the spreading thorn patches, the holographic pillars (later levels) or your own body.
- Grab glowing pickups for power-ups: **Shield** (survives one hit), **Time Slow** (the world slows for 6 s), **Fruit Magnet** (pulls fruit in for 8 s) and **Lace Dash** (stored, press **Space** to burst forward).
- The garden changes mood as your score climbs: Dusk, Midnight at 200, Aurora at 500.
- The picture quality steps down automatically (lower resolution, then no bloom) if the frame rate stays poor. Add `?quality=low` to the URL to start in the light mode, or `?quality=high` to stop it adapting.
- Add `?showcase` to the URL to orbit the camera around her face.

## Planned features

- Smooth free movement in full 3D with a chase camera
- A stylized snake with a female face, glowing eyes, gold jewelry and a rose-and-lace crown
- A glowing night garden with holographic ruins, neon vines and floating petals
- Power-ups: Shield, Time Slow, Fruit Magnet, Lace Dash
- Thorn hazards that spread as your score rises
- Generated ambient music and sound effects
- Keyboard and mobile touch controls

## Tech stack

- [Vite](https://vite.dev), [React](https://react.dev) and TypeScript
- [Three.js](https://threejs.org) for 3D rendering (to be added)
- Web Audio API for sound

## Getting started

```bash
npm install
npm run dev
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |

## Documentation

- [Design document](docs/DESIGN.md): vision, snake and garden design, gameplay, controls and build plan
