// Renderiza la toma fotograma a fotograma (Chromium) y la codifica a MP4 1080x1920 30 fps con ffmpeg.
//   node render.js                 -> out/recepcion.mp4 (+ versión móvil y GIF de vista previa)
//   node render.js --stills 0.3,2  -> out/stills/*.png
//   node render.js --cutout        -> out/stills/recorte.png (para revisar el recorte)
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSound } from './sound.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] ?? true) : null; };
const FPS = 30, DURATION = 4;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
fs.mkdirSync(path.join(ROOT, 'out/stills'), { recursive: true });

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => { console.error('ERROR', e.message); process.exit(1); });
await page.goto(`http://127.0.0.1:${server.address().port}/scene.html?render=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const shot = async t => { await page.evaluate(t => window.renderFrame(t), t); return page.screenshot({ type: 'png' }); };

if (arg('cutout')) {
  const url = await page.evaluate(() => window.__cutout());
  fs.writeFileSync(path.join(ROOT, 'out/stills/recorte.png'), Buffer.from(url.split(',')[1], 'base64'));
} else if (arg('stills')) {
  for (const t of String(arg('stills')).split(',').map(Number)) fs.writeFileSync(path.join(ROOT, `out/stills/t${t}.png`), await shot(t));
} else {
  const wav = path.join(ROOT, 'out/sonido.wav'), out = path.join(ROOT, 'out/recepcion.mp4');
  generateSound(wav);
  const ff = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < FPS * DURATION; f++) {
    const b = await shot(f / FPS);
    if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 30 === 29) console.log(`fotograma ${f + 1}/${FPS * DURATION}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', out, '-vf', 'scale=720:1280', '-c:v', 'libx264', '-profile:v', 'main',
    '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(ROOT, 'out/recepcion-movil.mp4')]);
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', out, '-vf',
    'fps=15,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', path.join(ROOT, 'out/recepcion.gif')]);
  console.log('Listo:', out);
}
await browser.close(); server.close();
