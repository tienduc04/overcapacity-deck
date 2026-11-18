import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createOcean, createSky, loadHdr, sunDirection } from './sea.js';
import { dressAll, loadSurfaces } from './materials.js';

// Scene 3 as a live 3D world: a container terminal at blue hour, wet apron, a ship at berth and a
// ship-to-shore crane. In front of the crane three boxes (scripts/blender/build_cargo.py) blow open to show
// the demand drivers as holograms, a Hapag-Lloyd box steps aside for the case study, and red brackets lock
// on the risks. Last, the boxes turn hollow (cargo fills ~40%) while the crane stacks the supply-demand
// chart behind them, one box per percentage point: orange = fleet growth, cyan = demand growth.
// Axes: x along the quay, y up, the sea at z < 0, the apron and the camera at z > 0. Units: metres.

const BOX = { w: 2.44, h: 2.59, l: 12.19 }; // 40 ft high cube; long side across the quay (z)
const TIER = 2.62; // stacking pitch
const CHART = { z: 46, spacing: 13, pair: 1.45 }; // apron row of the stacks; x between years; half gap in a pair
const HERO = { z: 80, xs: [-5, 0, 5], hl: { from: [-13, 80, 0], to: [-11, 88, -Math.PI / 2] } }; // the three boxes; the Hapag-Lloyd box: x, z, yaw
const COLOURS = { fleet: '#d2601f', demand: '#1f9fb3' };
const CRANE = { legs: [6, 34], gauge: 30, girderX: 8, boomY: 43, boomZ: [-52, 58], apex: 70 };
const WATER_Y = -3.5;
const SUN = { elevation: -3, offset: 25 }; // just below the horizon: blue hour
const ENV_INTENSITY = 0.12;
const PER_BOX = 0.14; // s of reveal per box
const FOG = 0x1a2c47;

const SURFACES = { side: { file: 'container_side', repeat: 1 / 2.4 } };
const LOOK = { Box: { surface: 'side', detail: 0.6, normal: 0.6 } };

// Camera poses per reveal step: position p, look-at t.
const ARRIVE = { p: [-8, 9, 92], t: [0, 12, CHART.z] }; // close under the crane, where scene 2's transition lands
const POSES = [
  { p: [11, 8.5, HERO.z + 29], t: [0, 1.4, HERO.z] }, // the three boxes, blown open, between the HUD columns
  { p: [-3, 8.5, HERO.z + 30], t: [-4, 1.6, HERO.z + 2] }, // pulled back left: the Hapag-Lloyd box and the risks
  { p: [-20, 46, 126], t: [-20, 0, 58] }, // high, panned left so boxes and chart sit right of the table
];

const ease = (x) => x * x * (3 - 2 * x);

