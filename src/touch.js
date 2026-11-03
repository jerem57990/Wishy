// Petites touches tactiles : vibration légère et inclinaison du téléphone.

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let sw = null;

/**
 * Vibration légère. Android : navigator.vibrate. iPhone (iOS 18+) : Safari ne donne pas
 * accès au vibreur, mais basculer un interrupteur natif <input switch> déclenche un retour haptique.
 */
export function haptic(kind = 'light') {
  try {
    if (navigator.vibrate) { navigator.vibrate(kind === 'success' ? [12, 60, 18] : 10); return; }
    if (!isIOS) return;
    if (!sw) {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.append(input);
      document.body.append(label);
      sw = label;
    }
    sw.click();
    if (kind === 'success') setTimeout(() => sw.click(), 90);
  } catch (_) { /* pas de vibreur */ }
}

// ---------- Capteurs de mouvement ----------
const listeners = new Set();
const state = { tiltX: 0, tiltY: 0, gx: 0, gy: -1, shake: 0, enabled: false };
let lastAcc = null;

function onOrient(e) {
  if (e.beta == null) return;
  // beta : avant/arrière (90 = téléphone vertical) ; gamma : gauche/droite
  const portrait = !screen.orientation || /portrait/.test(screen.orientation.type);
  const b = portrait ? e.beta : e.gamma, g = portrait ? e.gamma : -e.beta;
  state.tiltX = Math.max(-1, Math.min(1, g / 35));
  state.tiltY = Math.max(-1, Math.min(1, (b - 55) / 35));
  emit();
}
function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  const portrait = !screen.orientation || /portrait/.test(screen.orientation.type);
  // gravité dans le repère de l'écran (x vers la droite, y vers le haut)
  const k = isIOS ? 1 : -1;
  const gx = (portrait ? a.x : a.y) * k, gy = (portrait ? a.y : -a.x) * k;
  const n = Math.hypot(gx, gy) || 1;
  state.gx = gx / Math.max(9.81, n);
  state.gy = gy / Math.max(9.81, n);
  if (lastAcc) {
    const d = Math.abs(a.x - lastAcc.x) + Math.abs(a.y - lastAcc.y) + Math.abs(a.z - lastAcc.z);
    if (d > 14) state.shake = Math.min(1, d / 40);
  }
  lastAcc = { x: a.x, y: a.y, z: a.z };
  emit();
}
function emit() { for (const f of listeners) f(state); state.shake = 0; }

function attach() {
  if (state.enabled) return;
  state.enabled = true;
  addEventListener('deviceorientation', onOrient);
  addEventListener('devicemotion', onMotion);
}

/** Vrai si l'iPhone demande une autorisation explicite pour les capteurs */
export const needsMotionPermission = () => typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && !state.enabled;
export const hasMotion = () => 'ondevicemotion' in window && matchMedia('(pointer: coarse)').matches;

/** À appeler depuis un geste (touche) sur iPhone */
export async function enableMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== 'granted') return false;
      if (DeviceOrientationEvent?.requestPermission) await DeviceOrientationEvent.requestPermission().catch(() => {});
    }
    attach();
    try { localStorage.setItem('wishy-motion', '1'); } catch (_) {}
    return true;
  } catch (_) { return false; }
}

/** S'abonne aux mouvements ; renvoie une fonction de désabonnement */
export function onMotionChange(fn) {
  listeners.add(fn);
  // Android et ordinateurs : pas d'autorisation à demander
  if (!needsMotionPermission()) attach();
  return () => listeners.delete(fn);
}

// Sur iPhone, l'autorisation déjà donnée reste valable : on la redemande au premier toucher
try {
  if (needsMotionPermission() && localStorage.getItem('wishy-motion')) {
    addEventListener('touchend', () => enableMotion(), { once: true });
  }
} catch (_) {}
export const motion = state;
