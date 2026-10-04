// DEMO ONLY: a synthetic 8 h 30 min night used to try the ECG review tools
// before the analysis model is connected. It is not anyone's recording.
//
// It follows the output shape of the sample study the team uses (V2 mock,
// PhysioNet Apnea-ECG style): the model labels every MINUTE as apnea (A) or
// normal (N); consecutive A minutes form an "annotation run". Alongside the
// labels come R-peaks, beat labels (N) and HR/HRV summary metrics.
//
// The apnea runs are the same 17 intervals as `sampleEvents` in posa-state.tsx.
// Inside a run, breathing stops and restarts in ~50 s cycles, so heart rate
// slows and then jumps (cyclic variation of heart rate) and ECG-derived
// respiration (EDR) gets shallow.

import { sampleEvents } from './posa-state';

export type ApneaRun = { id: number; start: number; end: number; minutes: number; meanProbability: number };
export type Segment = { start: number; end: number };
export type NightMetrics = { rPeakCount: number; medianHrBpm: number; sdnnMs: number; rmssdMs: number; validRrPercent: number; labelledMinutes: number };

export type MockNight = {
  duration: number;
  runs: ApneaRun[];
  poorSignal: Segment[];
  metrics: NightMetrics;
  minuteLabel: (minute: number) => 'A' | 'N';
  minuteProbability: (minute: number) => number;
  beatsBetween: (from: number, to: number) => number[];
  ecgAt: (t: number) => number; // mV
  rrAt: (t: number) => number; // ms
  edrAt: (t: number) => number; // about -1..1
  inPoorSignal: (t: number) => boolean;
};

function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toSeconds = (value: string) => value.split(':').reduce((n, part) => n * 60 + Number(part), 0);
const CYCLE = 50; // s: one stop-breathing / recover cycle inside an apnea run
const STOP = 34; // s of each cycle without breathing

