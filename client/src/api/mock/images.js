// Placeholder "photos" for fixtures: flat shapes, no text.
const svg = (body, w = 640, h = 480) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;

export const PIPE_LEAK = svg(`
  <rect width="640" height="480" fill="#3b3f44"/>
  <rect y="300" width="640" height="180" fill="#2a2d31"/>
  <rect x="60" y="140" width="520" height="46" rx="6" fill="#8a9099"/>
  <rect x="300" y="120" width="40" height="86" rx="4" fill="#6c727a"/>
  <path d="M320 206 C 316 250 326 270 318 300" stroke="#9fc3d9" stroke-width="10" fill="none" stroke-linecap="round"/>
  <ellipse cx="330" cy="330" rx="150" ry="22" fill="#4f6c80" opacity="0.8"/>`);

export const CRACKED_WALL = svg(`
  <rect width="640" height="480" fill="#b9b2a6"/>
  <rect y="400" width="640" height="80" fill="#8f877b"/>
  <path d="M210 40 L250 130 L230 190 L290 260 L270 330 L320 400" stroke="#3d3a35" stroke-width="6" fill="none" stroke-linejoin="round"/>
  <path d="M250 130 L300 150 M290 260 L350 250" stroke="#3d3a35" stroke-width="3" fill="none"/>`);

// Deterministic QR-like pattern for the mock connection screen.
export function fakeQr(seed = 1) {
  const n = 29;
  const cell = 8;
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let rects = '';
  const finder = (x, y) =>
    `<rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}" fill="#000"/>` +
    `<rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fff"/>` +
    `<rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#000"/>`;
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!inFinder(x, y) && rand() > 0.52) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#000"/>`;
    }
  }
  return svg(`<rect width="100%" height="100%" fill="#fff"/>${rects}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}`, n * cell, n * cell);
}
