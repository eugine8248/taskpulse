// Deterministic label color from name hash. Keeps colors stable across
// reloads without storing them in the DB.

const PALETTE = [
  { bg: '#5b8def', fg: '#ffffff' }, // accent blue
  { bg: '#5fcf95', fg: '#0e1116' }, // success green
  { bg: '#e8a86a', fg: '#0e1116' }, // warning orange
  { bg: '#f0716a', fg: '#ffffff' }, // danger red
  { bg: '#a878e8', fg: '#ffffff' }, // purple
  { bg: '#6fc7d6', fg: '#0e1116' }, // teal
  { bg: '#d67ec0', fg: '#ffffff' }, // pink
  { bg: '#8b95a5', fg: '#ffffff' }, // gray
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function labelColor(name: string): { bg: string; fg: string } {
  return PALETTE[hash(name) % PALETTE.length];
}
