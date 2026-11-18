import * as THREE from 'three';
import gsap from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Scene 4 as a live 3D world: a tactical sea chart of Europe, Africa and Asia, extruded from Natural Earth
// coastlines (public domain, clipped by scripts/build-land.py). Ships run Asia -> Europe on two lanes: the
// Suez route (shut: dim red) and the Cape route (busy, amber). Reopening Suez moves the traffic over and
// the lanes' colours, rings and ship counts follow `open` (0 = shut, 1 = open).
// Axes: x east, y up, z south. 1 unit = 1 degree of latitude. Routes are schematic, not navigation data.

const LON0 = 50;
const LAT0 = 10;
const K = Math.cos((20 * Math.PI) / 180); // east-west squeeze
const X = (lon) => (lon - LON0) * K;
const Z = (lat) => -(lat - LAT0);
const at = (lon, lat, y = 0) => new THREE.Vector3(X(lon), y, Z(lat));
const LAND_H = 0.8;
const LANE_Y = 1.05;

// Waypoints (lon, lat): East Asia -> Sri Lanka, then either via Bab el-Mandeb and Suez, or round the Cape.
const TRUNK = [[122.8, 31], [123.2, 26], [122.8, 22.5], [120, 18.5], [115.5, 12], [110.5, 6.5], [106.5, 2.8], [104.3, 1.2], [101.5, 2.6], [99, 4.8], [96.8, 6.4], [93, 6.8], [88, 6.2], [83, 5.2], [78, 5.4]];
const SUEZ = [[72, 8], [65, 11], [57, 12.8], [50, 12.4], [45, 12.2], [43.3, 12.7], [42.5, 14.3], [41, 16.6], [39.4, 19.3], [37.6, 22.4], [35.8, 25.6], [34.2, 28], [33.2, 28.9], [32.6, 29.9], [32.4, 31.3], [30.5, 32.8], [26, 34.2], [20, 35.2], [15.5, 36.6], [11.5, 37.6], [6, 38.2], [0, 37.4], [-5.6, 36], [-9.8, 37.6], [-10.6, 42.5], [-6.5, 48.5], [1, 50.3], [3.6, 52.1]];
const CAPE = [[70, 2], [62, -5], [54, -15], [45, -27], [35, -33.5], [27, -36.2], [20, -36.3], [14.5, -34], [10, -28], [6, -16], [3, -6], [-3, 2], [-12, 8], [-19, 14.5], [-20.5, 22], [-18, 29.5], [-13.5, 36], [-12, 41], [-10.4, 45.5], [-6.5, 48.6], [1, 50.3], [3.6, 52.1]];
const MARKS = {
  bab: { lon: 43.3, lat: 12.7, label: 'BAB EL-MANDEB', sub: true },
  suez: { lon: 32.55, lat: 30.4, label: 'SUEZ CANAL', sub: true },
  hormuz: { lon: 56.4, lat: 26.5, label: 'STRAIT OF HORMUZ', sub: false },
  cape: { lon: 18.5, lat: -34.6, label: 'CAPE OF GOOD HOPE', sub: false },
  rtm: { lon: 4.2, lat: 52, label: 'ROTTERDAM', port: true },
  asia: { lon: 122.6, lat: 31, label: 'SHANGHAI', port: true },
};

// Camera poses per reveal step: position p, look-at t. Framed so the routes sit between the text column
// (left) and the numbers column (right).
const WIDE = { p: [-39, 160, 64], t: [-39, 0, -1] };
const POSES = [
  WIDE, // 0 Req 3: the whole detour
  { p: [-10, 66, 30], t: [-10, 0, -15] }, // 1 Red Sea, Gulf of Aden, Hormuz
  WIDE, // 2 Req 4: Suez traffic returning
  { p: [-42, 96, 22], t: [-42, 0, -34] }, // 3 Europe: bunching at the ports
  WIDE, // 4 medium term
  WIDE, // 5 lessons
];

const ease = (x) => x * x * (3 - 2 * x);

