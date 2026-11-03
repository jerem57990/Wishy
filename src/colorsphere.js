// Cercle chromatique Pantone en 3D : chaque vêtement est placé sur une sphère de couleurs
// (teinte = longitude, clarté = hauteur, saturation = distance à l'axe des gris).
// Toucher un vêtement allume ceux qui s'accordent avec lui.
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import PANTONE from './vendor/pantone-tcx.js';
import { hexToLch } from './colors.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const R = 1.5;

/** Position d'une couleur dans la sphère */
export function colorPos(hex, out = new THREE.Vector3()) {
  const [L, C, h] = hexToLch(hex);
  const lat = ((L - 50) / 50) * (Math.PI / 2) * 0.92;
  const rad = R * (0.18 + 0.82 * Math.min(1, C / 55));
  const lon = (h * Math.PI) / 180;
  const ring = Math.cos(lat) * rad;
  return out.set(Math.cos(lon) * ring, Math.sin(lat) * R, -Math.sin(lon) * ring);
}

function roundThumb(img, hex, size = 160) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  const r = size / 2;
  x.beginPath(); x.arc(r, r, r - 2, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill();
  x.save();
  x.beginPath(); x.arc(r, r, r - 14, 0, Math.PI * 2); x.clip();
  if (img) {
    const k = Math.max((size - 28) / img.width, (size - 28) / img.height) * 0.92;
    x.drawImage(img, r - (img.width * k) / 2, r - (img.height * k) / 2, img.width * k, img.height * k);
  } else { x.fillStyle = hex; x.fillRect(0, 0, size, size); }
  x.restore();
  x.lineWidth = 12; x.strokeStyle = hex; x.beginPath(); x.arc(r, r, r - 8, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/**
 * @param {HTMLElement} host
 * @param {{ onPick(item|null):void, harmony(a:string,b:string):{score:number,label:string}, imageData(item):Promise<string|null> }} opt
 */
export function createColorSphere(host, opt) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  camera.position.set(0, 1.4, 5.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 9;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.8;

  // nuage des couleurs Pantone TCX
  const step = Math.max(1, Math.floor(PANTONE.length / 1400));
  const pts = PANTONE.filter((_, i) => i % step === 0);
  const pos = new Float32Array(pts.length * 3), col = new Float32Array(pts.length * 3);
  const v = new THREE.Vector3(), c = new THREE.Color();
  pts.forEach(([, , hex], i) => {
    colorPos(hex, v);
    pos.set([v.x, v.y, v.z], i * 3);
    c.set(hex).convertSRGBToLinear();
    col.set([c.r, c.g, c.b], i * 3);
  });
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cloudGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  const dx = dot.getContext('2d'); dx.beginPath(); dx.arc(16, 16, 14, 0, Math.PI * 2); dx.fillStyle = '#fff'; dx.fill();
  const cloudMat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, map: new THREE.CanvasTexture(dot), alphaTest: 0.05, transparent: true, opacity: 0.95 });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  scene.add(cloud);
  // axe des gris et équateur
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, R * 2.1, 8), new THREE.MeshBasicMaterial({ color: 0x9a9caa }));
  scene.add(axis);
  const eq = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.006, 6, 120), new THREE.MeshBasicMaterial({ color: 0xc9cbd4 }));
  eq.rotation.x = Math.PI / 2;
  scene.add(eq);

  const group = new THREE.Group();
  scene.add(group);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x17171c, transparent: true, opacity: 0.55 });
  let lines = null;
  let sprites = [];
  let selected = null;

  async function setItems(items) {
    for (const s of sprites) { group.remove(s); s.material.map?.dispose(); s.material.dispose(); }
    sprites = [];
    for (const it of items) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: roundThumb(null, it.hex), transparent: true, depthWrite: false }));
      colorPos(it.hex, sp.position);
      sp.position.multiplyScalar(1.12);
      sp.scale.setScalar(0.42);
      sp.userData = { item: it, base: 0.42, target: 0.42, op: 1 };
      sp.renderOrder = 5;
      group.add(sp);
      sprites.push(sp);
      // photo du vêtement chargée ensuite
      opt.imageData(it).then(loadImg).then((img) => { if (img && sprites.includes(sp)) { sp.material.map.dispose(); sp.material.map = roundThumb(img, it.hex); sp.material.needsUpdate = true; } });
    }
    select(null);
  }

  function select(sp) {
    selected = sp;
    if (lines) { group.remove(lines); lines.geometry.dispose(); lines = null; }
    const matches = [];
    for (const s of sprites) {
      if (!sp) { s.userData.target = s.userData.base; s.userData.op = 1; continue; }
      if (s === sp) { s.userData.target = 0.62; s.userData.op = 1; continue; }
      const h = opt.harmony(sp.userData.item.hex, s.userData.item.hex);
      const ok = h.score >= 0.8;
      s.userData.target = ok ? 0.5 : 0.3;
      s.userData.op = ok ? 1 : 0.18;
      if (ok) matches.push({ item: s.userData.item, h, sp: s });
    }
    if (matches.length) {
      const arr = [];
      for (const m of matches) arr.push(sp.position.x, sp.position.y, sp.position.z, m.sp.position.x, m.sp.position.y, m.sp.position.z);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      lines = new THREE.LineSegments(g, lineMat);
      group.add(lines);
    }
    cloudMat.opacity = sp ? 0.35 : 0.95;
    controls.autoRotate = !sp && !reduced;
    opt.onPick?.(sp ? { item: sp.userData.item, matches: matches.sort((a, b) => b.h.score - a.h.score).map(({ item, h }) => ({ item, h })) } : null);
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(sprites, false)[0];
    select(hit ? (hit.object === selected ? null : hit.object) : null);
  });

  let alive = true;
  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  renderer.setAnimationLoop((t) => {
    if (!alive) return;
    for (const s of sprites) {
      const u = s.userData;
      const pulse = s === selected && !reduced ? 1 + Math.sin(t / 220) * 0.05 : 1;
      s.scale.setScalar(s.scale.x + (u.target * pulse - s.scale.x) * 0.15);
      s.material.opacity += (u.op - s.material.opacity) * 0.15;
    }
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    setItems,
    selectById(id) { select(sprites.find((s) => s.userData.item.id === id) || null); },
    dispose() { alive = false; ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); },
  };
}
