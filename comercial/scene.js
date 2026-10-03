// Toma continua de 4 s (1080x1920): el dueño revisa papeles tras el mostrador, suena el teléfono,
// él mira hacia el aparato y sigue con lo suyo. Técnica 2.5D: la foto de referencia recortada
// sobre un plano, dentro de una recepción construida en 3D. Todo depende del tiempo t (determinista).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1080, H = 1920, DURATION = 4;
const RENDER = new URLSearchParams(location.search).has('render');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Cronología (s). El teléfono suena en ráfagas dobles; él mira de reojo y vuelve a su tarea.
export const RINGS = [[0.85, 1.25], [1.42, 1.82], [2.55, 2.95], [3.12, 3.52]];
const ringing = t => RINGS.some(([a, b]) => t >= a && t < b);
const look = t => smooth(1.2, 1.6, t) * (1 - smooth(2.7, 3.15, t));

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a221c);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.25;
const camera = new THREE.PerspectiveCamera(29, W / H, 0.05, 30);

// ---------- recorte de la foto de referencia ----------
const loadImage = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const photo = await loadImage('dueno.png');
const IW = photo.width, IH = photo.height;

function cutout(img) {
  const c = document.createElement('canvas'); c.width = IW; c.height = IH;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, IW, IH).data;
  // crecimiento de región desde los bordes: un píxel es fondo si es gris neutro y casi igual
  // al píxel de fondo vecino que lo alcanzó (el fondo es un degradado suave; la persona tiene bordes nítidos)
  const sat = i => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
  const bg = new Uint8Array(IW * IH), q = new Int32Array(IW * IH); let qh = 0, qt = 0;
  const push = (px, py, from) => {
    const k = py * IW + px; if (bg[k]) return;
    const i = k * 4; if (sat(i) > 16) return;
    if (from >= 0) {
      const j = from * 4;
      if (Math.max(Math.abs(d[i] - d[j]), Math.abs(d[i + 1] - d[j + 1]), Math.abs(d[i + 2] - d[j + 2])) > 6) return;
    }
    bg[k] = 1; q[qt++] = k;
  };
  for (let i = 0; i < IW; i++) { push(i, 0, -1); }
  for (let i = 0; i < IH * .55; i++) { push(0, i, -1); push(IW - 1, i, -1); }
  // hueco cerrado entre el brazo izquierdo y el torso
  for (let y = 560; y < 800; y++) for (let x = 600; x < 690; x++) {
    const i = (y * IW + x) * 4; if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 95) push(x, y, -1);
  }
  while (qh < qt) {
    const k = q[qh++], px = k % IW, py = (k / IW) | 0;
    if (px > 0) push(px - 1, py, k); if (px < IW - 1) push(px + 1, py, k);
    if (py > 0) push(px, py - 1, k); if (py < IH - 1) push(px, py + 1, k);
  }
  // limpieza: cierra huecos pequeños de fondo dentro de la silueta y quita islas sueltas
  const tmp = new Uint8Array(bg);
  for (let pass = 0; pass < 2; pass++) for (let y = 1; y < IH - 1; y++) for (let x = 1; x < IW - 1; x++) {
    const k = y * IW + x;
    const n = tmp[k - 1] + tmp[k + 1] + tmp[k - IW] + tmp[k + IW];
    bg[k] = n >= 3 ? 1 : n <= 1 ? 0 : tmp[k];
  }
  for (let pass = 0; pass < 2; pass++) {
  const er = new Uint8Array(bg);
  for (let y = 1; y < IH - 1; y++) for (let x = 1; x < IW - 1; x++) {
    const k = y * IW + x; if (!bg[k] && (bg[k - 1] || bg[k + 1] || bg[k - IW] || bg[k + IW])) er[k] = 1;
  }
  bg.set(er);
  }
  const m = new ImageData(IW, IH);
  for (let k = 0; k < IW * IH; k++) { m.data[k * 4] = m.data[k * 4 + 1] = m.data[k * 4 + 2] = 255; m.data[k * 4 + 3] = bg[k] ? 0 : 255; }
  const mc = document.createElement('canvas'); mc.width = IW; mc.height = IH; mc.getContext('2d').putImageData(m, 0, 0);
  const soft = document.createElement('canvas'); soft.width = IW; soft.height = IH;
  const sx = soft.getContext('2d'); sx.filter = 'blur(1.1px)'; sx.drawImage(mc, 0, 0);
  const out = document.createElement('canvas'); out.width = IW; out.height = IH;
  const ox = out.getContext('2d'); ox.drawImage(img, 0, 0); ox.globalCompositeOperation = 'destination-in'; ox.drawImage(soft, 0, 0);
  const shadow = document.createElement('canvas'); shadow.width = IW / 2; shadow.height = IH / 2;
  const hx = shadow.getContext('2d'); hx.fillStyle = '#000'; hx.fillRect(0, 0, IW / 2, IH / 2);
  hx.filter = 'blur(22px)'; hx.drawImage(mc, 0, 0, IW / 2, IH / 2);
  return { out, shadow };
}
const { out: personCanvas, shadow: shadowCanvas } = cutout(photo);
window.__cutout = () => personCanvas.toDataURL('image/png');

