// Escena 3D vertical (1080x1920) totalmente determinista: todo depende del tiempo t.
// Modo render (?render=1): expone window.renderFrame(t) para capturar fotograma a fotograma.
// Modo vista previa: reproduce en bucle en tiempo real.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1080, H = 1920, DURATION = 20;
const RENDER = new URLSearchParams(location.search).has('render');

// ---------- utilidades ----------
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rand = mulberry32(84);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

const config = await (await fetch('screens/config.json')).json();
const STEPS = config.steps;
// Momento en que cambia la pantalla (justo después del "toque") en cada paso.
const CUTS = STEPS.map(s => s.t1 - 0.7);
const TAPS = CUTS.map(c => c - 0.3);
const XF = 0.35;

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
scene.fog = new THREE.FogExp2(0x05070c, 0.045);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 100);

// ---------- pantallas (capturas reales o provisionales) ----------
await document.fonts.load('600 40px Inter');
await document.fonts.load('800 40px Inter');

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawPlaceholder(s) {
  const cw = 1170, ch = 2532;
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  const fx = s.focus[0] * cw, fy = s.focus[1] * ch;
  const font = (w, px) => { ctx.font = `${w} ${px}px Inter, sans-serif`; };

  const chat = (model, answered) => {
    ctx.fillStyle = '#1a1a19'; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = '#eee'; font(600, 44); ctx.textAlign = 'left'; ctx.fillText('9:41', 90, 95);
    ctx.textAlign = 'center'; font(600, 50); ctx.fillText('Nuevo chat', cw / 2, 225);
    ctx.fillStyle = '#2d2d2b'; rr(ctx, 440, 430, 660, 170, 44); ctx.fill();
    ctx.fillStyle = '#e8e6df'; font(400, 42); ctx.textAlign = 'left';
    ctx.fillText('¿Qué modelo estoy usando?', 490, 530);
    const bars = answered ? [880, 960, 720, 900, 560] : [];
    bars.forEach((w, i) => { ctx.fillStyle = '#3a3a37'; rr(ctx, 80, 720 + i * 80, w, 34, 17); ctx.fill(); });
    ctx.fillStyle = '#262624'; rr(ctx, 50, 2140, 1070, 340, 56); ctx.fill();
    ctx.strokeStyle = '#3d3d3a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#8a8a85'; font(400, 44); ctx.fillText('Escribe tu mensaje…', 110, 2240);
    ctx.fillStyle = '#d6d4cc'; font(600, 40); ctx.textAlign = 'center';
    ctx.fillText(model + '  ⌄', fx, fy + 14);
    ctx.fillStyle = '#d97757'; ctx.beginPath(); ctx.arc(1040, fy, 50, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; font(800, 52); ctx.fillText('↑', 1040, fy + 18);
  };
  const sheet = (title, rows, focusIdx, top) => {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, cw, ch);
    const rowH = 150, y0 = fy - focusIdx * rowH;
    const sy = Math.min(top ?? y0 - 190, y0 - 190);
    ctx.fillStyle = '#2a2a28'; rr(ctx, 40, sy, 1090, ch - sy - 40, 60); ctx.fill();
    ctx.fillStyle = '#9a9890'; font(600, 36); ctx.textAlign = 'left'; ctx.fillText(title, 100, sy + 95);
    rows.forEach((r, i) => {
      const y = y0 + i * rowH;
      if (i) { ctx.fillStyle = '#3a3a37'; ctx.fillRect(100, y - rowH / 2, 970, 2); }
      ctx.fillStyle = '#ecebe5'; font(i === focusIdx ? 800 : 600, 46); ctx.textAlign = 'left'; ctx.fillText(r[0], 100, y + 16);
      if (r[1]) { ctx.fillStyle = '#8f8d86'; font(400, 38); ctx.textAlign = 'right'; ctx.fillText(r[1], 1070, y + 14); }
    });
  };

  switch (s.kind) {
    case 'chat': chat('Modelo actual', false); break;
    case 'done': chat('Opus 5.5', true); break;
    case 'menu': chat('Modelo actual', false);
      sheet('Modelo', [['Modelo actual', '✓'], ['Otro modelo', ''], ['Effort', '›'], ['More models', '›']], 3); break;
    case 'models': chat('Modelo actual', false);
      sheet('More models', [['Claude Fable 5.1', ''], ['Claude Opus 5.5', ''], ['Claude Opus 5', ''], ['Claude Sonnet 5', ''], ['Claude Haiku 4.5', '']], 1, 900); break;
    case 'effort': chat('Opus 5.5', false);
      sheet('Claude Opus 5.5', [['Effort', ''], ['Low', ''], ['Medium', ''], ['High', ''], ['Extra high', ''], ['Max', '']], 0, 1150); break;
  }
  // Marca de agua: deja claro que no es una captura real.
  ctx.fillStyle = 'rgba(217,119,87,.22)'; rr(ctx, 235, 285, 700, 74, 37); ctx.fill();
  ctx.fillStyle = '#f3a17e'; font(800, 32); ctx.textAlign = 'center'; ctx.fillText('CAPTURA PROVISIONAL', cw / 2, 334);
  return c;
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function makeTex(src) {
  const t = new THREE.Texture(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  return t;
}
const screens = [];
for (const s of config.screens) {
  let src, real = true;
  try { src = await loadImage('screens/' + s.file + '?v=' + Date.now()); }
  catch { src = drawPlaceholder(s); real = false; }
  screens.push({ ...s, tex: makeTex(src), aspect: src.width / src.height, real });
}
console.log('pantallas:', screens.map(s => `${s.file}=${s.real ? 'real' : 'provisional'}`).join(', '));

// ---------- teléfono ----------
const PH = 1.56;
const PW = PH * clamp(screens[0].aspect, 0.42, 0.52);
const BEZ = 0.034, CORNER = 0.105;

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const phone = new THREE.Group();
scene.add(phone);
const bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(PW + 2 * BEZ, PH + 2 * BEZ, CORNER + BEZ),
  { depth: 0.06, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 6, curveSegments: 32 });
bodyGeo.center(); bodyGeo.computeBoundingBox();
const FRONT_Z = bodyGeo.boundingBox.max.z;
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x9aa0a8, roughness: 0.32, metalness: 1.0 });
phone.add(new THREE.Mesh(bodyGeo, [glassMat, frameMat]));
for (const [x, y, h] of [[-1, 0.42, 0.1], [-1, 0.26, 0.16], [-1, 0.07, 0.16], [1, 0.3, 0.24]]) {
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, h, 4, 12), frameMat);
  b.position.set(x * (PW / 2 + BEZ + 0.012), y, 0); phone.add(b);
}

