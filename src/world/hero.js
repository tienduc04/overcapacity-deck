import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

// Scene 1 as a live 3D world: sunset sky, Gerstner-wave ocean, the container ship riding the swell
// and a slow camera sweep. Units are metres. Rendered into an HDR target by renderer.js, which
// applies ACES tone mapping and the deck's grade (see `live` there).

const SHIP_LENGTH = 330; // m, matches L in build_ship.py
const SHIP_SPEED = 7; // m/s of water flowing past (about 14 kn)
// Camera: low over the starboard bow quarter (the lettered side), ship on the right third.
const CAM = { angle: -38, radius: 300, height: 34 }; // degrees around the ship, metres
const SUN = { elevation: 2, offset: 14 }; // degrees above the horizon / right of the view centre

const oceanVertex = /* glsl */ `
  uniform float uTime, uSpeed;
  varying vec3 vWorld, vNormal;
  varying float vCrest;
  // GPU Gems 1 ch. 1 Gerstner wave: d direction, L wavelength (m), s steepness (0..1)
  vec3 gerstner(vec2 p, vec2 d, float L, float s, inout vec3 t, inout vec3 b) {
    float k = 6.28318 / L, c = sqrt(9.8 / k), a = s / k;
    float f = k * (dot(d, p) - c * uTime);
    float sf = sin(f), cf = cos(f);
    t += vec3(-d.x * d.x * s * sf, d.x * s * cf, -d.x * d.y * s * sf);
    b += vec3(-d.x * d.y * s * sf, d.y * s * cf, -d.y * d.y * s * sf);
    return vec3(d.x * a * cf, a * sf, d.y * a * cf);
  }
  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 q = p.xz + vec2(uSpeed * uTime, 0.0); // the ship sails +x, so the sea flows past
    float fade = 1.0 - smoothstep(600.0, 2600.0, length(p.xz - cameraPosition.xz)); // no far aliasing
    vec3 t = vec3(1.0, 0.0, 0.0), b = vec3(0.0, 0.0, 1.0), o = vec3(0.0);
    o += gerstner(q, normalize(vec2(1.0, 0.35)), 93.0, 0.09 * fade, t, b);
    o += gerstner(q, normalize(vec2(0.6, -0.8)), 47.0, 0.10 * fade, t, b);
    o += gerstner(q, normalize(vec2(-0.3, 1.0)), 23.0, 0.11 * fade, t, b);
    o += gerstner(q, normalize(vec2(0.9, 0.5)), 13.0, 0.09 * fade, t, b);
    o += gerstner(q, normalize(vec2(-0.7, -0.6)), 7.3, 0.07 * fade, t, b);
    p += o;
    vCrest = o.y;
    vNormal = normalize(cross(b, t));
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const oceanFragment = /* glsl */ `
  uniform samplerCube uEnv;
  uniform vec3 uSun, uSunColor;
  uniform float uTime, uSpeed, uShipHalf, uShipBeam;
  varying vec3 vWorld, vNormal;
  varying float vCrest;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  float ripple(vec2 q) { // ~2 m chop plus finer cat's-paws
    return vnoise(q * 0.5 + vec2(uTime * 0.7, 0.0)) * 0.65 + vnoise(q * 1.4 - vec2(0.0, uTime * 0.9)) * 0.35;
  }
  void main() {
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam);
    vec3 V = toCam / dist;
    vec2 q = vWorld.xz + vec2(uSpeed * uTime, 0.0);
    // small ripples on top of the swell, fading with distance
    float near = 1.0 - smoothstep(150.0, 1400.0, dist);
    float e = 0.25; // ripple normal from the slope of a small animated height field
    float h0 = ripple(q), hx = ripple(q + vec2(e, 0.0)), hz = ripple(q + vec2(0.0, e));
    vec3 n = normalize(vNormal + vec3(h0 - hx, 0.0, h0 - hz) / e * 0.35 * near);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 R = reflect(-V, n);
    R.y = abs(R.y);
    vec3 sky = textureCube(uEnv, R).rgb;
    vec3 horizon = textureCube(uEnv, normalize(vec3(-V.x, 0.03, -V.z))).rgb;
    vec3 deep = vec3(0.004, 0.016, 0.028);
    vec3 body = deep + vec3(0.01, 0.035, 0.04) * smoothstep(-0.5, 1.5, vCrest); // light through crests
    float glint = pow(max(dot(R, uSun), 0.0), 900.0) * 40.0 + pow(max(dot(R, uSun), 0.0), 60.0) * 0.6;
    vec3 col = mix(body, sky, fres) + uSunColor * glint;
    // foam: along the hull and a widening wake behind the stern (ship centred at the origin, bow +x)
    vec2 s = vWorld.xz;
    float alongHull = (1.0 - smoothstep(uShipHalf - 10.0, uShipHalf + 10.0, abs(s.x))) * (1.0 - smoothstep(uShipBeam - 1.0, uShipBeam + 9.0, abs(s.y)));
    float behind = max(-uShipHalf - s.x, 0.0);
    float wake = step(s.x, -uShipHalf + 20.0) * (1.0 - smoothstep(uShipBeam * 0.4 + behind * 0.12, uShipBeam + 4.0 + behind * 0.25, abs(s.y))) * exp(-behind * 0.004);
    float bow = exp(-length(vec2(s.x - uShipHalf, abs(s.y) - uShipBeam * 0.6)) * 0.06);
    float foamNoise = vnoise(q * 0.35) * 0.6 + vnoise(q * 1.3) * 0.4;
    float foam = clamp((alongHull * 0.7 + wake * 0.8 + bow) * smoothstep(0.3, 0.8, foamNoise + 0.25), 0.0, 1.0);
    col = mix(col, vec3(0.55, 0.55, 0.58) * (0.4 + 0.6 * max(uSun.y * 8.0, 0.2)), foam * 0.8);
    col = mix(col, horizon, 1.0 - exp(-dist * 0.00032)); // haze into the sky at the horizon
    gl_FragColor = vec4(col, 1.0);
  }
