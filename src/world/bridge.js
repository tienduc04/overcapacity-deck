import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// Scene 6 as a live 3D world: a ship's bridge at night, three curved screens over the console and the dark
// sea behind the windows. The screens draw the model's output (public/data/scenarios.json, from the Req 6
// Monte Carlo): the fan of the supply-demand gap, then one path per scenario, then the utilisation index.
// Axes: the screens stand on an arc at z ~ 0, the windows are beyond them (z < 0), the camera is at z > 0.

const COLOURS = { optimistic: '#22d6e6', base: '#f4f1ec', downside: '#ff6a4a' };
const TITLES = { optimistic: 'OPTIMISTIC', base: 'BASE', downside: 'DOWNSIDE' };
const ORDER = ['optimistic', 'base', 'downside'];
const ARC = { r: 5.8, axisZ: 5.4, y: 2.45, h: 3.3, span: 34 }; // curved screens: radius, axis z, centre height, height, degrees each
const SCREEN_PX = { w: 1280, h: 800 };
const GAP_RANGE = [-3, 17];
const UTIL_RANGE = [70, 100];
const BRIGHT = 1.7;

// Camera poses per reveal step: position p, look-at t.
const POSES = [
  { p: [-3.4, 2.6, 14.5], t: [-3.4, 2.3, 0] }, // the whole bridge, screens right of the inputs table
  { p: [-2.3, 2.4, 8.2], t: [-2.3, 2.4, 0] }, // the fan on the centre screen, right of the readout
  { p: [0, 3.0, 14.4], t: [0, 2.15, 0] }, // three screens high in the frame, cards below
  { p: [0, 3.0, 14.4], t: [0, 2.15, 0] }, // the three screens again: one stress test each, panel below
  { p: [-2.3, 2.4, 8.2], t: [-2.3, 2.4, 0] }, // the robustness grid on the centre screen, signposts on the left
];
const MODE = ['dim', 'fan', 'paths', 'stress', 'robust']; // what the screens draw per step

const ease = (x) => x * x * (3 - 2 * x);

export async function createBridgeWorld(data) {
  RectAreaLightUniformsLib.init();
  await document.fonts.load('800 60px Montserrat');
  await document.fonts.load('400 30px Inter');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 3000);
  scene.fog = new THREE.FogExp2(0x050b14, 0.006);
  const seaMesh = createSea();
  scene.add(sky(), seaMesh);

  // Room, console, chairs and screen bezels: one Blender mesh (scripts/blender/build_bridge.py, same ARC numbers).
  const gltf = await new GLTFLoader().loadAsync('models/bridge.glb');
  scene.add(gltf.scene);
  // Ceiling strips (x = -9, -3, 3, 9 in the model) light the room from above.
  for (const x of [-9, -3, 3, 9]) {
    const strip = new THREE.RectAreaLight(0xffe2b8, 2.2, 0.5, 22);
    strip.position.set(x, 6.2, 5);
    strip.rotation.x = -Math.PI / 2;
    scene.add(strip);
  }

  // The three curved screens, concave towards the viewer: segments of one cylinder inside the model's bezels.
  const screens = ORDER.map((name, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = SCREEN_PX.w;
    canvas.height = SCREEN_PX.h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1; // seen from inside the cylinder the u axis runs the other way
    const centre = (1 - i) * (ARC.span + 3); // seen from inside the cylinder the angle runs the other way: optimistic on the left
    const a0 = THREE.MathUtils.degToRad(centre - ARC.span / 2);
    const len = THREE.MathUtils.degToRad(ARC.span);
    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(ARC.r, ARC.r, ARC.h, 40, 1, true, a0 + Math.PI, len),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, color: new THREE.Color(BRIGHT, BRIGHT, BRIGHT), toneMapped: false })
    );
    face.position.set(0, ARC.y, ARC.axisZ);
    scene.add(face);
    const lamp = new THREE.PointLight(COLOURS[name], 130, 22, 2);
    const mid = a0 + len / 2 + Math.PI;
    lamp.position.set(Math.sin(mid) * (ARC.r - 1.6), ARC.y - 0.5, ARC.axisZ + Math.cos(mid) * (ARC.r - 1.6));
    scene.add(lamp);
    return { name, canvas, ctx: canvas.getContext('2d'), tex };
  });
  scene.add(new THREE.HemisphereLight(0x3a5272, 0x0a1018, 0.6));

  const draw = (mode) => {
    for (const s of screens) {
      const solo = (mode === 'fan' || mode === 'robust') && s.name !== 'base'; // these live on the centre screen
      if (mode === 'stress') paintStress(s.ctx, data.stress.items[ORDER.indexOf(s.name)]);
      else if (mode === 'robust' && !solo) paintRobust(s.ctx, data.robustness);
      else paint(s.ctx, s.name, solo ? 'dim' : mode, data);
      s.tex.needsUpdate = true;
    }
  };
  draw('dim');

  const state = { cam: pose(0) };
  let tl = null;
  let ready = false;
  return {
    scene,
    camera,
    post: { bloom: { strength: 0.4, radius: 0.5, threshold: 1.2 } }, // the screens, the buttons and the moon glitter
    init(renderer) {
      // dim studio reflections so the steel and the console read as metal
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.12;
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // Show a reveal step: animated (on screen), or at once (arriving from another scene).
    go(step, instant = false) {
      tl?.kill();
      draw(MODE[Math.min(step, MODE.length - 1)]);
      if (instant) return void Object.assign(state.cam, pose(step));
      tl = gsap.timeline().to(state.cam, { ...pose(step), duration: 2.2, ease: 'power2.inOut' });
    },
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      seaMesh.material.uniforms.uTime.value = t;
      const k = state.cam;
      camera.position.set(k.px + 0.12 * Math.sin(t * 0.17) + lean.x * 0.5, k.py + 0.05 * Math.sin(t * 0.23) + lean.y * 0.3, k.pz);
      camera.lookAt(k.tx, k.ty, k.tz);
    },
  };
}

