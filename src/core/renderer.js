import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { MAX_TRANSITION } from './fallback.js';

// Full-screen Three.js canvas that shows one plate (cover-fit) and blends between two plates.
// Transition API: transition(from, to, { type, duration, onDone }) → { skip() }.
// Each type defines vec4 transition(vec2 uv, float p) from fromColor/toColor; p runs 0 → 1 and
// p = 1 must look like plain toColor (settle() swaps back to the cheap crossfade material).
// uv.y = 1 is the top of the screen. Loop counts scale with uDetail (0.5 on the low tier).

const crossfade = /* glsl */ `
  vec4 transition(vec2 uv, float p) { return mix(fromColor(uv), toColor(uv), p); }
`;

// 1 → 2: rush into a bright point. Both plates radially blurred, white bloom at the midpoint.
const zoomBlur = /* glsl */ `
  vec4 transition(vec2 uv, float p) {
    vec2 c = vec2(0.5);
    float n = mix(5.0, 12.0, uDetail); // 12 taps per plate: a live HDR world costs more per tap
    float s = sin(p * PI); // blur and bloom peak mid-way
    vec4 a = vec4(0.0), b = vec4(0.0);
    for (int i = 0; i < 12; i++) {
      if (float(i) >= n) break;
      float r = 1.0 - s * 0.35 * float(i) / n;
      a += fromColor(c + (uv - c) * (1.0 - 0.6 * p) * r); // from: zooms in
      b += toColor(c + (uv - c) / (1.0 + 0.5 * (1.0 - p)) * r); // to: lands from close up
    }
    vec4 col = mix(a, b, smoothstep(0.4, 0.6, p)) / n;
    float r = length((uv - c) * vec2(aspect(), 1.0));
    float glow = pow(s, 3.0) * (0.9 * exp(-r * 7.0) + 0.35);
    return vec4(col.rgb + vec3(1.0, 0.96, 0.88) * glow, 1.0);
  }
`;

// 2 → 3: a cyan laser line scans top to bottom; the new plate sits behind it, with a short
// glitch band at the beam and scanlines that fade out.
const laserScan = /* glsl */ `
  vec4 transition(vec2 uv, float p) {
    float d = uv.y - mix(1.08, -0.08, p); // > 0: above the beam, already scanned
    float rev = smoothstep(-0.002, 0.002, d);
    float near = exp(-abs(d) * 40.0);
    float shift = (hash(vec2(floor(uv.y * 240.0), floor(uTime * 30.0))) - 0.5) * 0.025 * near * uDetail;
    vec2 q = uv + vec2(shift, 0.0);
    vec3 col = mix(fromColor(q).rgb, toColor(q).rgb, rev);
    float fade = 1.0 - smoothstep(0.9, 1.0, p);
    float band = rev * exp(-d * 14.0) * fade;
    float lines = 0.75 + 0.25 * sin(uv.y * uScreen.y * 1.6);
    col = mix(col, col * vec3(0.65, 1.0, 1.1) * lines, band * 0.7);
    vec3 beam = vec3(0.35, 0.9, 1.0) * (1.6 * exp(-abs(d) * uScreen.y * 0.25) + 0.3 * near);
    return vec4(col + beam * fade, 1.0);
  }
`;

// 3 → 4: radar sweep clockwise from 12 o'clock, green trail and range rings behind the edge.
const radarWipe = /* glsl */ `
  vec4 transition(vec2 uv, float p) {
    vec2 d = (uv - 0.5) * vec2(aspect(), 1.0);
    float a = fract(atan(d.x, d.y) / (2.0 * PI)); // 0 at 12 o'clock, growing clockwise
    float behind = p * 1.1 - a; // > 0: already swept
    float rev = smoothstep(0.0, 0.006, behind);
    vec3 col = mix(fromColor(uv).rgb, toColor(uv).rgb, rev);
    float fade = 1.0 - smoothstep(0.85, 1.0, p);
    float r = length(d);
    float trail = rev * exp(-behind * 9.0);
    float rings = pow(0.5 + 0.5 * cos(r * 2.0 * PI * 7.0), 30.0);
    float edge = exp(-abs(behind) * 220.0 / max(r * 6.0, 0.3));
    vec3 green = vec3(0.25, 1.0, 0.7);
    col = mix(col, col * vec3(0.6, 1.05, 0.85), trail * 0.5 * fade);
    col += green * (edge * 0.9 + trail * rings * 0.35 + exp(-r * 40.0) * 0.6) * fade;
    return vec4(col, 1.0);
  }
`;

