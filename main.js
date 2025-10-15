// Full animated multi-layer waves (slower + depth-slowdown + amplitude-compensation)

import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

/* --- scrollable page --- */
const SCREENS_TALL = 5;
const spacer = document.getElementById("scrollspace") || (() => {
  const d = document.createElement("div"); d.id = "scrollspace"; document.body.prepend(d); return d;
})();
spacer.style.height = `${SCREENS_TALL * 100}vh`;

/* --- scene / camera / renderer --- */
const scene = new THREE.Scene();
scene.background = new THREE.Color("dimgray");

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.2, 120);
camera.position.set(0, 2.2, 7);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

/* --- parameters --- */
const NUM_LAYERS        = 6;
const VERTICAL_SPACING  = 1.0;
const DEPTH_NUDGE       = 0.02;

const SIZE              = { w: 4, h: 5 };
const SEG               = { w: 300, h: 96 };

const AMP_TOP           = 0.12;
const AMP_BOTTOM        = 0.9;
const FEATURE_SIZE      = 8.0;              // bigger = broader features
const FREQ              = 1.0 / FEATURE_SIZE;

const TILT_X_DEG        = 8;                // horizontal tilt
const TILT_Z_DEG        = 2.5;
const POINT_SIZE        = 0.02;

/* --- Animation speed controls (the important knobs) --- */
const ANIM_BASE_SPEED         = 0.08;       // ↓ overall speed (try 0.05–0.12)
const DEPTH_SLOWDOWN          = 0.75;       // 0..1: how much to slow deepest layer (0=no slow, 1=slow a lot)
const AMPLITUDE_MOTION_COUPLING = 0.9;      // 0..∞: reduce speed as amplitude grows (0 = no compensation)
const TIME_SCALE              = 1.0;

const STACK_HEIGHT      = (NUM_LAYERS - 1) * VERTICAL_SPACING;
const BASE_CAM_Y        = camera.position.y;
const CAM_TRAVEL        = STACK_HEIGHT;

/* --- Simplex helpers --- */
const simplex = new SimplexNoise();
const noise3 = (x, y, z) => {
  if (typeof simplex.noise3d === "function") return simplex.noise3d(x, y, z);
  if (typeof simplex.noise3D === "function") return simplex.noise3D(x, y, z);
  if (typeof simplex.noise === "function")  return simplex.noise(x, y, z);
  if (typeof simplex.noise2d === "function") return simplex.noise2d(x + z * 0.7, y + z * 0.4);
  if (typeof simplex.noise2D === "function") return simplex.noise2D(x + z * 0.7, y + z * 0.4);
  throw new Error("No compatible SimplexNoise method found.");
};
const lerp = (a,b,t) => a + (b-a)*t;
const clamp01 = v => Math.max(0, Math.min(1, v));

/* --- build layers --- */
const group = new THREE.Group();
scene.add(group);

const layers = [];
for (let i = 0; i < NUM_LAYERS; i++) {
  const depthT    = NUM_LAYERS === 1 ? 0 : i / (NUM_LAYERS - 1);
  const amplitude = lerp(AMP_TOP, AMP_BOTTOM, depthT);

  const geo = new THREE.PlaneGeometry(SIZE.w, SIZE.h, SEG.w, SEG.h);
  const pos = geo.getAttribute("position");

  const baseX = new Float32Array(pos.count);
  const baseY = new Float32Array(pos.count);
  for (let k = 0; k < pos.count; k++) {
    baseX[k] = pos.getX(k);
    baseY[k] = pos.getY(k);
  }

  const ox = Math.cos(i * 1.618) * 10.0;
  const oy = Math.sin(i * 2.414) * 10.0;
  const phase = i * 123.456;

  // initial Z (t = 0) with soft crests
  for (let k = 0; k < pos.count; k++) {
    const x = baseX[k], y = baseY[k];
    const n  = noise3(x * FREQ + ox, y * FREQ + oy, 0.0);
    const z  = amplitude * Math.tanh(n * 0.95);
    pos.setZ(k, z);
  }
  pos.needsUpdate = true;

  const mat = new THREE.PointsMaterial({
    size: POINT_SIZE,
    color: 0xffffff,
    transparent: true,
    opacity: 0.0
  });

  const pts = new THREE.Points(geo, mat);
  pts.rotation.x = -Math.PI / 2 + THREE.MathUtils.degToRad(TILT_X_DEG);
  pts.rotation.z = THREE.MathUtils.degToRad(TILT_Z_DEG);
  pts.position.y = -i * VERTICAL_SPACING;
  pts.position.z = -i * DEPTH_NUDGE;

  group.add(pts);

  // Precompute per-layer speed (deeper = slower)
  // base speed * (1 - depthT * DEPTH_SLOWDOWN)  → deepest layer = base*(1-DEPTH_SLOWDOWN)
  const depthSpeed = ANIM_BASE_SPEED * (1 - depthT * DEPTH_SLOWDOWN);

  // Compensate speed for amplitude (bigger waves look faster → damp them)
  const ampDamp = 1.0 / (1.0 + amplitude * AMPLITUDE_MOTION_COUPLING);

  layers.push({
    idx: i,
    pts, pos, baseX, baseY,
    amplitude, ox, oy, phase,
    layerSpeed: Math.max(0.0001, depthSpeed) * ampDamp
  });
}

/* --- scroll → camera glide + proximity-based opacity --- */
let scrollProgress = 0;
const updateScrollProgress = () => {
  const doc = document.documentElement;
  const max = Math.max(1, doc.scrollHeight - innerHeight);
  scrollProgress = clamp01(scrollY / max);
};

function updateCameraAndOpacity() {
  const camY = BASE_CAM_Y - scrollProgress * CAM_TRAVEL;
  camera.position.y = camY;
  camera.lookAt(0, camY - 0.5, 0);

  const windowWidth = 1.6;
  layers.forEach(({ pts }) => {
    const y = pts.position.y;
    const d = Math.abs(y - camY);
    let vis = 1.0 - (d / windowWidth);
    vis = clamp01(vis);
    vis = vis * vis * (3 - 2 * vis);
    const depthFade = 1.0 - (Math.abs(y) / (STACK_HEIGHT + 0.0001)) * 0.35;
    pts.material.opacity = clamp01(vis * 0.95 * depthFade);
    pts.visible = pts.material.opacity > 0.01;
  });
}

/* --- animate --- */
let startMs = performance.now();
renderer.setAnimationLoop(() => {
  const nowMs = performance.now();
  const t = ((nowMs - startMs) / 1000) * TIME_SCALE;

  updateScrollProgress();
  updateCameraAndOpacity();

  for (let i = 0; i < layers.length; i++) {
    const L = layers[i];
    const { pos, baseX, baseY, amplitude, ox, oy, phase, pts, layerSpeed } = L;
    if (!pts.visible) continue;

    // Slower per-layer time
    const tt = t * layerSpeed + phase * 0.001;

    for (let k = 0; k < pos.count; k++) {
      const x = baseX[k], y = baseY[k];
      const n  = noise3(x * FREQ + ox, y * FREQ + oy, tt);
      const z  = amplitude * Math.tanh(n * 0.95);
      pos.setZ(k, z);
    }
    pos.needsUpdate = true;
  }

  renderer.render(scene, camera);
});

/* --- resize --- */
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