// --- the screens' contents -------------------------------------------------------------------------------

function paint(g, name, mode, data) {
  const { w, h } = SCREEN_PX;
  const col = COLOURS[name];
  const sc = data.scenarios[name];
  const years = data.years;
  const dim = mode === 'dim';
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#071420');
  bg.addColorStop(1, '#040b13');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = dim ? 0.4 : 1;
  const util = mode === 'util';
  const range = util ? UTIL_RANGE : GAP_RANGE;
  const px = { x0: 150, x1: w - 90, y0: 250, y1: h - 120 };
  const X = (i) => px.x0 + ((px.x1 - px.x0) * i) / (years.length - 1);
  const Y = (v) => px.y1 - ((px.y1 - px.y0) * (v - range[0])) / (range[1] - range[0]);

  // header
  g.textBaseline = 'alphabetic';
  g.fillStyle = col;
  g.font = '800 62px Montserrat';
  g.fillText(mode === 'fan' ? 'ALL RUNS' : TITLES[name], 60, 100);
  g.fillStyle = 'rgba(210, 225, 235, 0.85)';
  g.font = '500 28px Montserrat';
  g.fillText(util ? 'UTILISATION INDEX (START OF 2027 = 100)' : 'SUPPLY GROWTH MINUS DEMAND GROWTH, PP A YEAR', 60, 150);

  // grid and axes
  g.lineWidth = 2;
  const step = util ? 10 : 5;
  for (let v = Math.ceil(range[0] / step) * step; v <= range[1]; v += step) {
    g.strokeStyle = v === 0 && !util ? 'rgba(220, 235, 245, 0.7)' : 'rgba(120, 170, 200, 0.18)';
    g.beginPath();
    g.moveTo(px.x0, Y(v));
    g.lineTo(px.x1, Y(v));
    g.stroke();
    g.fillStyle = 'rgba(190, 215, 230, 0.8)';
    g.font = '500 26px Montserrat';
    g.textAlign = 'right';
    g.fillText(String(v), px.x0 - 18, Y(v) + 9);
  }
  g.textAlign = 'center';
  years.forEach((yr, i) => g.fillText(String(yr), X(i), px.y1 + 52));
  g.textAlign = 'left';

  const line = (vals, color, width = 9) => {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.shadowColor = color;
    g.shadowBlur = 26;
    g.beginPath();
    vals.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.stroke();
    g.restore();
    g.fillStyle = color;
    vals.forEach((v, i) => {
      g.beginPath();
      g.arc(X(i), Y(v), 11, 0, Math.PI * 2);
      g.fill();
    });
  };

  if (mode === 'fan') {
    // band between the optimistic and downside percentiles, the median in the middle
    const lo = data.fan_gap_pp.optimistic;
    const hi = data.fan_gap_pp.downside;
    const mid = data.fan_gap_pp.base;
    const fill = g.createLinearGradient(0, px.y0, 0, px.y1);
    fill.addColorStop(0, 'rgba(255, 106, 74, 0.38)');
    fill.addColorStop(1, 'rgba(34, 214, 230, 0.3)');
    g.fillStyle = fill;
    g.beginPath();
    hi.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    for (let i = lo.length - 1; i >= 0; i--) g.lineTo(X(i), Y(lo[i]));
    g.closePath();
    g.fill();
    line(hi, COLOURS.downside, 5);
    line(lo, COLOURS.optimistic, 5);
    line(mid, COLOURS.base, 10);
    const peak = mid.indexOf(Math.max(...mid));
    g.fillStyle = '#ffffff';
    g.font = '800 54px Montserrat';
    g.textAlign = 'center';
    g.fillText(`+${mid[peak].toFixed(1)}`, X(peak), Y(mid[peak]) - 34);
    g.font = '500 24px Montserrat';
    g.fillStyle = 'rgba(210, 225, 235, 0.9)';
    g.fillText(`PEAK ${years[peak]}`, X(peak), Y(mid[peak]) - 98);
    g.textAlign = 'left';
    g.font = '500 24px Montserrat';
    g.fillStyle = 'rgba(190, 215, 230, 0.85)';
    g.fillText(`${data.runs.toLocaleString('en-US')} MODEL RUNS · BAND = P10 TO P90`, 60, h - 28);
  } else {
    const vals = util ? sc.util_idx : sc.gap_pp;
    line(vals, col);
    const last = vals[vals.length - 1];
    g.fillStyle = '#ffffff';
    g.font = '800 120px Montserrat';
    g.textAlign = 'right';
    g.fillText(util ? last.toFixed(0) : `${last >= 0 ? '+' : ''}${last.toFixed(1)}`, w - 60, 130);
    g.font = '500 24px Montserrat';
    g.fillStyle = 'rgba(210, 225, 235, 0.9)';
    g.fillText(`${years[years.length - 1]}${util ? '' : ' PP'}`, w - 60, 168);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(190, 215, 230, 0.85)';
    g.fillText('MODEL OUTPUT · CARRIERS’ VIEW', 60, h - 28);
  }
  g.globalAlpha = 1;
}

