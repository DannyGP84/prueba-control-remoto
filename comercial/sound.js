// Audio de la toma: timbre electrónico de teléfono de escritorio (trino) + tono de sala suave.
import fs from 'fs';
const SR = 48000, DUR = 4, N = SR * DUR;
export const RINGS = [[0.85, 1.25], [1.42, 1.82], [2.55, 2.95], [3.12, 3.52]];

export function generateSound(file) {
  const L = new Float32Array(N), R = new Float32Array(N);
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // tono de sala: ruido marrón muy bajo
  let b = 0;
  for (let i = 0; i < N; i++) { b = (b + .02 * (rnd() * 2 - 1)) * .995; L[i] += b * .25; R[i] += b * .22; }
  // trino: alterna 1050 / 1320 Hz a 16 Hz, timbre suave (seno + armónicos impares)
  const dry = new Float32Array(N);
  for (const [a, e] of RINGS) {
    for (let i = Math.floor(a * SR); i < Math.floor(e * SR); i++) {
      const t = i / SR, x = t - a, len = e - a;
      const f = Math.floor(t * 32) % 2 ? 1320 : 1050;
      const ph = 2 * Math.PI * f * t;
      const env = Math.min(1, x / .01) * Math.min(1, (len - x) / .02);
      dry[i] += (Math.sin(ph) + .25 * Math.sin(3 * ph) + .1 * Math.sin(5 * ph)) * env * .16;
    }
  }
  // pequeña sala: ecos tempranos
  const taps = [[.011, .32], [.019, .24], [.031, .16], [.047, .1], [.071, .06]];
  for (let i = 0; i < N; i++) {
    let w = dry[i];
    for (const [d, g] of taps) { const j = i - Math.floor(d * SR); if (j >= 0) w += dry[j] * g; }
    L[i] += w * .95; R[i] += w * .8;         // el teléfono está un poco a la izquierda del dueño
  }
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = Math.pow(10, -3 / 20) / peak;
  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(L[i] * g * 32767), i * 4);
    data.writeInt16LE(Math.round(R[i] * g * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}