// ---------- persona (plano 2.5D con deformaciones sutiles) ----------
const PX = 1 / 890;                       // metros por píxel de la foto (1,78 m de estatura)
const FEET = 1600, FACE_X = 447;
const personTex = new THREE.CanvasTexture(personCanvas);
personTex.colorSpace = THREE.SRGBColorSpace; personTex.premultiplyAlpha = true;
personTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const personMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, premultipliedAlpha: true,
  uniforms: { tex: { value: personTex }, t: { value: 0 }, look: { value: 0 }, gaze: { value: 0 }, blink: { value: 0 }, br: { value: 0 },
              res: { value: new THREE.Vector2(IW, IH) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tex; uniform float t, look, gaze, blink, br; uniform vec2 res; varying vec2 vUv;
    float sm(float a, float b, float x){ return smoothstep(a, b, x); }
    vec2 rot(vec2 p, vec2 c, float a){ float s=sin(a), k=cos(a); p-=c; return c+vec2(k*p.x-s*p.y, s*p.x+k*p.y); }
    vec4 at(vec2 s){ return texture2D(tex, vec2(s.x/res.x, 1.-s.y/res.y)); }
    void main(){
      vec2 p = vec2(vUv.x*res.x, (1.-vUv.y)*res.y), s = p;
      // respiración: el pecho se expande apenas, anclado bajo el mostrador
      float wB = sm(860., 700., s.y);
      vec2 an = vec2(${FACE_X}., 860.);
      s = an + (s - an) / vec2(1. + .0045*br*wB, 1. + .006*br*wB);
      // cabeza: leve inclinación y giro de la cara hacia el teléfono
      float wX = 1. - sm(120., 185., abs(s.x - ${FACE_X}.));
      float wH = sm(305., 240., s.y) * wX;
      s = rot(s, vec2(448., 300.), -.03*look*wH);
      vec2 fc = vec2(447., 172.);
      float wF = 1. - sm(.75, 1.15, length((s - fc) / vec2(80., 105.)));
      s.x -= 6.*look*wF;
      s.y -= 1.5*(1. - look)*wF;               // la mirada un poco baja, hacia los papeles
      // ojos: el iris se adelanta al giro de cabeza; párpado superior en el parpadeo
      vec2 E[2]; E[0] = vec2(415., 152.); E[1] = vec2(477.5, 145.5);
      for (int i = 0; i < 2; i++) {
        vec2 d = (s - E[i]) / vec2(14., 7.5);
        float wE = 1. - sm(.7, 1., length(d));
        s.x -= 3.4*gaze*wE;
        s.y += 1.2*(1. - look)*wE;
      }
      vec4 c = at(s);
      for (int i = 0; i < 2; i++) {
        vec2 d = (s - E[i]) / vec2(13.5, 6.5);
        float inE = (1. - sm(.72, 1.12, length(d)));
        // borde del párpado: baja con el parpadeo y nunca pasa del contorno inferior del ojo
        float edge = min(-1. + 2.1*blink, .9*sqrt(max(0., 1. - d.x*d.x)));
        float lid = inE * (1. - sm(edge - .12, edge + .12, d.y)) * step(.02, blink);
        vec4 skin = vec4(0.);
        for (int k = -3; k <= 3; k++) skin += at(vec2(s.x + float(k)*2.5, E[i].y - 7.));
        skin /= 7.;
        skin.rgb *= mix(1.04, .86, sm(-1., edge, d.y));           // sombra hacia el borde del párpado
        float lash = (1. - sm(0., .2, abs(d.y - edge))) * (1. - sm(.85, 1.05, abs(d.x))) * step(.05, blink);
        c = mix(c, skin, lid);
        c.rgb = mix(c.rgb, vec3(.09, .06, .05), lash*.75*blink);
      }
      // gradación cálida para integrarlo con la luz de la recepción
      c.rgb *= vec3(.98, .92, .84);
      gl_FragColor = c;
    }`,
});
const personH = IH * PX, personW = IW * PX;
const person = new THREE.Mesh(new THREE.PlaneGeometry(personW, personH), personMat);
person.position.set((IW / 2 - FACE_X) * PX, personH / 2 - (IH - FEET) * PX, 0);
person.renderOrder = 1;
scene.add(person);
const FACE_Y = (FEET - 172) * PX;           // ≈ 1,60 m

// sombra suave del dueño sobre la pared del fondo
const shadowTex = new THREE.CanvasTexture(shadowCanvas);
const wallZ = -1.25;
const shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(personW * 1.08, personH * 1.08),
  new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowTex, transparent: true, opacity: .2, depthWrite: false }));
shadowMesh.position.set(person.position.x + .14, person.position.y - .05, wallZ + .005);
scene.add(shadowMesh);

// ---------- texturas procedurales ----------
function woodTexture(base, dark, w = 1024, h = 256, seed = 3) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, w, h);
  let a = seed; const r = () => (a = (a * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) {
    const y0 = r() * h, amp = 2 + r() * 6, f = .004 + r() * .01, ph = r() * 6;
    x.strokeStyle = dark; x.globalAlpha = .05 + r() * .12; x.lineWidth = .6 + r() * 2.2;
    x.beginPath();
    for (let px = 0; px <= w; px += 8) x.lineTo(px, y0 + Math.sin(px * f + ph) * amp + Math.sin(px * f * 3.1 + ph) * amp * .3);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function paperTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 660;
  const x = c.getContext('2d'); x.fillStyle = '#d8d2c5'; x.fillRect(0, 0, 512, 660);
  x.fillStyle = '#b9b3a8';
  for (let i = 0; i < 18; i++) { const w = 300 + ((i * 97) % 120); x.fillRect(60, 90 + i * 28, i % 6 === 5 ? w * .5 : w, 7); }
  x.fillRect(60, 40, 180, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- recepción ----------
const taupe = new THREE.MeshStandardMaterial({ color: 0x7a6e64, roughness: .95 });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), taupe);
wall.position.set(0, 2.2, wallZ); wall.receiveShadow = true; scene.add(wall);

const woodDark = woodTexture('#6b4127', '#2e1a0d', 1024, 256, 7);
const woodLight = woodTexture('#8a5a36', '#3a2210', 1024, 256, 11);
const panelMat = new THREE.MeshStandardMaterial({ map: woodDark, roughness: .55 });
const wainscot = new THREE.Mesh(new THREE.BoxGeometry(8, 1.0, .03), panelMat);
wainscot.position.set(0, .5, wallZ + .02); scene.add(wainscot);
const brass = new THREE.MeshStandardMaterial({ color: 0xb48a46, metalness: 1, roughness: .28 });
const rail = new THREE.Mesh(new THREE.BoxGeometry(8, .025, .03), brass);
rail.position.set(0, 1.01, wallZ + .04); scene.add(rail);

// mostrador
const CT = 1.08;                          // altura del mostrador (m)
const counter = new THREE.Group(); scene.add(counter);
const topMat = new THREE.MeshStandardMaterial({ map: woodLight, roughness: .38 });
woodLight.repeat.set(2, 1);
const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, .055, .7), topMat);
top.position.set(0, CT - .0275, .45); top.castShadow = top.receiveShadow = true; counter.add(top);
const front = new THREE.Mesh(new THREE.BoxGeometry(2.5, CT - .05, .05), new THREE.MeshStandardMaterial({ map: woodDark, roughness: .6 }));
front.position.set(0, (CT - .05) / 2, .76); counter.add(front);
const trim = new THREE.Mesh(new THREE.BoxGeometry(2.6, .012, .012), brass);
trim.position.set(0, CT - .055, .79); counter.add(trim);

// papeles
const paperTex = paperTexture();
const paperMat = new THREE.MeshStandardMaterial({ map: paperTex, roughness: .9 });
const plainPaper = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: .95 });
for (let i = 0; i < 6; i++) {
  const sh = new THREE.Mesh(new THREE.BoxGeometry(.215, .0025, .28), i === 5 ? [plainPaper, plainPaper, paperMat, plainPaper, plainPaper, plainPaper] : plainPaper);
  sh.position.set(-.1 + Math.sin(i * 2.3) * .006, CT + .0015 + i * .0026, .36 + Math.cos(i * 1.7) * .005);
  sh.rotation.y = .08 + Math.sin(i * 3.1) * .03;
  sh.castShadow = sh.receiveShadow = true; counter.add(sh);
}
const pen = new THREE.Mesh(new THREE.CylinderGeometry(.0045, .0045, .14, 16), brass);
pen.rotation.set(Math.PI / 2, 0, .9); pen.position.set(.06, CT + .006, .4); pen.castShadow = true; counter.add(pen);

// teléfono de escritorio sin marca
const phone = new THREE.Group(); counter.add(phone);
phone.position.set(.16, CT, .5); phone.rotation.y = -.32;
const charcoal = new THREE.MeshPhysicalMaterial({ color: 0x2c2c2e, roughness: .35, metalness: .05, clearcoat: .6, clearcoatRoughness: .3 });
const wedge = new THREE.Shape();                       // perfil lateral: más alto atrás
wedge.moveTo(-.09, 0); wedge.lineTo(.09, 0); wedge.lineTo(.09, .022); wedge.lineTo(-.05, .068); wedge.lineTo(-.09, .068); wedge.lineTo(-.09, 0);
const baseGeo = new THREE.ExtrudeGeometry(wedge, { depth: .2, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 3 });
baseGeo.translate(0, 0, -.1); baseGeo.rotateY(-Math.PI / 2);   // perfil a lo largo de z: frente (bajo) hacia la cámara
const base = new THREE.Mesh(baseGeo, charcoal); base.castShadow = true; phone.add(base);
const slope = Math.atan2(.046, .14);
const keyMat = new THREE.MeshStandardMaterial({ color: 0x48484b, roughness: .45 });
for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
  const k = new THREE.Mesh(new THREE.BoxGeometry(.022, .006, .014), keyMat);
  const zz = .06 - r * .022;
  k.position.set(-.025 + c * .028, .022 + (.09 - zz) * Math.tan(slope) + .006, zz); k.rotation.x = slope; phone.add(k);
}
const screen = new THREE.Mesh(new THREE.PlaneGeometry(.07, .024), new THREE.MeshBasicMaterial({ color: 0x23302f }));
screen.rotation.x = -Math.PI / 2 + slope; screen.position.set(.055, .022 + .085 * Math.tan(slope) + .007, -.01); phone.add(screen);
const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .55, .15) });
const led = new THREE.Mesh(new THREE.SphereGeometry(.0045, 12, 8), ledMat);
led.position.set(.075, .03, .085); phone.add(led);
const handset = new THREE.Group(); phone.add(handset);
handset.position.set(0, .082, -.065);
const grip = new THREE.Mesh(new THREE.CapsuleGeometry(.016, .15, 6, 16), charcoal);
grip.rotation.z = Math.PI / 2; grip.castShadow = true; handset.add(grip);
for (const x of [-.088, .088]) {
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(.022, .02, 6, 16), charcoal);
  cap.rotation.x = Math.PI / 2; cap.position.set(x, -.006, .004); cap.castShadow = true; handset.add(cap);
}
const cord = new THREE.Mesh(new THREE.TorusGeometry(.02, .004, 8, 24, Math.PI * 1.2), charcoal);
cord.position.set(-.1, .03, -.06); cord.rotation.set(0, Math.PI / 2, .4); phone.add(cord);

// aplique de latón a la izquierda y repisa a la derecha (fuera de la zona del texto)
const sconce = new THREE.Group(); scene.add(sconce);
sconce.position.set(-.78, 1.78, wallZ);
const plate = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .015, 32), brass);
plate.rotation.x = Math.PI / 2; sconce.add(plate);
const arm = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .16, 12), brass);
arm.rotation.x = Math.PI / 2; arm.position.z = .08; sconce.add(arm);
const shade = new THREE.Mesh(new THREE.CylinderGeometry(.06, .085, .13, 32, 1, true),
  new THREE.MeshStandardMaterial({ color: 0xf2e2c4, emissive: 0xffc98a, emissiveIntensity: 1.6, side: THREE.DoubleSide }));
shade.position.set(0, .03, .17); sconce.add(shade);
const bulb = new THREE.PointLight(0xffb36b, 1.4, 3.5, 2);
bulb.position.set(-.78, 1.8, wallZ + .2); scene.add(bulb);

const shelf = new THREE.Mesh(new THREE.BoxGeometry(.6, .03, .2), new THREE.MeshStandardMaterial({ map: woodLight, roughness: .5 }));
shelf.position.set(.78, 1.3, wallZ + .1); shelf.castShadow = true; scene.add(shelf);
const vase = new THREE.Mesh(new THREE.LatheGeometry([0, .03, .045, .05, .04, .022, .024].map((r, i) => new THREE.Vector2(r, i * .03)), 32),
  new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: .7 }));
vase.position.set(.68, 1.315, wallZ + .1); vase.castShadow = true; scene.add(vase);
[[0x5d4a3a, .19], [0x8a7a62, .17], [0x3f4a4a, .2]].forEach(([col, h], i) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(.03, h, .14), new THREE.MeshStandardMaterial({ color: col, roughness: .8 }));
  b.position.set(.86 + i * .034, 1.315 + h / 2, wallZ + .1); b.castShadow = true; scene.add(b);
});

// luces: llave cálida desde arriba a la izquierda, relleno suave, contraluz en la pared
scene.add(new THREE.HemisphereLight(0xf3e3cf, 0x2a2018, .4));
const key = new THREE.SpotLight(0xffd6ac, 11, 9, .62, .75, 1.4);
key.position.set(-1.2, 3.0, 2.2); key.target.position.set(0, 1.1, 0);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.radius = 6;
scene.add(key, key.target);
const wash = new THREE.SpotLight(0xffc690, 5, 7, .55, .95, 1.2);
wash.position.set(.9, 3.2, .6); wash.target.position.set(.3, 1.6, wallZ); scene.add(wash, wash.target);

// ---------- posproceso ----------
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), .22, .5, .92));
composer.addPass(new OutputPass());
const film = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    void main(){ vec2 d=vUv-.5; vec3 c=texture2D(tDiffuse,vUv).rgb;
      c*=1.-.38*smoothstep(.2,.75,length(d*vec2(1.,.6)));
      c=mix(c, c*vec3(1.03,1.,.94), .6);                 // gradación cálida
      c+=(hash(vUv*uRes+floor(uTime*30.)*7.31)-.5)*.022;
      gl_FragColor=vec4(c,1.); }`,
});
composer.addPass(film);

