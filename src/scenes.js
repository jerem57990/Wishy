// Scènes Three.js de Wishy : sac 3D du hero et histogramme 3D des dépenses.
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const C = {
  sun: 0xffd21f, sunDeep: 0xf5b800, ink: 0x17171c, paper: 0xffffff,
  berry: 0xff4f81, mint: 0x0fae7b, sky: 0x4f7cff, cloud: 0xeef0f4,
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeRenderer(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  return renderer;
}

function softLights(scene, { shadow = true, warm = true } = {}) {
  scene.add(new THREE.HemisphereLight(0xffffff, warm ? 0xffe9a0 : 0xdde3ee, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 7, 5);
  if (shadow) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.03;
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
  }
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff3c4, 0.8);
  rim.position.set(-5, 3, -4);
  scene.add(rim);
  return key;
}

// Boucle commune : chaque scène ne se dessine que si son conteneur est visible
function loop(host, renderer, camera, tick) {
  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(host);
  fit();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!host.offsetParent) return; // vue masquée
    const t = clock.getElapsedTime();
    tick(t, clock.getDelta());
  });
  return fit;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...o });

// =====================================================================
// 1. HERO : un sac de shopping qui flotte, entouré de cadeaux (1 par article) et de pièces
// =====================================================================
export function createHeroScene(host) {
  const renderer = makeRenderer(host);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.6, 9.5);
  softLights(scene);

  // Ombre portée douce sur la carte jaune
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const rig = new THREE.Group();
  scene.add(rig);

  // --- Le sac ---
  const bag = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.3, 2.5, 1.15, 6, 0.16), mat(C.ink, { roughness: 0.55 }));
  body.castShadow = true;
  bag.add(body);
  const handleGeo = new THREE.TorusGeometry(0.55, 0.07, 16, 48, Math.PI);
  for (const z of [0.38, -0.38]) {
    const h = new THREE.Mesh(handleGeo, mat(C.sun, { roughness: 0.3 }));
    h.position.set(0, 1.25, z);
    h.castShadow = true;
    bag.add(h);
  }
  // Coeur jaune sur la face avant
  const heart = new THREE.Shape();
  heart.moveTo(0, -0.42);
  heart.bezierCurveTo(-0.15, -0.28, -0.55, -0.05, -0.55, 0.2);
  heart.bezierCurveTo(-0.55, 0.45, -0.3, 0.55, -0.15, 0.5);
  heart.bezierCurveTo(-0.07, 0.47, 0, 0.4, 0, 0.32);
  heart.bezierCurveTo(0, 0.4, 0.07, 0.47, 0.15, 0.5);
  heart.bezierCurveTo(0.3, 0.55, 0.55, 0.45, 0.55, 0.2);
  heart.bezierCurveTo(0.55, -0.05, 0.15, -0.28, 0, -0.42);
  const heartMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(heart, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }),
    mat(C.sun, { roughness: 0.25 })
  );
  heartMesh.position.set(0, -0.05, 0.56);
  bag.add(heartMesh);
  bag.rotation.set(0.08, -0.45, 0.04);
  rig.add(bag);

  // --- Pièces (le budget) ---
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 40);
  const coinMat = mat(C.sunDeep, { metalness: 0.65, roughness: 0.25 });
  const coins = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(coinGeo, coinMat);
    c.castShadow = true;
    c.userData = { a: (i / 4) * Math.PI * 2 + 0.6, r: 2.25 + (i % 2) * 0.35, y: -0.6 + i * 0.45, s: 0.35 + i * 0.07 };
    rig.add(c);
    coins.push(c);
  }

  // --- Cadeaux : un par article de la wishlist (max 7) ---
  const giftColors = [C.paper, C.berry, C.sky, C.mint, C.paper, C.berry, C.sky];
  const gifts = [];
  const giftGeo = new RoundedBoxGeometry(0.62, 0.62, 0.62, 4, 0.08);
  const ribbonGeo = new THREE.BoxGeometry(0.64, 0.64, 0.12);
  function makeGift(i) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(giftGeo, mat(giftColors[i % giftColors.length]));
    box.castShadow = true;
    g.add(box);
    const rib = mat(giftColors[i % giftColors.length] === C.paper ? C.berry : C.sun, { roughness: 0.3 });
    const r1 = new THREE.Mesh(ribbonGeo, rib);
    const r2 = r1.clone(); r2.rotation.y = Math.PI / 2;
    g.add(r1, r2);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.09, 0.035, 48, 8), rib);
    knot.position.y = 0.36;
    g.add(knot);
    const ang = -0.4 + i * 0.95;
    g.userData = { a: ang, r: 1.7 + (i % 3) * 0.32, y: 1.05 - (i % 4) * 0.62, spin: 0.4 + (i % 3) * 0.2, s: 0 };
    g.scale.setScalar(0.001);
    rig.add(g);
    return g;
  }
  function setGiftCount(n) {
    n = Math.max(0, Math.min(7, n));
    while (gifts.length < n) gifts.push(makeGift(gifts.length));
    gifts.forEach((g, i) => (g.userData.target = i < n ? 0.85 - (i % 3) * 0.12 : 0.001));
  }

  // --- Interaction : parallaxe à la souris, glisser pour faire tourner, clic = petit saut ---
  let mx = 0, my = 0, drag = null, spinVel = 0, jump = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width) * 2 - 1;
    my = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (drag != null) { spinVel = (e.clientX - drag) * 0.004; drag = e.clientX; }
  });
  host.addEventListener('pointerdown', (e) => {
    drag = e.clientX;
    host.setPointerCapture(e.pointerId);
    const r = host.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(bag, true).length) jump = 1;
  });
  host.addEventListener('pointerup', () => (drag = null));
  host.addEventListener('pointerleave', () => { mx = my = 0; });

  loop(host, renderer, camera, (t) => {
    const k = reduced ? 0 : 1;
    rig.rotation.y += (mx * 0.35 - rig.rotation.y) * 0.05;
    rig.rotation.x += (my * 0.12 - rig.rotation.x) * 0.05;
    bag.rotation.y += spinVel + 0.002 * k;
    spinVel *= 0.94;
    jump *= 0.92;
    bag.position.y = Math.sin(t * 1.2) * 0.12 * k + Math.sin(jump * Math.PI) * 0.5;
    bag.scale.setScalar(1 + jump * 0.06);
    for (const c of coins) {
      const u = c.userData;
      const a = u.a + t * u.s * k;
      c.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 1.5 + u.a) * 0.15 * k, Math.sin(a) * u.r * 0.6);
      c.rotation.set(Math.PI / 2.4, t * 2 * k + u.a, 0);
    }
    for (const g of gifts) {
      const u = g.userData;
      u.s += ((u.target ?? 0) - u.s) * 0.08;
      g.scale.setScalar(Math.max(0.001, u.s));
      const a = u.a + t * 0.15 * k;
      g.position.set(Math.cos(a) * u.r, u.y + Math.sin(t + u.a * 3) * 0.12 * k, Math.sin(a) * u.r * 0.55 + 0.4);
      g.rotation.set(Math.sin(t * 0.7 + u.a) * 0.3 * k, t * u.spin * k + u.a, 0.15);
    }
    renderer.render(scene, camera);
  });

  return { setGiftCount, pop: () => (jump = 1) };
}

