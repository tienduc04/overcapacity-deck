import * as THREE from 'three';
import gsap from 'gsap';
import { MAX_TRANSITION } from './fallback.js';

// Full-screen Three.js canvas that shows one plate (cover-fit) and blends between two plates.
// Transition API: transition(from, to, { type, duration, onDone }) → { skip() }.
// Phase 1: every registered type uses the crossfade shader; Phase 3 replaces them one by one.

const crossfade = /* glsl */ `
  vec4 transition(vec2 uv, float p) { return mix(fromColor(uv), toColor(uv), p); }
`;
export const TRANSITIONS = {
  none: { glsl: crossfade, duration: 0 },
  crossfade: { glsl: crossfade, duration: 1.2 },
  zoomBlur: { glsl: crossfade, duration: 1.6 },
  laserScan: { glsl: crossfade, duration: 1.6 },
  radarWipe: { glsl: crossfade, duration: 1.6 },
  bubbles: { glsl: crossfade, duration: 1.6 },
  glassCrash: { glsl: crossfade, duration: 1.6 },
  dockFade: { glsl: crossfade, duration: 2.0 },
};

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const fragmentShader = (body) => /* glsl */ `
  uniform sampler2D uFrom, uTo;
  uniform vec2 uFromSize, uToSize, uScreen;
  uniform vec3 uFromXf, uToXf; // Ken Burns per plate: (scale, offset x, offset y)
  uniform float uProgress, uTime, uDetail, uGrain;
  varying vec2 vUv;
  // object-fit: cover, then the Ken Burns zoom/pan
  vec2 cover(vec2 uv, vec2 img, vec3 xf) {
    float s = uScreen.x / uScreen.y, i = img.x / img.y;
    vec2 k = s > i ? vec2(1.0, i / s) : vec2(s / i, 1.0);
    return (uv - 0.5) * k / xf.x + xf.yz + 0.5;
  }
  vec4 fromColor(vec2 uv) { return texture2D(uFrom, cover(uv, uFromSize, uFromXf)); }
  vec4 toColor(vec2 uv) { return texture2D(uTo, cover(uv, uToSize, uToXf)); }
  ${body}
  // Finish: cool shadows / warm highlights, vignette, animated film grain.
  vec3 finish(vec3 c, vec2 uv) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, c * vec3(0.93, 1.0, 1.07), (1.0 - l) * 0.3);
    c = mix(c, c * vec3(1.04, 1.0, 0.95), l * 0.2);
    vec2 d = (uv - 0.5) * vec2(uScreen.x / uScreen.y, 1.0);
    c *= 1.0 - smoothstep(0.5, 1.1, length(d)) * 0.4;
    float n = fract(sin(dot(floor(uv * uScreen) + fract(uTime * 7.0) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
    return c + (n - 0.5) * 0.04 * uGrain;
  }
  void main() { gl_FragColor = vec4(finish(transition(vUv, uProgress).rgb, vUv), 1.0); }
`;

// Ken Burns: slow breathing zoom with a pan in a different direction per plate.
const KB_PERIOD = 50; // seconds for one zoom in and out
const KB_ZOOM = 0.06;
export function kenBurns(i, t) {
  const s = 1 + KB_ZOOM * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / KB_PERIOD));
  const m = 0.45 * (1 - 1 / s); // keeps the sampled window inside the image
  return [s, Math.cos(i * 2.4) * m, Math.sin(i * 2.4) * m];
}

// FPS governor: after 3 s below 45 FPS, drop one level (grain off, then motion off at 1x pixels).
const FX_LEVELS = ['full', 'no-grain', 'minimal'];
const SLOW_FPS = 45;
const SLOW_SECONDS = 3;

// Clip hook (Phase 3): setClipPlayer(fn) where fn(from, to, onDone) returns { skip() } when a
// clip for that pair exists and is playing, or null to fall back to the shader.
let clipPlayer = null;
export const setClipPlayer = (fn) => (clipPlayer = fn);

