import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOcean, createSky, loadHdr, sunDirection } from './sea.js';
import { dressAll, loadSurfaces } from './materials.js';

// Scene 3 as a live 3D world: a container terminal at blue hour. A ship-to-shore crane scans the
// apron with a cyan laser; on the apron the boxes stack into a bar chart, one box per percentage
// point: orange = net fleet growth, cyan = port throughput growth, one pair of stacks per year.
// Axes: x along the quay, y up, the sea at z < 0, the apron and the camera at z > 0. Units: metres.

const BOX = { w: 2.44, h: 2.59, l: 12.19 }; // 40 ft high cube; long side across the quay (z)
const TIER = 2.62; // stacking pitch
const CHART = { z: 46, spacing: 13, pair: 1.45 }; // apron row of the stacks; x between years; half gap in a pair
const COLOURS = { fleet: '#d2601f', demand: '#1f9fb3' };
const CRANE = { x: 0, legs: [6, 34], gauge: 30, boomY: 44, boomZ: [-52, 58] }; // landside backreach over the chart
const WATER_Y = -3.5;
const SUN = { elevation: -3, offset: 25 }; // just below the horizon: blue hour
const ENV_INTENSITY = 0.12;
const DROP = 26; // m a box falls into place from

const SURFACES = { side: { file: 'container_side', repeat: 1 / 2.4 } };
const LOOK = { Box: { surface: 'side', detail: 0.6, normal: 0.6 } };

// Camera poses per reveal step: position p, look-at t.
const POSES = [
  { p: [-70, 16, 160], t: [8, 22, 0] }, // wide: crane, ship, the empty apron
  { p: [-16, 20, 128], t: [-16, 10, CHART.z] }, // the chart, right of the HUD figures
  { p: [0, 95, 160], t: [0, 0, CHART.z - 4] }, // high, small in the middle between the HUD columns
];

// series: { years, fleet, demand } in % per year (null = no figure: no stack).
export async function createPortWorld(series) {
  const loader = new GLTFLoader();
  const [shipGltf, surfaces, hdr] = await Promise.all([loader.loadAsync('models/ship.glb'), loadSurfaces(SURFACES), loadHdr(), document.fonts.load('800 120px Montserrat')]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 12000);
  const sun = sunDirection(new THREE.Vector3(0, 0, -1), SUN.elevation, SUN.offset);
  const sky = createSky(scene, sun);
  scene.fog = new THREE.FogExp2(0x14253d, 0.003);

  const ocean = createOcean({ envTexture: sky.envTexture, sun, sunColor: new THREE.Color(0.4, 0.5, 0.7), wave: 0.15, ripple: 0.25, haze: 0.002 });
  ocean.position.y = WATER_Y;
  scene.add(ocean);
  const quay = new THREE.Mesh(new THREE.BoxGeometry(600, 4, 260), new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.92 }));
  quay.position.set(0, -2, 130); // top at y = 0, edge at z = 0
  quay.receiveShadow = true;
  scene.add(quay);

  // The ship at berth, under the crane's boom.
  const ship = shipGltf.scene;
  const sb = new THREE.Box3().setFromObject(ship);
  ship.position.set(-(sb.min.x + sb.max.x) / 2 - 40, WATER_Y, -(sb.max.z - sb.min.z) / 2 - 4);
  scene.add(ship);

  const crane = createCrane();
  scene.add(crane.group);

  // Containers: one instanced mesh for the chart, one for the yard around it.
  const boxGeo = boxGeometry();
  const boxMat = new THREE.MeshStandardMaterial({ name: 'Box', color: 0xffffff, roughness: 1 });
  const holder = new THREE.Group();
  const chart = chartStacks(series, boxGeo, boxMat);
  const yard = yardStacks(boxGeo, boxMat);
  holder.add(chart.mesh, yard);
  dressAll(holder, surfaces, LOOK);
  scene.add(holder, ...chart.labels);

  const laser = createLaser();
  scene.add(laser.group);

  // Light: cool sky fill, a dim moon, warm floodlights from the crane and two masts.
  const moon = new THREE.DirectionalLight(0x9fb4e0, 1.2);
  moon.position.set(-200, 300, 250);
  scene.add(moon, new THREE.HemisphereLight(0x4a6a9c, 0x15181c, 1.6));
  for (const [x, y, z, tz] of [[0, CRANE.boomY - 2, CHART.z + 4, CHART.z], [-60, 32, 70, CHART.z], [60, 32, 70, CHART.z]]) {
    const s = new THREE.SpotLight(0xffc98a, 16000, 160, 0.6, 0.6, 2);
    s.position.set(x, y, z);
    s.target.position.set(x * 0.5, 0, tz);
    scene.add(s, s.target);
  }

  // Animated state: cam = pose shown, built = boxes dropped so far (chart.count when complete).
  const state = { cam: pose(0), built: 0, scanX: 0, scan: 1 };
  let tl = null;
  let ready = false;
  return {
    scene,
    camera,
    init(renderer) {
      sky.bake(renderer, { hide: [ocean, quay, ship, crane.group, holder, laser.group, ...chart.labels], hdr, envIntensity: ENV_INTENSITY });
      scene.background = new THREE.Color(0x14253d); // the baked dusk sky is too bright for the night look
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // Show a reveal step: animated (on screen), or at once (arriving from another scene).
    go(step, instant = false) {
      tl?.kill();
      const built = step >= 1 ? chart.count : 0;
      if (instant) {
        Object.assign(state, { cam: pose(step), built, scan: 1 });
        return;
      }
      tl = gsap.timeline().to(state.cam, { ...pose(step), duration: 2.2, ease: 'power2.inOut' }, 0);
      if (built > state.built) {
        // The laser follows the stacks as they go up, year by year, then goes back to sweeping.
        tl.to(state, { scan: 0, duration: 0.4 }, 0.6).to(state, { built, duration: chart.count * 0.11, ease: 'none' }, 0.8).to(state, { scan: 1, duration: 0.8 });
      } else if (built < state.built) tl.to(state, { built, duration: 0.6, ease: 'power1.in' }, 0);
    },
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      ocean.material.uniforms.uTime.value = t;
      chart.place(state.built);
      // Laser: sweeps the apron, or tracks the stack being built.
      const sweep = 30 * Math.sin(t * 0.45); // over the chart only, clear of the HUD figures
      const x = THREE.MathUtils.lerp(chart.xAt(state.built), sweep, state.scan);
      crane.trolley.position.x = x * 0.15; // the crane cannot move that fast; the beam swivels
      laser.aim(crane.trolley.position, x, t);
      const c = state.cam;
      camera.position.set(c.px + 0.8 * Math.sin(t * 0.13) + lean.x * 2, c.py + 0.4 * Math.sin(t * 0.21) + lean.y * 1.2, c.pz);
      camera.lookAt(c.tx, c.ty, c.tz);
    },
  };
}