// series: { years, tags, fleet, demand, fleetText, demandText }: % per year (null = no figure: no stack).
export async function createPortWorld(series) {
  const loader = new GLTFLoader();
  const [shipGltf, cargoGltf, surfaces, hdr] = await Promise.all([loader.loadAsync('models/ship.glb'), loader.loadAsync('models/cargo.glb'), loadSurfaces(SURFACES), loadHdr(), document.fonts.load('800 120px Montserrat')]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 12000);
  const sun = sunDirection(new THREE.Vector3(0, 0, -1), SUN.elevation, SUN.offset);
  const sky = createSky(scene, sun);
  const skyMesh = scene.children.find((o) => o.isSky);
  scene.fog = new THREE.FogExp2(FOG, 0.0022);

  const dome = createDome(sun);
  scene.add(dome);

  const ocean = createOcean({ envTexture: sky.envTexture, sun, sunColor: new THREE.Color(0.5, 0.4, 0.35), wave: 0.15, ripple: 0.25, haze: 0.0015 });
  ocean.position.y = WATER_Y;
  scene.add(ocean);

  // The quay: concrete body, and a wet asphalt top that mirrors the lights, the crane and the stacks.
  const quay = new THREE.Mesh(new THREE.BoxGeometry(600, 4, 260), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.95 }));
  quay.position.set(0, -2.02, 130); // top just under y = 0
  scene.add(quay);
  const floor = new Reflector(new THREE.PlaneGeometry(600, 260), { shader: WetShader, textureWidth: 1024, textureHeight: 576, clipBias: 0.003, multisample: 0, color: 0x888888 });
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 130);
  scene.add(floor);
  const rails = [CRANE.legs[0], CRANE.legs[1]].map((z) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(600, 0.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x555a61, roughness: 0.4, metalness: 0.8 }));
    r.position.set(0, 0.12, z);
    return r;
  });
  scene.add(...rails);

  // The ship at berth, under the crane's boom.
  const ship = shipGltf.scene;
  const sb = new THREE.Box3().setFromObject(ship);
  ship.position.set(-(sb.min.x + sb.max.x) / 2 - 40, WATER_Y, -(sb.max.z - sb.min.z) / 2 - 4);
  scene.add(ship);

  const shore = farShore();
  scene.add(shore.group);

  const crane = createCrane();
  scene.add(crane.group);

  // Containers: one instanced mesh for the chart, one for the yard around it.
  const boxGeo = boxGeometry();
  const boxMat = new THREE.MeshStandardMaterial({ name: 'Box', color: 0xffffff, roughness: 1 });
  const holder = new THREE.Group();
  const chart = chartStacks(series, boxGeo, boxMat);
  const yard = yardStacks(boxGeo, boxMat);
  holder.add(chart.mesh, yard.mesh);
  dressAll(holder, surfaces, LOOK);
  scene.add(holder, yard.contact, chart.contact, ...chart.labels);

  const laser = createLaser();
  scene.add(laser.group);

  const hero = createHero(cargoGltf.scene);
  scene.add(hero.group);

  // Light: cool sky fill, a dim moon, warm floodlights (the first rides on the crane) with light cones.
  const moon = new THREE.DirectionalLight(0x8fa8d8, 1.0);
  moon.position.set(-200, 300, 250);
  scene.add(moon, new THREE.HemisphereLight(0x4a6a9c, 0x15181c, 1.2));
  const cones = [];
  const floods = [
    { at: [0, CRANE.boomY + 2, CHART.z + 14], aim: [0, 0, CHART.z], onCrane: true },
    { at: [-70, 34, 72], aim: [-30, 0, CHART.z - 4] },
    { at: [70, 34, 72], aim: [30, 0, CHART.z - 4] },
  ];
  const heroLight = new THREE.SpotLight(0xffd2a0, 9000, 120, 0.5, 0.7, 2); // warm key on the three boxes
  heroLight.position.set(8, 24, HERO.z + 16);
  heroLight.target.position.set(0, 0, HERO.z);
  scene.add(heroLight, heroLight.target);
  floods.forEach((f, i) => {
    const s = new THREE.SpotLight(0xffc98a, 22000, 190, 0.55, 0.65, 2);
    s.position.set(...f.at);
    s.target.position.set(...f.aim);
    if (i === 0) {
      s.castShadow = true;
      s.shadow.mapSize.set(2048, 2048);
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.05;
    }
    const cone = lightCone(new THREE.Vector3(...f.at), new THREE.Vector3(...f.aim), 0.3, new THREE.Color(1.0, 0.72, 0.42));
    if (f.onCrane) crane.group.add(s, s.target, cone);
    else scene.add(s, s.target, cone);
    cones.push(cone);
  });
  const dust = dustMotes();
  scene.add(dust);

  // Animated state: cam = pose shown, built = boxes placed so far (chart.count when complete).
  // open: walls blown off (beat 1); split: the Hapag-Lloyd box aside; risk: red brackets; hollow: boxes as wireframe with cargo.
  const BEATS = [{ open: 1, split: 0, risk: 0, hollow: 0 }, { open: 1, split: 1, risk: 1, hollow: 0 }, { open: 0, split: 1, risk: 0, hollow: 1 }];
  const state = { cam: pose(0), built: 0, scan: 1, ...BEATS[0] };
  let tl = null;
  let ready = false;
  let craneX = 0;
  let lastT = 0;
  const tmp = new THREE.Vector3();
  const spreaderAt = new THREE.Vector3();
  return {
    scene,
    camera,
    post: { bloom: { strength: 0.3, radius: 0.35, threshold: 2.2 } }, // the lamps and the laser core
    init(renderer) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Bake the environment from the dusk dome, so the sea and the metal reflect its glow.
      skyMesh.visible = false;
      sky.bake(renderer, { hide: [ocean, quay, floor, ...rails, ship, shore.group, crane.group, holder, yard.contact, chart.contact, laser.group, dust, ...cones, ...chart.labels, hero.group], hdr, envIntensity: ENV_INTENSITY });
      scene.background = new THREE.Color(0x050a14);
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // Show a reveal step: animated (on screen), or at once (arriving from another scene).
    go(step, instant = false) {
      tl?.kill();
      const built = step >= 2 ? chart.count : 0;
      const beat = BEATS[Math.min(step, BEATS.length - 1)];
      if (instant) {
        Object.assign(state, { cam: pose(step), built, scan: 1, ...beat });
        // Arriving at step 0: start under the crane, pull back to the three boxes, then blow them open.
        if (step === 0)
          tl = gsap
            .timeline({ delay: 1 }) // delay: scene 2's lead-out
            .fromTo(state.cam, flat(ARRIVE), { ...pose(0), duration: 4.5, ease: 'sine.inOut', immediateRender: true })
            .fromTo(state, { open: 0 }, { open: 1, duration: 1.6, ease: 'power3.out', immediateRender: true }, 3.2);
        return;
      }
      tl = gsap.timeline().to(state.cam, { ...pose(step), duration: 2.2, ease: 'power2.inOut' }, 0).to(state, { ...beat, duration: 1.6, ease: 'power2.inOut' }, 0.3);
      if (built > state.built) {
        // The crane stacks the boxes one by one, the laser follows, then goes back to sweeping.
        tl.to(state, { scan: 0, duration: 0.4 }, 0.6).to(state, { built, duration: chart.count * PER_BOX, ease: 'none' }, 0.8).to(state, { scan: 1, duration: 0.8 });
      } else if (built < state.built) tl.to(state, { built, duration: 0.6, ease: 'power1.in' }, 0);
    },
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      ocean.material.uniforms.uTime.value = t;
      dust.material.uniforms.uTime.value = t;
      shore.twinkle(t);
      chart.place(state.built);
      hero.update(state, t);
      // The crane follows the box being placed along the quay; the trolley runs out along the boom.
      const carried = chart.carried;
      const targetX = carried ? carried.x : 0;
      craneX += (targetX - craneX) * (1 - Math.exp(-dt * 7));
      crane.group.position.x = craneX;
      if (carried) spreaderAt.set(carried.x, carried.y + BOX.h / 2 + 0.5, carried.z);
      else spreaderAt.set(craneX, CRANE.boomY - 14 + Math.sin(t * 0.8) * 0.3, CHART.z); // hanging idle over the apron
      crane.reach(spreaderAt, t);
      // Laser: scans the three boxes (beats 1-2), sweeps the chart, or marks the stack being built.
      const onHero = 1 - state.hollow;
      const sweep = THREE.MathUtils.lerp(30, 7, onHero) * Math.sin(t * 0.45); // clear of the HUD figures
      const lx = carried ? THREE.MathUtils.lerp(sweep, carried.x, 1 - state.scan) : sweep;
      laser.aim(crane.trolleyWorld(tmp), lx, t, THREE.MathUtils.lerp(CHART.z, HERO.z, onHero));
      const c = state.cam;
      camera.position.set(c.px + 0.8 * Math.sin(t * 0.13) + lean.x * 2, c.py + 0.4 * Math.sin(t * 0.21) + lean.y * 1.2, c.pz);
      camera.lookAt(c.tx, c.ty, c.tz);
    },
  };
}

