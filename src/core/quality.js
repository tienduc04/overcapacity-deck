// Render-quality tiers. Auto-picked from the GPU name; override with ?q=low|med|high.
// See docs/machine-report.md for the measurements behind the defaults.
export const TIERS = {
  low: { pixelRatio: 1, motion: false, detail: 0.5, liveScale: 0 }, // unknown projector laptop, software WebGL
  med: { pixelRatio: 1, motion: true, detail: 1, liveScale: 0.75 }, // Intel UHD / Iris Xe at 1080p
  high: { pixelRatio: 2, motion: true, detail: 1, liveScale: 1.5 }, // discrete GPU, HiDPI
};
// motion = Ken Burns + mouse parallax (Phase 3). detail = shader sample count multiplier.
// liveScale = resolution of the live 3D worlds relative to the screen (0 = still plates instead).

export function gpuName(gl) {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

// search: location.search. gpu: renderer string, or null without WebGL2.
export function pickTier(search, gpu) {
  const q = new URLSearchParams(search).get('q');
  if (q in TIERS) return q;
  if (!gpu || /swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'low';
  if (/nvidia|geforce|rtx|quadro|radeon (rx|pro)|apple m\d/i.test(gpu)) return 'high';
  return /iris|arc|radeon/i.test(gpu) ? 'med' : 'low';
}