// 4 → 5: under water. The old plate wobbles, bubbles rise and grow; inside each one the new
// plate shows through a lens, with a bright rim and a highlight.
const bubbles = /* glsl */ `
  vec4 transition(vec2 uv, float p) {
    float s = sin(p * PI);
    vec2 wob = vec2(sin(uv.y * 28.0 + uTime * 2.3), cos(uv.x * 22.0 + uTime * 1.9)) * 0.005 * s;
    vec3 col = fromColor(uv + wob).rgb;
    col = mix(col, col * vec3(0.55, 0.85, 1.0), 0.45 * s);
    vec2 q = uv * vec2(aspect(), 1.0) * 6.0 + vec2(0.0, -p * 2.5); // bubbles drift up
    vec2 cell = floor(q), f = q - cell;
    float inside = -1.0;
    vec2 lens = vec2(0.0);
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash2(cell + g);
        vec2 o = g + 0.5 + (h - 0.5) * 0.6 - f; // pixel to bubble centre, in cells
        float rad = smoothstep(h.x * 0.45, h.x * 0.45 + 0.45, p) * (0.55 + 0.4 * h.y);
        float m = rad - length(o);
        if (m > inside) { inside = m; lens = o / max(rad, 1e-3); }
      }
    float k = smoothstep(0.0, 0.015, inside);
    vec3 under = toColor(uv + lens * 0.03 * (1.0 - p)).rgb;
    float rim = exp(-abs(inside) * 50.0) * 0.5 * (1.0 - p);
    float spot = smoothstep(0.25, 0.0, length(lens - vec2(-0.35, 0.4))) * 0.35 * k * (1.0 - p);
    col = mix(col, under, k) + vec3(0.8, 0.95, 1.0) * (rim + spot);
    return vec4(mix(col, toColor(uv).rgb, smoothstep(0.75, 1.0, p)), 1.0);
  }
`;

// 5 → 6: glass crash. Cracks run out from an impact point, then Voronoi shards fly away into
// depth (each shrinks toward its seed, nearest the impact first), uncovering the new plate.
// A shard shrunk toward its own seed stays inside its convex cell, so one lookup per pixel works.
const glassCrash = /* glsl */ `
  vec3 voronoi(vec2 q) { // nearest seed in xy, F2 - F1 (distance to the nearest edge) in z
    vec2 cell = floor(q);
    float f1 = 9.0, f2 = 9.0;
    vec2 best = vec2(0.0);
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec2 g = cell + vec2(float(i), float(j));
        vec2 seed = g + hash2(g);
        float d = length(seed - q);
        if (d < f1) { f2 = f1; f1 = d; best = seed; } else if (d < f2) f2 = d;
      }
    return vec3(best, f2 - f1);
  }
  vec4 transition(vec2 uv, float p) {
    const float SCALE = 5.0;
    vec2 asp = vec2(aspect(), 1.0);
    vec2 hit = vec2(0.56, 0.48) * asp * SCALE;
    float shake = exp(-p * 30.0) * smoothstep(0.0, 0.02, p) * 0.01;
    vec2 q = (uv + (hash2(vec2(floor(uTime * 60.0))) - 0.5) * shake) * asp * SCALE;
    vec2 seed = voronoi(q).xy;
    float delay = min(length(seed - hit) * 0.08 + hash(seed) * 0.08, 0.45);
    float k = smoothstep(0.15 + delay, 0.55 + delay, p); // 0 intact, 1 gone
    float sc = 1.0 - k;
    if (sc < 0.001) return toColor(uv);
    float ang = (hash(seed + 7.0) - 0.5) * 1.2 * k;
    vec2 qq = seed + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (q - seed) / sc;
    vec3 v = voronoi(qq);
    if (distance(v.xy, seed) > 0.001) return toColor(uv); // outside the shrunk shard
    vec3 col = fromColor(qq / asp / SCALE + vec2(0.0, -0.08 * k * k)).rgb;
    float front = smoothstep(0.0, 0.25, p * 8.0 - length(qq - hit) * 0.25); // cracks spread out
    float crack = smoothstep(0.06, 0.0, v.z) * front;
    col = col * (1.0 - 0.5 * k) + vec3(0.9, 0.97, 1.0) * crack * (0.8 - 0.6 * k);
    col += exp(-p * 25.0) * smoothstep(0.0, 0.02, p) * 0.5 * exp(-length(q - hit)); // impact flash
    return vec4(col, 1.0);
  }
`;

// 6 → 7: docking. Slow push-in; a warm mist rises from the water line and leaves the new plate.
const dockFade = /* glsl */ `
  vec4 transition(vec2 uv, float p) {
    vec2 c = vec2(0.5, 0.45);
    vec3 a = fromColor(c + (uv - c) * (1.0 - 0.07 * p)).rgb;
    vec3 b = toColor(c + (uv - c) * (1.0 + 0.05 * (1.0 - p))).rgb;
    float t = mix(-0.45, 1.45, p);
    float n = vnoise(uv * vec2(aspect(), 1.0) * 3.0 + vec2(uTime * 0.15, 0.0));
    float m = 1.0 - smoothstep(t - 0.25, t + 0.25, uv.y + (n - 0.5) * 0.3);
    vec3 col = mix(a, b, m);
    float haze = sin(p * PI) * (0.55 + 0.45 * n) * (1.0 - 0.5 * uv.y);
    col = mix(col, vec3(1.0, 0.82, 0.6) * 0.85, haze * 0.35);
    return vec4(col, 1.0);
  }
`;