// =====================================================================
// 2. DÉPENSES : histogramme 3D des 12 derniers mois
// =====================================================================
function labelSprite(text, { color = '#3c3d47', weight = 700, size = 50 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.font = `${weight} ${size}px "DM Sans", system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.9, 0.71, 1);
  return s;
}

export function createBarsScene(host, { onSelect } = {}) {
  const renderer = makeRenderer(host);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(3, 6, 13.5);
  softLights(scene, { warm: false });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minAzimuthAngle = -0.9;
  controls.maxAzimuthAngle = 0.9;
  controls.target.set(0, 1.4, 0);

  const plate = new THREE.Mesh(new RoundedBoxGeometry(14.4, 0.3, 3.2, 4, 0.14), mat(C.cloud, { roughness: 0.8 }));
  plate.position.y = -0.15;
  plate.receiveShadow = true;
  scene.add(plate);

  const group = new THREE.Group();
  scene.add(group);
  let bars = [];
  let selected = -1;
  const MAXH = 4.2;

  const tip = document.createElement('div');
  tip.className = 'bar-tip';
  tip.hidden = true;
  host.appendChild(tip);

  function setData(data, sel) {
    group.clear();
    bars = [];
    const max = Math.max(1, ...data.map((d) => d.value));
    data.forEach((d, i) => {
      const x = (i - (data.length - 1) / 2) * 1.12;
      const m = mat(C.sun, { roughness: 0.35 });
      const bar = new THREE.Mesh(new RoundedBoxGeometry(0.78, 1, 0.9, 3, 0.12), m);
      bar.castShadow = true;
      bar.position.set(x, 0, 0);
      bar.userData = { i, d, h: Math.max(0.06, (d.value / max) * MAXH), cur: 0.001 };
      bar.scale.y = 0.001;
      group.add(bar);
      bars.push(bar);
      const lbl = labelSprite(d.short);
      lbl.position.set(x, 0.05, 2.05);
      group.add(lbl);
    });
    select(sel ?? data.length - 1, false);
  }

  function select(i, emit = true) {
    selected = i;
    bars.forEach((b, j) => {
      b.material.color.setHex(j === i ? C.ink : b.userData.d.value ? C.sun : 0xe2e5eb);
      b.material.emissive?.setHex(0x000000);
    });
    if (emit && onSelect) onSelect(i);
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null, downAt = null;
  function pick(e) {
    const r = host.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(bars)[0];
    return hit ? hit.object : null;
  }
  host.addEventListener('pointermove', (e) => {
    const b = pick(e);
    if (hovered && hovered !== b && hovered.userData.i !== selected) hovered.material.color.setHex(hovered.userData.d.value ? C.sun : 0xe2e5eb);
    hovered = b;
    if (b) {
      if (b.userData.i !== selected) b.material.color.setHex(C.sunDeep);
      const r = host.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = `${b.userData.d.label} · ${b.userData.d.fmt}`;
      tip.style.left = e.clientX - r.left + 'px';
      tip.style.top = e.clientY - r.top + 'px';
      host.style.cursor = 'pointer';
    } else { tip.hidden = true; host.style.cursor = ''; }
  });
  host.addEventListener('pointerleave', () => (tip.hidden = true));
  host.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
  host.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const b = pick(e);
    if (b) select(b.userData.i);
  });

  loop(host, renderer, camera, () => {
    for (const b of bars) {
      const u = b.userData;
      u.cur += (u.h - u.cur) * (reduced ? 1 : 0.09);
      b.scale.y = u.cur;
      b.position.y = u.cur / 2;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return { setData, select: (i) => select(i, false) };
}
