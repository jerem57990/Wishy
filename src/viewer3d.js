// Petite scène 3D sur socle jaune (aperçu du maillot floqué).
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Affiche un objet 3D dans un conteneur ; renvoie { dispose } */
export async function mountViewer(host, model, { background = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  camera.position.set(2.4, 1.5, 3.7);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xfff1c2, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0015;
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 15 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe7a3, 1);
  rim.position.set(-4, 2, -3);
  scene.add(rim);
  // socle jaune façon présentoir
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0xffd21f, roughness: 0.35 }));
  plinth.position.y = -0.04;
  plinth.receiveShadow = true;
  scene.add(plinth);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 7;
  controls.target.set(0, 0.7, 0);
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 1.6;
  renderer.domElement.addEventListener('pointerdown', () => (controls.autoRotate = false));

  model.scale.multiplyScalar(0.001);
  scene.add(model);
  const targetScale = model.scale.x * 1000;

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
  renderer.setAnimationLoop(() => {
    if (!alive) return;
    // petite apparition « pop » du modèle
    const s = model.scale.x + (targetScale - model.scale.x) * (reduced ? 1 : 0.12);
    model.scale.setScalar(s);
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    model,
    dispose() { alive = false; ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose(); renderer.domElement.remove(); },
  };
}

