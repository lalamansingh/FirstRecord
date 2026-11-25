/**
 * Siren generated with the Web Audio API (no audio file). Browsers only allow
 * audio after a user gesture on the page, so `unlock()` must be called from a
 * click/tap/keypress at least once; until then `start()` reports it is blocked.
 */
type Ctx = AudioContext;

let ctx: Ctx | null = null;
let nodes: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

function getCtx(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function isUnlocked(): boolean {
  return !!ctx && ctx.state === "running";
}

/** Call from a user gesture. Resolves true when audio is allowed. */
export async function unlock(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state !== "running") await c.resume();
  } catch {
    return false;
  }
  return c.state === "running";
}

/** Short confirmation tone, used after enabling sound. */
export function beep() {
  const c = getCtx();
  if (!c || c.state !== "running") return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.35);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.4);
}

/** Start the wailing siren. Returns false if the browser is blocking audio. */
export async function startSiren(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  if (c.state !== "running") {
    try {
      await c.resume();
    } catch {
      /* blocked until a gesture */
    }
  }
  if (c.state !== "running") return false;
  if (nodes) return true;
  const osc = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const gain = c.createGain();
  osc.type = "sawtooth";
  osc.frequency.value = 950; // centre pitch
  lfo.type = "triangle";
  lfo.frequency.value = 0.8; // sweeps per second
  lfoGain.gain.value = 450; // sweep depth (≈500–1400 Hz)
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.value = 0.0001;
  gain.gain.exponentialRampToValueAtTime(0.35, c.currentTime + 0.15);
  osc.connect(gain).connect(c.destination);
  osc.start();
  lfo.start();
  nodes = { osc, lfo, gain };
  return true;
}

export function stopSiren() {
  if (!nodes || !ctx) return;
  const { osc, lfo, gain } = nodes;
  nodes = null;
  try {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.1);
    osc.stop(ctx.currentTime + 0.12);
    lfo.stop(ctx.currentTime + 0.12);
  } catch {
    /* already stopped */
  }
}
