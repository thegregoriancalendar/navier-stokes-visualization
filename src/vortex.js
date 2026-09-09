import * as THREE from 'three';
import { STRAIN, ROTATION, CORE, CORE_DECAY, MAX_FLOW_TIME, WARMUP_FLOW_TIME, sourceScale, velocityAt } from './flow.js';

const SEGMENTS = 144;
const SIDES = 6;
const POINTS = SEGMENTS + 1;
const RELATIVE_STRAIN = STRAIN - CORE_DECAY;
const ANGLE_GAIN = ROTATION / (2 * RELATIVE_STRAIN);

export function trailWindow(age, duration) {
  return [Math.max(0, age - duration), age];
}

// A widening observation window follows axial outflow farther as it develops.
// This is the extent of displayed particle paths, not the paper's core scale.
export function axialDisplayScale(time) {
  return 0.68 + 0.62 * THREE.MathUtils.clamp(time / MAX_FLOW_TIME, 0, 1);
}

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createVortex() {
  const rand = random(91265);
  const strands = [];
  for (const sign of [-1, 1]) {
    for (let n = 0; n < 72; n++) {
      // Axial-focused seeds trade some crowded outer-disk trajectories for
      // paths that enter the rotating core earlier and remain visible aloft.
      const axialFocused = n % 3 === 0;
      const height = axialFocused ? 0.105 + rand() * 0.075 : 0.066 + rand() * 0.084;
      strands.push({
        radius: axialFocused ? 1.5 + rand() * 0.9 : 2.75 + rand() * 1.0,
        height: sign * height,
        angle: n * 2.3999632297 + rand() * 0.4 + (sign === -1 ? 0.31 : 0),
        width: (axialFocused ? 0.029 : 0.021) + rand() ** 2 * 0.025,
        trailDuration: 6.25 + rand() * 0.65,
        seed: rand(),
        // Staggered birth times populate the first frame with all flow stages.
        phase: ((n + 0.35) / 72 + (sign === -1 ? 0.137 : 0)) % 1,
        lifetime: Math.log((3.7 + rand() * 0.55) / height) / (2 * STRAIN),
        age: 0, cycle: 0, birthTime: 0,
      });
    }
  }

  for (const strand of strands) {
    const baseLifetime = strand.lifetime;
    const baseExitHeight = Math.abs(strand.height) * Math.exp(2 * STRAIN * baseLifetime);
    let birthTime = WARMUP_FLOW_TIME - strand.phase * baseLifetime;
    strand.releases = [];
    while (birthTime <= MAX_FLOW_TIME) {
      const exitHeight = baseExitHeight * axialDisplayScale(birthTime + baseLifetime);
      const initialHeight = Math.abs(strand.height) * sourceScale(birthTime)[1];
      const lifetime = Math.log(exitHeight / initialHeight) / (2 * STRAIN);
      strand.releases.push({ birthTime, lifetime });
      birthTime += lifetime;
    }
  }

  const count = strands.length * POINTS * SIDES;
  const centers = new Float64Array(strands.length * POINTS * 3);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const angular = new Float32Array(count);
  const seeds = new Float32Array(count);
  const indices = new Uint32Array(strands.length * SEGMENTS * SIDES * 6);
  const fractions = new Float64Array(POINTS);
  const tapers = new Float64Array(POINTS);
  const circleCos = new Float64Array(SIDES);
  const circleSin = new Float64Array(SIDES);
  for (let point = 0; point < POINTS; point++) {
    const f = point / SEGMENTS;
    fractions[point] = f;
    tapers[point] = Math.max(0.01, Math.sqrt(THREE.MathUtils.smoothstep(f, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(f, 0.96, 1))));
  }
  for (let side = 0; side < SIDES; side++) {
    circleCos[side] = Math.cos(side / SIDES * Math.PI * 2);
    circleSin[side] = Math.sin(side / SIDES * Math.PI * 2);
  }
  let index = 0;
  for (let strand = 0; strand < strands.length; strand++) {
    const start = strand * POINTS * SIDES;
    seeds.fill(strands[strand].seed, start, start + POINTS * SIDES);
    for (let step = 0; step < SEGMENTS; step++) {
      for (let side = 0; side < SIDES; side++) {
        const a = start + step * SIDES + side;
        const b = start + step * SIDES + (side + 1) % SIDES;
        const c = a + SIDES;
        const d = b + SIDES;
        indices[index++] = a; indices[index++] = b; indices[index++] = c;
        indices[index++] = b; indices[index++] = d; indices[index++] = c;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aAngular', new THREE.BufferAttribute(angular, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);

  const color = (hex) => {
    const c = new THREE.Color(hex);
    return 'vec3(' + [c.r, c.g, c.b].map(v => v.toFixed(6)).join(',') + ')';
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.13, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute float aAngular; attribute float aSeed;\nvarying float vAngular; varying float vSeed;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAngular = aAngular; vSeed = aSeed;');
    shader.fragmentShader = [
      'varying float vAngular; varying float vSeed;',
      'vec3 vortexPalette(float x) {',
      'vec3 teal = ' + color('#82bdb0') + '; vec3 cyan = ' + color('#48b3bd') + ';',
      'vec3 blue = ' + color('#416bad') + '; vec3 ochre = ' + color('#b2a087') + '; vec3 orange = ' + color('#dca064') + ';',
      'if (x < 0.14) return mix(teal, cyan, smoothstep(0.03, 0.14, x));',
      'if (x < 0.36) return mix(cyan, blue, smoothstep(0.14, 0.36, x));',
      'if (x < 0.56) return mix(blue, ochre, smoothstep(0.36, 0.56, x));',
      'return mix(ochre, orange, smoothstep(0.56, 0.86, x));',
      '}', shader.fragmentShader,
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb = vortexPalette(clamp(vAngular, 0.0, 1.0)) * (0.88 + 0.12 * vSeed);');
  };
  const mesh = new THREE.Mesh(geometry, material);
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const center = [0, 0, 0];
  let currentTime = Number.NaN;
  let diagnosticIndices;

  function update(time) {
    if (time === currentTime) return;
    currentTime = time;
    const coreSquared = (CORE * Math.exp(-CORE_DECAY * time)) ** 2;
    for (let strandIndex = 0; strandIndex < strands.length; strandIndex++) {
      const strand = strands[strandIndex];
      // Release times are precomputed: longer later lifetimes must not shift an
      // existing particle's birth time or change its physical tip velocity.
      strand.cycle = strand.releases.findLastIndex((release) => release.birthTime <= time);
      strand.active = strand.cycle >= 0;
      const release = strand.releases[Math.max(0, strand.cycle)];
      strand.birthTime = strand.active ? release.birthTime : time;
      strand.age = strand.active ? time - release.birthTime : 0;
      strand.lifetime = release.lifetime;
      const [radialSource, axialSource] = sourceScale(strand.birthTime);
      const radius = strand.radius * radialSource;
      const height = strand.height * axialSource;
      const angle = strand.angle + strand.birthTime * 0.27;
      const coreAtBirth = CORE * Math.exp(-CORE_DECAY * strand.birthTime);
      const radialRatio = (radius / coreAtBirth) ** 2;
      const [oldestAge, newestAge] = trailWindow(strand.age, strand.trailDuration);
      const historySpan = newestAge - oldestAge;
      const start = strandIndex * POINTS * 3;
      // A trail is born at one point. Its head follows the exact trajectory;
      // history fills in behind it. Once full, both history bounds advance.
      for (let point = 0; point < POINTS; point++) {
        const sampleAge = oldestAge + historySpan * fractions[point];
        const radialScale = Math.exp(-STRAIN * sampleAge);
        const axialScale = Math.exp(2 * STRAIN * sampleAge);
        const angleGrowth = Math.expm1(2 * RELATIVE_STRAIN * sampleAge);
        const sampleAngle = angle + ANGLE_GAIN * Math.log1p(angleGrowth / (1 + radialRatio));
        const sampleRadius = radius * radialScale;
        center[0] = sampleRadius * Math.cos(sampleAngle);
        center[1] = height * axialScale;
        center[2] = sampleRadius * Math.sin(sampleAngle);
        const offset = start + point * 3;
        centers[offset] = center[0]; centers[offset + 1] = center[1]; centers[offset + 2] = center[2];
      }
      const growIn = THREE.MathUtils.smoothstep(strand.age, 0, 0.22);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(strand.age, strand.lifetime - 0.9, strand.lifetime);
      const widthScale = strand.active ? Math.sqrt(growIn * fadeOut) : 0;
      // Rebuild tube glyphs around the actual advected centerlines. Thickness
      // is for visibility, not a claim of a volume-accurate fluid surface.
      for (let point = 0; point < POINTS; point++) {
        const offset = start + point * 3;
        const x = centers[offset]; const y = centers[offset + 1]; const z = centers[offset + 2];
        const before = start + Math.max(0, point - 1) * 3;
        const after = start + Math.min(SEGMENTS, point + 1) * 3;
        tangent.set(centers[after] - centers[before], centers[after + 1] - centers[before + 1], centers[after + 2] - centers[before + 2]).normalize();
        radial.set(x, 0, z).normalize();
        normal.copy(radial).addScaledVector(tangent, -radial.dot(tangent)).normalize();
        binormal.crossVectors(tangent, normal).normalize();
        const width = strand.width * tapers[point] * widthScale;
        const omega = 1 / (1 + (x * x + z * z) / coreSquared);
        let vertex = (strandIndex * POINTS + point) * SIDES;
        for (let side = 0; side < SIDES; side++, vertex++) {
          const u = circleCos[side]; const v = circleSin[side];
          const bufferOffset = vertex * 3;
          positions[bufferOffset] = x + width * (normal.x * u + binormal.x * v * 0.67);
          positions[bufferOffset + 1] = y + width * (normal.y * u + binormal.y * v * 0.67);
          positions[bufferOffset + 2] = z + width * (normal.z * u + binormal.z * v * 0.67);
          radial.copy(normal).multiplyScalar(u).addScaledVector(binormal, v / 0.67).normalize();
          normals[bufferOffset] = radial.x; normals[bufferOffset + 1] = radial.y; normals[bufferOffset + 2] = radial.z;
          angular[vertex] = omega;
        }
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.aAngular.needsUpdate = true;
  }

  function sampleParticles() {
    // Read the actual centerline buffer used to build the rendered geometry.
    // Capture stable strand identities on first inspection so a newly born
    // trail cannot reorder the diagnostics during a motion measurement.
    if (!diagnosticIndices) {
      diagnosticIndices = strands.map((strand, strandIndex) => ({ strand, strandIndex }))
        .filter(({ strand }) => strand.active)
        .sort((a, b) => Math.min(b.strand.age, b.strand.lifetime - b.strand.age) - Math.min(a.strand.age, a.strand.lifetime - a.strand.age))
        .slice(0, 3)
        .map(({ strandIndex }) => strandIndex);
    }
    return diagnosticIndices.map((strandIndex) => {
      const strand = strands[strandIndex];
      const point = SEGMENTS;
      const offset = (strandIndex * POINTS + point) * 3;
      const position = Array.from(centers.subarray(offset, offset + 3));
      return { id: [strandIndex, strand.cycle, point].join(':'), position, velocity: velocityAt(...position, currentTime), age: strand.age, birthTime: strand.birthTime };
    });
  }

  function activeCount() {
    return strands.reduce((count, strand) => count + Number(Boolean(strand.active)), 0);
  }

  function sampleTrails() {
    return strands.map((strand, strandIndex) => ({ strand, strandIndex }))
      .filter(({ strand }) => strand.active)
      .slice(0, 8)
      .map(({ strand, strandIndex }) => {
        const start = strandIndex * POINTS * 3;
        const end = start + SEGMENTS * 3;
        return {
          id: [strandIndex, strand.cycle].join(':'), age: strand.age,
          maximumAge: strand.trailDuration,
          growing: strand.age < strand.trailDuration,
          tail: Array.from(centers.subarray(start, start + 3)),
          head: Array.from(centers.subarray(end, end + 3)),
        };
      });
  }

  update(0);
  return { mesh, update, sampleParticles, sampleTrails, activeCount, strandCount: strands.length };
}
