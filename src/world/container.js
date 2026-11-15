import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createOcean, createSky, loadHdr, sunDirection } from './sea.js';
import { dressAll, loadSurfaces } from './materials.js';

// Scene 2 as a live 3D world: an orange 40 ft container on the quay (scripts/blender/build_container.py).
// Step 0: the camera has just zoomed in from scene 1 and locks on to the box. Step 1: closer, the figures
// slide in. Step 2: the doors swing open and the camera glides inside, low sun raking in behind it.
// Three.js axes: x along the container towards the doors, y up, z to the right looking out.

const LI = 12.03; // inside length: the door opening is at x = LI
const DOOR = { w: 2.34, h: 2.58 };
const WO_HALF = 1.22; // half the outside width (corrugation peaks)
const WATER_Y = -2.6;
const SUN = { elevation: 7, offset: -20 }; // degrees: low, from the front left, so the beam lands on the right
const ENV_INTENSITY = 0.7; // HDRI image light outside
const INSIDE_ENV = 0.35; // the walls see little sky
const LANE = { x: 700, speed: 9, range: 500 }; // passing ship: distance (m), m/s, z from +range to -range

const SURFACES = { rust: { file: 'rusty_painted_metal', repeat: 1 / 5 } };
const LOOK = {
  Wall: { surface: 'rust', detail: 0.35, normal: 0.35 },
  Frame: { surface: 'rust', detail: 0.5, normal: 0.4 },
  Door: { surface: 'rust', detail: 0.5, normal: 0.4 },
};
const INSIDE = ['Wall', 'Frame', 'Floor', 'Fittings'];
// Camera poses: position p, look-at t. The look-at point is the view centre, where the HUD reticle sits.
const POSES = {
  lock: { p: [LI + 7.5, 3.4, 8.5], t: [LI - 4.5, 1.2, 0] },
  read: { p: [LI + 5.0, 2.6, 6.0], t: [LI - 4.5, 1.2, 0] },
  doorway: { p: [LI + 3.2, 1.5, 0], t: [0, 1.3, 0] },
  inside: { p: [LI - 2.4, 1.45, 0.25], t: [0, 1.15, -0.35] },
};
const STEP_POSE = ['lock', 'read', 'inside'];