function fitFor(s) { // mapeo "cover" de la captura sobre la pantalla
  const as = PW / PH; const sc = new THREE.Vector2(1, 1);
  if (s.aspect > as) sc.x = as / s.aspect; else sc.y = s.aspect / as;
  return new THREE.Vector4(sc.x, sc.y, (1 - sc.x) / 2, (1 - sc.y) / 2);
}
function focusUV(s) {
  const f = fitFor(s);
  return new THREE.Vector2((s.focus[0] - f.z) / f.x, (1 - s.focus[1] - f.w) / f.y);
}
screens.forEach(s => { s.fit = fitFor(s); s.fuv = focusUV(s); s.boxW = new THREE.Vector2(s.box[0] * PW / s.fit.x, s.box[1] * PH / s.fit.y); });

const screenMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    tA: { value: screens[0].tex }, tB: { value: screens[0].tex },
    fitA: { value: screens[0].fit }, fitB: { value: screens[0].fit },
    uMix: { value: 0 }, uBright: { value: 0 }, uTime: { value: 0 },
    uFocus: { value: new THREE.Vector2(.5, .5) }, uBox: { value: new THREE.Vector2(.1, .1) }, uDim: { value: 0 },
    uSize: { value: new THREE.Vector2(PW, PH) }, uCorner: { value: CORNER },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tA, tB; uniform vec4 fitA, fitB; uniform float uMix, uBright, uTime, uDim, uCorner;
    uniform vec2 uFocus, uSize, uBox; varying vec2 vUv;
    float sdRB(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
    void main(){
      vec3 a = texture2D(tA, vUv*fitA.xy+fitA.zw).rgb;
      vec3 b = texture2D(tB, vUv*fitB.xy+fitB.zw).rgb;
      vec3 c = mix(a, b, uMix);
      // foco: oscurece todo menos el elemento a tocar
      float db = sdRB((vUv - uFocus) * uSize, uBox*.5 + .012, min(uBox.y*.5, .03));
      float spot = smoothstep(.05, 0., db);
      c *= mix(1., .38 + .62*spot, uDim);
      // reflejo de cristal que barre la pantalla
      float sheen = smoothstep(.06, 0., abs(vUv.x*.6 + vUv.y*.4 - fract(uTime*.09)*2.4 + .5));
      c = c*uBright*0.93 + sheen*0.02*uBright*(1.-.85*uDim);
      float sd = sdRB((vUv-.5)*uSize, uSize*.5, uCorner);
      gl_FragColor = vec4(c, smoothstep(.002, -.002, sd));
    }`,
});
const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), screenMat);
screenMesh.position.z = FRONT_Z + 0.0015;
phone.add(screenMesh);

const glowShader = (col) => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uI: { value: 0 }, uGrow: { value: 0 }, uPlane: { value: new THREE.Vector2(1, 1) }, uBox: { value: new THREE.Vector2(.5, .5) }, uCol: { value: new THREE.Color(col) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uI, uGrow; uniform vec2 uPlane, uBox; uniform vec3 uCol; varying vec2 vUv;
    float sdRB(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
    void main(){ vec2 hb = uBox*.5 + .014 + uGrow;
      float d = sdRB((vUv-.5)*uPlane, hb, min(hb.y, .045));
      float ring = smoothstep(.0045, 0., abs(d));
      float glow = exp(-pow(d/.022, 2.))*.5;
      gl_FragColor = vec4(uCol*(ring*1.5+glow)*uI, 1.); }`,
});
const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowShader(0xff8a4c));
const ripple = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowShader(0xffc9a0));
ring.position.z = ripple.position.z = 0.003;
screenMesh.add(ring, ripple);
// el marco siempre se dibuja encima de la pantalla, sin depender del orden por distancia
screenMesh.renderOrder = 1; ring.renderOrder = ripple.renderOrder = 2;

