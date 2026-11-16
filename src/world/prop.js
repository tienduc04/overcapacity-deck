import * as THREE from 'three';
import gsap from 'gsap';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Scene 5 as a live 3D world: under a ship's stern, a five-bladed bronze propeller turning in deep water.
// Light shafts fall from the surface, bubbles stream off the blades, marine snow drifts. Per reveal step
// (one carrier response each): the camera moves, the propeller's speed changes (slow steaming), it ages
// (scrapping: an old ship) and two more props appear beside it (consolidation: more fleets together).
// Axes: the shaft runs along z, the hull is at z < 0, the camera is behind the ship at z > 0. Units: metres.

const R = 4.2; // propeller radius
const BLADES = 5;
const FOG = 0x04303c;
// Reveal steps: fleet management, network design, slow steaming, scrapping, consolidation.
const STEPS = [
  { rpm: 1.5, age: 0, fleet: 0, cam: { p: [3.5, 3.5, 15], t: [-5.5, 0.4, 0] } },
  { rpm: 1.3, age: 0, fleet: 0, cam: { p: [-14.5, 5.5, 14], t: [-5.5, 0.4, 0] } },
  { rpm: 0.35, age: 0, fleet: 0, cam: { p: [-5.0, 0.6, 14], t: [-5.5, 0, 0] } }, // head on, turning slowly
  { rpm: 0.9, age: 1, fleet: 0, cam: { p: [4.5, -2.5, 10], t: [-5.5, 0, -1] } }, // low, old and worn
  { rpm: 1.3, age: 0, fleet: 1, cam: { p: [-5.5, 8, 27], t: [-5.5, 0.5, 0] } }, // pulled back: three fleets
];