export async function createContainerWorld() {
  RectAreaLightUniformsLib.init();
  const loader = new GLTFLoader();
  const [gltf, shipGltf, surfaces, hdr] = await Promise.all([
    loader.loadAsync('models/container.glb'),
    loader.loadAsync('models/ship.glb'),
    loadSurfaces(SURFACES),
    loadHdr(),
  ]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.05, 12000);
  const sun = sunDirection(new THREE.Vector3(1, 0, 0), SUN.elevation, SUN.offset);
  const sky = createSky(scene, sun);
  const sunColor = new THREE.Color(1.0, 0.66, 0.4);

  const ocean = createOcean({ envTexture: sky.envTexture, sun, sunColor, speed: 0, wave: 0.25, ripple: 0.3, haze: 0.0005 });
  ocean.position.y = WATER_Y;
  scene.add(ocean);

  const set = gltf.scene;
  dressAll(set, surfaces, LOOK);
  const door = set.getObjectByName('Door');
  const doorAngle = door.rotation.y; // open, as built
  // Blender builds one leaf (hinged at +z); the other is its mirror image.
  const door2 = door.clone();
  door2.position.z = -door.position.z;
  door2.scale.z = -1;
  set.add(door2);
  set.add(lettering());
  set.traverse((o) => {
    if (!o.isMesh) return;
    if (['Wall', 'Frame'].includes(o.material.name)) o.material.side = THREE.DoubleSide; // seen from outside too
    o.castShadow = o.material.name !== 'Shore';
    // the sun grazes the quay at 7 degrees: shadows there would only add acne stripes
    o.receiveShadow = !['Shore', 'Quay', 'Kerb'].includes(o.material.name);
    if (o.material.name === 'Floor') plywood(o.material);
    if (o.material.name === 'Shore') haze(o.material, sky.envTexture, 0.0003);
  });
  scene.add(set);

  // A ship crossing the harbour mouth, seen through the doors now and then.
  const ship = shipGltf.scene;
  ship.rotation.y = Math.PI / 2; // bow (+x in the model) towards -z: right to left
  ship.position.set(LANE.x, WATER_Y, 0);
  ship.traverse((o) => o.isMesh && haze(o.material, sky.envTexture, 0.0003));
  scene.add(ship);

  // Lights: the low sun with shadows (the beam through the doors), skylight from the opening.
  const light = new THREE.DirectionalLight(sunColor, 3.2);
  light.target.position.set(6, 1, 0);
  light.position.copy(light.target.position).addScaledVector(sun, 40);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -6, right: 6, top: 4, bottom: -4, near: 20, far: 60 });
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  const opening = new THREE.RectAreaLight(0xffd2ad, 9, DOOR.w, DOOR.h);
  opening.position.set(LI - 0.05, DOOR.h / 2, 0);
  opening.lookAt(0, DOOR.h / 2, 0);
  scene.add(light, light.target, opening, new THREE.HemisphereLight(0x8fa6c8, 0x2a2018, 0.35));

  const dust = dustMotes(sun, 600);
  scene.add(dust);

  // Animated state: door 0 = shut, 1 = open as built; cam = pose being shown.
  const state = { door: 0, cam: pose('lock') };
  let tl = null;
  let at = 'lock';

  let ready = false;
  return {
    scene,
    camera,
    init(renderer) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      sky.bake(renderer, { hide: [ocean, set, ship, dust], hdr, envIntensity: ENV_INTENSITY });
      // Inside, the sky is only seen through the doors: a much weaker environment light.
      set.traverse((o) => {
        if (!o.isMesh || !INSIDE.includes(o.material.name)) return;
        o.material.envMap = scene.environment;
        o.material.envMapRotation.copy(scene.environmentRotation);
        o.material.envMapIntensity = INSIDE_ENV;
      });
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // Move to the pose for a reveal step: animated, or at once (entering the scene from elsewhere).
    // Going in or out passes the doorway, with the doors open.
    go(step, instant = false) {
      const to = STEP_POSE[Math.min(step, STEP_POSE.length - 1)];
      tl?.kill();
      if (instant) {
        Object.assign(state, { door: to === 'inside' ? 1 : 0, cam: pose(to) });
      } else if (to === 'inside') {
        tl = gsap.timeline()
          .to(state, { door: 1, duration: 1.4, ease: 'power2.inOut' })
          .to(state.cam, { ...pose('doorway'), duration: 1.5, ease: 'power2.inOut' }, 0.5)
          .to(state.cam, { ...pose('inside'), duration: 1.8, ease: 'power2.out' });
      } else {
        tl = gsap.timeline();
        if (at === 'inside') tl.to(state.cam, { ...pose('doorway'), duration: 1.4, ease: 'power2.in' });
        tl.to(state.cam, { ...pose(to), duration: 1.6, ease: 'power2.inOut' }).to(state, { door: 0, duration: 1.2, ease: 'power2.inOut' }, '<0.4');
      }
      at = to;
    },
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      ocean.material.uniforms.uTime.value = t;
      dust.material.uniforms.uTime.value = t;
      const creak = state.door * (Math.sin(t * 0.4) * 0.025 + Math.sin(t * 1.3) * 0.006); // in the breeze, when open
      door.rotation.y = doorAngle * state.door + creak;
      door2.rotation.y = -door.rotation.y;
      ship.position.z = LANE.range - ((t * LANE.speed) % (2 * LANE.range));
      // Hand-held: a little drift and breathing on top of the pose.
      const c = state.cam;
      camera.position.set(c.px + 0.06 * Math.sin(t * 0.31) + lean.x * 0.15, c.py + 0.03 * Math.sin(t * 0.9) + lean.y * 0.1, c.pz + 0.06 * Math.sin(t * 0.23));
      camera.lookAt(c.tx, c.ty + 0.02 * Math.sin(t * 0.6), c.tz + lean.x * 0.2);
    },
  };
}

