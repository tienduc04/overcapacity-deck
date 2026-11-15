import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOcean, createSky, loadHdr, sunDirection } from './sea.js';
import { dressAll, loadSurfaces } from './materials.js';

// Scene 1 as a live 3D world: sunset sky, Gerstner-wave ocean, the container ship riding the swell
// and a slow camera sweep. Units are metres. Rendered into an HDR target by renderer.js, which
// applies ACES tone mapping and the deck's grade (see `live` there).

const SHIP_LENGTH = 330; // m, matches L in build_ship.py
const SHIP_SPEED = 7; // m/s of water flowing past (about 14 kn)
// Camera: low over the starboard bow quarter (the lettered side), ship on the right third.
const CAM = { angle: -38, radius: 300, height: 34 }; // degrees around the ship, metres
const SUN = { elevation: 2, offset: 14 }; // degrees above the horizon / right of the view centre
const ENV_INTENSITY = 0.8; // HDRI image light on the ship

const SURFACES = {
  rust: { file: 'rusty_painted_metal', repeat: 1 / 5 },
  plate: { file: 'metal_plate_02', repeat: 1 / 2 },
  box: { file: 'container_side', repeat: 1 }, // container UVs: one tile per box height
};
// Hull wear is kept light on purpose.
const LOOK = {
  Hull: { surface: 'rust', detail: 0.35, normal: 0.5 },
  Antifouling: { surface: 'rust', detail: 0.55, normal: 0.6 },
  Superstructure: { surface: 'rust', detail: 0.2, normal: 0.3 },
  Funnel: { surface: 'rust', detail: 0.3, normal: 0.3 },
  Deck: { surface: 'plate', detail: 0.9, normal: 1 },
  'Hatch covers': { surface: 'plate', detail: 0.8, normal: 1 },
  Containers: { surface: 'box', detail: 0.9, normal: 1 },
};

export async function createHeroWorld() {
  const [gltf, surfaces, hdr] = await Promise.all([new GLTFLoader().loadAsync('models/ship.glb'), loadSurfaces(SURFACES), loadHdr()]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 5, 12000);
  // Sun low in the frame, just right of where the camera looks: backlit sunset, glitter path on the sea.
  const ca = THREE.MathUtils.degToRad(CAM.angle);
  const view = new THREE.Vector3(-Math.cos(ca), 0, -Math.sin(ca)); // camera -> ship, horizontal
  const sun = sunDirection(view, SUN.elevation, SUN.offset);
  const sky = createSky(scene, sun);
  const sunColor = new THREE.Color(1.0, 0.62, 0.36);

  // Ship from scripts/blender/build_ship.py: metres, bow +x, waterline at y = 0, centred on x/z.
  const ship = gltf.scene;
  const box = new THREE.Box3().setFromObject(ship);
  dressAll(ship, surfaces, LOOK);
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

  let ready = false;
  return {
    scene,
    camera,
    init(renderer) {
      sky.bake(renderer, { hide: [ocean, rig], hdr, envIntensity: ENV_INTENSITY });
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.setViewOffset(w, h, -w * 0.12, 0, w, h); // shift the shot so the ship sits right of the title
    },
    // t: seconds since page load. lean: smoothed pointer tilt (-1..1).
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      ocean.material.uniforms.uTime.value = t;
      rig.rotation.x = Math.sin(t * 0.5) * 0.012; // roll
      rig.rotation.z = Math.sin(t * 0.37 + 1.0) * 0.008; // pitch
      rig.position.y = Math.sin(t * 0.6) * 0.8;
      // Slow drift along the ship, as if filmed from a drone keeping pace.
      const a = ca + THREE.MathUtils.degToRad(9 * Math.sin(t * 0.05) + lean.x * 4);
      const r = CAM.radius + 25 * Math.sin(t * 0.031);
      camera.position.set(Math.cos(a) * r, CAM.height + 6 * Math.sin(t * 0.07) + lean.y * 8, Math.sin(a) * r);
      camera.lookAt(-20, 22, 0);
    },
  };
}
