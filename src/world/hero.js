import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Scene 1 as a live 3D world: sunset sky, Gerstner-wave ocean, the container ship riding the swell
// and a slow camera sweep. Units are metres. Rendered into an HDR target by renderer.js, which
// applies ACES tone mapping and the deck's grade (see `live` there).

const SHIP_LENGTH = 330; // m, matches L in build_ship.py
const SHIP_SPEED = 7; // m/s of water flowing past (about 14 kn)
// Camera: low over the starboard bow quarter (the lettered side), ship on the right third.
const CAM = { angle: -38, radius: 300, height: 34 }; // degrees around the ship, metres
const SUN = { elevation: 2, offset: 14 };
const ENV_INTENSITY = 0.8; // HDRI image light on the ship // degrees above the horizon / right of the view centre

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
  const [gltf, surfaces, hdr] = await Promise.all([
    new GLTFLoader().loadAsync('models/ship.glb'),
    loadSurfaces(),
    new HDRLoader().setDataType(THREE.FloatType).loadAsync('env/umhlanga_sunrise_1k.hdr'),
  ]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
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
    const look = o.isMesh && LOOK[o.material.name];
    if (look) dress(o.material, surfaces[look.surface], look);
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
      // Image lighting for the ship comes from a real sunrise-over-the-sea HDRI, turned so its sun
      // sits where the sky's sun is. The sea keeps reflecting the procedural sky (uEnv).
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentRotation.y = sunLongitude(hdr) - Math.atan2(sun.z, sun.x);
      scene.environmentIntensity = ENV_INTENSITY;
      pmrem.dispose();
      hdr.dispose();
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

// ---------- materials: Poly Haven CC0 textures (docs/third-party-assets.md) ----------
// Ship UVs are metres (containers: one tile per box height), so `repeat` = tiles per metre.
const SURFACES = {
  rust: { file: 'rusty_painted_metal', repeat: 1 / 5 },
  plate: { file: 'metal_plate_02', repeat: 1 / 2 },
  box: { file: 'container_side', repeat: 1 },
};
// detail: how much of the texture's light and dark (wear, streaks, ribs) shows through the
// part's own colour; the texture's colour itself is dropped. Hull wear is kept light on purpose.
const LOOK = {
  Hull: { surface: 'rust', detail: 0.35, normal: 0.5 },
  Antifouling: { surface: 'rust', detail: 0.55, normal: 0.6 },
  Superstructure: { surface: 'rust', detail: 0.2, normal: 0.3 },
  Funnel: { surface: 'rust', detail: 0.3, normal: 0.3 },
  Deck: { surface: 'plate', detail: 0.9, normal: 1 },
  'Hatch covers': { surface: 'plate', detail: 0.8, normal: 1 },
  Containers: { surface: 'box', detail: 0.9, normal: 1 },
};

async function loadSurfaces() {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(
    Object.entries(SURFACES).map(async ([key, { file, repeat }]) => {
      const [diff, nor, arm] = await Promise.all(['diff', 'nor_gl', 'arm'].map((k) => loader.loadAsync(`textures/${file}_${k}_1k.jpg`)));
      for (const t of [diff, nor, arm]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.setScalar(repeat);
        t.anisotropy = 8;
      }
      diff.colorSpace = THREE.SRGBColorSpace;
      return [key, { diff, nor, arm, mean: meanLuminance(diff.image) }];
    })
  );
  return Object.fromEntries(entries);
}

// Mean linear luminance of an image, so `detail` darkens and lightens around the part's colour.
function meanLuminance(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 32, 32);
  const d = g.getImageData(0, 0, 32, 32).data;
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
  return sum / (d.length / 4);
}

function dress(material, s, look) {
  material.map = s.diff;
  material.normalMap = s.nor;
  material.normalScale.setScalar(look.normal);
  material.roughnessMap = s.arm; // ARM: AO in R, roughness in G
  material.roughness = 1;
  material.aoMap = s.arm;
  material.aoMapIntensity = 0.7;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMapMean = { value: s.mean };
    shader.uniforms.uDetail = { value: look.detail };
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uMapMean, uDetail;').replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        float lum = dot(texture2D(map, vMapUv).rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= mix(1.0, lum / uMapMean, uDetail);
      #endif`
    );
  };
  material.needsUpdate = true;
}

// Longitude (atan2(z, x)) of the brightest pixel in an equirectangular HDR: where its sun is.
function sunLongitude(hdr) {
  const { data, width, height } = hdr.image;
  let best = 0;
  let at = 0;
  for (let i = 0; i < width * height; i++) {
    const l = data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2];
    if (l > best) [best, at] = [l, i];
  }
  return ((at % width) + 0.5) / width * 2 * Math.PI - Math.PI;
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