`;

export async function createHeroWorld() {
  const gltf = await new GLTFLoader().loadAsync('models/ship.glb');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 5, 12000);
  // Sun low in the frame, just right of where the camera looks: backlit sunset, glitter path on the sea.
  const ca = THREE.MathUtils.degToRad(CAM.angle);
  const view = new THREE.Vector3(-Math.cos(ca), 0, -Math.sin(ca)); // camera -> ship, horizontal
  const right = new THREE.Vector3(-view.z, 0, view.x);
  const off = THREE.MathUtils.degToRad(SUN.offset);
  const el = THREE.MathUtils.degToRad(SUN.elevation);
  const flat = view.clone().multiplyScalar(Math.cos(off)).addScaledVector(right, Math.sin(off));
  const sun = new THREE.Vector3(flat.x * Math.cos(el), Math.sin(el), flat.z * Math.cos(el)).normalize();

  const sky = new Sky();
  sky.scale.setScalar(10000);
  const su = sky.material.uniforms;
  su.turbidity.value = 10;
  su.rayleigh.value = 3.5;
  su.mieCoefficient.value = 0.005;
  su.mieDirectionalG.value = 0.8;
  su.cloudCoverage.value = 0.35;
  su.cloudDensity.value = 0.35;
  su.sunPosition.value.copy(sun);
  scene.add(sky);

  const envTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  const cubeCamera = new THREE.CubeCamera(1, 20000, envTarget);
  const sunColor = new THREE.Color(1.0, 0.62, 0.36);

  const half = SHIP_LENGTH / 2;
  const ocean = new THREE.Mesh(
    oceanGeometry(6000, 300),
    new THREE.ShaderMaterial({
      vertexShader: oceanVertex,
      fragmentShader: oceanFragment,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: SHIP_SPEED },
        uEnv: { value: envTarget.texture },
        uSun: { value: sun },
        uSunColor: { value: new THREE.Vector3(sunColor.r, sunColor.g, sunColor.b).multiplyScalar(6) },
        uShipHalf: { value: half },
        uShipBeam: { value: 0 }, // set from the model below
      },
    })
  );
  ocean.frustumCulled = false; // vertices move in the shader
  scene.add(ocean);

  // Ship from scripts/blender/build_ship.py: metres, bow +x, waterline at y = 0, centred on x/z.
  const ship = gltf.scene;
  const box = new THREE.Box3().setFromObject(ship);
  ocean.material.uniforms.uShipBeam.value = (box.max.z - box.min.z) / 2;
  ship.traverse((o) => {
    if (!o.isMesh) return;
    o.material.envMapIntensity = 1.0;
    if (o.material.name === 'Containers') corrugate(o.material);
  });
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
      // Bake the sky once: reflections for the sea and image lighting for the ship.
      // No sun disc in the bake: the sea adds its own glint, and a baked disc reflects as a hard line.
      ocean.visible = rig.visible = false;
      su.showSunDisc.value = 0;
      cubeCamera.update(renderer, scene);
      su.showSunDisc.value = 1;
      ocean.visible = rig.visible = true;
      // Prefilter once. Passing the render-target cube straight to scene.environment can make
      // three rebuild the PMREM every frame, which cost ~20 FPS on the Intel UHD.
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromCubemap(envTarget.texture).texture;
      pmrem.dispose();
      // The sky is static, so draw it from the bake instead of re-running the Sky shader per pixel.
      scene.background = envTarget.texture;
      sky.visible = false;
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

// Container walls are corrugated: shade stripes every ~0.3 m along the box (x in model metres).
function corrugate(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.84 + 0.16 * smoothstep(-0.8, 0.8, sin(vLocal.x * 21.0));');
  };
}

// Square grid with vertices packed near the centre (spacing grows with distance).
function oceanGeometry(size, segments) {
  const g = new THREE.PlaneGeometry(2, 2, segments, segments);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setXYZ(i, Math.sign(x) * x * x * size, 0, Math.sign(z) * z * z * size);
  }
  g.computeBoundingSphere();
  return g;
}
