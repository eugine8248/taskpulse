// Run dagre over a set of {id, source, target} pairs and write back
// positions. Top-down (TB) for callgraph readability: callers above,
// callees below.
//
// v0.4: the dagre invocation lives in @callmap/core (no React types).
// The desktop and webview adapters wrap layoutGraph with the xyflow
// Node/Edge shapes they need — this module returns plain {id, x, y}
// triples so it stays usable from any renderer.

import dagre from "dagre";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

export interface LayoutNodeInput {
  id: string;
}

export interface LayoutEdgeInput {
  source: string;
  target: string;
}

export interface LayoutPosition {
  id: string;
  /** Top-left X (already adjusted from dagre's center-coords). */
  x: number;
  /** Top-left Y (already adjusted from dagre's center-coords). */
  y: number;
  width: number;
  height: number;
}

export function layoutGraph(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[]
): LayoutPosition[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80, marginx: 24, marginy: 24 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      x: pos.x - NODE_WIDTH / 2,
      y: pos.y - NODE_HEIGHT / 2,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });
}

export const LAYOUT_NODE_WIDTH = NODE_WIDTH;
export const LAYOUT_NODE_HEIGHT = NODE_HEIGHT;
