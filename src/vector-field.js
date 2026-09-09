import * as THREE from 'three';
import { velocityAt } from './flow.js';

const UP = new THREE.Vector3(0, 1, 0);

export function createVectorField() {
  const samples = [];
  // Keep the total glyph count modest, but spend more of it near the axis.
  // Equal angular counts make outer rings look denser because their arrows
  // spread across a larger circumference; this inverse distribution corrects
  // that and gives the concentrating core a little more visual weight.
  const rings = [
    { radius: 0.48, angles: 12 },
    { radius: 1.12, angles: 9 },
    { radius: 2.05, angles: 6 },
    { radius: 3.15, angles: 5 },
  ];
  const heights = [-3.9, -1.9, -0.42, 0.42, 1.9, 3.9];
  for (let layer = 0; layer < heights.length; layer++) {
    for (let ring = 0; ring < rings.length; ring++) {
      for (let index = 0; index < rings[ring].angles; index++) {
        const angle = index / rings[ring].angles * Math.PI * 2 + layer * 0.29 + ring * 0.17;
        samples.push({ radius: rings[ring].radius, height: heights[layer], angle });
      }
    }
  }

  const material = new THREE.MeshBasicMaterial({
    color: '#9bc4b8', transparent: true, opacity: 0.27,
    depthWrite: false, toneMapped: false,
  });
  const dimColor = new THREE.Color('#55716a');
  const brightColor = new THREE.Color('#b6ddd2');
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 5), material, samples.length);
  const heads = new THREE.InstancedMesh(new THREE.ConeGeometry(0.027, 0.09, 6), material, samples.length);
  shafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shafts.frustumCulled = false;
  heads.frustumCulled = false;

  const group = new THREE.Group();
  group.name = '3D velocity field';
  group.add(shafts, heads);
  group.visible = false;

  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const shaftCenter = new THREE.Vector3();
  const headCenter = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const diagnostic = [];
  let currentTime = Number.NaN;
  let currentStrength = Number.NaN;

  function update(time, strength, force = false) {
    if (!force && time === currentTime && strength === currentStrength) return;
    currentTime = time;
    currentStrength = strength;
    const strengthRatio = THREE.MathUtils.clamp(strength / 1.7, 0, 1);
    material.opacity = strengthRatio === 0 ? 0 : 0.1 + 0.28 * Math.sqrt(strengthRatio);
    material.color.copy(dimColor).lerp(brightColor, strengthRatio);
    diagnostic.length = 0;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      position.set(
        sample.radius * Math.cos(sample.angle),
        sample.height,
        sample.radius * Math.sin(sample.angle),
      );
      const velocity = velocityAt(position.x, position.y, position.z, time).map((component) => component * strength);
      const magnitude = Math.hypot(...velocity);
      direction.set(...velocity);
      if (magnitude > 1e-8) direction.multiplyScalar(1 / magnitude);
      else direction.set(0, 0, 0);
      quaternion.setFromUnitVectors(UP, direction);

      // A wider, capped length range makes the increasing velocity visible
      // without allowing any arrow to dominate the strand rendering.
      const length = magnitude > 1e-8 ? 0.035 + 0.39 * (1 - Math.exp(-0.22 * magnitude)) : 0;
      const glyphScale = magnitude > 1e-8 ? 1 : 0;
      const headLength = 0.075 * glyphScale;
      const shaftLength = length - headLength;
      const startOffset = -length * 0.5;
      shaftCenter.copy(position).addScaledVector(direction, startOffset + shaftLength * 0.5);
      headCenter.copy(position).addScaledVector(direction, startOffset + shaftLength + headLength * 0.5);
      scale.set(glyphScale, shaftLength, glyphScale);
      matrix.compose(shaftCenter, quaternion, scale);
      shafts.setMatrixAt(index, matrix);
      scale.set(glyphScale, headLength / 0.09, glyphScale);
      matrix.compose(headCenter, quaternion, scale);
      heads.setMatrixAt(index, matrix);
      if (index < 4) diagnostic.push({ position: position.toArray(), direction: direction.toArray(), velocity, length });
    }
    shafts.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  function setVisible(visible, time, strength) {
    group.visible = visible;
    if (visible) update(time, strength, true);
  }

  function sampleVectors() {
    return diagnostic.map((sample) => ({
      position: [...sample.position], direction: [...sample.direction], velocity: [...sample.velocity],
      length: sample.length, opacity: material.opacity,
    }));
  }

  update(0, 0, true);
  return { group, update, setVisible, sampleVectors, arrowCount: samples.length };
}