export async function createPropWorld() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 400);
  scene.fog = new THREE.FogExp2(FOG, 0.045);
  scene.add(createWater());

  const bronze = new THREE.MeshStandardMaterial({ color: 0xc78a4a, metalness: 1, roughness: 0.27, envMapIntensity: 1.5 });
  const aged = { color: new THREE.Color(0x4d5a45), rough: 0.72 };
  const fresh = { color: new THREE.Color(0xc78a4a), rough: 0.27 };
  const blade = bladeGeometry();
  const makeProp = () => {
    const g = new THREE.Group();
    for (let k = 0; k < BLADES; k++) {
      const m = new THREE.Mesh(blade, bronze);
      m.rotation.z = (k * Math.PI * 2) / BLADES;
      g.add(m);
    }
    const lathe = new THREE.LatheGeometry([[0.001, -1.2], [0.6, -1.05], [0.98, -0.4], [0.98, 0.9], [0.72, 1.5], [0.001, 1.85]].map(([r, z]) => new THREE.Vector2(r, z)), 40);
    lathe.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(lathe, bronze));
    return g;
  };
  const props = [makeProp(), makeProp(), makeProp()];
  props[0].position.set(0, 0, 0);
  props[1].position.set(-10.5, 1.2, -3);
  props[2].position.set(13.5, -0.8, -5);
  props[1].rotation.y = 0.35;
  props[2].rotation.y = -0.4;
  const rig = new THREE.Group();
  rig.add(...props);
  scene.add(rig);

  // The stern above and behind the propeller: dark antifouling-red hull, shaft, skeg (no rudder: it would hide the blades).
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a0d0b, roughness: 0.9, metalness: 0.1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x232a30, roughness: 0.55, metalness: 0.6 });
  const stern = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 13, 10), hullMat);
  hull.position.set(0, 4.4, -9.2);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3.4, 20), steel);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, 0, -2.9);
  const skeg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6, 5), hullMat);
  skeg.position.set(0, 1.0, -2.0);
  stern.add(hull, shaft, skeg);
  stern.position.x = 0;
  scene.add(stern);

  // Light: the surface above, and a warm lamp from the camera side that makes the bronze glow.
  const sunlight = new THREE.DirectionalLight(0x9fe8ff, 3.2);
  sunlight.position.set(-6, 40, 14);
  const lamp = new THREE.PointLight(0xffc88a, 900, 60, 2);
  lamp.position.set(6, 3, 18);
  scene.add(sunlight, lamp, new THREE.HemisphereLight(0x3fa8c0, 0x03121a, 0.8));

  const shafts = lightShafts();
  const snow = marineSnow();
  const bubbles = bubbleStream();
  scene.add(shafts, snow.points, bubbles.points);

  const state = { cam: camPose(0), rpm: STEPS[0].rpm, age: 0, fleet: 0 };
  let tl = null;
  let ready = false;
  let lastT = 0;
  return {
    scene,
    camera,
    post: { bloom: { strength: 0.35, radius: 0.6, threshold: 1.1 } },
    init(renderer) {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.55;
      pm.dispose();
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // Show a reveal step: animated, or at once (arriving from another scene).
    go(step, instant = false) {
      tl?.kill();
      const s = STEPS[Math.min(step, STEPS.length - 1)];
      if (instant) return void Object.assign(state, { cam: camPose(step), rpm: s.rpm, age: s.age, fleet: s.fleet });
      tl = gsap
        .timeline()
        .to(state.cam, { ...camPose(step), duration: 2.4, ease: 'power2.inOut' }, 0)
        .to(state, { rpm: s.rpm, age: s.age, fleet: s.fleet, duration: 2.0, ease: 'power2.inOut' }, 0);
    },
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      props.forEach((p, i) => (p.rotation.z -= state.rpm * dt * (i ? 0.9 : 1) * (i === 2 ? -1 : 1)));
      const f = ease(state.fleet);
      props[1].scale.setScalar(Math.max(0.001, f));
      props[2].scale.setScalar(Math.max(0.001, f));
      bronze.color.copy(fresh.color).lerp(aged.color, state.age);
      bronze.roughness = fresh.rough + (aged.rough - fresh.rough) * state.age;
      bronze.metalness = 1 - 0.45 * state.age;
      shafts.material.uniforms.uTime.value = t;
      snow.material.uniforms.uTime.value = t;
      bubbles.points.material.uniforms.uTime.value = t;
      bubbles.points.material.uniforms.uRate.value = 0.25 + state.rpm * 0.5;
      const c = state.cam;
      camera.position.set(c.px + 0.5 * Math.sin(t * 0.21) + lean.x * 1.2, c.py + 0.3 * Math.sin(t * 0.33) + lean.y * 0.8, c.pz);
      camera.lookAt(c.tx, c.ty, c.tz);
    },
  };
}

const ease = (x) => x * x * (3 - 2 * x);

// One propeller blade as a closed thin solid: elliptical outline, pitch twist, rake and skew.
function bladeGeometry({ r0 = 0.8, pitch = 3.9, wmax = 1.7, rake = 0.45, skew = 0.7, thick = 0.2, nu = 30, nv = 14 } = {}) {
  const pos = [];
  const idx = [];
  const cols = nv + 1;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const r = r0 + (R - r0) * u;
      const w = wmax * Math.sqrt(Math.max(0, 1 - ((u - 0.4) / 0.6) ** 2));
      const phi = Math.atan(pitch / (2 * Math.PI * r));
      const sk = skew * u * u;
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1;
        const s = v * w;
        const th = (side ? -1 : 1) * thick * (1 - v * v) * (1 - 0.75 * u);
        // radial x, tangential y, axial z; blade normal n = (0, -sin phi, cos phi)
        pos.push(r, s * Math.cos(phi) + sk - th * Math.sin(phi), s * Math.sin(phi) + rake * u * u + th * Math.cos(phi));
      }
    }
  }
  const per = (nu + 1) * cols;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = side * per + i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (side) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Deep-water backdrop: bright teal near the surface above, black-blue below.
