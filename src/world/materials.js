import * as THREE from 'three';

// Poly Haven CC0 textures (docs/third-party-assets.md). Model UVs are metres, so `repeat` = tiles per metre.
// The texture's own colour is dropped: `detail` sets how much of its light and dark (wear, streaks,
// ribs) shows through the part's colour, `normal` scales its normal map.

export async function loadSurfaces(defs) {
  const loader = new THREE.TextureLoader();
  const entries = await Promise.all(
    Object.entries(defs).map(async ([key, { file, repeat }]) => {
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

// Dress every mesh whose material name is a key of `looks` ({ surface, detail, normal }).
export function dressAll(root, surfaces, looks) {
  root.traverse((o) => {
    const look = o.isMesh && looks[o.material.name];
    if (look) dress(o.material, surfaces[look.surface], look);
  });
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
export function sunLongitude(hdr) {
  const { data, width, height } = hdr.image;
  let best = 0;
  let at = 0;
  for (let i = 0; i < width * height; i++) {
    const l = data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2];
    if (l > best) [best, at] = [l, i];
  }
  return ((at % width) + 0.5) / width * 2 * Math.PI - Math.PI;
}