function placeGlow(m, s, margin) {
  m.position.set((s.fuv.x - .5) * PW, (s.fuv.y - .5) * PH, m === ring ? .003 : .004);
  m.scale.set(s.boxW.x + 2 * margin, s.boxW.y + 2 * margin, 1);
  m.material.uniforms.uPlane.value.set(s.boxW.x + 2 * margin, s.boxW.y + 2 * margin);
  m.material.uniforms.uBox.value.copy(s.boxW);
}

// ---------- ambiente ----------
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShaderMaterial({
  depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; void main(){ vec2 p=vUv-.5;
    float g1=exp(-dot(p-vec2(-.08,.06),p-vec2(-.08,.06))*60.);
    float g2=exp(-dot(p-vec2(.1,-.07),p-vec2(.1,-.07))*50.);
    vec3 c=vec3(.006,.008,.016)+vec3(.9,.36,.12)*g1*.16+vec3(.08,.4,.55)*g2*.13;
    gl_FragColor=vec4(c,1.); }`,
}));
backdrop.position.z = -9;
scene.add(backdrop);

const beams = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 14), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uI: { value: .0 }, uCol: { value: new THREE.Color(i % 2 ? 0x3aa6c9 : 0xff8a4c) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uI; uniform vec3 uCol; varying vec2 vUv;
      void main(){ float x=exp(-pow((vUv.x-.5)*5.,2.)); float y=smoothstep(0.,.7,vUv.y)*smoothstep(1.,.85,vUv.y);
        gl_FragColor=vec4(uCol*x*y*uI,1.); }`,
  }));
  m.position.set((i - 1.5) * 1.3, 2, -3.2 - i * .4);
  m.rotation.z = (i - 1.5) * -0.28;
  scene.add(m); beams.push(m);
}

const halo1 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.005, 12, 240),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .5, .22).multiplyScalar(3), fog: false }));
const halo2 = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.003, 12, 240),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(.25, .7, .9).multiplyScalar(2.2), fog: false }));
halo1.position.z = -0.7; halo2.position.z = -1.0;
scene.add(halo1, halo2);

