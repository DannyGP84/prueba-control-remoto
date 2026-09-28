// Renderiza el búho a MP4 (6 s en bucle x2 = 12 s) y GIF.  node render.js [--stills 1.2,1.75]
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const FPS = 30, LOOP = 6, REPEAT = 2;
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1116, height: 2000 } });
page.on('pageerror', e => { console.error('ERROR', e.message); process.exit(1); });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html?render=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const shot = async t => { await page.evaluate(t => window.renderFrame(t), t); return page.screenshot({ type: 'png' }); };

if (arg('stills')) {
  for (const t of arg('stills').split(',').map(Number)) fs.writeFileSync(path.join(ROOT, `out/frame-${t}.png`), await shot(t));
} else {
  const out = path.join(ROOT, 'out/buho.mp4');
  const ff = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = [];
  for (let f = 0; f < FPS * LOOP; f++) frames.push(await shot(f / FPS));
  for (let r = 0; r < REPEAT; r++) for (const b of frames) if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once('drain', r));
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-i', out, '-t', String(LOOP), '-vf',
    'fps=15,scale=400:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none', '-loop', '0', path.join(ROOT, 'out/buho.gif')]);
  console.log('Listo:', out);
}
await browser.close(); server.close();
