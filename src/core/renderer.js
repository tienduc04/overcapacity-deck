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
  uniform float uProgress, uTime, uDetail;
  varying vec2 vUv;
  // object-fit: cover
  vec2 cover(vec2 uv, vec2 img) {
    float s = uScreen.x / uScreen.y, i = img.x / img.y;
    vec2 k = s > i ? vec2(1.0, i / s) : vec2(s / i, 1.0);
    return (uv - 0.5) * k + 0.5;
  }
  vec4 fromColor(vec2 uv) { return texture2D(uFrom, cover(uv, uFromSize)); }
  vec4 toColor(vec2 uv) { return texture2D(uTo, cover(uv, uToSize)); }
  ${body}
  void main() { gl_FragColor = transition(vUv, uProgress); }
`;

// Clip hook (Phase 3): setClipPlayer(fn) where fn(from, to, onDone) returns { skip() } when a
// clip for that pair exists and is playing, or null to fall back to the shader.
let clipPlayer = null;
export const setClipPlayer = (fn) => (clipPlayer = fn);

export function createRenderer(canvas, plates, tier) {
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
  };
  const materials = Object.fromEntries(
    Object.entries(TRANSITIONS).map(([name, t]) => [name, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: fragmentShader(t.glsl), depthTest: false })])
  );
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materials.crossfade);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const setPair = (from, to) => {
    uniforms.uFrom.value = textures[from];
    uniforms.uFromSize.value = textures[from].userData.size;
    uniforms.uTo.value = textures[to];
    uniforms.uToSize.value = textures[to].userData.size;
  };

  function show(i) {
    setPair(i, i);
    uniforms.uProgress.value = 1;
  }

  function transition(from, to, { type = 'crossfade', duration, onDone } = {}) {
    const clip = clipPlayer?.(from, to, onDone);
    if (clip) return clip;
    const t = TRANSITIONS[type] ?? TRANSITIONS.crossfade;
    const d = Math.min(duration ?? t.duration, MAX_TRANSITION);
    quad.material = materials[type] ?? materials.crossfade;
    setPair(from, to);
    uniforms.uProgress.value = 0;
    const end = () => {
      show(to);
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
    resize(w, h) {
      renderer.setSize(w, h, false);
      uniforms.uScreen.value.set(w, h);
    },
    render(time) {
      uniforms.uTime.value = time;
      renderer.render(scene, camera);
    },
  };
}
