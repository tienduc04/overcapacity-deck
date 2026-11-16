import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOcean, createSky, loadHdr, sunDirection } from './sea.js';

// Scene 1 as a live 3D world: sunset sky, Gerstner-wave ocean, the container ship riding the swell
// and a slow camera sweep. Units are metres. Rendered into an HDR target by renderer.js, which
// applies ACES tone mapping and the deck's grade (see `live` there).

const SHIP_LENGTH = 330; // m, a large post-Panamax ship
const SHIP_SPEED = 7; // m/s of water flowing past (about 14 kn)
// Camera: low over the starboard bow quarter (the lettered side), ship on the right third.
const CAM = { angle: -38, radius: 300, height: 34 }; // degrees around the ship, metres
const SUN = { elevation: 2, offset: 14 }; // degrees above the horizon / right of the view centre
const ENV_INTENSITY = 0.8; // HDRI image light on the ship

// Fly-in to scene 2: end on an orange box on deck (rig space, m, placed by eye), seen from `dist` m.
const FLY = { target: [142, 18.6, -16.3], from: [0.3, 0.4, -1], dist: 3 }; // the lettered box near the bow; ends close, inside the blur

const TITLE_DEPTH = 900; // m from the camera: beyond the ship (about 300 m), in front of the sky
const DRAUGHT = 14.5; // m below the waterline, typical for this size (the red antifouling stays under water)

// title: { word } lettered into the sky behind the ship.
export async function createHeroWorld(title) {
  const [gltf, hdr, titleMesh] = await Promise.all([new GLTFLoader().loadAsync('models/ship-rm02.glb'), loadHdr(), createTitle(title)]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 5, 12000);
  // Sun low in the frame, just right of where the camera looks: backlit sunset, glitter path on the sea.
  const ca = THREE.MathUtils.degToRad(CAM.angle);
  const view = new THREE.Vector3(-Math.cos(ca), 0, -Math.sin(ca)); // camera -> ship, horizontal
  const sun = sunDirection(view, SUN.elevation, SUN.offset);
  const sky = createSky(scene, sun);
  const sunColor = new THREE.Color(1.0, 0.62, 0.36);

  // "Container Ship" by RM02 (CC-BY-4.0, rebranded by scripts/rebrand_rm02.py): length along x,
  // keel at y = 0, centred on z, unknown units. Scale to SHIP_LENGTH, centre on x, sink to the waterline.
  const ship = gltf.scene;
  let box = new THREE.Box3().setFromObject(ship);
  const k = SHIP_LENGTH / (box.max.x - box.min.x);
  ship.scale.setScalar(k);
  ship.position.set((-(box.min.x + box.max.x) / 2) * k, -box.min.y * k - DRAUGHT, 0);
  box = new THREE.Box3().setFromObject(ship);
  // The ship marks the stencil buffer, so the title behind it is hidden exactly where the ship is.
  ship.traverse((o) => o.isMesh && Object.assign(o.material, { stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp }));
  const ocean = createOcean({
    envTexture: sky.envTexture,
    sun,
    sunColor,
    speed: SHIP_SPEED,
    ship: { half: SHIP_LENGTH / 2, beam: (box.max.z - box.min.z) / 2 },
  });
  scene.add(ocean);
  const rig = new THREE.Group(); // bobbing pivot at the waterline
  rig.add(ship);
  scene.add(rig);

  const light = new THREE.DirectionalLight(sunColor, 2.4);
  light.position.copy(sun).multiplyScalar(1000);
  const fill = new THREE.DirectionalLight(0xa9b8cf, 1.1); // cool sky fill on the shaded, lettered side
  fill.position.copy(view).multiplyScalar(-1000).setY(400);
  scene.add(light, fill, new THREE.HemisphereLight(0x8fa6c8, 0x0b1520, 0.6));
  camera.add(titleMesh); // screen-locked: the ship drifts in front of it
  scene.add(camera);
  const titleFx = { alpha: 1, rise: 0 }; // driven by the scene's entrance animation
  const fly = { p: 0 }; // 0 = drone shot, 1 = close on the orange box; driven by the scene's lead-out
  const sunPoint = new THREE.Vector3();
  const flyTarget = new THREE.Vector3();
  const flyEnd = new THREE.Vector3(...FLY.from).normalize();
  const offset = new THREE.Vector3();
  const look = new THREE.Vector3();
  let shift = 0; // view offset, px

  let ready = false;
  return {
    scene,
    camera,
    init(renderer) {
      sky.bake(renderer, { hide: [ocean, rig, titleMesh], hdr, envIntensity: ENV_INTENSITY });
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      shift = -w * 0.12; // shift the shot so the ship sits right of the centre
      camera.setViewOffset(w, h, shift, 0, w, h);
      const k = Math.min(w / 1920, h / 1080); // the HUD stage: 16:9, centred, scaled to fit
      fitToView(titleMesh, camera, TITLE_DEPTH, (1920 * k) / w, (1080 * k) / h);
    },
    titleFx,
    fly,
    post: {
      bloom: { strength: 0.14, radius: 0.35, threshold: 9.0 }, // HDR units: only the sun disc and its glitter
      rays: { intensity: 0.2, threshold: 9.0 },
      // sun position on screen (uv) for the god rays
      sun(uv) {
        if (!uv) return;
        const v = sunPoint.copy(camera.position).addScaledVector(sun, 5000).project(camera);
        uv.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      },
    },
    // t: seconds since page load. lean: smoothed pointer tilt (-1..1).
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      ocean.material.uniforms.uTime.value = t;
      titleMesh.material.opacity = titleFx.alpha;
      titleMesh.material.map.offset.y = titleFx.rise;
      rig.rotation.x = Math.sin(t * 0.5) * 0.012; // roll
      rig.rotation.z = Math.sin(t * 0.37 + 1.0) * 0.008; // pitch
      rig.position.y = Math.sin(t * 0.6) * 0.8;
      // Slow drift along the ship, as if filmed from a drone keeping pace.
      const a = ca + THREE.MathUtils.degToRad(9 * Math.sin(t * 0.05) + lean.x * 4);
      const r = CAM.radius + 25 * Math.sin(t * 0.031);
      camera.position.set(Math.cos(a) * r, CAM.height + 6 * Math.sin(t * 0.07) + lean.y * 8, Math.sin(a) * r);
      look.set(-20, 22, 0);
      if (fly.p > 0) {
        // Swing round to the box and close in; distance shrinks geometrically, so the speed feels even.
        flyTarget.set(...FLY.target).applyMatrix4(rig.matrixWorld);
        offset.subVectors(camera.position, flyTarget);
        const d = offset.length();
        offset.normalize().lerp(flyEnd, fly.p).normalize().multiplyScalar(d * (FLY.dist / d) ** fly.p);
        camera.position.addVectors(flyTarget, offset);
        look.lerp(flyTarget, Math.min(1, fly.p * 1.6));
      }
      if (camera.view) camera.view.offsetX = shift * (1 - fly.p); // the box ends in the centre, where the zoom blur aims (no view before the first resize)
      camera.updateProjectionMatrix();
      camera.lookAt(look);
    },
  };
}