// Scene pass with MSAA: draws into its own multisampled target, which a TexturePass then copies into the
// composer. (MSAA on the composer's own targets doubled the cost of every later pass.)
class MsaaScenePass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, stencilBuffer: true, samples }); // stencil: hero title
  }
  setSize(w, h) {
    this.target.setSize(w, h);
  }
  render(renderer) {
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
  }
}

// Screen-space god rays: bright sky around the sun is smeared towards the sun, dark things (the ship)
// in between leave shafts. Runs on the HDR frame, before tone mapping.
const GodRays = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uIntensity: { value: 0.5 }, uThreshold: { value: 1.2 }, uTint: { value: new THREE.Color(1.0, 0.72, 0.45) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uIntensity, uThreshold;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 step = (uSun - vUv) * (0.9 / 24.0);
      vec2 p = vUv;
      float w = 1.0, sum = 0.0;
      for (int i = 0; i < 24; i++) {
        p += step;
        vec3 s = texture2D(tDiffuse, p).rgb;
        sum += clamp(dot(s, vec3(0.2126, 0.7152, 0.0722)) - uThreshold, 0.0, 6.0) * w;
        w *= 0.92;
      }
      float falloff = 1.0 - smoothstep(0.0, 1.2, length(uSun - vUv));
      gl_FragColor = vec4(base.rgb + uTint * sum * (1.0 / 24.0) * uIntensity * (0.4 + falloff), base.a);
    }`,
};

export const TRANSITIONS = {
  none: { glsl: crossfade, duration: 0 },
  crossfade: { glsl: crossfade, duration: 1.2 },
  zoomBlur: { glsl: zoomBlur, duration: 1.6 },
  laserScan: { glsl: laserScan, duration: 1.8 },
  radarWipe: { glsl: radarWipe, duration: 2.0 },
  bubbles: { glsl: bubbles, duration: 2.0 },
  glassCrash: { glsl: glassCrash, duration: 2.2 },
  dockFade: { glsl: dockFade, duration: 2.4 },
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
  uniform float uFromLive, uToLive; // 1 = a live 3D world in HDR: tone-map it to match the plates
  varying vec2 vUv;
  #define PI 3.14159265
  float aspect() { return uScreen.x / uScreen.y; }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  // object-fit: cover, then the Ken Burns zoom/pan
  vec2 cover(vec2 uv, vec2 img, vec3 xf) {
    float s = uScreen.x / uScreen.y, i = img.x / img.y;
    vec2 k = s > i ? vec2(1.0, i / s) : vec2(s / i, 1.0);
    return (uv - 0.5) * k / xf.x + xf.yz + 0.5;
  }
  vec3 aces(vec3 x) { return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  vec4 grade(vec4 c, float live) { return live > 0.5 ? vec4(pow(aces(c.rgb * 0.6), vec3(1.0 / 2.2)), 1.0) : c; }
  vec4 fromColor(vec2 uv) { return grade(texture2D(uFrom, cover(uv, uFromSize, uFromXf)), uFromLive); }
  vec4 toColor(vec2 uv) { return grade(texture2D(uTo, cover(uv, uToSize, uToXf)), uToLive); }
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
const TILT = 0.03;

// Clip hook (Phase 3): setClipPlayer(fn) where fn(from, to, onDone) returns { skip() } when a
// clip for that pair exists and is playing, or null to fall back to the shader.
let clipPlayer = null;
export const setClipPlayer = (fn) => (clipPlayer = fn);

// still[i] = true keeps plate i fixed (no Ken Burns), e.g. the s04 map that highlights align to.
// live[i] = a 3D world ({ scene, camera, init, resize, update }) drawn instead of plate i.
export function createRenderer(canvas, plates, tier, { still = [], live = [] } = {}) {
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

  // Live worlds render into HDR targets on every frame they are on screen, then go through the
  // same transition and finish shaders as a plate.
  const composers = [];
  const targets = plates.map((_, i) => {
    if (!live[i]) return null;
    const rt = new THREE.WebGLRenderTarget(1920, 1080, { type: THREE.HalfFloatType, stencilBuffer: true, samples: 0 }); // stencil: hero title behind the ship; MSAA: smooth edges on a discrete GPU
    rt.texture.userData.size = new THREE.Vector2(1920, 1080);
    textures[i] = rt.texture;
    live[i].init(renderer);
    const post = live[i].post;
    if (post) {
      // Post chain on the world's own target: scene, bloom on the HDR highlights, god rays.
      const c = new EffectComposer(renderer, rt);
      const scenePass = new MsaaScenePass(live[i].scene, live[i].camera, 0);
      c.addPass(scenePass);
      c.addPass(new TexturePass(scenePass.target.texture));
      c.bloom = new UnrealBloomPass(new THREE.Vector2(960, 540), post.bloom.strength, post.bloom.radius, post.bloom.threshold);
      c.addPass(c.bloom);
      if (post.rays) {
        c.rays = new ShaderPass(GodRays);
        c.rays.uniforms.uIntensity.value = post.rays.intensity;
        c.rays.uniforms.uThreshold.value = post.rays.threshold ?? 1.2;
        c.addPass(c.rays);
      }
      composers[i] = c;
    }
    // Compile shaders and upload textures now, not on the first transition frame (that was a 200-300 ms hitch).
    live[i].update?.(0);
    if (composers[i]) {
      live[i].post.sun?.(composers[i].rays?.uniforms.uSun.value);
      composers[i].render();
      composers[i].render(); // twice: both ping-pong targets
    } else {
      renderer.setRenderTarget(rt);
      renderer.render(live[i].scene, live[i].camera);
    }
    renderer.setRenderTarget(null);
    return rt;
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
    uFromLive: { value: 0 },
    uToLive: { value: 0 },
  };
  let motion = tier.motion;
  const started = plates.map(() => 0); // when each plate last came on screen (s)
  const pair = { from: 0, to: 0 };
  const now = () => performance.now() / 1000;
  // Tilt: the pointer leans the view a little. An extra TILT zoom pays for the shift, so the
  // sampled window stays inside the plate (same bound as Ken Burns). Decorative only.
  const lean = { x: 0, y: 0, tx: 0, ty: 0 };
  const xf = (v, i, t) => {
    if (!motion || still[i] || live[i]) return v.set(1, 0, 0); // a live world moves its own camera
    const [s, x, y] = kenBurns(i, t - started[i]);
    const s2 = s * (1 + TILT);
    const m = 0.5 * (1 / s - 1 / s2);
    return v.set(s2, x + lean.x * m, y + lean.y * m);
  };
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
    uniforms.uFromLive.value = live[from] ? 1 : 0;
    uniforms.uToLive.value = live[to] ? 1 : 0;
  };

  const settle = (i) => {
    setPair(i, i);
    uniforms.uProgress.value = 1;
    quad.material = materials.crossfade; // at rest, no need to run the transition shader
  };
  function show(i) {
    started[i] = now();
    settle(i);
  }

  // Live worlds keep moving under the transition shader, so camera moves carry across the cut.
  // shortcut: costs fill rate on an iGPU (govern() steps effects down if frames drop); the deck runs on an RTX 3050.
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
      composers.forEach((c) => c?.passes.slice(1).forEach((p) => (p.enabled = false))); // back to the plain frame
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
      const pr = renderer.getPixelRatio() * (tier.liveScale || 1); // fill rate is the limit on iGPUs
      targets.forEach((rt, i) => {
        if (!rt) return;
        const c = composers[i];
        if (c) {
          c.setPixelRatio(pr);
          c.setSize(w, h);
        } else rt.setSize(Math.round(w * pr), Math.round(h * pr));
        rt.texture.userData.size.set(w, h);
        live[i].resize(w, h);
      });
    },
    tilt(x, y) {
      lean.tx = Math.max(-1, Math.min(1, x));
      lean.ty = Math.max(-1, Math.min(1, y));
    },
    render(time) {
      const ease = Math.min(1, Math.max(0, time - last) * 3); // read before govern() moves `last`
      lean.x += (lean.tx - lean.x) * ease;
      lean.y += (lean.ty - lean.y) * ease;
      govern(time);
      uniforms.uTime.value = time;
      xf(uniforms.uFromXf.value, pair.from, time);
      xf(uniforms.uToXf.value, pair.to, time);
      for (const i of new Set([pair.from, pair.to])) {
        if (!targets[i]) continue;
        live[i].update(time, lean);
        const c = composers[i];
        if (c) {
          live[i].post.sun?.(c.rays?.uniforms.uSun.value); // sun position on screen, for the rays
          c.render();
        } else {
          renderer.setRenderTarget(targets[i]);
          renderer.render(live[i].scene, live[i].camera);
        }
      }
      // A composer ping-pongs its two targets: the finished frame is in readBuffer.
      if (composers[pair.from]) uniforms.uFrom.value = composers[pair.from].readBuffer.texture;
      if (composers[pair.to]) uniforms.uTo.value = composers[pair.to].readBuffer.texture;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}