// --- sky -------------------------------------------------------------------------------------------

// Dusk dome: deep blue overhead, teal band, an orange glow where the sun has just gone (towards the sea).
function createDome(sun) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun.clone().setY(0).normalize() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(vec3(0.075, 0.14, 0.25), vec3(0.008, 0.02, 0.06), smoothstep(0.0, 0.55, h));
        float toSun = max(dot(vec3(d.x, 0.0, d.z) / max(length(d.xz), 1e-3), uSun), 0.0);
        float band = exp(-h * 9.0);
        col += vec3(1.0, 0.42, 0.14) * pow(toSun, 5.0) * band * 1.6;
        col += vec3(0.9, 0.5, 0.35) * pow(toSun, 40.0) * exp(-h * 22.0) * 2.4;
        col += vec3(0.10, 0.22, 0.38) * exp(-h * 16.0) * 0.6;
        // faint stars high up
        float star = step(0.9985, hash(floor(d * 380.0))) * smoothstep(0.25, 0.6, h);
        col += vec3(star) * 0.8;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// The far shore: dark stacks and cranes on the horizon with their lights, for depth.
function farShore() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 1 });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = 140;
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dark, n);
  const m = new THREE.Matrix4();
  const lights = [];
  for (let i = 0; i < n; i++) {
    const w = 14 + rnd() * 40;
    const h = 6 + rnd() * 26;
    const x = -1100 + rnd() * 2200;
    const z = -800 - rnd() * 260;
    m.makeScale(w, h, 30 + rnd() * 60).setPosition(x, h / 2 - 3, z);
    boxes.setMatrixAt(i, m);
    for (let k = 0; k < 3; k++) lights.push(x + (rnd() - 0.5) * w, rnd() * h, z + 20);
  }
  group.add(boxes);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lights), 3));
  const pm = new THREE.PointsMaterial({ color: new THREE.Color(3.0, 2.0, 1.1), size: 2.2, sizeAttenuation: false, fog: false });
  const points = new THREE.Points(pg, pm);
  group.add(points);
  const farCranes = createCrane({ lite: true });
  for (const x of [-520, -150, 330]) {
    const c = farCranes.group.clone();
    c.position.set(x, -3, -780);
    c.scale.setScalar(1.1);
    c.rotation.y = Math.PI;
    group.add(c);
  }
  return { group, twinkle: (t) => (pm.size = 2.2 + 0.3 * Math.sin(t * 2.0)) };
}

