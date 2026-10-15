// Restrained cue sounds synthesised with WebAudio; no audio files to load.
let context: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

type Cue = "deliver" | "block" | "alarm" | "click" | "success" | "setback" | "fail";

const CUES: Record<Cue, [number, number, OscillatorType, number][]> = {
  deliver: [[880, 0.06, "sine", 0.05]],
  block: [[180, 0.09, "triangle", 0.07]],
  alarm: [[520, 0.12, "square", 0.04], [390, 0.14, "square", 0.04]],
  click: [[640, 0.03, "sine", 0.04]],
  success: [[523, 0.1, "sine", 0.06], [659, 0.1, "sine", 0.06], [784, 0.16, "sine", 0.06]],
  setback: [[392, 0.12, "triangle", 0.06], [330, 0.18, "triangle", 0.06]],
  fail: [[260, 0.2, "sawtooth", 0.03]],
};

export function play(cue: Cue): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    let at = context.currentTime;
    for (const [frequency, duration, type, volume] of CUES[cue]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + duration);
      at += duration * 0.9;
    }
  } catch {
    // Audio is optional.
  }
}
