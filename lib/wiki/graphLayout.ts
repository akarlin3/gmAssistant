// Pure force-directed layout for the node graph (CP2). Kept dependency-light
// and side-effect-free so it can run both in the browser (feeding React Flow
// node positions) and in tests/benchmarks under node. d3-force does the heavy
// lifting: Barnes–Hut repulsion (forceManyBody) + link springs + collision,
// plus a per-cluster forceX/forceY that pulls faction members toward a shared
// centroid so factions read as visual clusters.
//
// The simulation is run synchronously to completion here (no animation): React
// Flow then renders the settled positions and owns pan/zoom/select. Iteration
// count is capped by node count so large graphs stay responsive.

import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';

export type LayoutNode = {
  /** Stable unique id — the entityKey (`type:id`). */
  id: string;
  /** Cluster id (e.g. a faction key) or null for the unclustered center. */
  cluster?: string | null;
};

export type LayoutEdge = {
  source: string;
  target: string;
  /** 0..1 — stronger edges pull endpoints closer. */
  weight?: number;
};

export type Point = { x: number; y: number };

type SimNode = SimulationNodeDatum & { id: string; cluster: string | null };

/** Canvas extent the layout targets. React Flow re-fits via fitView anyway. */
const WIDTH = 1200;
const HEIGHT = 800;

// Place each distinct cluster on a ring around the center; the null cluster
// (entities with no faction) sits at the middle so they don't bias any ring.
function clusterCenters(clusters: string[]): Map<string, Point> {
  const centers = new Map<string, Point>();
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const ringRadius = Math.min(WIDTH, HEIGHT) * 0.34;
  clusters.forEach((c, i) => {
    const angle = (i / Math.max(1, clusters.length)) * Math.PI * 2;
    centers.set(c, {
      x: cx + Math.cos(angle) * ringRadius,
      y: cy + Math.sin(angle) * ringRadius,
    });
  });
  return centers;
}

/**
 * Compute settled 2D positions for every node. Deterministic given identical
 * input (nodes are seeded on a circle, not randomly), so re-layout doesn't
 * make the graph jump when the node/edge set is unchanged.
 */
export function computeLayout(
  nodes: ReadonlyArray<LayoutNode>,
  edges: ReadonlyArray<LayoutEdge>,
): Record<string, Point> {
  const n = nodes.length;
  if (n === 0) return {};

  // Distinct non-null clusters, in stable order.
  const clusterIds = Array.from(
    new Set(nodes.map((nd) => nd.cluster).filter((c): c is string => !!c)),
  ).sort();
  const centers = clusterCenters(clusterIds);
  const center: Point = { x: WIDTH / 2, y: HEIGHT / 2 };
  const centerOf = (cluster: string | null): Point =>
    (cluster && centers.get(cluster)) || center;

  // Seed deterministically near each node's cluster centroid on a small circle.
  const simNodes: SimNode[] = nodes.map((nd, i) => {
    const c = centerOf(nd.cluster ?? null);
    const angle = (i / n) * Math.PI * 2;
    return {
      id: nd.id,
      cluster: nd.cluster ?? null,
      x: c.x + Math.cos(angle) * 40,
      y: c.y + Math.sin(angle) * 40,
    };
  });

  const idSet = new Set(simNodes.map((s) => s.id));
  const simLinks = edges
    .filter((e) => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target)
    .map((e) => ({
      source: e.source,
      target: e.target,
      // Heavier edges pull harder (shorter rest length handled via strength).
      strength: 0.2 + 0.6 * clamp01(e.weight ?? 0.4),
    }));

  const sim = forceSimulation<SimNode>(simNodes)
    .force('charge', forceManyBody<SimNode>().strength(-220).distanceMax(420))
    .force(
      'link',
      forceLink<SimNode, (typeof simLinks)[number]>(simLinks)
        .id((d) => d.id)
        .distance(90)
        .strength((l: any) => l.strength),
    )
    .force('collide', forceCollide<SimNode>(30))
    .force('x', forceX<SimNode>((d) => centerOf(d.cluster).x).strength(clusterIds.length ? 0.09 : 0.04))
    .force('y', forceY<SimNode>((d) => centerOf(d.cluster).y).strength(clusterIds.length ? 0.09 : 0.04))
    .stop();

  // Fewer iterations for big graphs — the layout is already near-converged from
  // the cluster-seeded start, and this is the main CPU cost on render.
  const iterations = n > 400 ? 150 : n > 150 ? 220 : 300;
  for (let i = 0; i < iterations; i++) sim.tick();

  const out: Record<string, Point> = {};
  for (const s of simNodes) {
    out[s.id] = { x: s.x ?? center.x, y: s.y ?? center.y };
  }
  return out;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