// still[i] = true keeps plate i fixed (no Ken Burns), e.g. the s04 map that highlights align to.
export function createRenderer(canvas, plates, tier, { still = [] } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); // r187 throws without WebGL2
  } catch (err) {
    console.warn('[renderer] WebGL2 unavailable:', err.message);
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier.pixelRatio));

  const textures = plates.map((p) => {
    const t = p instanceof HTMLCanvasElement ? new THREE.CanvasTexture(p) : new THREE.Texture(p);
    t.colorSpace = THREE.NoColorSpace; // pass plate bytes straight through (no linear/sRGB round trip)
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    t.userData.size = new THREE.Vector2(p.naturalWidth || p.width, p.naturalHeight || p.height);
    return t;
  });

  const uniforms = {
    uFrom: { value: textures[0] },
    uTo: { value: textures[0] },
    uFromSize: { value: textures[0].userData.size },
    uToSize: { value: textures[0].userData.size },
    uScreen: { value: new THREE.Vector2(1920, 1080) },
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uDetail: { value: tier.detail },
    uGrain: { value: tier.motion ? 1 : 0 },
    uFromXf: { value: new THREE.Vector3(1, 0, 0) },
    uToXf: { value: new THREE.Vector3(1, 0, 0) },
  };
  let motion = tier.motion;
  const started = plates.map(() => 0); // when each plate last came on screen (s)
  const pair = { from: 0, to: 0 };
  const now = () => performance.now() / 1000;
  const xf = (v, i, t) => (motion && !still[i] ? v.set(...kenBurns(i, t - started[i])) : v.set(1, 0, 0));
  const materials = Object.fromEntries(
    Object.entries(TRANSITIONS).map(([name, t]) => [name, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: fragmentShader(t.glsl), depthTest: false })])
  );
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materials.crossfade);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const setPair = (from, to) => {
    Object.assign(pair, { from, to });
    uniforms.uFrom.value = textures[from];
    uniforms.uFromSize.value = textures[from].userData.size;
    uniforms.uTo.value = textures[to];
    uniforms.uToSize.value = textures[to].userData.size;
  };

  const settle = (i) => {
    setPair(i, i);
    uniforms.uProgress.value = 1;
  };
  function show(i) {
    started[i] = now();
    settle(i);
  }

  let level = 0;
  let size = [1920, 1080];
  let last = 0;
  let slowFor = 0;
  function govern(t) {
    const dt = t - last;
    last = t;
    if (dt <= 0 || dt > 0.5) return; // first frame, or the tab was hidden
    slowFor = dt > 1 / SLOW_FPS ? slowFor + dt : 0;
    if (slowFor < SLOW_SECONDS || level === FX_LEVELS.length - 1) return;
    slowFor = 0;
    level++;
    uniforms.uGrain.value = 0;
    if (level === 2) {
      motion = false;
      renderer.setPixelRatio(1);
      renderer.setSize(...size, false);
    }
    console.info(`[renderer] slow frames, effects level → ${FX_LEVELS[level]}`);
  }

  function transition(from, to, { type = 'crossfade', duration, onDone } = {}) {
    const clip = clipPlayer?.(from, to, onDone);
    if (clip) return clip;
    const t = TRANSITIONS[type] ?? TRANSITIONS.crossfade;
    const d = Math.min(duration ?? t.duration, MAX_TRANSITION);
    quad.material = materials[type] ?? materials.crossfade;
    started[to] = now();
    setPair(from, to);
    uniforms.uProgress.value = 0;
    const end = () => {
      settle(to); // keeps the Ken Burns clock running from the transition start
      onDone?.();
    };
    if (d === 0) {
      end();
      return { skip() {} };
    }
    const tween = gsap.to(uniforms.uProgress, { value: 1, duration: d, ease: 'power2.inOut', onComplete: end });
    return { skip: () => tween.progress(1) }; // progress(1) fires onComplete once
  }

  return {
    kind: 'webgl',
    renderer,
    show,
    transition,
    get fx() {
      return FX_LEVELS[level];
    },
    resize(w, h) {
      size = [w, h];
      renderer.setSize(w, h, false);
      uniforms.uScreen.value.set(w, h);
    },
    render(time) {
      govern(time);
      uniforms.uTime.value = time;
      xf(uniforms.uFromXf.value, pair.from, time);
      xf(uniforms.uToXf.value, pair.to, time);
      renderer.render(scene, camera);
    },
  };
}
