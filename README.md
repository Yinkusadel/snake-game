# EWURABA

A futuristic 3D snake game. You play a girl-headed naga with a rose-and-lace crown, gliding through a bioluminescent cyber-garden, eating glowing fruits and dodging thorns.

> **Status:** playable prototype. The garden, the snake, fruit, scoring, collisions, power-ups and hazards are in. A proper title screen, sound and mobile controls are still to come. See the [design document](docs/DESIGN.md) for the full plan.

## How to play

- Press **Space** or tap to start.
- Steer with **← →** or **A / D**.
- Eat the glowing fruit to grow and score. Exotic fruit is worth more, and golden fruit is rare and brief. Eat quickly in a row for a combo multiplier.
- Don't hit the thorn wall, the spreading thorn patches, the holographic pillars (later levels) or your own body.
- Grab glowing pickups for power-ups: **Shield** (survives one hit), **Time Slow** (the world slows for 6 s), **Fruit Magnet** (pulls fruit in for 8 s) and **Lace Dash** (stored, press **Space** to burst forward).
- The garden changes mood as your score climbs: Dusk, Midnight at 200, Aurora at 500.
- Add `?quality=low` to the URL to turn off bloom and multisampling on slow devices.
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
