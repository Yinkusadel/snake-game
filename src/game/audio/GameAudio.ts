/**
 * All sound is synthesised with the Web Audio API, so there are no audio
 * files to download. The soundtrack is generative: slow detuned pads under a
 * sparse echoing pluck melody, with a different key and scale per level.
 */

export type AudioMode = 'title' | 'play' | 'pause' | 'over'
export type PowerSound = 'shield' | 'slow' | 'magnet' | 'dash'
export type FruitTier = 'common' | 'exotic' | 'golden'

const MUTE_KEY = 'ewuraba-muted'
const BAR = 8
const STEP = 0.375
const LOOKAHEAD = 0.7

interface Mood {
  /** MIDI note of the key's root. */
  root: number
  /** Scale used for the pluck melody, as semitones above the root. */
  scale: number[]
  /** Four chords, each a set of semitone offsets from the root. */
  chords: number[][]
}

const MOODS: Mood[] = [
  // Dusk: D minor, i - VI - III - VII.
  {
    root: 50,
    scale: [0, 3, 5, 7, 10],
    chords: [
      [0, 7, 12, 15],
      [-4, 3, 8, 12],
      [3, 10, 15, 19],
      [-2, 5, 10, 14],
    ],
  },
  // Midnight: lower and darker, B minor with a flat second colour.
  {
    root: 47,
    scale: [0, 2, 3, 7, 8],
    chords: [
      [0, 7, 12, 15],
      [-4, 3, 8, 12],
      [-2, 5, 10, 14],
      [-5, 2, 7, 10],
    ],
  },
  // Aurora: bright E lydian.
  {
    root: 52,
    scale: [0, 2, 4, 6, 7, 9, 11],
    chords: [
      [0, 7, 11, 16],
      [-4, 3, 7, 12],
      [5, 12, 16, 19],
      [7, 14, 18, 23],
    ],
  },
]

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export class GameAudio {
  private ctx: BaseAudioContext | null
  private readonly ownsContext: boolean
  private master!: GainNode
  private musicBus!: GainNode
  private musicFilter!: BiquadFilterNode
  private sfxBus!: GainNode
  private reverbSend!: GainNode
  private echoIn!: GainNode
  private noiseBuffer!: AudioBuffer
  private timer: ReturnType<typeof setInterval> | null = null

  private muted = loadMuted()
  private mode: AudioMode = 'title'
  private mood = 0
  private slow = false

  private nextChord = 0
  private nextStep = 0
  private stepIndex = 0
  private chordIndex = 0
  private chords: { t: number; notes: number[] }[] = []

  /** Pass a context to drive the engine yourself (tests render offline). */
  constructor(context?: BaseAudioContext) {
    this.ctx = context ?? null
    this.ownsContext = !context
    if (context) this.build(context)
  }

  get isMuted() {
    return this.muted
  }

  /** Browsers only allow sound after a user gesture; call this from one. */
  unlock() {
    if (this.ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.build(this.ctx)
    }
    const ctx = this.ctx as AudioContext
    if (ctx.state === 'suspended') void ctx.resume()
    if (this.timer === null && this.ownsContext) {
      const t = ctx.currentTime
      this.nextChord = t + 0.1
      this.nextStep = t + 0.1
      this.timer = setInterval(() => this.schedule(ctx.currentTime + LOOKAHEAD), 150)
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Not persisting the choice is harmless.
    }
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.05)
  }

  setMode(mode: AudioMode) {
    this.mode = mode
    this.updateFilter()
  }

  setMood(level: number) {
    this.mood = Math.min(level, MOODS.length - 1)
  }

  /** Time Slow muffles the music. */
  setSlow(slow: boolean) {
    this.slow = slow
    this.updateFilter()
  }

  dispose() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    if (this.ctx && this.ownsContext) void (this.ctx as AudioContext).close()
    this.ctx = null
  }

  // ---- Music -------------------------------------------------------------

  /** Queues music up to `until` (audio-context seconds). Called on a timer. */
  schedule(until: number) {
    if (!this.ctx) return
    while (this.nextChord < until) {
      this.playChord(this.nextChord)
      this.nextChord += BAR
    }
    while (this.nextStep < until) {
      this.pluck(this.nextStep)
      this.nextStep += STEP
      this.stepIndex++
    }
  }

  private updateFilter() {
    if (!this.ctx) return
    const base = { title: 2600, play: 4200, pause: 500, over: 700 }[this.mode]
    const freq = this.slow ? Math.min(base, 650) : base
    this.musicFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.25)
  }

  private playChord(t: number) {
    const ctx = this.ctx!
    const mood = MOODS[this.mood]
    const chord = mood.chords[this.chordIndex % mood.chords.length]
    this.chordIndex++
    const notes = chord.map((n) => mood.root + n)
    this.chords.push({ t, notes })
    if (this.chords.length > 6) this.chords.shift()

    const vol = this.mode === 'over' ? 0.05 : 0.085
    for (const note of notes) {
      for (const detune of [-8, 8]) {
        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = midi(note)
        osc.detune.value = detune

        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 650
        lp.Q.value = 0.4

        const g = ctx.createGain()
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(vol / 2, t + 2.2)
        g.gain.setValueAtTime(vol / 2, t + BAR - 0.5)
        g.gain.linearRampToValueAtTime(0, t + BAR + 2.5)

        osc.connect(lp).connect(g).connect(this.musicBus)
        g.connect(this.reverbSend)
        osc.start(t)
        osc.stop(t + BAR + 2.6)
      }
    }

    // Low drone on the chord's root.
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = midi(notes[0] - 12)
    const sg = ctx.createGain()
    sg.gain.setValueAtTime(0, t)
    sg.gain.linearRampToValueAtTime(0.16, t + 1.5)
    sg.gain.setValueAtTime(0.16, t + BAR - 0.5)
    sg.gain.linearRampToValueAtTime(0, t + BAR + 1.5)
    sub.connect(sg).connect(this.musicBus)
    sub.start(t)
    sub.stop(t + BAR + 1.6)
  }

  private pluck(t: number) {
    const ctx = this.ctx!
    const density = { title: 0.5, play: 0.55 + this.mood * 0.12, pause: 0.2, over: 0.0 }[this.mode]
    if (Math.random() > density) return

    const mood = MOODS[this.mood]
    const chord = [...this.chords].reverse().find((c) => c.t <= t + 0.01) ?? this.chords[0]
    if (!chord) return
    // Half the notes are chord tones, the rest wander the scale.
    const note =
      Math.random() < 0.5
        ? pick(chord.notes) + 12 * (1 + Math.floor(Math.random() * 2))
        : mood.root + pick(mood.scale) + 12 * (2 + Math.floor(Math.random() * 2))

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = midi(note)
    const g = ctx.createGain()
    const vol = 0.07 + Math.random() * 0.04
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1)

    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.2 - 0.6
    osc.connect(g).connect(pan)
    pan.connect(this.musicBus)
    pan.connect(this.echoIn)
    pan.connect(this.reverbSend)
    osc.start(t)
    osc.stop(t + 1.2)
  }

  // ---- Sound effects -----------------------------------------------------

  /** Fruit pickup. The pitch climbs with the combo multiplier. */
  eat(multiplier: number, tier: FruitTier) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const steps = [0, 2, 4, 7, 9]
    const m = Math.max(1, multiplier) - 1
    const note = 74 + steps[m % 5] + 12 * Math.floor(m / 5)

    if (tier === 'golden') {
      ;[0, 4, 7, 12, 16].forEach((interval, i) => this.tone(midi(74 + interval), 0.5, 'triangle', 0.16, t + i * 0.055))
      this.noise(0.35, 6000, 'highpass', 0.12, t)
      return
    }
    this.tone(midi(note), 0.28, 'triangle', 0.3, t)
    this.tone(midi(note + 12), 0.2, 'sine', 0.12, t)
    if (tier === 'exotic') this.tone(midi(note + 7), 0.3, 'triangle', 0.13, t + 0.06)
  }

  power(kind: PowerSound) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    switch (kind) {
      case 'shield':
        this.tone(midi(79), 0.7, 'sine', 0.22, t)
        this.tone(midi(86), 0.9, 'sine', 0.16, t + 0.08)
        this.tone(midi(91), 1.0, 'sine', 0.1, t + 0.16)
        break
      case 'slow':
        this.sweep(900, 140, 0.9, 'sine', 0.24, t)
        this.noise(0.8, 500, 'lowpass', 0.1, t)
        break
      case 'magnet':
        for (let i = 0; i < 4; i++) this.tone(midi(60 + i * 3), 0.16, 'square', 0.07, t + i * 0.07)
        this.sweep(200, 700, 0.4, 'sawtooth', 0.08, t)
        break
      case 'dash':
        this.sweep(300, 1400, 0.4, 'square', 0.09, t)
        this.tone(midi(88), 0.4, 'sine', 0.14, t + 0.3)
        break
    }
  }

  dash() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.noiseSweep(400, 3600, 0.55, 0.3, t)
    this.sweep(140, 420, 0.5, 'sawtooth', 0.1, t)
  }

  shieldBreak() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.noise(0.4, 3000, 'highpass', 0.3, t)
    this.sweep(1200, 200, 0.45, 'triangle', 0.2, t)
    ;[90, 95, 98].forEach((n, i) => this.tone(midi(n), 0.25, 'sine', 0.08, t + 0.02 * i))
  }

  slowEnd() {
    const ctx = this.ctx
    if (!ctx) return
    this.sweep(160, 800, 0.5, 'sine', 0.16, ctx.currentTime)
  }

  levelUp() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    ;[0, 4, 7, 12, 16, 19].forEach((interval, i) => {
      this.tone(midi(67 + interval), 0.9, 'triangle', 0.13, t + i * 0.09)
      this.tone(midi(55 + interval), 1.2, 'sine', 0.07, t + i * 0.09)
    })
  }

  start() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    ;[0, 7, 12, 19].forEach((interval, i) => this.tone(midi(55 + interval), 1.1, 'sine', 0.12, t + i * 0.06))
    this.noiseSweep(300, 2500, 0.8, 0.16, t)
  }

  pause(paused: boolean) {
    const ctx = this.ctx
    if (!ctx) return
    this.sweep(paused ? 700 : 350, paused ? 350 : 700, 0.18, 'sine', 0.14, ctx.currentTime)
  }

  death() {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    this.sweep(260, 38, 1.4, 'sawtooth', 0.22, t, 900)
    this.sweep(110, 28, 0.9, 'sine', 0.4, t)
    this.noise(0.7, 1400, 'lowpass', 0.3, t)
  }

  // ---- Synthesis helpers ---------------------------------------------------

  private tone(freq: number, duration: number, type: OscillatorType, vol: number, when: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(vol, when + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    osc.connect(g)
    g.connect(this.sfxBus)
    g.connect(this.reverbSend)
    osc.start(when)
    osc.stop(when + duration + 0.05)
  }

  private sweep(from: number, to: number, duration: number, type: OscillatorType, vol: number, when: number, cutoff?: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, when)
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), when + duration)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(vol, when + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    let out: AudioNode = osc
    if (cutoff) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = cutoff
      osc.connect(lp)
      out = lp
    }
    out.connect(g)
    g.connect(this.sfxBus)
    osc.start(when)
    osc.stop(when + duration + 0.05)
  }

  private noise(duration: number, freq: number, type: BiquadFilterType, vol: number, when: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, when)
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    src.connect(f).connect(g)
    g.connect(this.sfxBus)
    src.start(when, Math.random() * 0.5)
    src.stop(when + duration + 0.05)
  }

  /** Filtered noise whose centre frequency glides, like wind rushing past. */
  private noiseSweep(from: number, to: number, duration: number, vol: number, when: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 2.5
    f.frequency.setValueAtTime(from, when)
    f.frequency.exponentialRampToValueAtTime(to, when + duration)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.exponentialRampToValueAtTime(vol, when + duration * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration)
    src.connect(f).connect(g)
    g.connect(this.sfxBus)
    src.start(when, Math.random() * 0.5)
    src.stop(when + duration + 0.05)
  }

  // ---- Graph ---------------------------------------------------------------

  private build(ctx: BaseAudioContext) {
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -14
    compressor.ratio.value = 6
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.85
    this.master.connect(compressor).connect(ctx.destination)

    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0.4
    this.musicFilter = ctx.createBiquadFilter()
    this.musicFilter.type = 'lowpass'
    this.musicFilter.frequency.value = 2600
    this.musicBus.connect(this.musicFilter).connect(this.master)

    this.sfxBus = ctx.createGain()
    this.sfxBus.gain.value = 3.2
    this.sfxBus.connect(this.master)

    // Shared reverb: decaying stereo noise as the impulse response.
    const length = Math.floor(ctx.sampleRate * 2.4)
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.4)
    }
    const reverb = ctx.createConvolver()
    reverb.buffer = impulse
    this.reverbSend = ctx.createGain()
    this.reverbSend.gain.value = 0.35
    const wet = ctx.createGain()
    wet.gain.value = 0.7
    this.reverbSend.connect(reverb).connect(wet).connect(this.master)

    // Feedback echo for the pluck melody.
    this.echoIn = ctx.createGain()
    this.echoIn.gain.value = 0.5
    const delay = ctx.createDelay(1)
    delay.delayTime.value = STEP * 2
    const feedback = ctx.createGain()
    feedback.gain.value = 0.38
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2400
    this.echoIn.connect(delay).connect(tone)
    tone.connect(feedback).connect(delay)
    tone.connect(this.musicBus)

    // One second of white noise, reused by every noise effect.
    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const n = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1
  }
}
