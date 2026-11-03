// Tirelire 3D : une pièce par euro économisé grâce aux promos.
// Physique maison (gravité, rebonds, chocs entre pièces) ; sur iPhone la gravité suit
// l'inclinaison du téléphone et secouer fait sauter les pièces.
import * as THREE from './vendor/three.module.js';
import { onMotionChange, haptic } from './touch.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Rayon intérieur de la tirelire (ellipsoïde)
const A = 1.18, B = 0.86, C = 0.86;
const DENOMS = [
  { v: 100, r: 0.24, h: 0.06, face: '#ffd21f', rim: '#e0a800', ink: '#5a4300' },
  { v: 50, r: 0.22, h: 0.055, face: '#ffd84d', rim: '#c99a00', ink: '#5a4300' },
  { v: 10, r: 0.19, h: 0.05, face: '#f4c430', rim: '#b8b9c2', ink: '#5a4300' },
  { v: 2, r: 0.165, h: 0.045, face: '#d9dae0', rim: '#f0c419', ink: '#3c3d47' },
  { v: 1, r: 0.15, h: 0.042, face: '#f0c419', rim: '#d9dae0', ink: '#5a4300' },
];
const MAX_COINS = 140;

/** Découpe un montant en pièces (au plus MAX_COINS) */
export function coinsFor(amount) {
  const total = Math.max(0, Math.round(amount));
  // la plus petite monnaie possible tant que le nombre de pièces reste raisonnable
  const sets = [[2, 1], [10, 2, 1], [50, 10, 2, 1], [100, 50, 10, 2, 1]];
  for (const set of sets) {
    let rest = total;
    const out = [];
    for (const v of set) { const n = Math.floor(rest / v); for (let i = 0; i < n; i++) out.push(DENOMS.find((x) => x.v === v)); rest -= n * v; }
    if (out.length <= MAX_COINS || set === sets[sets.length - 1]) return out.slice(0, MAX_COINS).sort(() => Math.random() - 0.5);
  }
  return [];
}

function faceTexture(d) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createRadialGradient(54, 50, 6, 64, 64, 64);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, d.face);
  g.addColorStop(1, d.rim);
  x.fillStyle = g;
  x.beginPath(); x.arc(64, 64, 64, 0, Math.PI * 2); x.fill();
  x.lineWidth = 6; x.strokeStyle = d.rim; x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2); x.stroke();
  x.fillStyle = d.ink;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `800 ${d.v >= 10 ? 46 : 56}px Bricolage, "DM Sans", sans-serif`;
  x.fillText(String(d.v), 64, 58);
  x.font = '700 22px "DM Sans", sans-serif';
  x.fillText('€', 64, 96);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePig(group) {
  const glass = new THREE.MeshStandardMaterial({ color: 0xffb3c8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const solid = new THREE.MeshStandardMaterial({ color: 0xff8fb0, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), glass);
  body.scale.set(A + 0.12, B + 0.12, C + 0.12);
  body.renderOrder = 2;
  group.add(body);
  // reflets
  const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0.3, 0.7, 0.5, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  shine.scale.copy(body.scale).multiplyScalar(1.01);
  shine.renderOrder = 3;
  group.add(shine);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.24, 32), solid);
  snout.rotation.z = Math.PI / 2;
  snout.position.set(A + 0.2, 0.02, 0);
  group.add(snout);
  for (const z of [-0.1, 0.1]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), new THREE.MeshStandardMaterial({ color: 0xc2456e }));
    n.rotation.z = Math.PI / 2; n.position.set(A + 0.33, 0.03, z); group.add(n);
  }
  for (const z of [-0.42, 0.42]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 24), solid);
    ear.position.set(A * 0.62, B + 0.12, z);
    ear.rotation.set(z > 0 ? 0.35 : -0.35, 0, -0.35);
    group.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.3 }));
    eye.position.set(A * 0.86, 0.38, z * 0.62);
    group.add(eye);
  }
  for (const [x, z] of [[0.62, 0.45], [-0.62, 0.45], [0.62, -0.45], [-0.62, -0.45]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.42, 24), solid);
    leg.position.set(x, -B - 0.08, z);
    group.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 10, 24, Math.PI * 1.6), solid);
  tail.position.set(-A - 0.18, 0.15, 0);
  tail.rotation.y = Math.PI / 2;
  group.add(tail);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.1), new THREE.MeshStandardMaterial({ color: 0x17171c }));
  slot.position.set(-0.05, B + 0.115, 0);
  group.add(slot);
}