// One reverse stress test per screen: what a single lever would need to close the 2028 gap, against the record.
function paintStress(g, it) {
  const { w, h } = SCREEN_PX;
  screenBg(g);
  g.textAlign = 'left';
  g.fillStyle = '#F37021';
  g.font = '800 58px Montserrat';
  g.fillText(it.k.toUpperCase(), 60, 100);
  g.fillStyle = 'rgba(210, 225, 235, 0.85)';
  g.font = '500 26px Montserrat';
  g.fillText('TO CLOSE THE 2028 GAP', 60, 146);
  const bar = (y, label, text, frac, color) => {
    g.fillStyle = 'rgba(190, 215, 230, 0.85)';
    g.font = '500 26px Montserrat';
    g.fillText(label.toUpperCase(), 60, y);
    g.fillStyle = 'rgba(120, 170, 200, 0.16)';
    g.fillRect(60, y + 18, w - 120, 70);
    if (frac != null) {
      g.save();
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 24;
      g.fillRect(60, y + 18, (w - 120) * Math.min(1, frac), 70);
      g.restore();
    }
    g.fillStyle = '#ffffff';
    g.font = '800 54px Montserrat';
    g.textAlign = 'right';
    g.fillText(text, w - 76, y + 74);
    g.textAlign = 'left';
  };
  bar(270, `Needed: ${it.needLabel}`, it.needText, it.need == null ? null : it.need / it.max, '#F37021');
  bar(470, `Record: ${it.refLabel}`, it.refText, it.ref == null ? null : it.ref / it.max, '#22d6e6');
  g.fillStyle = '#f4f1ec';
  g.font = '700 34px Montserrat';
  g.fillText(it.verdict.toUpperCase(), 60, h - 90);
  g.fillStyle = 'rgba(190, 215, 230, 0.85)';
  g.font = '500 24px Montserrat';
  g.fillText('REVERSE STRESS TEST · OTHER INPUTS AT MEDIAN', 60, h - 28);
}

