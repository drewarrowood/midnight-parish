type Bus = {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
};

let bus: Bus | null = null;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;
let sirenOscA: OscillatorNode | null = null;
let sirenOscB: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let heartGain: GainNode | null = null;
let nextNote = 0;
let sirenPhase = 0;

export function unlockAudio(): void {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!bus) {
    const ctx = new Ctx({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    music.gain.value = 0.45;
    sfx.gain.value = 0.8;
    master.gain.value = 0.9;
    music.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
    bus = { ctx, master, music, sfx };
    mountLoops(ctx, sfx);
  }
  if (bus.ctx.state === "suspended") void bus.ctx.resume();
}

function mountLoops(ctx: AudioContext, sfx: GainNode) {
  engineOsc = ctx.createOscillator();
  engineOsc.type = "sawtooth";
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 180;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(sfx);
  engineOsc.start();

  sirenOscA = ctx.createOscillator();
  sirenOscB = ctx.createOscillator();
  sirenOscA.type = "sine";
  sirenOscB.type = "sine";
  sirenGain = ctx.createGain();
  sirenGain.gain.value = 0;
  sirenOscA.connect(sirenGain);
  sirenOscB.connect(sirenGain);
  sirenGain.connect(sfx);
  sirenOscA.start();
  sirenOscB.start();

  const heart = ctx.createOscillator();
  heart.type = "sine";
  heart.frequency.value = 58;
  heartGain = ctx.createGain();
  heartGain.gain.value = 0;
  heart.connect(heartGain);
  heartGain.connect(sfx);
  heart.start();
}

export function resumeAudio(): void {
  if (bus && bus.ctx.state === "suspended") void bus.ctx.resume();
}

export function setMuted(muted: boolean): void {
  if (!bus) return;
  bus.master.gain.setTargetAtTime(muted ? 0 : 0.9, bus.ctx.currentTime, 0.03);
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  at?: number,
  dest?: AudioNode,
) {
  if (!bus) return;
  const t = at ?? bus.ctx.currentTime;
  const osc = bus.ctx.createOscillator();
  const g = bus.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(dest ?? bus.sfx);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

function noise(dur: number, gain: number, freq = 800) {
  if (!bus) return;
  const t = bus.ctx.currentTime;
  const len = Math.floor(bus.ctx.sampleRate * dur);
  const buffer = bus.ctx.createBuffer(1, len, bus.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = bus.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = bus.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const g = bus.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(bus.sfx);
  src.start(t);
  src.stop(t + dur);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    g.disconnect();
  };
}

export const sfx = {
  bite() {
    noise(0.18, 0.4, 240);
    tone(140, 0.22, "triangle", 0.25);
  },
  claw() {
    noise(0.08, 0.28, 1400);
    tone(220, 0.09, "sawtooth", 0.12);
  },
  hit() {
    noise(0.12, 0.35, 400);
    tone(90, 0.16, "sine", 0.3);
  },
  gun() {
    noise(0.09, 0.45, 1800);
    tone(160, 0.08, "square", 0.08);
  },
  cash() {
    tone(880, 0.07, "square", 0.08);
    tone(1320, 0.1, "square", 0.06);
  },
  carDoor() {
    noise(0.1, 0.2, 300);
    tone(100, 0.12, "triangle", 0.1);
  },
  mission() {
    tone(523, 0.12, "triangle", 0.12);
    tone(659, 0.14, "triangle", 0.1);
    tone(784, 0.2, "triangle", 0.1);
  },
  fail() {
    tone(196, 0.25, "sawtooth", 0.1);
    tone(130, 0.35, "triangle", 0.12);
  },
  bell() {
    tone(740, 0.18, "sine", 0.08);
    tone(980, 0.22, "sine", 0.05);
  },
  phone() {
    tone(440, 0.12, "square", 0.06);
    tone(480, 0.18, "square", 0.05);
  },
};

const BLUES = [55, 65.4, 73.4, 82.4, 98, 110];

export function mixFrame(opts: {
  speed: number;
  inCar: boolean;
  station: number;
  heat: number;
  lowBlood: boolean;
  copDist: number;
}): void {
  if (!bus || !engineGain || !engineFilter || !engineOsc || !sirenGain || !sirenOscA || !sirenOscB || !heartGain) return;
  const ctx = bus.ctx;
  const now = ctx.currentTime;
  const drive = opts.inCar ? Math.min(1, Math.abs(opts.speed) / 16) : 0;
  engineGain.gain.setTargetAtTime(drive * 0.18, now, 0.05);
  engineOsc.frequency.setTargetAtTime(48 + drive * 90, now, 0.05);
  engineFilter.frequency.setTargetAtTime(160 + drive * 900, now, 0.05);

  const siren = opts.heat > 0 ? Math.max(0.02, 0.12 * (1 - Math.min(opts.copDist, 40) / 48)) : 0;
  sirenGain.gain.setTargetAtTime(siren, now, 0.08);
  sirenPhase += 0.016;
  const hi = 620 + Math.sin(sirenPhase * 6) * 180;
  sirenOscA.frequency.setTargetAtTime(hi, now, 0.05);
  sirenOscB.frequency.setTargetAtTime(hi * 1.25, now, 0.05);

  const beat = opts.lowBlood ? 0.08 + Math.abs(Math.sin(now * 5)) * 0.12 : 0;
  heartGain.gain.setTargetAtTime(beat, now, 0.04);

  if (nextNote < now) nextNote = now + 0.05;
  const step = opts.station === 1 ? 0.28 : opts.station === 2 ? 0.55 : 0.42;
  let guard = 0;
  while (nextNote < now + 0.25 && guard++ < 4) {
    if (opts.station === 0) {
      const f = BLUES[Math.floor(Math.random() * BLUES.length)]!;
      tone(f, 0.32, "triangle", 0.06, nextNote, bus.music);
      if (Math.random() > 0.55) tone(f * 2, 0.18, "sine", 0.03, nextNote, bus.music);
    } else if (opts.station === 1) {
      noiseAt(nextNote, 0.05, 0.1, 120);
      if (guard % 2 === 0) tone(180, 0.05, "square", 0.04, nextNote, bus.music);
    } else {
      tone(92 + Math.random() * 8, 0.4, "sine", 0.03, nextNote, bus.music);
      noiseAt(nextNote, 0.2, 0.015, 2400);
    }
    nextNote += step;
  }
}

function noiseAt(at: number, dur: number, gain: number, freq: number) {
  if (!bus) return;
  const len = Math.max(1, Math.floor(bus.ctx.sampleRate * dur));
  const buffer = bus.ctx.createBuffer(1, len, bus.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = bus.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = bus.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  const g = bus.ctx.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(bus.music);
  src.start(at);
  src.stop(at + dur + 0.02);
}

export const RADIO = ["91.1 KBNE  The Parish", "104.3 KROU  Basin Bounce", "690 WYAT  Night Desk"];
