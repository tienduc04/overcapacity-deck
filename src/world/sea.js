import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { sunLongitude } from './materials.js';

// Shared pieces of the outdoor worlds: low-sun sky, Gerstner-wave sea, HDRI image light.

// Unit vector to a sun `elevation` degrees up and `offset` degrees right of the horizontal `view`.
export function sunDirection(view, elevation, offset) {
  const right = new THREE.Vector3(-view.z, 0, view.x);
  const off = THREE.MathUtils.degToRad(offset);
  const el = THREE.MathUtils.degToRad(elevation);
  const flat = view.clone().normalize().multiplyScalar(Math.cos(off)).addScaledVector(right, Math.sin(off));
  return new THREE.Vector3(flat.x * Math.cos(el), Math.sin(el), flat.z * Math.cos(el)).normalize();
}

export const loadHdr = () => new HDRLoader().setDataType(THREE.FloatType).loadAsync('env/umhlanga_sunrise_1k.hdr');

export function createSky(scene, sun) {
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

  return {
    envTexture: envTarget.texture,
    // Bake the sky once (reflections for the sea, background), light the scene with the HDRI turned
    // so its sun sits where the sky's sun is, then draw the sky from the bake from now on.
    bake(renderer, { hide, hdr, envIntensity }) {
      // No sun disc in the bake: the sea adds its own glint, and a baked disc reflects as a hard line.
      for (const o of hide) o.visible = false;
      su.showSunDisc.value = 0;
      cubeCamera.update(renderer, scene);
      su.showSunDisc.value = 1;
      for (const o of hide) o.visible = true;
      // Prefilter once. Passing the render-target cube straight to scene.environment can make
      // three rebuild the PMREM every frame, which cost ~20 FPS on the Intel UHD.
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.environmentRotation.y = sunLongitude(hdr) - Math.atan2(sun.z, sun.x);
      scene.environmentIntensity = envIntensity;
      pmrem.dispose();
      hdr.dispose();
      scene.background = envTarget.texture;
      sky.visible = false;
    },
  };
}

const oceanVertex = /* glsl */ `
  uniform float uTime, uSpeed, uWave;
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
    vec2 q = p.xz + vec2(uSpeed * uTime, 0.0); // a ship sailing +x: the sea flows past
    float fade = (1.0 - smoothstep(600.0, 2600.0, length(p.xz - cameraPosition.xz))) * uWave; // no far aliasing
    vec3 t = vec3(1.0, 0.0, 0.0), b = vec3(0.0, 0.0, 1.0), o = vec3(0.0);
    o += gerstner(q, normalize(vec2(1.0, 0.35)), 93.0, 0.09 * fade, t, b);
    o += gerstner(q, normalize(vec2(0.6, -0.8)), 47.0, 0.10 * fade, t, b);
    o += gerstner(q, normalize(vec2(-0.3, 1.0)), 23.0, 0.11 * fade, t, b);
    o += gerstner(q, normalize(vec2(0.9, 0.5)), 13.0, 0.09 * fade, t, b);
    o += gerstner(q, normalize(vec2(-0.7, -0.6)), 7.3, 0.07 * fade, t, b);
    p += o;
    vCrest = o.y / max(uWave, 0.01);
    vNormal = normalize(cross(b, t));
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const oceanFragment = /* glsl */ `
  uniform samplerCube uEnv;
  uniform vec3 uSun, uSunColor;
  uniform float uTime, uSpeed, uShipHalf, uShipBeam, uFoam, uRipple, uHaze;
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
    vec3 n = normalize(vNormal + vec3(h0 - hx, 0.0, h0 - hz) / e * uRipple * near);
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
    float foam = uFoam * clamp((alongHull * 0.7 + wake * 0.8 + bow) * smoothstep(0.3, 0.8, foamNoise + 0.25), 0.0, 1.0);
    col = mix(col, vec3(0.55, 0.55, 0.58) * (0.4 + 0.6 * max(uSun.y * 8.0, 0.2)), foam * 0.8);
    col = mix(col, horizon, 1.0 - exp(-dist * uHaze)); // haze into the sky at the horizon
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Open sea by default; harbours pass smaller waves and no ship foam.
export function createOcean({ envTexture, sun, sunColor, speed = 0, wave = 1, ripple = 0.35, haze = 0.00032, ship = null }) {
  const ocean = new THREE.Mesh(
    oceanGeometry(6000, 300),
    new THREE.ShaderMaterial({
      vertexShader: oceanVertex,
      fragmentShader: oceanFragment,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uWave: { value: wave },
        uRipple: { value: ripple },
        uHaze: { value: haze },
        uEnv: { value: envTexture },
        uSun: { value: sun },
        uSunColor: { value: new THREE.Vector3(sunColor.r, sunColor.g, sunColor.b).multiplyScalar(6) },
        uFoam: { value: ship ? 1 : 0 },
        uShipHalf: { value: ship?.half ?? 0 },
        uShipBeam: { value: ship?.beam ?? 0 },
      },
    })
  );
  ocean.frustumCulled = false; // vertices move in the shader
  return ocean;
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

// Distance haze into the horizon colour of the baked sky, same as the sea's.
export function haze(material, envTexture, density) {
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