// --- wet ground ------------------------------------------------------------------------------------

// Reflector shader: dark asphalt with grain, puddles that mirror the scene, a yellow edge line.
const WetShader = {
  name: 'WetShader',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
    }
    void main() {
      vec2 w = vWorld.xz;
      float n = vnoise(w * 0.06) * 0.6 + vnoise(w * 0.27) * 0.4;
      float puddle = smoothstep(0.45, 0.68, n);
      float grain = vnoise(w * 4.0) * 0.6 + vnoise(w * 17.0) * 0.4;
      vec3 asphalt = vec3(0.028, 0.032, 0.04) * (0.6 + 0.9 * grain);
      // painted lines: quay edge (yellow) and lane lines every 13 m along x
      float edge = 1.0 - smoothstep(0.25, 0.45, abs(w.y - 4.0));
      float lane = (1.0 - smoothstep(0.08, 0.2, abs(fract(w.x / 13.0 + 0.5) - 0.5) * 13.0)) * step(10.0, w.y) * step(w.y, 100.0);
      asphalt = mix(asphalt, vec3(0.55, 0.42, 0.06), edge * 0.9);
      asphalt = mix(asphalt, vec3(0.3), lane * 0.55);
      vec3 view = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
      vec2 ripple = vec2(vnoise(w * 1.3), vnoise(w * 1.3 + 7.0)) - 0.5;
      vec3 refl = texture2DProj(tDiffuse, vUv + vec4(ripple * 0.004 * vUv.w, 0.0, 0.0)).rgb;
      float r = clamp(mix(0.10, 0.85, puddle) * (0.45 + 0.9 * fres), 0.0, 0.95) * (1.0 - edge * 0.6);
      gl_FragColor = vec4(mix(asphalt, refl, r), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// --- chart -----------------------------------------------------------------------------------------

// Stacks for each year: fleet (orange, left) and demand (cyan, right), one box per percentage point
// (rounded), placed one at a time by the crane: year by year, bottom to top. Labels on the apron.
function chartStacks({ years, tags = [], fleet, demand, fleetText = [], demandText = [] }, geo, mat) {
  const slots = []; // { x, y, colour, order }
  const x0 = -((years.length - 1) * CHART.spacing) / 2;
  const xs = years.map((_, i) => x0 + i * CHART.spacing);
  years.forEach((_, i) => {
    const tiers = [fleet[i], demand[i]].map((v) => (v == null ? 0 : Math.round(v)));
    for (let k = 0; k < Math.max(...tiers); k++) {
      tiers.forEach((n, j) => {
        if (k < n) slots.push({ x: xs[i] + (j ? CHART.pair : -CHART.pair), y: BOX.h / 2 + k * TIER, colour: j ? COLOURS.demand : COLOURS.fleet, order: slots.length });
      });
    }
  });
  const mesh = new THREE.InstancedMesh(geo, mat, slots.length);
  const colour = new THREE.Color();
  slots.forEach((s, i) => mesh.setColorAt(i, colour.set(s.colour).multiplyScalar(0.9 + 0.2 * ((i * 37) % 10) / 10))); // slight batch-to-batch tone
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false; // boxes travel in from outside the bounds
  const m = new THREE.Matrix4();
  const bottoms = slots.filter((s) => s.y === BOX.h / 2);
  const contact = contactShadows(bottoms.length);
  const out = { mesh, contact, count: slots.length, carried: null, labels: years.map((y, i) => yearLabel(y, tags[i], fleetText[i] ?? fmt(fleet[i]), demandText[i] ?? fmt(demand[i]), xs[i])) };
  let shown = -1;
  // Boxes with order < built are down; the next one is carried in by the crane (in along the boom,
  // then lowered); the rest are not there yet.
  out.place = (built) => {
    if (built === shown) return;
    shown = built;
    out.carried = null;
    slots.forEach((s, i) => {
      const p = THREE.MathUtils.clamp(built - s.order, 0, 1);
      let y = s.y;
      let z = CHART.z;
      if (p > 0 && p < 1) {
        z = CHART.z - 16 * (1 - ease(Math.min(1, p / 0.45)));
        y = s.y + 13 * (1 - ease(Math.max(0, (p - 0.35) / 0.65)));
        out.carried = { x: s.x, y, z };
      }
      m.makeScale(p > 0 ? 1 : 0, p > 0 ? 1 : 0, p > 0 ? 1 : 0).setPosition(s.x, y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    bottoms.forEach((s, i) => {
      const on = built - s.order >= 0.9 ? 1 : 0;
      contact.setMatrixAt(i, m.makeScale(on, on, on).setPosition(s.x, 0.06, CHART.z));
    });
    contact.instanceMatrix.needsUpdate = true;
  };
  return out;
}

const fmt = (v) => (v == null ? 'n/a' : `+${v.toFixed(1)}`);

// Painted on the apron in front of the stacks: the year, its scenario tag, and the two figures in their colours.
function yearLabel(year, tag, fleet, demand, x) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.textAlign = 'center';
  g.font = '800 92px Montserrat';
  g.fillStyle = '#f4f1ec';
  g.fillText(year, 256, 86);
  if (tag) {
    g.font = '600 40px Montserrat';
    g.fillStyle = '#9fb2c6';
    g.fillText(tag.toUpperCase(), 256, 138);
  }
  g.font = '800 54px Montserrat';
  g.fillStyle = COLOURS.fleet;
  g.fillText(fleet, 136, 220);
  g.fillStyle = '#4fd8ea';
  g.fillText(demand, 376, 220);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), new THREE.MeshBasicMaterial({ map, transparent: true, color: new THREE.Color(1.6, 1.6, 1.6), depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.05, CHART.z + BOX.l / 2 + 4.5);
  return mesh;
}

// The terminal yard around the chart: blocks of stacks 1-4 high in muted, weathered colours (fixed seed).
function yardStacks(geo, mat) {
  const colours = ['#1d2a52', '#7d8798', '#4a1c22', '#2f4a3a', '#8a8f96', '#c9561c', '#6b2a1a', '#2a4a6a'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const items = [];
  for (const [bx, bz, rows, cols] of [[-150, 40, 9, 6], [92, 40, 9, 6], [-150, 92, 9, 6], [92, 92, 9, 6]]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < h; k++) items.push([bx + r * (BOX.w + 0.4), BOX.h / 2 + k * TIER, bz + c * (BOX.l + 1.5), colours[Math.floor(rnd() * colours.length)], 0.55 + rnd() * 0.5]);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const colour = new THREE.Color();
  items.forEach(([x, y, z, c, tone], i) => {
    mesh.setMatrixAt(i, m.makeTranslation(x, y, z));
    mesh.setColorAt(i, colour.set(c).multiplyScalar(tone));
  });
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  const bottoms = items.filter((it) => it[1] === BOX.h / 2);
  const contact = contactShadows(bottoms.length);
  bottoms.forEach((it, i) => contact.setMatrixAt(i, m.makeTranslation(it[0], 0.06, it[2])));
  return { mesh, contact };
}

// Soft dark pads under the bottom boxes: the mirror floor cannot take shadows, this grounds the stacks.
function contactShadows(count) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.95)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(c);
  const plane = new THREE.PlaneGeometry(BOX.w + 3.2, BOX.l + 3.2);
  plane.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, color: 0x000000 }), count);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
  return mesh;
}