// The title as a full-view quad drawn on a 1920×1080 canvas (same layout units as the HUD). It is
// drawn after the ship without depth testing, and only where the ship has not marked the stencil.
async function createTitle({ word }) {
  await document.fonts.load('800 222px Montserrat');
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const g = canvas.getContext('2d');
  g.textAlign = 'center';
  // Dark letters against the bright sunset sky, fading out towards the horizon. Opaque: in HDR even
  // 5 % of the sky around the sun shows through. (Thin text stays in HTML, after tone mapping.)
  const fade = g.createLinearGradient(0, 318, 0, 540);
  fade.addColorStop(0, 'rgb(10, 17, 24)');
  fade.addColorStop(0.55, 'rgb(14, 18, 24)');
  fade.addColorStop(1, 'rgba(40, 30, 30, 0)');
  g.fillStyle = fade;
  g.font = '800 222px Montserrat';
  g.letterSpacing = '-2px';
  g.fillText(word.toUpperCase(), 960, 509);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    stencilWrite: true, // enables the stencil test; the ops keep the buffer as it is
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = 10; // after the ship, including its transparent parts
  mesh.frustumCulled = false;
  return mesh;
}

// Place a camera-child quad at `depth` metres over the part of the (offset) view the HUD stage covers:
// sx, sy are its half-size in normalised device coordinates. Keeps the 16:9 canvas undistorted.
function fitToView(mesh, camera, depth, sx, sy) {
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  [[-sx, sy], [sx, sy], [-sx, -sy], [sx, -sy]].forEach(([x, y], i) => {
    v.set(x, y, 0.5).applyMatrix4(camera.projectionMatrixInverse);
    v.multiplyScalar(-depth / v.z);
    pos.setXYZ(i, v.x, v.y, v.z);
  });
  pos.needsUpdate = true;
}
