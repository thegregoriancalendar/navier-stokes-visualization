import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createVortex, axialDisplayScale } from './vortex.js';
import { createVectorField } from './vector-field.js';
import { DURATION, flowClock, flowRate, sourceScale } from './flow.js';

const $ = (id) => document.getElementById(id);
const container = $('scene');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { progress: 0, flow: 0, playing: !reducedMotion, speed: 1, stage: -1, interacting: false, vectorFieldVisible: false };
const scene = new THREE.Scene();
scene.background = new THREE.Color('#080a0c');
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
} catch {
  $('loading').textContent = 'This visualization needs WebGL. Try opening it in a browser with graphics acceleration enabled.';
  $('loading').style.maxWidth = '300px';
  $('loading').style.lineHeight = '1.8';
  $('play').disabled = true;
  throw new Error('WebGL is unavailable.');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
container.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-hidden', 'true');

scene.add(new THREE.AmbientLight('#ffffff', 0.42));
scene.add(new THREE.HemisphereLight('#ffffff', '#52657a', 0.85));
const key = new THREE.DirectionalLight('#fff5e8', 2.3);
key.position.set(-5, 8, 7);
scene.add(key);
const fill = new THREE.DirectionalLight('#c0e7ff', 0.7);
fill.position.set(6, 0, -4);
scene.add(fill);
const rim = new THREE.DirectionalLight('#ffffff', 0.95);
rim.position.set(-2, -6, -3);
scene.add(rim);

const vortex = createVortex();
const { mesh, strandCount } = vortex;
scene.add(mesh);
const vectorField = createVectorField();
scene.add(vectorField.group);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 9;
controls.maxDistance = 30;
controls.minPolarAngle = 0.22;
controls.maxPolarAngle = Math.PI - 0.22;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.6;
controls.addEventListener('start', () => { state.interacting = true; });
controls.addEventListener('end', () => { state.interacting = false; });

let smallScreen = false;
function resetCamera() {
  // Drain orbit inertia before resetting, so the camera stays at its home view.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  camera.position.set(9.1, 5.1, 15.2).multiplyScalar(smallScreen ? 1.09 : 0.96);
  controls.target.set(0, 0.0, 0);
  controls.update();
  controls.enableDamping = damping;
}
function resize() {
  const { width, height } = container.getBoundingClientRect();
  const nextSmall = window.innerWidth <= 680;
  const changed = nextSmall !== smallScreen;
  smallScreen = nextSmall;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  // Keep the reference composition beside the editorial text on desktop.
  camera.setViewOffset(width, height, smallScreen ? 0 : -width * 0.108, 0, width, height);
  camera.updateProjectionMatrix();
  if (changed) resetCamera();
}
resize();
resetCamera();
new ResizeObserver(resize).observe(container);

const stages = [
  { title: 'Smooth forcing starts the flow', description: 'A smooth external force accelerates fluid from rest.<br />The first material trajectories become visible.' },
  { title: 'Radial inflow feeds the axis', description: 'Fluid moves inward toward the rotating core.<br />Incompressibility redirects it axially.' },
  { title: 'Vortex stretching spins it faster', description: 'Axial strain lengthens vortex lines.<br />The narrowing core amplifies rotation.' },
  { title: 'The velocity scale diverges', description: 'Similarity lengths shrink as peak speed grows.<br />The display stops short of the formal blow-up time.' },
];
const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6z" fill="currentColor"/></svg>';
const pauseIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zm5 0h3v12h-3z" fill="currentColor"/></svg>';
const replayIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 6a6 6 0 1 1-1 6M5 2v4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function updatePlayButton() {
  const ended = state.progress >= 1;
  $('play').innerHTML = ended ? replayIcon : state.playing ? pauseIcon : playIcon;
  $('play').setAttribute('aria-label', ended ? 'Replay animation' : state.playing ? 'Pause animation' : 'Play animation');
}
function syncProgress() {
  const percentage = Math.round(state.progress * 100);
  const stage = state.progress < 0.18 ? 0 : state.progress < 0.45 ? 1 : state.progress < 0.72 ? 2 : 3;
  $('evolution').value = Math.round(state.progress * 1000);
  $('evolution').style.setProperty('--progress', `${percentage}%`);
  $('evolution').setAttribute('aria-valuetext', `${percentage} percent, ${stages[stage].title}`);
  $('progress-label').textContent = `${String(percentage).padStart(2, '0')}%`;
  state.flow = flowClock(state.progress);
  vortex.update(state.flow);
  if (state.vectorFieldVisible) vectorField.update(state.flow, flowRate(state.progress));
  if (stage !== state.stage) {
    state.stage = stage;
    $('stage-number').textContent = `0${stage + 1} / 04`;
    $('stage-title').textContent = stages[stage].title;
    $('stage-description').innerHTML = stages[stage].description;
  }
}
function replay() {
  state.progress = 0;
  state.flow = 0;
  state.playing = true;
  syncProgress();
  updatePlayButton();
}
function togglePlay() {
  if (state.progress >= 1) return replay();
  state.playing = !state.playing;
  updatePlayButton();
}
$('play').addEventListener('click', togglePlay);
$('replay').addEventListener('click', replay);
$('evolution').addEventListener('input', (event) => {
  state.progress = Number(event.target.value) / 1000;
  state.playing = false;
  syncProgress();
  updatePlayButton();
});
const speeds = [0.5, 1, 2];
$('speed').addEventListener('click', () => {
  state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length];
  $('speed').textContent = `${state.speed}×`;
  $('speed').setAttribute('aria-label', `Playback speed: ${state.speed} times`);
});
$('reset-view').addEventListener('click', resetCamera);
$('vector-field').addEventListener('click', () => {
  state.vectorFieldVisible = !state.vectorFieldVisible;
  vectorField.setVisible(state.vectorFieldVisible, state.flow, flowRate(state.progress));
  const action = state.vectorFieldVisible ? 'Hide' : 'Show';
  $('vector-field').setAttribute('aria-pressed', String(state.vectorFieldVisible));
  $('vector-field').setAttribute('aria-label', `${action} 3D vector field`);
  $('vector-field').title = `${action} 3D vector field`;
});
let toastTimeout;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2400);
}
$('save-image').addEventListener('click', () => {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) return toast('Could not save this frame. Please try again.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vortex-study-${Math.round(state.progress * 100)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Image saved');
  }, 'image/png');
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast('Full screen is not available in this browser.'); }
});
document.addEventListener('fullscreenchange', () => {
  $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit full screen' : 'Enter full screen');
});
const dialog = $('about-dialog');
let playingBeforeDialog = false;
$('about-button').addEventListener('click', () => {
  playingBeforeDialog = state.playing;
  state.playing = false;
  updatePlayButton();
  dialog.showModal();
});
$('close-about').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
dialog.addEventListener('close', () => { state.playing = playingBeforeDialog && state.progress < 1; updatePlayButton(); });
window.addEventListener('keydown', (event) => {
  if (dialog.open || ['INPUT', 'BUTTON', 'A'].includes(document.activeElement.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.key.toLowerCase() === 'r') replay();
});

const labelPosition = new THREE.Vector3();
function positionLabel(id, x, y, z, offsetX, offsetY, flipped = false) {
  const el = $(id);
  const [radial] = sourceScale(state.flow);
  const axial = axialDisplayScale(state.flow);
  labelPosition.set(x * radial, y * axial, z * radial).project(camera);
  const width = container.clientWidth;
  const height = container.clientHeight;
  const px = (labelPosition.x * 0.5 + 0.5) * width + offsetX;
  const py = (-labelPosition.y * 0.5 + 0.5) * height + offsetY;
  el.style.transform = `translate(${px}px, ${py}px)`;
  el.classList.toggle('flipped', flipped);
  el.style.opacity = px < width * 0.28 || px > width - 125 || py < 12 || py > height - 60 ? '0' : '1';
}
function updateLabels() {
  if (smallScreen) return;
  positionLabel('inward-label', 3.3, 0.06, 0.1, 22, 12, true);
  positionLabel('axial-label', 0.4, 3.48, 0, 28, -12, true);
  positionLabel('core-label', -0.4, -2.4, 0, -160, 6);
}

function positionEquation(id, leaderId, x, y, z, calloutY, side = 'right') {
  const callout = $(id);
  const leader = $(leaderId);
  const [radial] = sourceScale(state.flow);
  const axial = axialDisplayScale(state.flow);
  labelPosition.set(x * radial, y * axial, z * radial).project(camera);
  const width = container.clientWidth;
  const height = container.clientHeight;
  const anchorX = (labelPosition.x * 0.5 + 0.5) * width;
  const anchorY = (-labelPosition.y * 0.5 + 0.5) * height;
  // Equation copy lives in a clear screen-space rail. Only the hairline leader
  // enters the rendered volume, so no lettering can sit over a streamline.
  const calloutX = side === 'left'
    ? (smallScreen ? 16 : Math.max(300, width * 0.27))
    : width - callout.offsetWidth - (smallScreen ? 16 : 34);
  callout.style.transform = `translate(${calloutX}px, ${calloutY}px)`;
  const connectionX = side === 'left' ? calloutX + callout.offsetWidth + 8 : calloutX - 8;
  const connectionY = calloutY + callout.offsetHeight * 0.48;
  const dx = connectionX - anchorX;
  const dy = connectionY - anchorY;
  leader.style.width = `${Math.hypot(dx, dy)}px`;
  leader.style.transform = `translate(${anchorX}px, ${anchorY}px) rotate(${Math.atan2(dy, dx)}rad)`;
}

function updateEquationCallouts() {
  if (smallScreen) {
    positionEquation('equation-motion', 'leader-motion', 0.45, 2.5, 0, -30, 'right');
    positionEquation('equation-core', 'leader-core', 2.45, 0.05, 0, 140, 'right');
    positionEquation('equation-blowup', 'leader-blowup', -0.25, -2.05, 0, container.clientHeight - 140, 'left');
    return;
  }
  positionEquation('equation-motion', 'leader-motion', 0.4, 2.65, 0, 34);
  positionEquation('equation-core', 'leader-core', 2.7, 0.05, 0, Math.min(350, container.clientHeight * 0.44));
  positionEquation('equation-blowup', 'leader-blowup', -0.3, -2.25, 0, container.clientHeight - 151, 'left');
}

let lastTime;
let lastUi = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = lastTime === undefined ? 0 : Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (document.hidden) return;
  if (state.playing) {
    state.progress = Math.min(1, state.progress + dt * state.speed / DURATION);
    state.flow = flowClock(state.progress);
    vortex.update(state.flow);
    if (state.vectorFieldVisible) vectorField.update(state.flow, flowRate(state.progress));
    if (state.progress >= 1) { state.playing = false; updatePlayButton(); }
    if (now - lastUi > 40 || !state.playing) { syncProgress(); lastUi = now; }
  }
  controls.update();
  updateLabels();
  updateEquationCallouts();
  renderer.render(scene, camera);
}
document.addEventListener('visibilitychange', () => { lastTime = undefined; });
syncProgress();
updatePlayButton();
renderer.render(scene, camera);
$('loading').classList.add('loaded');
document.documentElement.dataset.ready = 'true';
// Read-only diagnostic state for smoke checks and reproducible screenshots.
window.vortexStudy = { getState: () => ({ ...state, scale: mesh.scale.toArray(), sourceScale: sourceScale(state.flow), strandCount, activeStrands: vortex.activeCount(), particles: vortex.sampleParticles(), trails: vortex.sampleTrails(), geometryVersion: mesh.geometry.attributes.position.version, vectorFieldVisible: vectorField.group.visible, arrowCount: vectorField.arrowCount, vectors: vectorField.sampleVectors(), camera: camera.position.toArray(), triangles: renderer.info.render.triangles }) };
requestAnimationFrame(animate);