// A box with UVs in metres on every face (the side texture tiles by size, ribs upright).
function boxGeometry() {
  const g = new THREE.BoxGeometry(BOX.w, BOX.h, BOX.l);
  const { position: p, normal: n, uv } = g.attributes;
  for (let i = 0; i < p.count; i++) {
    const [ax, ay] = Math.abs(n.getX(i)) > 0.5 ? [p.getZ(i), p.getY(i)] : Math.abs(n.getY(i)) > 0.5 ? [p.getZ(i), p.getX(i)] : [p.getX(i), p.getY(i)];
    uv.setXY(i, ax, ay);
  }
  return g;
}

// --- crane and laser ---------------------------------------------------------------------------------

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const ONE = new THREE.Vector3(1, 1, 1);

// A square-section beam between two points, as a box geometry ready to merge.
function beamGeo(a, b, t, t2 = t) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const g = new THREE.BoxGeometry(t, va.distanceTo(vb), t2);
  _q.setFromUnitVectors(UP, vb.clone().sub(va).normalize());
  g.applyMatrix4(_m.compose(va.clone().add(vb).multiplyScalar(0.5), _q, ONE));
  return g;
}

// A lattice girder from a to b: four chords and zig-zag bracing on every face.
function lattice(a, b, hw, hh, chord = 0.5, diag = 0.22) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  d.normalize();
  const side = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
  const up = new THREE.Vector3().crossVectors(side, d).normalize();
  const corner = (sx, sy) => side.clone().multiplyScalar(sx * hw).add(up.clone().multiplyScalar(sy * hh));
  const cs = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  const out = [];
  cs.forEach((c) => out.push(beamGeo(va.clone().add(c).toArray(), vb.clone().add(c).toArray(), chord)));
  const n = Math.max(2, Math.round(len / (Math.max(hw, hh) * 2.2)));
  for (let f = 0; f < 4; f++) {
    const c0 = cs[f];
    const c1 = cs[(f + 1) % 4];
    for (let j = 0; j < n; j++) {
      const p0 = va.clone().addScaledVector(d, (len * j) / n).add(j % 2 ? c0 : c1);
      const p1 = va.clone().addScaledVector(d, (len * (j + 1)) / n).add(j % 2 ? c1 : c0);
      out.push(beamGeo(p0.toArray(), p1.toArray(), diag));
    }
  }
  return out;
}