function build(): MockNight {
  const random = seeded(8842);
  const duration = 8 * 3600 + 30 * 60;
  const totalMinutes = duration / 60;

  const spans = sampleEvents.map((e) => ({ start: toSeconds(e.start), end: toSeconds(e.end) }));
  const inRun = (t: number) => spans.find((s) => t >= s.start && t < s.end);

  const poorSignal: Segment[] = [{ start: 2 * 3600 + 10 * 60, end: 2 * 3600 + 12 * 60 }, { start: 5 * 3600 + 47 * 60, end: 5 * 3600 + 48 * 60 }, { start: 7 * 3600 + 20 * 60, end: 7 * 3600 + 21 * 60 + 30 }];
  const inPoorSignal = (t: number) => poorSignal.some((s) => t >= s.start && t < s.end);

  // Per-minute model output.
  const labels = new Uint8Array(totalMinutes); // 1 = A
  const probability = new Float32Array(totalMinutes);
  for (let m = 0; m < totalMinutes; m++) {
    const a = Boolean(inRun(m * 60 + 30));
    labels[m] = a ? 1 : 0;
    probability[m] = a ? 0.6 + random() * 0.38 : random() < 0.06 ? 0.3 + random() * 0.18 : 0.02 + random() * 0.18;
  }
  const runs: ApneaRun[] = spans.map((s, i) => {
    const first = Math.floor(s.start / 60), last = Math.ceil(s.end / 60);
    let sum = 0;
    for (let m = first; m < last; m++) sum += probability[m];
    return { id: i + 1, start: s.start, end: s.end, minutes: last - first, meanProbability: sum / (last - first) };
  });

  // Heart rate per second: slow drift + breathing ripple; cyclic dips and
  // rebounds inside apnea runs.
  const hr = new Float32Array(duration + 1);
  for (let s = 0; s <= duration; s++) {
    let v = 66 + 4 * Math.sin(s / 1400) + 1.2 * Math.sin(2 * Math.PI * 0.25 * s);
    const run = inRun(s);
    if (run) {
      const c = (s - run.start) % CYCLE;
      v += c < STOP ? -7 * (c / STOP) : 20 * Math.exp(-(c - STOP) / 4);
    }
    hr[s] = v;
  }
  const hrAt = (t: number) => hr[Math.max(0, Math.min(duration, Math.floor(t)))];

  const beats: number[] = [];
  for (let t = 0; t < duration; t += 60 / hrAt(t)) beats.push(t);
  const beatIndex = (t: number) => {
    let lo = 0, hi = beats.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (beats[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const R_PHASE = 0.36; // where the R wave sits within each beat
  const beatsBetween = (from: number, to: number) => {
    const out: number[] = [];
    for (let k = Math.max(0, beatIndex(from) - 1); k < beats.length - 1 && beats[k] <= to; k++) {
      const r = beats[k] + R_PHASE * (beats[k + 1] - beats[k]);
      if (r >= from && r <= to && !inPoorSignal(r)) out.push(r);
    }
    return out;
  };

  const breath = (t: number) => Math.sin(2 * Math.PI * 0.25 * t);
  const edrAt = (t: number) => {
    if (inPoorSignal(t)) return 0.9 * Math.sin(t * 9.1) * Math.sin(t * 2.3);
    const run = inRun(t);
    if (run && (t - run.start) % CYCLE < STOP) return breath(t) * 0.12;
    return breath(t) * (run ? 1.25 : 1); // deeper recovery breaths after each stop
  };

  const ecgAt = (t: number) => {
    const k = beatIndex(t);
    const rr = (beats[k + 1] ?? beats[k] + 1) - beats[k];
    const phase = (t - beats[k]) / rr;
    const qrs = Math.exp(-Math.pow((phase - R_PHASE) / 0.035, 2)) * 1.6 - Math.exp(-Math.pow((phase - 0.4) / 0.02, 2)) * 0.35;
    const p = Math.exp(-Math.pow((phase - 0.16) / 0.08, 2)) * 0.15;
    const tw = Math.exp(-Math.pow((phase - 0.68) / 0.12, 2)) * 0.3;
    const noise = inPoorSignal(t) ? 0.45 * Math.sin(t * 157) + 0.3 * Math.sin(t * 61) : 0;
    return p + qrs + tw + 0.05 * breath(t) + noise;
  };

  const rrAt = (t: number) => 60000 / hrAt(t);

  // Summary metrics computed from the synthetic beats (same fields as the
  // sample study's SummaryMetrics, plus labelled minutes).
  const rr: number[] = [];
  let valid = 0;
  for (let k = 0; k < beats.length - 1; k++) {
    if (inPoorSignal(beats[k])) continue;
    valid++;
    rr.push((beats[k + 1] - beats[k]) * 1000);
  }
  const mean = rr.reduce((a, b) => a + b, 0) / rr.length;
  const sdnn = Math.sqrt(rr.reduce((a, b) => a + (b - mean) ** 2, 0) / rr.length);
  let sq = 0;
  for (let i = 1; i < rr.length; i++) sq += (rr[i] - rr[i - 1]) ** 2;
  const sorted = [...rr].sort((a, b) => a - b);
  const excludedMinutes = poorSignal.reduce((n, s) => n + Math.ceil((s.end - s.start) / 60), 0);
  const metrics: NightMetrics = {
    rPeakCount: beats.length,
    medianHrBpm: Math.round(60000 / sorted[Math.floor(sorted.length / 2)]),
    sdnnMs: Math.round(sdnn),
    rmssdMs: Math.round(Math.sqrt(sq / (rr.length - 1))),
    validRrPercent: valid / (beats.length - 1) * 100,
    labelledMinutes: totalMinutes - excludedMinutes,
  };

  return {
    duration, runs, poorSignal, metrics,
    minuteLabel: (m) => (labels[Math.max(0, Math.min(totalMinutes - 1, m))] ? 'A' : 'N'),
    minuteProbability: (m) => probability[Math.max(0, Math.min(totalMinutes - 1, m))],
    beatsBetween, ecgAt, rrAt, edrAt, inPoorSignal,
  };
}

let cached: MockNight | null = null;
export function mockNight(): MockNight {
  if (!cached) cached = build();
  return cached;
}
