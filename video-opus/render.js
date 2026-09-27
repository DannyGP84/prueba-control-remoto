// Renderiza la escena fotograma a fotograma con Chromium y la codifica a MP4 vertical con ffmpeg.
//   node render.js                      -> out/opus-5-5-vertical.mp4
//   node render.js --stills 1,4.8,12    -> out/stills/*.png (comprobación rápida)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';
import { generateMusic } from './music.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('fps', 30));
const DURATION = 20;
const OUT = path.resolve(ROOT, arg('out', 'out/opus-5-5-vertical.mp4'));
const stills = arg('stills') ? arg('stills').split(',').map(Number) : null;

fs.mkdirSync(path.join(ROOT, 'out/stills'), { recursive: true });
const server = await startServer(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[escena]', m.text()));
page.on('pageerror', e => { console.error('[escena] ERROR', e); process.exitCode = 1; });
await page.goto(`http://127.0.0.1:${server.address().port}/scene.html?render=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.evaluate(() => document.fonts.ready);

const shot = async t => { await page.evaluate(t => window.renderFrame(t), t); return page.screenshot({ type: 'png' }); };

if (stills) {
  for (const t of stills) {
    const f = path.join(ROOT, `out/stills/t${t.toFixed(2)}.png`);
    fs.writeFileSync(f, await shot(t));
    console.log('fotograma', f);
  }
} else {
  const wav = path.join(ROOT, 'out/music.wav');
  generateMusic(wav);
  const ff = spawn(ffmpegPath, ['-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const total = FPS * DURATION, start = Date.now();
  for (let f = 0; f < total; f++) {
    const buf = await shot(f / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 30 === 29) {
      const el = (Date.now() - start) / 1000;
      console.log(`fotograma ${f + 1}/${total} · ${el.toFixed(0)} s · faltan ~${(el / (f + 1) * (total - f - 1)).toFixed(0)} s`);
    }
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg salió con ' + c))));
  console.log('Video listo:', OUT);
}
await browser.close();
server.close();