// Ship-to-shore crane: portal legs with bracing, lattice boom girders over the ship and back over the
// apron, the A-frame with stays, machinery house, trolley with cabin, spreader and four hoist cables.
// reach(spreaderWorld, t) hangs the spreader at a point; the trolley runs along the boom to it.
function createCrane({ lite = false } = {}) {
  const group = new THREE.Group();
  const steel = [];
  const red = [];
  const dark = [];
  const { legs, gauge, girderX, boomY, boomZ, apex } = CRANE;
  const top = boomY - 4;
  for (const side of [-1, 1]) {
    const sx = (side * gauge) / 2;
    for (const z of legs) red.push(beamGeo([sx, 0, z], [sx, top, z], 1.8, 2.2));
    red.push(beamGeo([sx, 0.8, legs[0] - 3], [sx, 0.8, legs[1] + 3], 2.0, 2.0)); // sill beam
    for (const [y0, y1] of [[1, 14], [14, 27], [27, top - 1]]) {
      steel.push(beamGeo([sx, y0, legs[0]], [sx, y1, legs[1]], 0.5)); // X bracing between the legs
      steel.push(beamGeo([sx, y0, legs[1]], [sx, y1, legs[0]], 0.5));
    }
    steel.push(beamGeo([sx, 14, legs[0]], [sx, 14, legs[1]], 0.9), beamGeo([sx, 27, legs[0]], [sx, 27, legs[1]], 0.9));
    steel.push(beamGeo([sx, top, legs[0]], [sx, top, legs[1]], 1.4));
    for (const z of legs) for (const w of [-2.2, 2.2]) dark.push(beamGeo([sx, 0.1, z + w], [sx, 1.4, z + w], 1.1)); // wheel bogies
    // A-frame
    steel.push(...lattice([sx, top, legs[1]], [sx * 0.55, apex, legs[1] - 6], 0.7, 0.7, 0.55, 0.2));
    steel.push(...lattice([sx, top, legs[0]], [sx * 0.55, apex, legs[1] - 6], 0.6, 0.6, 0.5, 0.2));
    // stays to the boom tip and the backreach end
    steel.push(beamGeo([sx * 0.55, apex, legs[1] - 6], [side * girderX, boomY + 2, boomZ[0] + 4], 0.35));
    steel.push(beamGeo([sx * 0.55, apex, legs[1] - 6], [side * girderX, boomY + 2, boomZ[1]], 0.35));
  }
  for (const z of legs) steel.push(beamGeo([-gauge / 2, top, z], [gauge / 2, top, z], 1.5)); // portal cross beams
  steel.push(beamGeo([-gauge / 2 * 0.55, apex, legs[1] - 6], [gauge / 2 * 0.55, apex, legs[1] - 6], 0.9));
  // boom girders
  for (const side of [-1, 1]) {
    steel.push(...lattice([side * girderX, boomY, boomZ[0]], [side * girderX, boomY, boomZ[1]], 1.0, 2.2, 0.65, 0.25));
    dark.push(beamGeo([side * girderX, boomY + 2.4, boomZ[0]], [side * girderX, boomY + 2.4, boomZ[1]], 0.5, 0.7)); // trolley rail
  }
  for (let z = boomZ[0] + 6; z <= boomZ[1]; z += 14) steel.push(beamGeo([-girderX, boomY, z], [girderX, boomY, z], 0.7)); // boom cross ties
  // machinery house on the backreach
  const house = new THREE.BoxGeometry(15, 6, 13);
  house.translate(0, boomY + 5, legs[1] + 8);
  steel.push(house);
  const merged = (list, material) => {
    const mesh = new THREE.Mesh(mergeGeometries(list), material);
    mesh.castShadow = true;
    group.add(mesh);
  };
  merged(steel, new THREE.MeshStandardMaterial({ color: 0xc4cad1, roughness: 0.55, metalness: 0.4 }));
  merged(red, new THREE.MeshStandardMaterial({ color: 0x9c2a1f, roughness: 0.6, metalness: 0.3 }));
  merged(dark, new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.5, metalness: 0.6 }));
  // lamps along the boom and the frame: bright points for the bloom
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 6, 4.5), fog: false });
  const lampSpots = [];
  for (let z = boomZ[0] + 2; z <= boomZ[1]; z += 12) lampSpots.push([-girderX, boomY - 2.4, z], [girderX, boomY - 2.4, z]);
  for (const side of [-1, 1]) for (const z of legs) lampSpots.push([side * gauge / 2 + side * 1.2, top - 2, z], [side * gauge / 2 + side * 1.2, 16, z]);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat, lampSpots.length + 1);
  lampSpots.forEach((p, i) => lamps.setMatrixAt(i, _m.makeTranslation(...p)));
  group.add(lamps);
  const warn = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.5, 0.3), fog: false }));
  warn.position.set(0, apex + 1, legs[1] - 6);
  group.add(warn);
  if (lite) return { group };

  // trolley with the operator cabin, the spreader and the hoist cables
  const trolley = new THREE.Group();
  const trolleyBody = new THREE.Mesh(new THREE.BoxGeometry(girderX * 2 + 2.4, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.5, metalness: 0.5 }));
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 4), new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.5, emissive: 0xffb760, emissiveIntensity: 1.4 }));
  cabin.position.set(0, -2.7, 0);
  trolley.add(trolleyBody, cabin);
  trolley.position.set(0, boomY + 5.0, CHART.z);
  trolley.castShadow = true;
  group.add(trolley);
  const spreader = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, BOX.l * 0.98), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.5, metalness: 0.6 }));
  spreader.castShadow = true;
  group.add(spreader);
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6, metalness: 0.7 });
  const cables = Array.from({ length: 4 }, () => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), cableMat);
    group.add(c);
    return c;
  });
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const dir = new THREE.Vector3();
  return {
    group,
    trolleyWorld: (v) => trolley.getWorldPosition(v),
    // Hang the spreader at `world` (a point in the scene); the trolley follows along the boom.
    reach(world) {
      const local = group.worldToLocal(va.copy(world));
      trolley.position.z += (local.z - trolley.position.z) * 0.35;
      spreader.position.copy(local);
      const sz = BOX.l * 0.4;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy], i) => {
        const a = vb.set(sx * 1.0, boomY + 4, trolley.position.z + sy * 2.2).clone();
        const b = new THREE.Vector3(local.x + sx * 1.1, local.y + 0.2, local.z + sy * sz);
        dir.subVectors(b, a);
        const c = cables[i];
        c.position.copy(a).addScaledVector(dir, 0.5);
        c.scale.set(1, dir.length(), 1);
        c.quaternion.setFromUnitVectors(UP, dir.normalize());
      });
    },
  };
}