// --- chart -----------------------------------------------------------------------------------------

// Stacks for each year: fleet (orange, left) and demand (cyan, right), one box per percentage point
// (rounded), dropped in order: year by year, both stacks of a year together. Labels on the apron.
function chartStacks({ years, fleet, demand }, geo, mat) {
  const slots = []; // { x, y, colour, order }
  let order = 0;
  const x0 = -((years.length - 1) * CHART.spacing) / 2;
  const xs = years.map((_, i) => x0 + i * CHART.spacing);
  const startOf = [];
  years.forEach((_, i) => {
    startOf.push(order);
    const tiers = [fleet[i], demand[i]].map((v) => (v == null ? 0 : Math.round(v)));
    for (let k = 0; k < Math.max(...tiers); k++) {
      tiers.forEach((n, j) => {
        if (k < n) slots.push({ x: xs[i] + (j ? CHART.pair : -CHART.pair), y: BOX.h / 2 + k * TIER, colour: j ? COLOURS.demand : COLOURS.fleet, order });
      });
      order++;
    }
  });
  startOf.push(order);
  const mesh = new THREE.InstancedMesh(geo, mat, slots.length);
  const colour = new THREE.Color();
  slots.forEach((s, i) => mesh.setColorAt(i, colour.set(s.colour)));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false; // boxes fall in from above the bounds
  const m = new THREE.Matrix4();
  let shown = -1;
  return {
    mesh,
    count: order,
    labels: years.map((y, i) => yearLabel(y, fleet[i], demand[i], xs[i])),
    // x of the stack pair being built when `built` boxes are down (fractional).
    xAt(built) {
      const i = startOf.findIndex((s, k) => built < startOf[k + 1]);
      return xs[i < 0 ? xs.length - 1 : i];
    },
    // Boxes with order < built are down; the next one falls; the rest are hidden.
    place(built) {
      if (built === shown) return;
      shown = built;
      slots.forEach((s, i) => {
        const k = THREE.MathUtils.clamp(built - s.order, 0, 1);
        const fall = 1 - k * k; // accelerating, like a drop
        m.makeScale(k > 0 ? 1 : 0, k > 0 ? 1 : 0, k > 0 ? 1 : 0).setPosition(s.x, s.y + fall * DROP, CHART.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Painted on the apron in front of the stacks: the year, and the two figures in their colours.
function yearLabel(year, fleet, demand, x) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.textAlign = 'center';
  g.font = '800 104px Montserrat';
  g.fillStyle = '#f4f1ec';
  g.fillText(year, 256, 104);
  g.font = '800 64px Montserrat';
  const fmt = (v) => (v == null ? 'n/a' : `+${v.toFixed(1)}`);
  g.fillStyle = COLOURS.fleet;
  g.fillText(fmt(fleet), 136, 210);
  g.fillStyle = '#4fd8ea';
  g.fillText(fmt(demand), 376, 210);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 5.5), new THREE.MeshBasicMaterial({ map, transparent: true, color: new THREE.Color(1.6, 1.6, 1.6), depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.03, CHART.z + BOX.l / 2 + 4.5);
  return mesh;
}

// The terminal yard around the chart: blocks of stacks 1-4 high in muted colours (fixed seed).
function yardStacks(geo, mat) {
  const colours = ['#1d2a52', '#7d8798', '#4a1c22', '#2f4a3a', '#8a8f96', '#c9561c'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const items = [];
  for (const [bx, bz, rows, cols] of [[-150, 40, 9, 6], [92, 40, 9, 6], [-150, 92, 9, 6], [92, 92, 9, 6]]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < h; k++) items.push([bx + r * (BOX.w + 0.4), BOX.h / 2 + k * TIER, bz + c * (BOX.l + 1.5), colours[Math.floor(rnd() * colours.length)]]);
      }
    }
  }
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const colour = new THREE.Color();
  items.forEach(([x, y, z, c], i) => {
    mesh.setMatrixAt(i, m.makeTranslation(x, y, z));
    mesh.setColorAt(i, colour.set(c).multiplyScalar(0.8));
  });
  mesh.receiveShadow = true;
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

// Ship-to-shore crane from steel boxes: two portal frames, the boom out over the ship and back over
// the apron, the A-frame with its stays, and the trolley (moves along x a little, for the laser).
function createCrane() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.6, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.6, metalness: 0.3 });
  const beam = (a, b, size, mat = steel) => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, va.distanceTo(vb)), mat);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.lookAt(vb);
    mesh.castShadow = true;
    group.add(mesh);
  };
  const { x, legs, gauge, boomY, boomZ } = CRANE;
  const top = boomY - 3;
  for (const side of [-1, 1]) {
    const sx = x + (side * gauge) / 2;
    for (const z of legs) beam([sx, 0, z], [sx, top, z], 1.8, red);
    beam([sx, 12, legs[0]], [sx, 12, legs[1]], 1.4);
    beam([sx, top, legs[0]], [sx, top, legs[1]], 1.6);
    beam([sx, 0.8, legs[0] - 3], [sx, 0.8, legs[1] + 3], 2.2); // sill beam over the wheels
    beam([sx, boomY, boomZ[0]], [sx, boomY, boomZ[1]], 1.6); // boom girder
    beam([sx, boomY + 26, legs[1] - 6], [sx, top, legs[1]], 1.2); // A-frame
    beam([sx, boomY + 26, legs[1] - 6], [sx, top, legs[0]], 1.2);
    beam([sx, boomY + 26, legs[1] - 6], [sx, boomY, boomZ[0] + 8], 0.5); // forestay
    beam([sx, boomY + 26, legs[1] - 6], [sx, boomY, boomZ[1]], 0.5); // backstay
  }
  for (const z of [...legs, boomZ[0], boomZ[1]]) beam([x - gauge / 2, z === legs[0] || z === legs[1] ? top : boomY, z], [x + gauge / 2, z === legs[0] || z === legs[1] ? top : boomY, z], 1.4);
  beam([x - gauge / 2, boomY + 26, legs[1] - 6], [x + gauge / 2, boomY + 26, legs[1] - 6], 1.2);
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 8), new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.5, emissive: 0x00f0ff, emissiveIntensity: 0.15 }));
  trolley.position.set(x, boomY - 2.5, CHART.z);
  group.add(trolley);
  // Aircraft warning lights on the A-frame.
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.6, 0.4) }));
  lamp.position.set(x, boomY + 26.8, legs[1] - 6);
  group.add(lamp);
  return { group, trolley };
}

// Cyan scan beam: a thin fan from the trolley down to a line across the apron, and the glowing line.
function createLaser() {
  const group = new THREE.Group();
  const glow = (alpha) => new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 4, 5), transparent: true, opacity: alpha, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const fan = new THREE.Mesh(fanGeo, glow(0.05));
  fan.frustumCulled = false;
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, BOX.l + 6), glow(0.9));
  group.add(fan, line);
  return {
    group,
    aim(from, x, t) {
      const p = fanGeo.attributes.position;
      const half = (BOX.l + 6) / 2;
      p.setXYZ(0, from.x, from.y - 1.5, from.z);
      p.setXYZ(1, x, 0.05, CHART.z - half);
      p.setXYZ(2, x, 0.05, CHART.z + half);
      p.needsUpdate = true;
      line.position.set(x, 0.06, CHART.z);
      line.material.opacity = 0.75 + 0.25 * Math.sin(t * 9);
    },
  };
}

function pose(step) {
  const { p, t } = POSES[Math.min(step, POSES.length - 1)];
  return { px: p[0], py: p[1], pz: p[2], tx: t[0], ty: t[1], tz: t[2] };
}
