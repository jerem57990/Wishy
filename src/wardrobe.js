// Dressing 3D : les vêtements de la wishlist sur une penderie qu'on fait défiler du doigt.
// Toucher un vêtement (ou le glisser vers le bas) l'envoie dans le miroir.
import * as THREE from './vendor/three.module.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GAP = 1.15;

const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

// Photo du vêtement sur une étiquette blanche aux coins arrondis
function garmentTexture(img, hex, title) {
  const W = 360, H = 460;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const r = 36;
  x.beginPath();
  x.roundRect ? x.roundRect(4, 4, W - 8, H - 8, r) : x.rect(4, 4, W - 8, H - 8);
  x.fillStyle = '#ffffff'; x.fill();
  x.save(); x.clip();
  if (img) {
    const k = Math.min((W - 40) / img.width, (H - 70) / img.height);
    x.drawImage(img, W / 2 - (img.width * k) / 2, 20 + (H - 70 - img.height * k) / 2, img.width * k, img.height * k);
  } else {
    x.fillStyle = hex || '#eef0f4'; x.fillRect(0, 0, W, H);
  }
  x.fillStyle = hex || '#ffd21f';
  x.fillRect(0, H - 34, W, 34);
  x.restore();
  x.fillStyle = '#17171c';
  x.font = '700 20px "DM Sans", sans-serif';
  x.textAlign = 'center';
  const t = (title || '').length > 30 ? title.slice(0, 29) + '…' : title || '';
  x.fillStyle = '#ffffff'; x.fillText(t, W / 2 + 1, H - 11);
  x.fillStyle = '#17171c'; x.fillText(t, W / 2, H - 12);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function hangerMesh(mat) {
  const g = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 8, 24, Math.PI * 1.3), mat);
  hook.position.y = 0.1;
  hook.rotation.z = -0.3;
  g.add(hook);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8), mat);
  neck.position.y = 0.0;
  g.add(neck);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), mat);
    arm.position.set(s * 0.22, -0.13, 0);
    arm.rotation.z = s * 1.08;
    g.add(arm);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 8), mat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = -0.24;
  g.add(bar);
  return g;
}

/**
 * @param {HTMLElement} host
 * @param {{ imageData(item):Promise<string|null>, onPick(item):void, dropZone():HTMLElement|null }} opt
 */