// A floodlight's visible cone: additive, brightest near the lamp and at the cone's core.
function lightCone(from, to, angle, colour) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.ConeGeometry(Math.tan(angle) * len, len, 40, 1, true);
  geo.translate(0, -len / 2, 0); // apex at the origin, opening along -y
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: colour } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        vH = -position.y / ${len.toFixed(2)};
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float a = f * (1.0 - vH) * smoothstep(0.0, 0.06, vH) * 0.15;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  mesh.frustumCulled = false;
  return mesh;
}

// Dust and spray drifting in the lamplight over the apron.
function dustMotes() {
  const count = 500;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 160, 0.5 + Math.random() * 38, 20 + Math.random() * 70], i * 3);
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
          vec3 p = position + vec3(sin(uTime * 0.2 + seed) * 2.0, sin(uTime * 0.13 + seed * 2.3) * 1.2, cos(uTime * 0.17 + seed * 1.7) * 2.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = 0.35 + 0.35 * sin(uTime * 1.1 + seed * 5.0);
          gl_PointSize = clamp(60.0 / -mv.z * (1.0 + fract(seed)), 1.0, 4.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * vA * smoothstep(0.5, 0.0, r), 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  points.frustumCulled = false;
  return points;
}

// Cyan scan beam: a thin fan from the trolley down to a line across the apron, and the glowing line.
function createLaser() {
  const group = new THREE.Group();
  const glow = (alpha) => new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 4, 5), transparent: true, opacity: alpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const fan = new THREE.Mesh(fanGeo, glow(0.03));
  fan.frustumCulled = false;
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, BOX.l + 6), glow(0.9));
  group.add(fan, line);
  return {
    group,
    aim(from, x, t, z = CHART.z) {
      const p = fanGeo.attributes.position;
      const half = (BOX.l + 6) / 2;
      p.setXYZ(0, from.x, from.y - 1.5, from.z);
      p.setXYZ(1, x, 0.08, z - half);
      p.setXYZ(2, x, 0.08, z + half);
      p.needsUpdate = true;
      line.position.set(x, 0.09, z);
      line.material.opacity = 0.75 + 0.25 * Math.sin(t * 9);
    },
  };
}

function pose(step) {
  return flat(POSES[Math.min(step, POSES.length - 1)]);
}

function flat({ p, t }) {
  return { px: p[0], py: p[1], pz: p[2], tx: t[0], ty: t[1], tz: t[2] };
}

// --- hero boxes --------------------------------------------------------------------------------------