// ---------- animación ----------
function renderAt(t) {
  const lk = look(t);
  personMat.uniforms.look.value = lk;
  personMat.uniforms.gaze.value = smooth(1.08, 1.3, t) * (1 - smooth(2.62, 2.9, t));
  personMat.uniforms.blink.value = Math.max(1 - smooth(0, .085, Math.abs(t - 1.16)), 1 - smooth(0, .085, Math.abs(t - 3.3)));
  personMat.uniforms.br.value = Math.sin(t * Math.PI * 2 / 3.6);
  personMat.uniforms.t.value = t;

  // timbre: el auricular vibra y el LED parpadea en cada ráfaga
  const r = ringing(t);
  handset.rotation.set(r ? Math.sin(t * 190) * .012 : 0, 0, r ? Math.sin(t * 230 + 1) * .01 : 0);
  handset.position.y = .082 + (r ? Math.abs(Math.sin(t * 160)) * .0012 : 0);
  ledMat.color.setRGB(...(r && Math.sin(t * 40) > -.2 ? [4, 1.8, .4] : [.25, .12, .05]));

  // cámara: plano medio a la altura de los ojos, acercamiento lento y continuo, sin cortes
  const u = t / DURATION, e = u * u * (3 - 2 * u) * .35 + u * .65;
  camera.position.set(Math.sin(t * .9) * .004, lerp(1.5, 1.52, e) + Math.sin(t * 1.3) * .002, lerp(2.7, 2.25, e));
  camera.lookAt(0, lerp(1.36, 1.39, e), 0);
  film.uniforms.uTime.value = t;
  composer.render();
}

window.__ringPlan = RINGS;
if (RENDER) {
  window.renderFrame = async t => { renderAt(t); await new Promise(r => requestAnimationFrame(r)); };
  window.__ready = true;
} else {
  const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); canvas.style.transform = `translate(${(innerWidth - W * k) / 2}px,0) scale(${k})`; };
  addEventListener('resize', fit); fit();
  const t0 = performance.now();
  const loop = () => { renderAt(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
  loop();
}
