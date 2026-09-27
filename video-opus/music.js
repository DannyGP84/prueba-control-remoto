// Banda sonora ambiental sintetizada por código (sin muestras externas ni derechos de autor).
// Pad cinematográfico + campanas + golpes graves + "whooshes" en cada transición + clics en cada toque.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SR = 48000, DUR = 20, N = SR * DUR;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function generateMusic(outFile) {
  const rand = mulberry32(7);
  const dry = [new Float32Array(N), new Float32Array(N)];
  const send = [new Float32Array(N), new Float32Array(N)];
  const pad = [new Float32Array(N), new Float32Array(N)];

  const add = (buf, i, v, pan) => { // pan -1..1, ley de potencia constante
    const a = (pan + 1) * Math.PI / 4;
    buf[0][i] += v * Math.cos(a); buf[1][i] += v * Math.sin(a);
  };

  // --- pad de acordes: Dm9 → B♭maj9 → Fmaj7 → C(add9) → F(add9)
  const chords = [
    [0, 5.6, [38, 50, 53, 57, 60, 64]],
    [5.0, 10.6, [34, 46, 50, 53, 57, 60]],
    [10.0, 15.6, [41, 48, 53, 57, 60, 64]],
    [15.0, 18.6, [36, 48, 55, 60, 62, 67]],
    [18.0, 20.0, [29, 41, 53, 57, 60, 65, 67, 72]],
  ];
  for (const [t0, t1, notes] of chords) {
    notes.forEach((m, k) => {
      const bass = m < 45, f = mtof(m), amp = bass ? .11 : .042;
      const atk = bass ? .8 : 1.4, rel = 1.8, pan = bass ? 0 : (k % 2 ? .45 : -.45) * (k / notes.length);
      const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor((t1 + rel) * SR));
      const det = bass ? [0] : [-.07, 0, .07];
      for (let i = i0; i < i1; i++) {
        const t = i / SR - t0, tl = t1 - t0;
        const env = Math.min(1, t / atk) * (t > tl ? Math.max(0, 1 - (t - tl) / rel) : 1);
        let v = 0;
        for (const d of det) {
          const fr = f * Math.pow(2, d / 12), ph = 2 * Math.PI * fr * t;
          v += Math.sin(ph) + (bass ? 0 : .22 * Math.sin(2 * ph + .3) + .08 * Math.sin(3 * ph));
        }
        add(pad, i, v * amp * env / det.length * (1 + .15 * Math.sin(2 * Math.PI * .23 * t + k)), pan);
      }
    });
  }
  // filtro paso bajo que se abre a lo largo del video
  for (const ch of [0, 1]) {
    let y = 0;
    for (let i = 0; i < N; i++) {
      const fc = 700 + 2600 * Math.pow(i / N, 1.3);
      const a = 1 - Math.exp(-2 * Math.PI * fc / SR);
      y += a * (pad[ch][i] - y);
      dry[ch][i] += y; send[ch][i] += y * .45;
    }
  }

  // --- campanas suaves (arpegio) durante los pasos
  const bellNotes = [76, 79, 81, 84, 86, 88];
  const bell = (t, m, g, pan) => {
    const f = mtof(m), i0 = Math.floor(t * SR);
    for (let i = i0; i < Math.min(N, i0 + SR * 2.5); i++) {
      const x = (i - i0) / SR, env = Math.exp(-x * 2.6) * Math.min(1, x / .004);
      const v = (Math.sin(2 * Math.PI * f * x) + .3 * Math.sin(2 * Math.PI * f * 2.76 * x) * Math.exp(-x * 5)) * env * g;
      add(dry, i, v * .5, pan); add(send, i, v, pan);
    }
  };
  for (let t = 3.25; t < 17.8; t += .5) bell(t, bellNotes[Math.floor(rand() * bellNotes.length)], .018, rand() * 1.4 - .7);
  [3.95, 7.95, 11.95, 15.95].forEach(t => bell(t, 91, .045, 0));       // aparece el aro
  [18.25, 18.5, 18.75].forEach((t, i) => bell(t, [84, 88, 91][i], .05, (i - 1) * .4)); // "¡Listo!"

  // --- golpes graves
  const boom = (t, g) => {
    const i0 = Math.floor(t * SR);
    let ph = 0;
    for (let i = i0; i < Math.min(N, i0 + SR * 2.2); i++) {
      const x = (i - i0) / SR, f = 38 + 60 * Math.exp(-x * 9);
      ph += 2 * Math.PI * f / SR;
      const v = Math.sin(ph) * Math.exp(-x * 2.2) * Math.min(1, x / .003) * g;
      add(dry, i, v, 0); add(send, i, v * .3, 0);
    }
  };
  boom(0.35, .55); [3, 7, 11, 15].forEach(t => boom(t, .22)); boom(18.05, .6);

  // --- whooshes (ruido filtrado que sube) hacia cada transición
  const whoosh = (tEnd, len, g, dir) => {
    const i0 = Math.floor((tEnd - len) * SR), i1 = Math.floor(tEnd * SR + .12 * SR);
    let low = 0, band = 0;
    for (let i = Math.max(0, i0); i < Math.min(N, i1); i++) {
      const p = (i - i0) / (tEnd * SR - i0);
      const fc = 250 + 3800 * Math.pow(Math.min(p, 1), 2);
      const f1 = 2 * Math.sin(Math.PI * fc / SR), n = rand() * 2 - 1;
      // filtro de estado variable (Chamberlin), salida pasa-banda
      low += f1 * band; const high = n - low - .35 * band; band += f1 * high;
      const env = p <= 1 ? Math.pow(p, 2.2) : Math.max(0, 1 - (p - 1) * 40);
      const v = band * env * g;
      const pan = Math.sin(p * Math.PI * dir) * .6;
      add(dry, i, v, pan); add(send, i, v * .6, pan);
    }
  };
  [[3, 1.2], [7, .9], [11, .9], [15, .9], [18, 1.1]].forEach(([t, l], k) => whoosh(t, l, .22, k % 2 ? 1 : -1));

  // --- clics de "toque"
  [6.0, 10.0, 14.0, 17.0].forEach(t => {
    const i0 = Math.floor(t * SR);
    for (let i = i0; i < i0 + SR * .15; i++) {
      const x = (i - i0) / SR;
      const v = (Math.sin(2 * Math.PI * 1900 * x) * Math.exp(-x * 90) + .6 * Math.sin(2 * Math.PI * 720 * x) * Math.exp(-x * 45)) * .16;
      add(dry, i, v, .1); add(send, i, v * .4, .1);
    }
  });

  // --- reverberación tipo Freeverb (4 combs + 2 allpass por canal)
  const combs = [1557, 1617, 1491, 1422].map(d => Math.round(d * SR / 44100));
  const aps = [556, 441].map(d => Math.round(d * SR / 44100));
  for (const ch of [0, 1]) {
    const sp = ch ? 23 : 0, wet = new Float32Array(N);
    for (const d0 of combs) {
      const d = d0 + sp, buf = new Float32Array(d); let idx = 0, lp = 0;
      for (let i = 0; i < N; i++) {
        const out = buf[idx]; lp = out * .75 + lp * .25;
        buf[idx] = send[ch][i] * .12 + lp * .86; idx = (idx + 1) % d; wet[i] += out;
      }
    }
    for (const d0 of aps) {
      const d = d0 + sp, buf = new Float32Array(d); let idx = 0;
      for (let i = 0; i < N; i++) {
        const b = buf[idx], out = -wet[i] + b; buf[idx] = wet[i] + b * .5; idx = (idx + 1) % d; wet[i] = out;
      }
    }
    for (let i = 0; i < N; i++) dry[ch][i] += wet[i] * .9;
  }

  // --- master: saturación suave, fundidos y normalización a -1 dBFS
  let peak = 0;
  for (const ch of [0, 1]) for (let i = 0; i < N; i++) {
    const t = i / SR, fade = Math.min(1, t / .2) * Math.min(1, (DUR - t) / .9);
    const v = Math.tanh(dry[ch][i] * 1.3) / Math.tanh(1.3) * fade;
    dry[ch][i] = v; peak = Math.max(peak, Math.abs(v));
  }
  const g = Math.pow(10, -1 / 20) / peak;
  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) for (const ch of [0, 1])
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, dry[ch][i] * g)) * 32767), (i * 2 + ch) * 2);
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24);
  hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([hdr, data]));
  return outFile;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const f = generateMusic(path.join(path.dirname(fileURLToPath(import.meta.url)), 'out/music.wav'));
  console.log('Música:', f);
}