// The Blender props: three boxes in parts (Frame, WallL, WallR, Roof) that blow open into a technical
// wireframe with a hologram inside, a Hapag-Lloyd box that steps aside, red risk brackets, and the cargo
// (~40% of the box) shown when the boxes turn hollow. update(state) reads open, split, risk and hollow (0..1).
function createHero(src) {
  const group = new THREE.Group();
  const get = (n) => src.getObjectByName(n);
  const template = get('Box');
  const edgeMat = (c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const fades = []; // { mesh, edges, kind }: kind 'wall' wires up when open or hollow, 'frame' only when hollow
  const ghost = (part, kind) =>
    part.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.side = THREE.DoubleSide;
      o.castShadow = o.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 35), edgeMat(new THREE.Color(0.35, 2.2, 2.6)));
      o.add(edges);
      fades.push({ mesh: o, edges, kind });
    });
  const holo = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.3, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const holoEdges = edgeMat(new THREE.Color(0.5, 3.2, 3.6));
  const red = edgeMat(new THREE.Color(3.2, 0.35, 0.25));
  const cargoMats = [];

  const boxes = HERO.xs.map((x, i) => {
    const b = template.clone(true);
    b.position.set(x, 0, HERO.z);
    const parts = Object.fromEntries(['Frame', 'WallL', 'WallR', 'Roof'].map((n) => [n, b.getObjectByName(n)]));
    ghost(parts.Frame, 'frame');
    for (const n of ['WallL', 'WallR', 'Roof']) ghost(parts[n], 'wall');
    const icon = get(['IconAI', 'IconRoute', 'IconTariff'][i]).clone();
    icon.material = holo;
    icon.position.set(0, 1.35, 0);
    icon.add(new THREE.LineSegments(new THREE.EdgesGeometry(icon.geometry, 20), holoEdges));
    const cargo = get('Cargo').clone(true);
    cargo.position.set(0, 0, 0);
    cargo.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.castShadow = o.receiveShadow = true;
      cargoMats.push(o.material);
    });
    const brackets = new THREE.LineSegments(bracketGeometry(BOX.w + 1.2, BOX.h + 0.8, BOX.l + 1.2), red);
    brackets.position.y = -0.2;
    b.add(icon, cargo, brackets);
    group.add(b);
    return { parts, icon, cargo, phase: i * 2.1 };
  });

  const hl = template.clone(true);
  hl.add(get('Lettering').clone());
  hl.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  group.add(hl);

  return {
    group,
    update(s, t) {
      for (const b of boxes) {
        b.parts.WallL.position.x = -1.4 * s.open;
        b.parts.WallR.position.x = 1.4 * s.open;
        b.parts.WallL.rotation.z = 0.1 * s.open;
        b.parts.WallR.rotation.z = -0.1 * s.open;
        b.parts.Roof.position.y = 1.7 * s.open;
        b.icon.rotation.y = 0.5 * Math.sin(t * 0.6 + b.phase);
        b.icon.position.y = 1.35 + 0.08 * Math.sin(t * 1.3 + b.phase);
        b.icon.visible = s.open * (1 - s.hollow) > 0.01;
        b.cargo.visible = s.hollow > 0.01;
      }
      for (const f of fades) {
        const wire = f.kind === 'wall' ? Math.max(s.open, s.hollow) : s.hollow;
        f.mesh.material.opacity = 1 - 0.9 * wire;
        f.mesh.material.depthWrite = wire < 0.02;
        f.edges.material.opacity = 0.7 * wire;
      }
      holo.opacity = 0.35 * s.open * (1 - s.hollow);
      holoEdges.opacity = 0.9 * s.open * (1 - s.hollow);
      red.opacity = s.risk * (0.65 + 0.35 * Math.sin(t * 4));
      for (const m of cargoMats) m.opacity = s.hollow;
      const [x0, z0, y0] = HERO.hl.from;
      const [x1, z1, y1] = HERO.hl.to;
      const k = ease(s.split);
      hl.position.set(THREE.MathUtils.lerp(x0, x1, k), 0, THREE.MathUtils.lerp(z0, z1, k));
      hl.rotation.y = THREE.MathUtils.lerp(y0, y1, k);
    },
  };
}

// Corner brackets of a box w x h x l standing on y = 0 (three short legs at each of the 8 corners).
function bracketGeometry(w, h, l) {
  const pts = [];
  const leg = 1.1;
  for (const sx of [-1, 1])
    for (const sy of [0, 1])
      for (const sz of [-1, 1]) {
        const c = new THREE.Vector3((sx * w) / 2, sy * h, (sz * l) / 2);
        pts.push(c, c.clone().add(new THREE.Vector3(-sx * leg, 0, 0)));
        pts.push(c, c.clone().add(new THREE.Vector3(0, sy ? -leg : leg, 0)));
        pts.push(c, c.clone().add(new THREE.Vector3(0, 0, -sz * leg)));
      }
  return new THREE.BufferGeometry().setFromPoints(pts);
}