/**
 * @param {HTMLElement} host
 * @returns {{ setAmount(eur:number, {animateFrom?:number}):void, shake():void, dispose():void }}
 */
export function createPiggy(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0.5, 0.7, 5.1);
  camera.lookAt(0, 0.08, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe9a8, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);

  const pig = new THREE.Group();
  makePig(pig);
  scene.add(pig);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshBasicMaterial({ color: 0x17171c, transparent: true, opacity: 0.08 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -B - 0.3;
  shadow.scale.set(1.1, 0.6, 1);
  scene.add(shadow);

  // matériaux partagés par dénomination
  const mats = new Map();
  const matFor = (d) => {
    if (!mats.has(d.v)) {
      const face = new THREE.MeshStandardMaterial({ map: faceTexture(d), metalness: 0.15, roughness: 0.35, emissive: 0x2a2000, emissiveIntensity: 0.15 });
      const rim = new THREE.MeshStandardMaterial({ color: d.rim, metalness: 0.3, roughness: 0.3 });
      mats.set(d.v, [rim, face, face]);
    }
    return mats.get(d.v);
  };
  const geos = new Map();
  const geoFor = (d) => { if (!geos.has(d.v)) geos.set(d.v, new THREE.CylinderGeometry(d.r, d.r, d.h, 28)); return geos.get(d.v); };

  const coins = []; // { mesh, p:Vector3, v:Vector3, w:Vector3, r }
  const tmp = new THREE.Vector3();
  function addCoin(d, fromSlot) {
    const mesh = new THREE.Mesh(geoFor(d), matFor(d));
    mesh.renderOrder = 1;
    const c = { mesh, d, r: d.r * 0.92, p: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8) };
    if (fromSlot) c.p.set(-0.05 + (Math.random() - 0.5) * 0.2, B - 0.15, (Math.random() - 0.5) * 0.05);
    else c.p.set((Math.random() - 0.5) * A, -B * 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * C);
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
    mesh.position.copy(c.p);
    pig.add(mesh);
    coins.push(c);
  }
  function clear() { for (const c of coins) pig.remove(c.mesh); coins.length = 0; }

  // gravité (repère de la tirelire) : vers le bas par défaut, suit le téléphone sur mobile
  const g = new THREE.Vector3(0, -9.8, 0);
  const offMotion = onMotionChange((m) => {
    if (m.gx || m.gy) g.set(m.gx * 9.8, m.gy * 9.8, -1.5).clampLength(0, 9.8);
    if (m.shake > 0.35) kick(m.shake);
  });
  let lastHaptic = 0;
  function kick(force = 0.6) {
    for (const c of coins) c.v.add(tmp.set((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 4).multiplyScalar(force));
    for (const c of coins) c.w.add(tmp.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20).multiplyScalar(force));
    wobble = 1;
    haptic();
  }

  const gl = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  function step(dt) {
    let hardHit = 0;
    gl.copy(g).applyAxisAngle(Y, -pig.rotation.y);
    for (const c of coins) {
      c.v.addScaledVector(gl, dt);
      c.v.multiplyScalar(0.995);
      c.p.addScaledVector(c.v, dt);
      // paroi ellipsoïdale
      const a = A - c.r, b = B - c.r, cc = C - c.r;
      const k = (c.p.x / a) ** 2 + (c.p.y / b) ** 2 + (c.p.z / cc) ** 2;
      if (k > 1) {
        const s = 1 / Math.sqrt(k);
        c.p.multiplyScalar(s);
        const n = tmp.set(c.p.x / (a * a), c.p.y / (b * b), c.p.z / (cc * cc)).normalize();
        const vn = c.v.dot(n);
        if (vn > 0) {
          if (vn > 2.5) hardHit = Math.max(hardHit, vn);
          c.v.addScaledVector(n, -vn * 1.45); // rebond (restitution 0,45)
          c.v.multiplyScalar(0.86); // frottement
          c.w.multiplyScalar(0.8);
        }
      }
    }
    // chocs entre pièces
    for (let i = 0; i < coins.length; i++) {
      const ci = coins[i];
      for (let j = i + 1; j < coins.length; j++) {
        const cj = coins[j];
        const dx = cj.p.x - ci.p.x, dy = cj.p.y - ci.p.y, dz = cj.p.z - ci.p.z;
        const min = (ci.r + cj.r) * 0.62; // les pièces sont plates : on les laisse s'empiler serré
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2), push = (min - d) / 2;
        const nx = dx / d, ny = dy / d, nz = dz / d;
        ci.p.x -= nx * push; ci.p.y -= ny * push; ci.p.z -= nz * push;
        cj.p.x += nx * push; cj.p.y += ny * push; cj.p.z += nz * push;
        const rv = (cj.v.x - ci.v.x) * nx + (cj.v.y - ci.v.y) * ny + (cj.v.z - ci.v.z) * nz;
        if (rv < 0) {
          const imp = -rv * 0.7;
          ci.v.x -= nx * imp; ci.v.y -= ny * imp; ci.v.z -= nz * imp;
          cj.v.x += nx * imp; cj.v.y += ny * imp; cj.v.z += nz * imp;
        }
      }
    }
    for (const c of coins) {
      c.w.multiplyScalar(0.97);
      const ang = c.w.length() * dt;
      if (ang > 1e-5) c.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(tmp.copy(c.w).normalize(), ang));
      // au repos, les pièces se couchent peu à peu à plat
      if (c.v.lengthSq() < 0.05) c.mesh.quaternion.slerp(flat, 0.02);
      c.mesh.position.copy(c.p);
    }
    const now = performance.now();
    if (hardHit && now - lastHaptic > 250) { lastHaptic = now; if (hardHit > 4) haptic(); }
  }
  const flat = new THREE.Quaternion();

  // toucher : petite secousse ; glisser : faire pivoter la tirelire
  let drag = null, rotY = -0.35, wobble = 0;
  host.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; host.setPointerCapture(e.pointerId); });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    rotY += dx * 0.01;
    drag.x = e.clientX;
  });
  host.addEventListener('pointerup', () => { if (drag && !drag.moved) kick(0.5); drag = null; });

  let pending = [];
  let dropTimer = 0;
  function setAmount(eur, { animateFrom = null } = {}) {
    const all = coinsFor(eur);
    const before = animateFrom == null ? all.length : Math.min(all.length, coinsFor(animateFrom).length);
    clear();
    // les pièces déjà là sont posées au fond ; les nouvelles tombent par la fente une à une
    all.slice(0, before).forEach((d) => addCoin(d, false));
    pending = all.slice(before);
    for (let i = 0; i < 40; i++) step(1 / 60); // laisse le tas se tasser
  }

  let alive = true;
  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 1 ? 6 : 5.1;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  let last = performance.now();
  renderer.setAnimationLoop((t) => {
    if (!alive) return;
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (pending.length && t - dropTimer > 140) { dropTimer = t; addCoin(pending.shift(), true); if (pending.length % 4 === 0) haptic(); }
    if (!reduced) { step(dt / 2); step(dt / 2); }
    wobble *= 0.9;
    pig.rotation.y += (rotY - pig.rotation.y) * 0.1;
    pig.rotation.z = Math.sin(t / 60) * 0.06 * wobble;
    renderer.render(scene, camera);
  });
  return {
    setAmount,
    shake: () => kick(0.8),
    dispose() { alive = false; offMotion(); ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); },
  };
}
