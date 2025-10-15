import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

/* --- make the page scrollable --- */
const SCREENS_TALL = 5;  // how long the glide is
const spacer = document.getElementById("scrollspace") || (() => {
  const d = document.createElement("div"); d.id = "scrollspace"; document.body.prepend(d); return d;
})();
spacer.style.height = `${SCREENS_TALL * 100}vh`;

/* --- scene / camera / renderer --- */
const scene = new THREE.Scene();
scene.background = new THREE.Color("dimgray");

// Flatter perspective view
const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.2, 120);
camera.position.set(0, 2.2, 7);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

/* --- parameters --- */
const NUM_LAYERS = 5;           // total layers
const VERTICAL_SPACING = 1.0;   // vertical distance between layers (along +Y downward)
const DEPTH_NUDGE = 0.02;       // tiny Z offset per layer to avoid z-fighting

const SIZE = { w: 3, h: 5 };    // plane size
const SEG  = { w: 160, h: 110 };// grid resolution

const AMP_TOP = 0.10;           // amplitude for first (top) layer
const AMP_BOTTOM = 0.85;        // amplitude for deepest layer

/* Fewer peaks: broader, smoother waves */
const FREQ = 0.34;              // lower = broader features (0.1–0.25 is calm)

/* Subtle horizontal tilt (not vertical spin) */
const TILT_X_DEG = 8;           // horizontal tilt (forward/back)
const TILT_Z_DEG = 3;           // slight diagonal skew
const POINT_SIZE = 0.02;        // particle size

// Camera travel equals stack height so we glide through it
const STACK_HEIGHT = (NUM_LAYERS - 1) * VERTICAL_SPACING;
const BASE_CAM_Y = camera.position.y;
const CAM_TRAVEL = STACK_HEIGHT;

/* --- helpers --- */
const simplex = new SimplexNoise();
// Robust wrapper to handle method name differences across three releases
const noise = (x, y) => {
  if (typeof simplex.noise3d === "function") return simplex.noise3d(x, y, 0);
  if (typeof simplex.noise3D === "function") return simplex.noise3D(x, y, 0);
  if (typeof simplex.noise2d === "function") return simplex.noise2d(x, y);
  if (typeof simplex.noise2D === "function") return simplex.noise2D(x, y);
  if (typeof simplex.noise === "function")  return simplex.noise(x, y, 0);
  throw new Error("No compatible SimplexNoise method found.");
};

const lerp    = (a,b,t) => a + (b-a)*t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* --- build static layers (no time animation) --- */
const group = new THREE.Group();
scene.add(group);

const layers = [];
for (let i = 0; i < NUM_LAYERS; i++) {
  const tDepth = NUM_LAYERS === 1 ? 0 : i / (NUM_LAYERS - 1);
  const amplitude = lerp(AMP_TOP, AMP_BOTTOM, tDepth);

  const geo = new THREE.PlaneGeometry(SIZE.w, SIZE.h, SEG.w, SEG.h);
  const pos = geo.getAttribute("position");

  // per-layer offsets so patterns differ
  const ox = Math.cos(i * 1.618) * 10.0;
  const oy = Math.sin(i * 2.414) * 10.0;

  // STATIC displacement (no time)
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    const y = pos.getY(k);

    // base noise
    const n = noise(x * FREQ + ox, y * FREQ + oy);

    // soften crests/valleys (smoother, fewer sharp peaks)
    const soft = Math.tanh(n * 0.9);

    const z = amplitude * soft;
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

  // Start as a horizontal “water” surface…
  pts.rotation.x = -Math.PI / 2;

  // …then add a small HORIZONTAL tilt (forward/back), NOT a vertical spin
  pts.rotation.x += THREE.MathUtils.degToRad(TILT_X_DEG);

  // Optional slight diagonal skew for depth feel
  pts.rotation.z = THREE.MathUtils.degToRad(TILT_Z_DEG);

  // Stack layers downward (+Y down the screen in our camera setup)
  pts.position.y = -i * VERTICAL_SPACING;

  // Tiny Z nudge per layer to avoid z-fighting
  pts.position.z = -i * DEPTH_NUDGE;

  group.add(pts);
  layers.push({ idx: i, pts, y: pts.position.y });
}

/* --- scroll → camera glide + proximity-based opacity (see several layers at once) --- */
let scrollProgress = 0;
const updateScrollProgress = () => {
  const doc = document.documentElement;
  const max = Math.max(1, doc.scrollHeight - innerHeight);
  scrollProgress = clamp01(scrollY / max);
};

function updateCameraAndOpacity() {
  // Glide the camera down the stack
  const camY = BASE_CAM_Y - scrollProgress * CAM_TRAVEL;
  camera.position.y = camY;
  camera.lookAt(0, camY - 0.5, 0);

  // Opacity falls off with vertical distance from camera
  const windowWidth = 1.6;   // larger => more layers visible at once
  layers.forEach(({ pts, y }) => {
    const d = Math.abs(y - camY);
    let vis = 1.0 - (d / windowWidth);
    vis = clamp01(vis);
    // smooth the edges (smoothstep)
    vis = vis * vis * (3 - 2 * vis);

    // gentle depth fade so far layers are a bit dimmer
    const depthFade = 1.0 - (Math.abs(y) / (STACK_HEIGHT + 0.0001)) * 0.35;

    pts.material.opacity = clamp01(vis * 0.95 * depthFade);
    pts.visible = pts.material.opacity > 0.01;
  });
}

/* --- render on demand --- */
function render(){ renderer.render(scene, camera); }
function updateAndRender(){
  updateScrollProgress();
  updateCameraAndOpacity();
  render();
}

// initial frame
updateAndRender();

/* --- events --- */
addEventListener("scroll", () => { updateAndRender(); }, { passive: true });
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  render();
});