// The assumption sweep: median 2028 gap per variant, all of them still a 2028 peak.
function paintRobust(g, rob) {
  const { w, h } = SCREEN_PX;
  screenBg(g);
  g.textAlign = 'left';
  g.fillStyle = '#22d6e6';
  g.font = '800 58px Montserrat';
  g.fillText('14 OF 14 HOLD', 60, 96);
  g.fillStyle = 'rgba(210, 225, 235, 0.85)';
  g.font = '500 24px Montserrat';
  g.fillText('MEDIAN GAP 2028 (PP) PER ASSUMPTION VARIANT', 60, 138);
  const x0 = 470, x1 = w - 150, max = 15;
  rob.rows.forEach(([name, v], i) => {
    const y = 182 + i * 40;
    g.fillStyle = 'rgba(210, 225, 235, 0.9)';
    g.font = '500 23px Montserrat';
    g.fillText(name.toUpperCase(), 60, y + 22);
    g.fillStyle = i ? 'rgba(244, 241, 236, 0.75)' : '#F37021';
    g.fillRect(x0, y + 4, ((x1 - x0) * v) / max, 24);
    g.fillStyle = '#ffffff';
    g.fillText(v.toFixed(1), x0 + ((x1 - x0) * v) / max + 12, y + 24);
    g.fillStyle = '#22d6e6';
    g.font = '800 26px Montserrat';
    g.fillText('✓', w - 70, y + 24);
  });
  g.fillStyle = 'rgba(190, 215, 230, 0.85)';
  g.font = '500 22px Montserrat';
  g.fillText('HOLDS = PEAK IN 2028, FALLING TO 2030, P10 2028 STILL ABOVE ZERO', 60, h - 24);
}

function screenBg(g) {
  const { w, h } = SCREEN_PX;
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#071420');
  bg.addColorStop(1, '#040b13');
  g.globalAlpha = 1;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.textBaseline = 'alphabetic';
}

// --- sky and sea ---------------------------------------------------------------------------------------

function sky() {
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(vec3(0.012, 0.028, 0.06), vec3(0.001, 0.003, 0.01), smoothstep(0.0, 0.45, h));
        vec3 moon = normalize(vec3(0.35, 0.28, -1.0));
        float m = max(dot(d, moon), 0.0);
        col += vec3(0.55, 0.7, 0.9) * pow(m, 900.0) * 3.0 + vec3(0.2, 0.3, 0.5) * pow(m, 18.0) * 0.5;
        col += vec3(0.8) * step(0.9988, hash(floor(d * 420.0))) * smoothstep(0.08, 0.4, h);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 12), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// Night sea: dark swell and the moon's glitter path.
function createSea() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vW;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y); }
      void main() {
        vec3 view = normalize(vW - cameraPosition);
        vec2 p = vW.xz * 0.12;
        float n = vn(p + vec2(uTime * 0.05, 0.0)) * 0.6 + vn(p * 3.1 - uTime * 0.04) * 0.4;
        vec3 nrm = normalize(vec3((n - 0.5) * 0.6, 1.0, (vn(p * 2.0 + 5.0) - 0.5) * 0.6));
        vec3 moon = normalize(vec3(0.35, 0.28, -1.0));
        vec3 r = reflect(view, nrm);
        float glint = pow(max(dot(r, moon), 0.0), 220.0);
        float fres = pow(1.0 - clamp(-view.y, 0.0, 1.0), 4.0);
        vec3 col = vec3(0.002, 0.006, 0.014) + vec3(0.012, 0.03, 0.06) * fres + vec3(0.6, 0.8, 1.0) * glint * 1.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -14;
  return mesh;
}

function pose(step) {
  const { p, t } = POSES[Math.min(step, POSES.length - 1)];
  return { px: p[0], py: p[1], pz: p[2], tx: t[0], ty: t[1], tz: t[2] };
}