export function createWardrobe(host, opt) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  camera.position.set(0, 0.45, 3.7);
  camera.lookAt(0, 0.38, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffeec2, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 3);
  scene.add(key);

  const metal = new THREE.MeshStandardMaterial({ color: 0x17171c, metalness: 0.6, roughness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.5 });
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 60, 16), metal);
  rail.rotation.z = Math.PI / 2;
  rail.position.y = 1.1;
  scene.add(rail);
  // fond : mur clair + étagère
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), new THREE.MeshStandardMaterial({ color: 0xfff7d6, roughness: 1 }));
  wall.position.z = -0.6;
  scene.add(wall);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(60, 0.06, 0.5), wood);
  shelf.position.set(0, 1.42, -0.35);
  scene.add(shelf);

  const rack = new THREE.Group();
  scene.add(rack);
  let items = [];
  let offset = 0, vel = 0, target = null;

  function setItems(list) {
    for (const g of items) { rack.remove(g); g.userData.cloth.material.map?.dispose(); }
    items = list.map((it, i) => {
      const g = new THREE.Group();
      g.position.set(i * GAP, 1.1, 0);
      const h = hangerMesh(metal);
      h.position.y = -0.14;
      g.add(h);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.25), new THREE.MeshStandardMaterial({ map: garmentTexture(null, it.hex, it.title), transparent: true, roughness: 0.9, side: THREE.DoubleSide }));
      cloth.position.y = -0.98;
      g.add(cloth);
      g.userData = { item: it, cloth, swing: 0, swingV: 0, lift: 0 };
      rack.add(g);
      opt.imageData(it).then(loadImg).then((img) => { if (img && items.includes(g)) { cloth.material.map.dispose(); cloth.material.map = garmentTexture(img, it.hex, it.title); cloth.material.needsUpdate = true; } });
      return g;
    });
    offset = Math.floor((items.length - 1) / 2) * GAP;
    target = null;
  }
  const maxOff = () => Math.max(0, (items.length - 1) * GAP);

  // --- Gestes : glisser horizontalement = faire défiler ; vers le bas ou toucher = au miroir ---
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag = null;
  const ghost = document.createElement('img');
  ghost.className = 'wd-ghost';
  ghost.hidden = true;
  document.body.append(ghost);
  function hitAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(items.map((g) => g.userData.cloth), false)[0];
    return h ? items.find((g) => g.userData.cloth === h.object) : null;
  }
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', (e) => {
    drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, t: performance.now(), mode: null, g: hitAt(e) };
    el.setPointerCapture(e.pointerId);
    target = null;
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.mode && Math.hypot(dx, dy) > 8) drag.mode = Math.abs(dx) > Math.abs(dy) * 0.8 || !drag.g ? 'scroll' : 'lift';
    if (drag.mode === 'scroll') {
      const k = 3.2 / el.clientWidth;
      const d = (e.clientX - drag.x) * k;
      offset = Math.max(-0.4, Math.min(maxOff() + 0.4, offset - d));
      vel = -d / Math.max(1, performance.now() - drag.t) * 16;
      drag.t = performance.now();
      for (const g of items) g.userData.swingV += d * 0.6;
    } else if (drag.mode === 'lift') {
      drag.g.userData.lift = 1;
      const tex = drag.g.userData.cloth.material.map;
      if (ghost.hidden) { ghost.src = tex.image.toDataURL('image/png'); ghost.hidden = false; }
      ghost.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 75}px) rotate(${dx * 0.05}deg)`;
      const dz = opt.dropZone?.();
      dz?.classList.toggle('over', !!dz && inside(dz, e));
    }
    drag.x = e.clientX;
  });
  const inside = (node, e) => { const r = node.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  el.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const dz = opt.dropZone?.();
    if (drag.mode === 'lift') {
      drag.g.userData.lift = 0;
      ghost.hidden = true;
      dz?.classList.remove('over');
      if (dz && (inside(dz, e) || e.clientY - drag.y0 > 60)) opt.onPick(drag.g.userData.item);
    } else if (!drag.mode && drag.g) {
      // toucher : centrer le vêtement, puis l'envoyer au miroir s'il est déjà au centre
      const i = items.indexOf(drag.g);
      if (Math.abs(i * GAP - offset) < GAP / 2) opt.onPick(drag.g.userData.item);
      else target = i * GAP;
      drag.g.userData.swingV += 0.12;
    }
    drag = null;
  });
  el.addEventListener('wheel', (e) => { offset = Math.max(0, Math.min(maxOff(), offset + (e.deltaX || e.deltaY) * 0.004)); e.preventDefault(); }, { passive: false });

  let alive = true;
  const fit = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.8 ? 4.6 : w / h < 1.1 ? 4.1 : 3.7;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  renderer.setAnimationLoop(() => {
    if (!alive) return;
    if (!drag) {
      if (target != null) { offset += (target - offset) * 0.12; if (Math.abs(target - offset) < 0.002) target = null; }
      else {
        offset += vel; vel *= 0.92;
        // se cale sur le cintre le plus proche
        if (Math.abs(vel) < 0.004) { const snap = Math.round(offset / GAP) * GAP; offset += (Math.max(0, Math.min(maxOff(), snap)) - offset) * 0.1; }
      }
    }
    rack.position.x = -offset;
    camera.position.x = 0;
    for (const g of items) {
      const u = g.userData;
      // balancier amorti
      u.swingV += -u.swing * 0.08;
      u.swingV *= reduced ? 0.5 : 0.93;
      u.swing += u.swingV;
      g.rotation.z = Math.max(-0.5, Math.min(0.5, u.swing));
      const d = Math.abs(g.position.x - offset);
      const focus = Math.max(0, 1 - d / (GAP * 1.6));
      g.rotation.y = (g.position.x - offset) * -0.35;
      g.position.z = focus * 0.35 - u.lift * 0.2;
      u.cloth.material.opacity = u.lift ? 0.35 : 1;
    }
    renderer.render(scene, camera);
  });
  return {
    setItems,
    dispose() { alive = false; ghost.remove(); ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); },
  };
}