const NP = 1400;
const pPos = new Float32Array(NP * 3), pSeed = new Float32Array(NP);
for (let i = 0; i < NP; i++) {
  pPos[i * 3] = (rand() - .5) * 9; pPos[i * 3 + 1] = (rand() - .5) * 8; pPos[i * 3 + 2] = -6 + rand() * 9;
  pSeed[i] = rand();
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `uniform float uTime; attribute float aSeed; varying float vA; varying float vS;
    void main(){ vec3 p=position; p.y=mod(p.y+uTime*(.04+.1*aSeed)+4.,8.)-4.; p.x+=sin(uTime*.3+aSeed*6.28)*.12;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=(2.+aSeed*6.)*(7./-mv.z); vA=.18+.45*aSeed; vS=aSeed; }`,
  fragmentShader: `varying float vA; varying float vS;
    void main(){ float a=smoothstep(.5,0.,length(gl_PointCoord-.5));
      vec3 col=mix(vec3(1.,.62,.36), vec3(.5,.8,1.), step(.72,vS));
      gl_FragColor=vec4(col*a*vA,1.); }`,
});
scene.add(new THREE.Points(pGeo, pMat));

scene.add(new THREE.HemisphereLight(0x8090b0, 0x080604, 0.25));
const key = new THREE.SpotLight(0xfff1e0, 40, 20, 0.5, 0.8); key.position.set(1.5, 3, 4); scene.add(key);
const rimA = new THREE.DirectionalLight(0xff8a4c, 5); rimA.position.set(-3, 2, -2.5); scene.add(rimA);
const rimB = new THREE.DirectionalLight(0x47b6e0, 4); rimB.position.set(3, -1, -2.5); scene.add(rimB);

