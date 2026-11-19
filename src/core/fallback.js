// Plate loading (shared with renderer.js) and the no-WebGL path: plates as CSS backgrounds
// on two stacked layers, CSS-opacity crossfade, same transition API as the WebGL renderer.

export const MAX_TRANSITION = 4; // seconds

const pad = (n) => String(n).padStart(2, '0');

// Placeholder plate on a 2D canvas: dark gradient, big scene number, title.
export function placeholderPlate(n, title, w = 1920, h = 1080) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0A1118');
  grad.addColorStop(1, '#002C5F');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(243, 112, 33, 0.18)';
  g.font = '800 520px Montserrat, sans-serif';
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.fillText(pad(n), w - 60, h - 80);
  g.fillStyle = 'rgba(232, 238, 244, 0.3)';
  g.font = '800 26px Montserrat, sans-serif';
  g.textAlign = 'center'; // top centre: clear of the HUD top bar, headline and badge
  g.fillText(`PLACEHOLDER PLATE · ${title.toUpperCase()}`, w / 2, 60);
  return c;
}

// Resolves to an <img> for public/plates/sNN.jpg, or a placeholder canvas if it is missing.
export function loadPlate(n, title) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(placeholderPlate(n, title));
    img.src = `plates/s${pad(n)}.jpg`;
  });
}

// DOM-only renderer. plates: array of <img>/<canvas> in scene order.
export function createFallback(root, plates) {
  const urls = plates.map((p) => (p instanceof HTMLCanvasElement ? p.toDataURL('image/jpeg', 0.85) : p.src));
  const layers = [0, 1].map(() => {
    const d = document.createElement('div');
    d.className = 'plate-layer';
    root.append(d);
    return d;
  });
  let front = 0;

  function show(i) {
    layers[front].style.backgroundImage = `url("${urls[i]}")`;
    layers[front].style.transition = 'none';
    layers[front].style.opacity = 1;
    layers[1 - front].style.opacity = 0;
  }

  // Same signature as renderer.transition(). Every type is a crossfade here.
  function transition(from, to, { duration = 1.2, onDone } = {}) {
    const back = 1 - front;
    const d = Math.min(duration, MAX_TRANSITION);
    layers[back].style.backgroundImage = `url("${urls[to]}")`;
    layers[back].style.transition = 'none';
    layers[back].style.opacity = 0;
    void layers[back].offsetWidth; // commit opacity 0 before animating
    layers[back].style.transition = `opacity ${d}s ease-in-out`;
    layers[back].style.opacity = 1;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      front = back;
      show(to);
      onDone?.();
    };
    const timer = setTimeout(finish, d * 1000);
    return { skip: finish };
  }

  return { kind: 'fallback', show, transition, render() {}, resize() {} };
}