function createWater() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y * 0.5 + 0.5;
        vec3 col = mix(vec3(0.004, 0.02, 0.035), vec3(0.03, 0.2, 0.26), smoothstep(0.25, 1.0, h));
        col += vec3(0.05, 0.3, 0.34) * pow(smoothstep(0.7, 1.0, h), 2.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// God rays: tall soft planes falling from the surface, swaying slowly.
function lightShafts() {
  const n = 16;
  const geos = [];
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(2 + rnd() * 6, 90);
    g.rotateZ(0.22 + (rnd() - 0.5) * 0.1);
    g.rotateY((rnd() - 0.5) * 1.6);
    g.translate(-40 + rnd() * 80, 18, -30 + rnd() * 60);
    const a = new Float32Array(g.attributes.position.count).fill(0.5 + rnd());
    g.setAttribute('seed', new THREE.BufferAttribute(a, 1));
    geos.push(g);
  }
  const merged = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const sd = [];
  const idx = [];
  let off = 0;
  for (const g of geos) {
    pos.push(...g.attributes.position.array);
    uv.push(...g.attributes.uv.array);
    sd.push(...g.attributes.seed.array);
    idx.push(...Array.from(g.index.array, (i) => i + off));
    off += g.attributes.position.count;
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.setAttribute('seed', new THREE.Float32BufferAttribute(sd, 1));
  merged.setIndex(idx);
  const mesh = new THREE.Mesh(
    merged,
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'attribute float seed; varying vec2 vUv; varying float vS; void main() { vUv = uv; vS = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying float vS;
        void main() {
          float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float down = pow(vUv.y, 1.6);
          float flick = 0.6 + 0.4 * sin(uTime * 0.4 * vS + vS * 9.0);
          float a = pow(edge, 1.6) * down * flick * 0.1;
          gl_FragColor = vec4(vec3(0.5, 1.0, 1.0) * a, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  mesh.frustumCulled = false;
  return mesh;
}

// Marine snow: tiny particles drifting in the water.
function marineSnow() {
  const n = 900;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 70, (Math.random() - 0.5) * 40, -20 + Math.random() * 55], i * 3);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        uniform float uTime; attribute float seed; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.12 + seed) * 1.4, -mod(uTime * 0.25 + seed, 40.0) + 20.0 + sin(uTime * 0.2 + seed * 2.0) * 0.5, cos(uTime * 0.1 + seed * 1.3) * 1.4);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = 0.25 + 0.3 * fract(seed * 7.0);
          gl_PointSize = clamp(40.0 / -mv.z * (0.6 + fract(seed)), 1.0, 3.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: 'varying float vA; void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.6, 0.95, 1.0) * vA * smoothstep(0.5, 0.0, r), 1.0); }',
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
  );
  points.frustumCulled = false;
  return { points, material: points.material };
}

// Bubbles streaming up and back from the propeller disc.
function bubbleStream() {
  const n = 260;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * R * 0.9;
    pos.set([Math.cos(a) * r, Math.sin(a) * r, Math.random() * 2], i * 3);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRate: { value: 1 } },
      vertexShader: `
        uniform float uTime, uRate; attribute float seed; varying float vA;
        void main() {
          float life = fract(seed * 0.37 + uTime * 0.12 * uRate);
          vec3 p = position + vec3(sin(uTime + seed) * 0.4, life * 22.0, life * 9.0 + sin(seed) * 0.5);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (1.0 - life) * smoothstep(0.0, 0.05, life);
          gl_PointSize = clamp((1.0 + fract(seed * 3.0) * 2.5) * 90.0 / -mv.z, 2.0, 22.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          float r = length(q);
          float ring = smoothstep(0.5, 0.42, r) * smoothstep(0.28, 0.46, r);
          float glint = smoothstep(0.12, 0.0, length(q - vec2(-0.14, -0.14)));
          gl_FragColor = vec4(vec3(0.7, 1.0, 1.0) * (ring * 0.9 + glint) * vA * 0.6, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  points.frustumCulled = false;
  return { points };
}

function camPose(step) {
  const { p, t } = STEPS[Math.min(step, STEPS.length - 1)].cam;
  return { px: p[0], py: p[1], pz: p[2], tx: t[0], ty: t[1], tz: t[2] };
}
