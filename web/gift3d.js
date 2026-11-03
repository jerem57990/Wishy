// Ouverture de la liste partagée : un paquet cadeau 3D qui se déballe, puis la liste apparaît.
import * as THREE from './vendor/three.module.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const SUN = 0xffd21f, INK = 0x17171c, BERRY = 0xff4f81, SKY = 0x4f7cff, MINT = 0x0fae7b;

export function playGift({ title = '', onDone = () => {} } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gl;
  try { gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); } catch { gl = null; }
  if (reduced || !gl) { onDone(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'gift';
  overlay.innerHTML = `<div class="gift-text"><p>Une liste à découvrir</p><h2></h2><span class="gift-hint">Touche le paquet pour l'ouvrir</span></div><button class="gift-skip" type="button">Passer</button>`;
  overlay.querySelector('h2').textContent = title;
  document.body.append(overlay);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  overlay.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 2.2, 7.5);
  camera.lookAt(0, 0.6, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe9a0, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.002;
  scene.add(key);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.9;
  ground.receiveShadow = true;
  scene.add(ground);

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, ...o });
  const gift = new THREE.Group();
  scene.add(gift);
  // boîte
  const box = new THREE.Mesh(new RoundedBoxGeometry(2, 1.6, 2, 5, 0.08), mat(SUN, { roughness: 0.35 }));
  box.castShadow = true;
  gift.add(box);
  const ribbonMat = mat(INK, { roughness: 0.3 });
  const rib1 = new THREE.Mesh(new THREE.BoxGeometry(2.02, 1.62, 0.32), ribbonMat);
  const rib2 = rib1.clone(); rib2.rotation.y = Math.PI / 2;
  gift.add(rib1, rib2);
  // couvercle + nœud
  const lid = new THREE.Group();
  lid.position.y = 0.92;
  const lidMesh = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.4, 2.2, 5, 0.08), mat(SUN, { roughness: 0.35 }));
  lidMesh.castShadow = true;
  const lr1 = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.42, 0.34), ribbonMat);
  const lr2 = lr1.clone(); lr2.rotation.y = Math.PI / 2;
  lid.add(lidMesh, lr1, lr2);
  const loopGeo = new THREE.TorusGeometry(0.34, 0.1, 16, 40);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, ribbonMat);
    loop.position.set(0.32 * s, 0.42, 0);
    loop.rotation.set(0, 0, s * 0.5);
    loop.scale.set(1, 0.8, 0.6);
    loop.castShadow = true;
    lid.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), ribbonMat);
  knot.position.y = 0.3;
  lid.add(knot);
  gift.add(lid);
  gift.position.y = -0.1;
  gift.rotation.y = -0.5;

  // confettis
  const confetti = [];
  const cGeo = new THREE.PlaneGeometry(0.09, 0.16);
  const colors = [SUN, BERRY, SKY, MINT, 0xffffff, INK];
  function burst() {
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, roughness: 0.6 }));
      m.position.set((Math.random() - 0.5) * 1.2, 1.1, (Math.random() - 0.5) * 1.2);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3.5;
      m.userData = { v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 5 + Math.random() * 4, Math.sin(a) * sp * 0.6), r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) };
      scene.add(m);
      confetti.push(m);
    }
  }

  const fit = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w < h ? 13 : 8;
    camera.position.y = w < h ? 2.8 : 2.2;
    camera.lookAt(0, 0.4, 0);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', fit);
  fit();

  let opened = 0, phase = 'idle', finished = false, last = performance.now(), t = 0;
  const open = () => { if (phase !== 'idle') return; phase = 'open'; overlay.classList.add('opening'); burst(); navigator.vibrate?.(20); };
  const finish = () => {
    if (finished) return;
    finished = true;
    overlay.classList.add('done');
    setTimeout(() => { renderer.setAnimationLoop(null); renderer.dispose(); removeEventListener('resize', fit); overlay.remove(); }, 650);
    onDone();
  };
  overlay.addEventListener('click', (e) => { if (e.target.closest('.gift-skip')) return finish(); open(); });
  setTimeout(open, 2600); // s'ouvre tout seul si on ne touche pas

  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (phase === 'idle') {
      gift.position.y = -0.1 + Math.sin(t * 2) * 0.06;
      gift.rotation.y = -0.5 + Math.sin(t * 0.8) * 0.15;
      lid.position.y = 0.92 + Math.max(0, Math.sin(t * 6)) * 0.03; // petit frémissement
    } else {
      opened += dt;
      // le couvercle s'envole en tournant
      lid.position.y = 0.92 + opened * 6 - opened * opened * 2;
      lid.position.x = opened * 1.8;
      lid.rotation.z = -opened * 2.4;
      lid.rotation.x = opened * 1.2;
      gift.scale.setScalar(Math.max(0.001, 1 - Math.max(0, opened - 0.6) * 1.3));
      for (const c of confetti) {
        c.userData.v.y -= 9.8 * dt * 0.6;
        c.userData.v.multiplyScalar(0.985);
        c.position.addScaledVector(c.userData.v, dt);
        c.rotation.x += c.userData.r.x * dt; c.rotation.y += c.userData.r.y * dt; c.rotation.z += c.userData.r.z * dt;
      }
      if (opened > 1.5) finish();
    }
    renderer.render(scene, camera);
  });
}
