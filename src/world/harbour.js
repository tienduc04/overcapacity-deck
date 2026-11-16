import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOcean, createSky, haze, loadHdr, sunDirection } from './sea.js';

// Scene 7 as a live 3D world: the harbour at dawn seen from the river. A row of brick warehouses and a
// container terminal on the far bank (scripts/blender/build_harbour.py), golden haze, and our ship
// (scripts/blender/build_ship.py) coming in and slowing to a stop in front of the cranes: the arrival.
// Axes: the far bank runs along x at z ~ -700, the camera looks along -z from the near side.

const SUN = { elevation: 2, offset: 6 }; // degrees: low behind the warehouses (left of the frame centre), clear of the ship
const ENV_INTENSITY = 0.6;
const HAZE = 0.0008; // per metre: the far bank is a warm silhouette, the ship stays clear
const SHIP = { z: -470, from: 560, to: 200, tau: 25 }; // lane z; x at the start and where it settles; s
const CAM = { p: [-40, 14, -150], t: [150, 34, -700] };

export async function createHarbourWorld() {
  const loader = new GLTFLoader();
  const [harbourGltf, shipGltf, hdr] = await Promise.all([loader.loadAsync('models/harbour.glb'), loader.loadAsync('models/ship.glb'), loadHdr()]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 1, 12000);
  const sun = sunDirection(new THREE.Vector3(0, 0, -1), SUN.elevation, SUN.offset);
  const sky = createSky(scene, sun);
  const sunColor = new THREE.Color(1.0, 0.7, 0.42);

  const ocean = createOcean({ envTexture: sky.envTexture, sun, sunColor, speed: 0, wave: 0.12, ripple: 0.3, haze: 0.0006 });
  scene.add(ocean);

  const harbour = harbourGltf.scene;
  harbour.traverse((o) => o.isMesh && haze(o.material, sky.envTexture, HAZE));
  const ship = shipGltf.scene;
  ship.rotation.y = Math.PI; // bow (+x in the model) towards -x: in from the right
  ship.traverse((o) => o.isMesh && haze(o.material, sky.envTexture, HAZE * 0.6));
  const rig = new THREE.Group(); // bobbing pivot at the waterline
  rig.add(ship);
  rig.position.set(SHIP.from, 0, SHIP.z);
  scene.add(harbour, rig);

  const light = new THREE.DirectionalLight(sunColor, 2.6);
  light.position.copy(sun).multiplyScalar(1000);
  const fill = new THREE.DirectionalLight(0x9fb2cf, 0.8); // cool light from the sky behind the camera
  fill.position.set(-300, 400, 800);
  scene.add(light, fill, new THREE.HemisphereLight(0xb7c3d6, 0x2a2018, 0.5));

  const sunPoint = new THREE.Vector3();
  const look = new THREE.Vector3();
  let start = null; // time the arrival began
  let ready = false;
  return {
    scene,
    camera,
    post: {
      bloom: { strength: 0.14, radius: 0.35, threshold: 9.0 }, // HDR units: only the sun disc and its glitter
      rays: { intensity: 0.2, threshold: 9.0 },
      sun(uv) {
        if (!uv) return;
        const v = sunPoint.copy(camera.position).addScaledVector(sun, 5000).project(camera);
        uv.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      },
    },
    init(renderer) {
      sky.bake(renderer, { hide: [ocean, harbour, rig], hdr, envIntensity: ENV_INTENSITY });
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // Start the ship's approach (each time the scene is entered).
    arrive() {
      start = null;
    },
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      if (start === null) start = t;
      ocean.material.uniforms.uTime.value = t;
      // Comes in fast, eases to a stop: x approaches SHIP.to exponentially.
      rig.position.x = SHIP.to + (SHIP.from - SHIP.to) * Math.exp(-(t - start) / SHIP.tau);
      rig.position.y = Math.sin(t * 0.5) * 0.3;
      rig.rotation.x = Math.sin(t * 0.4) * 0.004;
      const [px, py, pz] = CAM.p;
      camera.position.set(px + 12 * Math.sin(t * 0.04) + lean.x * 6, py + 1.5 * Math.sin(t * 0.07) + lean.y * 3, pz);
      camera.lookAt(look.set(...CAM.t));
    },
  };
}
