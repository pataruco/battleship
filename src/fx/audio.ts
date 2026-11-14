import { getPrefs } from '../storage/prefs';

export type Sfx = 'splash' | 'boom' | 'glug' | 'fanfare' | 'chime' | 'pop';

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Create/resume the `AudioContext` inside the start tap (one gesture) and ask iOS for playback audio. */
export function unlockAudio(): void {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback';
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    void ctx.resume();
    // A silent tick completes the unlock on older iOS.
    const g = ctx.createGain();
    g.gain.value = 0;
    const o = ctx.createOscillator();
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {
    // Sound is a nicety.
  }
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function tone(c: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, vol: number, endFreq = freq): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function hiss(c: AudioContext, at: number, dur: number, freq: number, vol: number): void {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, freq / 8), at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(at);
  s.stop(at + dur + 0.02);
}

/** Plays a synthesised effect. No-op when sound is off, the context is locked, or Web Audio is missing. */
export function play(sfx: Sfx): void {
  if (!ctx || ctx.state !== 'running' || !getPrefs().sound) return;
  const c = ctx;
  const t = c.currentTime;
  try {
    switch (sfx) {
      case 'splash':
        hiss(c, t, 0.45, 5000, 0.35);
        break;
      case 'boom':
        tone(c, t, 140, 0.5, 'sine', 0.8, 40);
        hiss(c, t, 0.4, 1800, 0.5);
        break;
      case 'glug':
        tone(c, t, 420, 0.18, 'sine', 0.5, 160);
        tone(c, t + 0.2, 360, 0.18, 'sine', 0.5, 120);
        tone(c, t + 0.4, 300, 0.25, 'sine', 0.5, 90);
        break;
      case 'fanfare':
        [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.14, f, 0.3, 'triangle', 0.45));
        tone(c, t + 0.6, 1047, 0.7, 'triangle', 0.45);
        tone(c, t + 0.6, 784, 0.7, 'triangle', 0.3);
        break;
      case 'chime':
        tone(c, t, 880, 0.35, 'sine', 0.4);
        tone(c, t + 0.15, 1320, 0.5, 'sine', 0.4);
        break;
      case 'pop':
        tone(c, t, 300, 0.1, 'sine', 0.5, 700);
        break;
    }
  } catch {
    // Sound is a nicety.
  }
}
