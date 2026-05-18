// Taskpulse-skinned renderer for a CallGraphResult.
//
// Reads --c-bg / --c-surface / --c-accent / --c-success / --c-error from
// the document root so the panel matches whichever theme (warm-cream
// light, cool-slate dark) is active — NOT callmap's IDE dark palette.

import type { CallGraphResult, ChangedFunction } from './types';
import { layoutGraph, LAYOUT_NODE_WIDTH, LAYOUT_NODE_HEIGHT } from './graphLayout';

interface RenderTheme {
  bg: string;
  surface: string;
  text: string;
  accent: string;
  success: string;
  error: string;
  borderSoft: string;
}

function readTheme(): RenderTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, fallback: string) => css.getPropertyValue(n).trim() || fallback;
  return {
    bg: v('--c-bg', '#f7f3ec'),
    surface: v('--c-surface', '#fff'),
    text: v('--c-text', '#1a1a1a'),
    accent: v('--c-accent', '#f97316'),
    success: v('--c-success', '#16a34a'),
    error: v('--c-error', '#dc2626'),
    borderSoft: v('--c-border-soft', 'rgba(0,0,0,0.1)'),
  };
}

function colorForKind(kind: ChangedFunction['kind'], theme: RenderTheme): string {
  switch (kind) {
    case 'added':
      return theme.success;
    case 'removed':
      return theme.error;
    case 'changed':
      return theme.accent;
    case 'unchanged':
    case 'neutral':
    default:
      return theme.text;
  }
}

export function renderInto(container: HTMLElement, result: CallGraphResult): void {
  const theme = readTheme();
  container.innerHTML = '';

  const positions = layoutGraph(
    result.functions.map((f) => ({ id: f.id })),
    result.edges.map((e) => ({ source: e.source, target: e.target })),
  );
  const posMap = new Map(positions.map((p) => [p.id, p]));

  // Compute bounds so we can fit-to-view.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x + p.width > maxX) maxX = p.x + p.width;
    if (p.y + p.height > maxY) maxY = p.y + p.height;
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600; }
  const pad = 48;
  const w = Math.max(800, maxX - minX + pad * 2);
  const h = Math.max(600, maxY - minY + pad * 2);

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${w} ${h}`);
  svg.style.background = theme.bg;
  svg.style.fontFamily = 'system-ui, sans-serif';

  // Build a defs section with an arrowhead marker.
  const defs = document.createElementNS(svgNs, 'defs');
  defs.innerHTML = `
    <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.accent}" opacity="0.6"/>
    </marker>
    <marker id="cg-arrow-ext" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${theme.text}" opacity="0.35"/>
    </marker>
  `;
  svg.appendChild(defs);

  // Edges
  for (const e of result.edges) {
    const a = posMap.get(e.source);
    const b = posMap.get(e.target);
    if (!a || !b) continue;
    const x1 = a.x + a.width / 2;
    const y1 = a.y + a.height;
    const x2 = b.x + b.width / 2;
    const y2 = b.y;
    const path = document.createElementNS(svgNs, 'path');
    const cy = (y1 + y2) / 2;
    path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`);
    path.setAttribute('fill', 'none');
    path.setAttribute(
      'stroke',
      e.external ? theme.text : theme.accent,
    );
    path.setAttribute('stroke-opacity', e.external ? '0.35' : '0.55');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('marker-end', e.external ? 'url(#cg-arrow-ext)' : 'url(#cg-arrow)');
    svg.appendChild(path);
  }

  // Nodes
  for (const fn of result.functions) {
    const pos = posMap.get(fn.id);
    if (!pos) continue;
    const color = colorForKind(fn.kind, theme);
    const g = document.createElementNS(svgNs, 'g');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
    g.style.cursor = 'pointer';

    const rect = document.createElementNS(svgNs, 'rect');
    rect.setAttribute('width', String(LAYOUT_NODE_WIDTH));
    rect.setAttribute('height', String(LAYOUT_NODE_HEIGHT));
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', theme.surface);
    rect.setAttribute('stroke', color);
    rect.setAttribute('stroke-width', (fn.kind === 'unchanged' || fn.kind === 'neutral') ? '1' : '2');
    g.appendChild(rect);

    const name = document.createElementNS(svgNs, 'text');
    name.setAttribute('x', '12');
    name.setAttribute('y', '20');
    name.setAttribute('fill', theme.text);
    name.setAttribute('font-size', '13');
    name.setAttribute('font-weight', '600');
    name.textContent = truncate(fn.name, 28);
    g.appendChild(name);

    const file = document.createElementNS(svgNs, 'text');
    file.setAttribute('x', '12');
    file.setAttribute('y', '38');
    file.setAttribute('fill', theme.text);
    file.setAttribute('font-size', '10');
    file.setAttribute('opacity', '0.6');
    file.textContent = truncate(fn.file.replace(/^.*\//, ''), 32);
    g.appendChild(file);

    const kindLabel = document.createElementNS(svgNs, 'text');
    kindLabel.setAttribute('x', String(LAYOUT_NODE_WIDTH - 8));
    kindLabel.setAttribute('y', '18');
    kindLabel.setAttribute('fill', color);
    kindLabel.setAttribute('font-size', '10');
    kindLabel.setAttribute('text-anchor', 'end');
    kindLabel.setAttribute('font-weight', '600');
    kindLabel.textContent = fn.kind.toUpperCase();
    g.appendChild(kindLabel);

    // Hover tooltip via title
    const title = document.createElementNS(svgNs, 'title');
    title.textContent = `${fn.name}\n${fn.file}:${fn.startLine}`;
    g.appendChild(title);

    svg.appendChild(g);
  }

  // Empty-state
  if (result.functions.length === 0) {
    const t = document.createElementNS(svgNs, 'text');
    t.setAttribute('x', String((minX + maxX) / 2));
    t.setAttribute('y', String((minY + maxY) / 2));
    t.setAttribute('fill', theme.text);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '14');
    t.textContent = 'No supported source files in this PR.';
    svg.appendChild(t);
  }

  container.appendChild(svg);
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
