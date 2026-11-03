// Visionneuse 3D des articles (modèles GLB) et « Voir chez moi » en réalité augmentée.
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);

// Charge un GLB depuis une URL ou un ArrayBuffer, centré et mis à l'échelle (1 unité ≈ hauteur de l'objet)
export async function loadModel(src) {
  const loader = new GLTFLoader();
  const gltf = typeof src === 'string' ? await loader.loadAsync(src) : await loader.parseAsync(src, '');
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const k = 1.6 / Math.max(size.x, size.y, size.z || 1);
  root.position.sub(center);
  const wrap = new THREE.Group();
  wrap.add(root);
  wrap.scale.setScalar(k);
  wrap.position.y = (size.y * k) / 2;
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material) o.material.side = THREE.FrontSide; } });
  return wrap;
}

/** Affiche un modèle dans un conteneur ; renvoie { dispose } */
export async function mountViewer(host, src, { background = null } = {}) {
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

  const model = await loadModel(src);
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

// ---------- Réalité augmentée ----------
const usdzCache = new Map();
/** Prépare le fichier USDZ (format AR d'Apple) à partir du modèle GLB. */
export async function prepareUSDZ(src, key) {
  if (usdzCache.has(key)) return usdzCache.get(key);
  const p = (async () => {
    const { USDZExporter } = await import('./vendor/USDZExporter.js');
    const model = await loadModel(src);
    const scene = new THREE.Scene();
    scene.add(model);
    // échelle réelle approximative : ~30 cm de haut
    model.scale.multiplyScalar(0.3 / 1.6);
    model.position.y = 0;
    model.updateMatrixWorld(true);
    const data = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true });
    return URL.createObjectURL(new Blob([data], { type: 'model/vnd.usdz+zip' }));
  })();
  usdzCache.set(key, p);
  return p;
}

/** Ouvre la réalité augmentée : AR Quick Look sur iPhone, Scene Viewer sur Android. */
export async function openAR({ src, publicUrl, key, title }) {
  if (isIOS()) {
    const href = await prepareUSDZ(src, key);
    const a = document.createElement('a');
    a.rel = 'ar';
    a.href = `${href}#allowsContentScaling=1`;
    a.append(document.createElement('img')); // AR Quick Look exige une image dans le lien
    document.body.append(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
    return true;
  }
  if (isAndroid() && publicUrl) {
    const u = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(publicUrl)}&mode=ar_preferred&title=${encodeURIComponent(title || '')}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;end;`;
    location.href = u;
    return true;
  }
  return false;
}