// ---------- posproceso ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.55, 0.65, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uFade; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){ vec2 d=vUv-.5; float r=dot(d,d); vec2 off=d*r*.012;
      vec3 c=vec3(texture2D(tDiffuse,vUv+off).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,vUv-off).b);
      c*=1.-.55*smoothstep(.12,.62,length(d*vec2(1.,.62)));
      c+=(hash(vUv*uRes+floor(uTime*24.)*17.13)-.5)*.045;
      gl_FragColor=vec4(c*uFade,1.); }`,
});
composer.addPass(film);

// ---------- cámara: fotogramas clave ----------
// [t, ancla ('C' = centro del teléfono, número = foco de esa pantalla), desplazamiento del punto de mira, posición relativa, fov]
const KF = [
  [0.0, 'C', [0, .8, 0], [.9, -1.9, 7.6], 30],
  [2.6, 'C', [0, .52, 0], [0, -.12, 5.0], 30],
  [3.4, 'C', [0, .45, 0], [.08, -.08, 4.6], 30],
  [4.6, 0, [0, .2, 0], [.36, -.14, 2.05], 30],
  [6.0, 0, [0, .18, 0], [.28, -.1, 1.85], 30],
  [6.9, 'C', [0, .22, 0], [-.5, .1, 3.3], 30],
  [8.0, 1, [0, .2, 0], [-.34, .12, 2.35], 30],
  [10.0, 1, [0, .18, 0], [-.26, .08, 2.15], 30],
  [10.9, 'C', [0, .22, 0], [.55, -.2, 3.4], 30],
  [12.0, 2, [0, .2, 0], [.3, -.24, 2.35], 30],
  [14.0, 2, [0, .18, 0], [.2, -.16, 2.1], 30],
  [14.9, 'C', [0, .22, 0], [-.42, .18, 3.2], 30],
  [15.8, 3, [0, .2, 0], [-.3, .1, 2.35], 30],
  [17.0, 3, [0, .18, 0], [-.22, .05, 2.15], 30],
  [18.2, 'C', [0, .42, 0], [.7, -.3, 4.7], 30],
  [20.0, 'C', [0, .46, 0], [.25, -.1, 5.3], 30],
];
const tmpV = new THREE.Vector3();
function anchor(a) {
  if (a === 'C') return phone.getWorldPosition(new THREE.Vector3());
  const s = screens[a];
  return screenMesh.localToWorld(new THREE.Vector3((s.fuv.x - .5) * PW, (s.fuv.y - .5) * PH, 0));
}
function updateCamera(t) {
  let k = KF.length - 2;
  for (let i = 0; i < KF.length - 1; i++) if (t < KF[i + 1][0]) { k = i; break; }
  const A = KF[k], B = KF[k + 1];
  const u = easeIO(clamp((t - A[0]) / (B[0] - A[0])));
  const la = anchor(A[1]).add(tmpV.fromArray(A[2])), lb = anchor(B[1]).add(tmpV.fromArray(B[2]));
  const look = la.lerp(lb, u);
  const off = new THREE.Vector3().fromArray(A[3]).lerp(new THREE.Vector3().fromArray(B[3]), u);
  // cámara en mano, muy sutil
  off.x += Math.sin(t * 1.1) * .012 + Math.sin(t * 2.3 + 1) * .005;
  off.y += Math.sin(t * 1.7 + 2) * .01;
  camera.position.copy(look).add(off);
  camera.fov = lerp(A[4], B[4], u); camera.updateProjectionMatrix();
  camera.lookAt(look);
  camera.rotateZ(lerp(.1, 0, easeOut(clamp(t / 3))) + Math.sin(t * .5) * .012);
}

// ---------- animación de la escena ----------
function screenIndexAt(t) { let i = 0; CUTS.forEach(c => { if (t >= c) i++; }); return i; }

function updateScene(t) {
  // teléfono: entra desde abajo girando y luego flota
  const inT = easeOut(clamp(t / 2.4));
  phone.position.set(0, lerp(-2.8, 0, inT) + Math.sin(t * 1.3) * .018, 0);
  const outT = easeIO(clamp((t - 18) / 2));
  phone.rotation.set(Math.sin(t * .9) * .035 + lerp(.35, 0, inT),
    lerp(-1.25, 0, inT) + Math.sin(t * .7) * .05 + outT * .32, lerp(.22, 0, inT));
  phone.updateMatrixWorld(true);

  // pantalla: encendido + fundidos entre capturas
  const idx = screenIndexAt(t);
  const cut = CUTS[idx - 1];
  const inXF = idx > 0 && t < cut + XF;
  const A = screens[inXF ? idx - 1 : idx], B = screens[idx];
  const u = screenMat.uniforms;
  u.tA.value = A.tex; u.fitA.value = A.fit; u.tB.value = B.tex; u.fitB.value = B.fit;
  u.uMix.value = inXF ? easeIO((t - cut) / XF) : 0;
  u.uBright.value = smooth(1.0, 1.7, t);
  u.uTime.value = t;

  // foco y aro sobre el elemento a tocar
  let dim = 0, ringI = 0, s = B;
  if (idx < STEPS.length) {
    const st = STEPS[idx];
    const on = Math.max(st.t0, idx ? CUTS[idx - 1] + XF : 0) + 0.45;
    dim = smooth(on, on + .5, t) * (1 - smooth(CUTS[idx] - .2, CUTS[idx], t));
    ringI = dim;
  } else {
    dim = smooth(18.3, 18.9, t) * .7;
    ringI = dim;
  }
  u.uFocus.value.copy(s.fuv); u.uBox.value.copy(s.boxW); u.uDim.value = dim;
  const pulse = .004 + Math.sin(t * 6.5) * .004;
  placeGlow(ring, s, pulse + .12);
  ring.material.uniforms.uGrow.value = pulse;
  ring.material.uniforms.uI.value = ringI * 1.3;

  // onda del "toque": el marco se expande y se desvanece
  let ri = 0;
  TAPS.forEach((tp, i) => {
    const p = (t - tp) / .6;
    if (p >= 0 && p <= 1) {
      ri = Math.pow(1 - p, 1.5);
      const grow = .01 + easeOut(p) * .09;
      placeGlow(ripple, screens[i], grow + .07);
      ripple.material.uniforms.uGrow.value = grow;
    }
  });
  ripple.material.uniforms.uI.value = ri * 2;
  ripple.visible = ri > 0;

  // ambiente
  pMat.uniforms.uTime.value = t;
  halo1.rotation.set(.18, .1, t * .15); halo2.rotation.set(-.12, .2, -t * .1);
  const haloI = smooth(.6, 2.2, t);
  halo1.scale.setScalar(lerp(.6, 1, haloI)); halo2.scale.setScalar(lerp(.5, 1, haloI));
  beams.forEach((b, i) => { b.material.uniforms.uI.value = (.1 + .05 * Math.sin(t * .8 + i * 1.7)) * smooth(.2, 2, t); });
  bloom.strength = .55 + .35 * Math.exp(-Math.pow((t - 18.1) * 2.5, 2));
  film.uniforms.uTime.value = t;
  film.uniforms.uFade.value = smooth(0, .7, t) * (1 - smooth(19.35, 20, t));
}

// ---------- textos ----------
const $ = sel => document.querySelector(sel);
function splitChars(el, text) {
  el.textContent = '';
  return [...text].map(ch => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; el.appendChild(s); return s; });
}
const intro = config.intro, outro = config.outro;
$('#intro .kicker').textContent = intro.kicker;
const l1 = splitChars($('#intro .l1'), intro.line1);
const l2 = splitChars($('#intro .l2'), intro.line2);
$('#intro .sub').textContent = intro.sub;
$('#outro .title').textContent = outro.title;
$('#outro .sub').textContent = outro.sub;
$('#outro .note').textContent = outro.note;
$('#source').textContent = outro.source;
const bars = STEPS.map(() => { const i = document.createElement('i'); const b = document.createElement('b'); i.appendChild(b); $('#progress').appendChild(i); return b; });

function reveal(el, t, t0, dur = .6, dy = 40) {
  const p = easeOut(clamp((t - t0) / dur));
  el.style.opacity = p; el.style.transform = `translateY(${(1 - p) * dy}px)`; el.style.filter = `blur(${(1 - p) * 10}px)`;
}
function block(el, t, tin, tout, dy = 30) {
  const a = easeOut(clamp((t - tin) / .6)), b = easeIO(clamp((t - tout) / .45));
  el.style.opacity = a * (1 - b);
  el.style.transform = `translateY(${(1 - a) * dy - b * 24}px) scale(${1 - b * .03})`;
  el.style.filter = `blur(${((1 - a) + b) * 8}px)`;
}
let lastStep = -1;
function updateUI(t) {
  block($('#intro'), t, .5, 2.75);
  reveal($('#intro .kicker'), t, .5, .7, 20);
  l1.forEach((s, i) => reveal(s, t, .75 + i * .035, .55));
  l2.forEach((s, i) => reveal(s, t, 1.15 + i * .04, .65, 60));
  reveal($('#intro .sub'), t, 1.9, .6, 20);

  const si = STEPS.findIndex(s => t >= s.t0 && t < s.t1);
  const stepEl = $('#step');
  if (si >= 0) {
    const st = STEPS[si];
    if (si !== lastStep) {
      $('#step .num').textContent = String(si + 1).padStart(2, '0');
      $('#step .lbl').textContent = `Paso ${si + 1} de ${STEPS.length}`;
      $('#step .title').textContent = st.title;
      $('#step .subt').textContent = st.sub;
      lastStep = si;
    }
    block(stepEl, t, st.t0 + .15, st.t1 - .4);
  } else stepEl.style.opacity = 0;

  $('#progress').style.opacity = smooth(2.9, 3.4, t) * (1 - smooth(17.8, 18.2, t));
  bars.forEach((b, i) => { b.style.transform = `scaleX(${clamp((t - STEPS[i].t0) / (STEPS[i].t1 - STEPS[i].t0))})`; });

  block($('#outro'), t, 18.25, 99, 40);
  reveal($('#outro .title'), t, 18.25, .7, 60);
  reveal($('#outro .sub'), t, 18.6, .6);
  reveal($('#outro .note'), t, 18.9, .6);
  $('#source').style.opacity = smooth(19, 19.4, t) * .9;
}

function renderAt(t) {
  updateScene(t);
  updateCamera(t);
  updateUI(t);
  composer.render();
}

if (RENDER) {
  window.renderFrame = async (t) => {
    renderAt(t);
    await new Promise(r => requestAnimationFrame(() => r()));
  };
  window.__screens = screens.map(s => ({ file: s.file, real: s.real }));
  window.__ready = true;
} else {
  const stage = $('#stage');
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - H * s) / 2}px) scale(${s})`;
  };
  addEventListener('resize', fit); fit();
  const audio = new Audio('out/music.wav'); audio.loop = true;
  let t0 = performance.now();
  addEventListener('click', () => { t0 = performance.now(); audio.currentTime = 0; audio.play().catch(() => {}); });
  const loop = () => { renderAt(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
  loop();
}