export async function createMapWorld() {
  const [land, shipGltf] = await Promise.all([fetch('data/land.json').then((r) => r.json()), new GLTFLoader().loadAsync('models/mapship.glb')]);
  await document.fonts.load('800 56px Montserrat');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 2000);

  // Sea: dark chart with a faint 10-degree grid and a slow radar ring from the Red Sea.
  const seaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vW; void main() { vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vW;
      void main() {
        vec2 p = vW.xz;
        vec2 g = abs(fract(p / 10.0 + 0.5) - 0.5) * 10.0;
        float grid = 1.0 - smoothstep(0.0, 0.09, min(g.x, g.y));
        vec2 c = vec2(${X(40).toFixed(2)}, ${Z(18).toFixed(2)});
        float r = length(p - c);
        float ring = smoothstep(2.5, 0.0, abs(mod(r - uTime * 7.0, 60.0) - 0.0)) * exp(-r * 0.018);
        float vign = smoothstep(190.0, 40.0, length(p - vec2(0.0, 0.0)));
        vec3 col = mix(vec3(0.004, 0.010, 0.022), vec3(0.012, 0.045, 0.085), vign);
        col += vec3(0.03, 0.22, 0.34) * grid * 0.55 * vign;
        col += vec3(0.08, 0.5, 0.75) * ring * 0.25;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), seaMat);
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  // Land: extruded polygons, plus glowing coastline.
  const topMat = new THREE.MeshStandardMaterial({ color: 0x1a3c4c, roughness: 0.75, metalness: 0.15 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x0c1f2a, roughness: 0.9 });
  const landGroup = new THREE.Group();
  const lineSegs = [];
  for (const poly of land.polys) {
    const ring = (flat) => {
      const pts = [];
      for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(X(flat[i]), -Z(flat[i + 1])));
      return pts;
    };
    const shape = new THREE.Shape(ring(poly[0]));
    for (let k = 1; k < poly.length; k++) shape.holes.push(new THREE.Path(ring(poly[k])));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: LAND_H, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, [topMat, sideMat]);
    mesh.rotation.x = -Math.PI / 2;
    landGroup.add(mesh);
    for (const flat of poly) {
      for (let i = 0; i < flat.length; i += 2) {
        const j = (i + 2) % flat.length;
        lineSegs.push(X(flat[i]), LAND_H + 0.02, Z(flat[i + 1]), X(flat[j]), LAND_H + 0.02, Z(flat[j + 1]));
      }
    }
  }
  scene.add(landGroup);
  const coastGeo = new THREE.BufferGeometry();
  coastGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lineSegs), 3));
  scene.add(new THREE.LineSegments(coastGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(0.25, 1.3, 1.7), transparent: true, opacity: 0.55 })));

  const key = new THREE.DirectionalLight(0x9fd8ff, 2.2);
  key.position.set(-60, 120, 40);
  scene.add(key, new THREE.HemisphereLight(0x6fa8d8, 0x081018, 0.9));

  // Lanes: tubes with flowing dashes. open = 0 shut (red) .. 1 open (cyan); the Cape lane fades as Suez opens.
  const trunkSuez = new THREE.CatmullRomCurve3([...TRUNK, ...SUEZ].map(([lo, la]) => at(lo, la, LANE_Y)), false, 'centripetal');
  const trunkCape = new THREE.CatmullRomCurve3([...TRUNK, ...CAPE].map(([lo, la]) => at(lo, la, LANE_Y)), false, 'centripetal');
  const laneUniforms = { uTime: { value: 0 }, uOpen: { value: 0 } };
  const lane = (curve, kind) =>
    new THREE.Mesh(
      new THREE.TubeGeometry(curve, 700, 0.2, 6),
      new THREE.ShaderMaterial({
        uniforms: { ...laneUniforms, uKind: { value: kind } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform float uTime, uOpen, uKind;
          varying vec2 vUv;
          void main() {
            float dash = smoothstep(0.35, 0.5, fract(vUv.x * 90.0 - uTime * 0.9));
            vec3 amber = vec3(3.2, 1.5, 0.35);
            vec3 cyan = vec3(0.35, 2.4, 3.2);
            vec3 red = vec3(1.7, 0.2, 0.12);
            vec3 col; float a;
            if (uKind < 0.5) { col = mix(red, cyan, smoothstep(0.0, 0.4, uOpen)); // cyan as soon as traffic is back; the ship count shows how much
              a = mix(0.35, 1.0, uOpen) * mix(0.55 + 0.45 * dash, 1.0, uOpen * 0.6 + 0.0); }
            else { col = amber; a = mix(1.0, 0.3, uOpen) * (0.6 + 0.4 * dash); }
            gl_FragColor = vec4(col * a, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
  scene.add(lane(trunkSuez, 0), lane(trunkCape, 1));

  // Ships: low-poly container ships (scripts/blender/build_mapship.py, length 1, bow +x) along each lane;
  // counts follow `open`.
  const N = 26;
  let shipGeo = null;
  shipGltf.scene.traverse((o) => o.isMesh && (shipGeo = o.geometry));
  shipGeo.scale(3.2, 3.2, 3.2);
  shipGeo.translate(0, 0.22, 0); // sits on top of the lane tube, not inside it
  const shipMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x6a4a30, emissiveIntensity: 1.2 }); // lit enough to read against the dark sea
  const ships = [new THREE.InstancedMesh(shipGeo, shipMat, N), new THREE.InstancedMesh(shipGeo, shipMat, N)];
  ships.forEach((s) => (s.frustumCulled = false));
  scene.add(...ships);

  // Chokepoint rings and labels.
  const markers = {};
  for (const [id, m] of Object.entries(MARKS)) {
    const g = new THREE.Group();
    g.position.copy(at(m.lon, m.lat, LANE_Y + 0.1));
    if (!m.port) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.3), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      g.add(ring);
      g.userData.ring = ring;
    } else {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.4) }));
      g.add(dot);
    }
    if (m.sub) {
      // A red cross over the chokepoint while it is shut; fades as it reopens.
      const xMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const a of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 0.55), xMat);
        bar.rotation.y = a;
        bar.position.y = 0.3;
        g.add(bar);
      }
      g.userData.cross = xMat;
    }
    const sprite = label(m.label);
    sprite.position.set(0, 4.2, 0);
    g.add(sprite);
    scene.add(g);
    markers[id] = g;
  }

  const state = { cam: pose(0), open: 0 };
  let tl = null;
  let ready = false;
  const tmp = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    scene,
    camera,
    post: { bloom: { strength: 0.55, radius: 0.55, threshold: 1.0 } }, // the lanes and rings glow
    init() {
      ready = true;
    },
    resize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    // Move to the pose for a reveal step; open: how far Suez traffic is back, 0 shut .. 1 fully back
    // (animated, or at once when `instant`).
    go(step, open, instant = false) {
      tl?.kill();
      if (instant) return void Object.assign(state, { cam: pose(step), open });
      tl = gsap.timeline().to(state.cam, { ...pose(step), duration: 2.2, ease: 'power2.inOut' }, 0).to(state, { open, duration: 3.2, ease: 'power2.inOut' }, 0.4);
    },
    update(t, lean = { x: 0, y: 0 }) {
      if (!ready) return;
      seaMat.uniforms.uTime.value = t;
      laneUniforms.uTime.value = t;
      laneUniforms.uOpen.value = state.open;
      const o = state.open;
      // Cape traffic thins out, Suez traffic builds up.
      [[trunkCape, ships[1], 1 - 0.75 * ease(o), 0.011], [trunkSuez, ships[0], o, 0.013]].forEach(([curve, mesh, share, speed]) => {
        for (let i = 0; i < N; i++) {
          const u = (i / N + t * speed) % 1;
          const v = THREE.MathUtils.clamp((share * N - i) / 1.5, 0, 1);
          curve.getPointAt(u, tmp);
          curve.getTangentAt(u, tan);
          side.crossVectors(tan, up).normalize();
          lift.crossVectors(side, tan);
          m4.makeBasis(tan, lift, side).setPosition(tmp).scale(side.set(v, v, v)); // long axis along the lane
          mesh.setMatrixAt(i, m4);
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
      // Rings: red while shut (Bab el-Mandeb, Suez), cyan once open; Hormuz and the Cape stay amber.
      const pulse = 1 + 0.18 * Math.sin(t * 3);
      for (const id of ['bab', 'suez']) {
        const g = markers[id];
        const k = Math.min(1, o * 2.5);
        g.userData.ring.material.color.setRGB(3 - 2.7 * k, 0.4 + 1.8 * k, 0.3 + 2.7 * k);
        g.userData.ring.scale.setScalar(pulse);
        g.userData.cross.opacity = 1 - Math.min(1, o * 2.2);
      }
      for (const id of ['hormuz', 'cape']) {
        markers[id].userData.ring.material.color.setRGB(3, 1.5, 0.3);
        markers[id].userData.ring.scale.setScalar(pulse);
      }
      const c = state.cam;
      camera.position.set(c.px + 1.2 * Math.sin(t * 0.17) + lean.x * 3, c.py + 0.6 * Math.sin(t * 0.23) + lean.y * 2, c.pz);
      camera.lookAt(c.tx, c.ty, c.tz);
    },
  };
}

// A text sprite: bold, white, always on top.
function label(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 112;
  const g = canvas.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 62px Montserrat';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(3,10,20,0.9)';
  g.strokeText(text, 384, 58);
  g.fillStyle = '#f2f6fa';
  g.fillText(text, 384, 58);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true, fog: false }));
  sprite.scale.set(17, 2.5, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function pose(step) {
  const { p, t } = POSES[Math.min(step, POSES.length - 1)];
  return { px: p[0], py: p[1], pz: p[2], tx: t[0], ty: t[1], tz: t[2] };
}