// Plywood floor: vertex colour per board (Blender), wavy veneer grain along the board, wear from the
// rust texture's light and dark. UVs are metres with a random offset per board.
function plywood(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBoard;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBoard = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vBoard;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float warp = vnoise(vBoard * vec2(0.7, 3.0)) * 7.0 + vnoise(vBoard * vec2(2.5, 9.0)) * 1.5;
        float rings = 0.5 + 0.5 * sin(vBoard.y * 38.0 + warp);
        float fibre = vnoise(vBoard * vec2(3.0, 120.0));
        float wear = vnoise(vBoard * 1.3) * 0.6 + vnoise(vBoard * 6.0) * 0.4;
        diffuseColor.rgb *= mix(0.72, 1.1, rings) * mix(0.9, 1.05, fibre) * mix(0.75, 1.08, wear);`
      );
  };
  material.roughness = 0.7;
  material.needsUpdate = true;
}

// Distance haze into the horizon colour of the baked sky, same as the sea's.
function haze(material, envTexture, density) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHazeEnv = { value: envTexture };
    shader.uniforms.uHaze = { value: density };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHazeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHazeWorld;\nuniform samplerCube uHazeEnv;\nuniform float uHaze;')
      .replace(
        '#include <dithering_fragment>',
        `vec3 hv = vHazeWorld - cameraPosition;
        vec3 horizon = textureCube(uHazeEnv, normalize(vec3(hv.x, 0.03 * length(hv.xz), hv.z))).rgb;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, horizon, 1.0 - exp(-length(hv) * uHaze));
        #include <dithering_fragment>`
      );
  };
  material.needsUpdate = true;
}

// Dust drifting in the container; bright where it crosses the sunbeam.
function dustMotes(sun, count) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([0.5 + Math.random() * (LI - 0.5), 0.1 + Math.random() * 2.5, (Math.random() - 0.5) * 2.2], i * 3);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSun: { value: sun }, uColor: { value: new THREE.Color(1.0, 0.8, 0.6) } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSun;
        attribute float seed;
        varying float vLit;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.11 + seed) * 0.25, sin(uTime * 0.07 + seed * 3.1) * 0.2, cos(uTime * 0.09 + seed * 1.7) * 0.2);
          // trace towards the sun: does this mote see it through the door opening?
          float t = (${LI.toFixed(2)} - p.x) / uSun.x;
          vec3 q = p + uSun * t;
          float inside = step(abs(q.z), ${(DOOR.w / 2).toFixed(2)}) * step(0.0, q.y) * step(q.y, ${DOOR.h.toFixed(2)});
          vLit = mix(0.06, 1.0, inside) * (0.6 + 0.4 * sin(uTime * 1.3 + seed * 5.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = max((1.5 + fract(seed) * 2.5) * 5.0 / -mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vLit;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(uColor * vLit * 0.9 * smoothstep(0.5, 0.0, r), 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  points.frustumCulled = false; // positions drift in the shader
  return points;
}

// A pose as a flat object gsap can tween.
function pose(name) {
  const { p, t } = POSES[name];
  return { px: p[0], py: p[1], pz: p[2], tx: t[0], ty: t[1], tz: t[2] };
}

// HAPAG-LLOYD in white on the side facing the camera (+z), just proud of the corrugation.
function lettering() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4f1ec';
  g.font = '800 200px Montserrat';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('HAPAG-LLOYD', 1024, 136);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.9), new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.position.set(LI / 2 + 0.3, 1.55, WO_HALF + 0.03);
  mesh.receiveShadow = true;
  return mesh;
}
