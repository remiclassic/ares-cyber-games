import { GRID_SIZE, LINK_WAYPOINTS, NODES, NODE_BY_ID, TOKEN_SPEED, VARIANTS, buildRounds, linkPolyline, pointAlong } from "../data/scenario";
import { nodeDistance } from "../sim/engine";
import { findPath, missingDependency } from "../sim/network";
import { createRng, nextFloat } from "../sim/rng";
import type { Assessment, GameState, Link, NodeId, RouteCandidate, SourceId, Token } from "../sim/types";

// Isometric Canvas 2D renderer styled after the Project Ares concept mockup:
// an extruded board over a dark city, glowing right-angle conduits with flow
// chevrons, buildings on pedestals, a shielded core and a holographic gateway.

export const COLORS = {
  cyan: "#22d3ee",
  amber: "#fbbf24",
  red: "#fb7185",
  conduit: "#3d8bff",
  inbound: "#ffa940",
  backup: "#b794ff",
  online: "#4ade80",
  text: "#e6edf7",
  muted: "#93a3bd",
};

const G = GRID_SIZE;
const ZONES: readonly { from: number; to: number; label: string; tint: string }[] = [
  { from: 0, to: 2, label: "EXTERNAL", tint: "rgba(255, 169, 64, 0.06)" },
  { from: 2, to: 4, label: "DMZ · INSPECTED", tint: "rgba(251, 191, 36, 0.035)" },
  { from: 4, to: G, label: "INTERNAL", tint: "rgba(61, 139, 255, 0.05)" },
];

export type Insets = Readonly<{ top: number; right: number; bottom: number; left: number }>;
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export type View = {
  width: number;
  height: number;
  dpr: number;
  time: number;
  alpha: number;
  reducedMotion: boolean;
  selectedNode: NodeId | null;
  candidates: readonly RouteCandidate[];
  hoverCandidate: string | null;
  focusFlow: SourceId | null;
  compact?: boolean;
  insets?: Insets;
};

export type Layout = Readonly<{ tw: number; th: number; ox: number; oy: number }>;
type Pt = { x: number; y: number };

const SLAB = 0.55; // board thickness, in tile-heights
const PEDESTAL_R = 0.62; // pedestal half-size, in tiles
const PEDESTAL_H = 0.42; // pedestal height, in tile-heights

export function computeLayout(width: number, height: number, compact = false, insets: Insets = NO_INSETS): Layout {
  const sw = Math.max(50, width - insets.left - insets.right);
  const sh = Math.max(50, height - insets.top - insets.bottom);
  const overhang = compact ? 0.55 : 0.95; // sprite height above the board's top corner, in tile widths
  const tw = Math.max(compact ? 12 : 26, Math.min(sw / (G + 0.3), sh / (G / 2 + SLAB / 2 + overhang + 0.15)));
  const th = tw / 2;
  const totalH = G * th + SLAB * th + overhang * tw;
  return { tw, th, ox: insets.left + sw / 2, oy: insets.top + (sh - totalH) / 2 + overhang * tw };
}

export function gridToScreen(layout: Layout, gx: number, gy: number): Pt {
  return { x: layout.ox + (gx - gy) * (layout.tw / 2), y: layout.oy + (gx + gy) * (layout.th / 2) };
}

export function nodeScreen(layout: Layout, id: NodeId): Pt {
  const node = NODE_BY_ID[id];
  return gridToScreen(layout, node.gx + 0.5, node.gy + 0.5);
}

// Where a route candidate's build pin sits (grid coords): middle of its last link.
export function candidateAnchor(candidate: RouteCandidate): Pt {
  const [a, b] = candidate.links[candidate.links.length - 1];
  return pointAlong(linkPolyline(a, b), 0.5);
}

const sprites = new Map<string, HTMLImageElement>();
export function loadSprites(): Promise<void> {
  const names = [...new Set(NODES.map((node) => node.sprite))];
  return Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => {
            sprites.set(name, image);
            resolve();
          };
          image.onerror = () => resolve();
          image.src = `./assets/${name}.png`;
        }),
    ),
  ).then(() => undefined);
}

// ------------------------------------------------------------------ static layer

function pathTiles(): Set<string> {
  const tiles = new Set<string>();
  const add = (x: number, y: number) => tiles.add(`${Math.floor(x)},${Math.floor(y)}`);
  const pairs: [NodeId, NodeId][] = [
    ["internet", "gateway"],
    ["gateway", "inspect"],
    ["inspect", "core"],
    ["core", "hr"],
    ["core", "finance"],
  ];
  for (const variant of VARIANTS) {
    for (const round of buildRounds(variant)) for (const c of round.candidates) for (const [a, b] of c.links) pairs.push([a, b]);
  }
  for (const key of Object.keys(LINK_WAYPOINTS)) pairs.push(key.split("-") as [NodeId, NodeId]);
  for (const [a, b] of pairs) {
    const pts = linkPolyline(a, b);
    for (let i = 1; i < pts.length; i += 1) {
      const steps = Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * 2);
      for (let s = 0; s <= steps; s += 1) add(pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * s) / steps, pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * s) / steps);
    }
  }
  for (const node of NODES) for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) tiles.add(`${node.gx + dx},${node.gy + dy}`);
  return tiles;
}

function isoBox(c: CanvasRenderingContext2D, layout: Layout, gx: number, gy: number, w: number, d: number, h: number, top: string, left: string, right: string): { top: Pt[] } {
  const a = gridToScreen(layout, gx, gy);
  const b = gridToScreen(layout, gx + w, gy);
  const e = gridToScreen(layout, gx + w, gy + d);
  const f = gridToScreen(layout, gx, gy + d);
  const up = (p: Pt) => ({ x: p.x, y: p.y - h });
  const poly = (pts: Pt[], fill: string) => {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  poly([f, e, up(e), up(f)], left);
  poly([e, b, up(b), up(e)], right);
  const topPts = [up(a), up(b), up(e), up(f)];
  poly(topPts, top);
  return { top: topPts };
}

function windows(c: CanvasRenderingContext2D, layout: Layout, gx: number, gy: number, w: number, d: number, h: number, rng: ReturnType<typeof createRng>, alpha: number): void {
  // Lit window dots on the left face.
  const f = gridToScreen(layout, gx, gy + d);
  const e = gridToScreen(layout, gx + w, gy + d);
  const rows = Math.max(1, Math.floor(h / (layout.th * 0.28)));
  for (let r = 0; r < rows; r += 1) {
    for (let k = 1; k < 4; k += 1) {
      if (nextFloat(rng) < 0.55) continue;
      const t = k / 4;
      const x = f.x + (e.x - f.x) * t;
      const y = f.y + (e.y - f.y) * t - (r + 0.6) * (h / (rows + 0.4));
      c.fillStyle = nextFloat(rng) < 0.8 ? `rgba(110, 190, 255, ${alpha})` : `rgba(255, 190, 110, ${alpha})`;
      c.fillRect(x - 1, y - 1, Math.max(1.5, layout.tw * 0.025), Math.max(1.5, layout.tw * 0.02));
    }
  }
}

const staticCache = new Map<string, HTMLCanvasElement>();

function drawStatic(ctx: CanvasRenderingContext2D, layout: Layout, view: View): void {
  const key = `${view.width}x${view.height}@${view.dpr}:${layout.tw.toFixed(2)}:${layout.ox.toFixed(1)}:${layout.oy.toFixed(1)}:${view.compact ? 1 : 0}`;
  let cached = staticCache.get(key);
  if (!cached) {
    cached = document.createElement("canvas");
    cached.width = Math.round(view.width * view.dpr);
    cached.height = Math.round(view.height * view.dpr);
    const c = cached.getContext("2d")!;
    c.scale(view.dpr, view.dpr);
    paintStatic(c, layout, view);
    if (staticCache.size > 6) staticCache.clear();
    staticCache.set(key, cached);
  }
  ctx.drawImage(cached, 0, 0, view.width, view.height);
}

function paintStatic(c: CanvasRenderingContext2D, layout: Layout, view: View): void {
  const { tw, th } = layout;
  const center = gridToScreen(layout, G / 2, G / 2);

  // Night sky + haze.
  const sky = c.createRadialGradient(center.x, center.y - th * 2, tw, center.x, center.y, Math.max(view.width, view.height));
  sky.addColorStop(0, "#11213f");
  sky.addColorStop(0.55, "#081226");
  sky.addColorStop(1, "#040914");
  c.fillStyle = sky;
  c.fillRect(0, 0, view.width, view.height);

  // City blocks around the board.
  const rng = createRng("ares-city");
  const reach = view.compact ? 7 : 14;
  const blocks: { gx: number; gy: number; w: number; d: number; h: number }[] = [];
  for (let gy = -reach; gy < G + reach; gy += 1.4) {
    for (let gx = -reach; gx < G + reach; gx += 1.4) {
      const inside = gx > -2.2 && gx < G + 1.2 && gy > -2.2 && gy < G + 1.2;
      if (inside || nextFloat(rng) < 0.35) continue;
      blocks.push({ gx: gx + nextFloat(rng) * 0.3, gy: gy + nextFloat(rng) * 0.3, w: 0.7 + nextFloat(rng) * 0.5, d: 0.7 + nextFloat(rng) * 0.5, h: th * (0.4 + nextFloat(rng) * 3.2) });
    }
  }
  blocks.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
  for (const b of blocks) {
    const dist = Math.hypot(b.gx - G / 2, b.gy - G / 2);
    const fade = Math.max(0.12, 1 - (dist - G / 2) / (reach + 4));
    c.globalAlpha = fade;
    isoBox(c, layout, b.gx, b.gy, b.w, b.d, b.h, "#122038", "#0b1528", "#081020");
    windows(c, layout, b.gx, b.gy, b.w, b.d, b.h, rng, 0.35 * fade);
  }
  c.globalAlpha = 1;

  // Board shadow and slab.
  const slab = SLAB * th;
  const s0 = gridToScreen(layout, 0, 0);
  const s1 = gridToScreen(layout, G, 0);
  const s2 = gridToScreen(layout, G, G);
  const s3 = gridToScreen(layout, 0, G);
  c.save();
  c.fillStyle = "rgba(0, 0, 0, 0.55)";
  c.filter = view.compact ? "none" : "blur(18px)";
  c.beginPath();
  c.moveTo(s0.x, s0.y + slab + 10);
  c.lineTo(s1.x + 10, s1.y + slab + 10);
  c.lineTo(s2.x, s2.y + slab + 22);
  c.lineTo(s3.x - 10, s3.y + slab + 10);
  c.closePath();
  c.fill();
  c.restore();
  const face = (pts: Pt[], fill: string | CanvasGradient) => {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  const down = (p: Pt) => ({ x: p.x, y: p.y + slab });
  const leftFace = c.createLinearGradient(s3.x, s3.y, s3.x, s3.y + slab);
  leftFace.addColorStop(0, "#14243f");
  leftFace.addColorStop(1, "#0a1428");
  face([s3, s2, down(s2), down(s3)], leftFace);
  const rightFace = c.createLinearGradient(s1.x, s1.y, s1.x, s1.y + slab);
  rightFace.addColorStop(0, "#0f1d35");
  rightFace.addColorStop(1, "#070f20");
  face([s2, s1, down(s1), down(s2)], rightFace);
  // Light strips along the slab sides.
  c.strokeStyle = "rgba(61, 139, 255, 0.55)";
  c.lineWidth = 1.5;
  for (const [a, b] of [[s3, s2], [s2, s1]] as [Pt, Pt][]) {
    c.beginPath();
    c.moveTo(a.x, a.y + slab * 0.55);
    c.lineTo(b.x, b.y + slab * 0.55);
    c.stroke();
  }
  face([s0, s1, s2, s3], "#0b172b");

  // Tiles.
  const used = pathTiles();
  for (let gy = 0; gy < G; gy += 1) {
    for (let gx = 0; gx < G; gx += 1) {
      const inset = 0.06;
      const pts = [gridToScreen(layout, gx + inset, gy + inset), gridToScreen(layout, gx + 1 - inset, gy + inset), gridToScreen(layout, gx + 1 - inset, gy + 1 - inset), gridToScreen(layout, gx + inset, gy + 1 - inset)];
      face(pts, (gx + gy) % 2 ? "#0f1d33" : "#0d1a2f");
      c.strokeStyle = "rgba(120, 160, 220, 0.07)";
      c.lineWidth = 1;
      c.stroke();
      const zone = ZONES.find((z) => gx >= z.from && gx < z.to)!;
      face(pts, zone.tint);
    }
  }

  // Decorative server blocks on free tiles.
  const decoRng = createRng("ares-deco");
  const deco: { gx: number; gy: number; w: number; h: number }[] = [];
  for (let gy = 0; gy < G; gy += 1) {
    for (let gx = 0; gx < G; gx += 1) {
      if (used.has(`${gx},${gy}`) || nextFloat(decoRng) < 0.45) continue;
      deco.push({ gx: gx + 0.2, gy: gy + 0.2, w: 0.35 + nextFloat(decoRng) * 0.3, h: th * (0.25 + nextFloat(decoRng) * 0.75) });
    }
  }
  deco.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
  for (const d of deco) {
    isoBox(c, layout, d.gx, d.gy, d.w, d.w, d.h, "#1a2b48", "#101d34", "#0b1628");
    windows(c, layout, d.gx, d.gy, d.w, d.w, d.h, decoRng, 0.55);
  }

  // Zone boundaries and labels.
  c.setLineDash([6, 6]);
  c.lineWidth = 1.5;
  c.strokeStyle = "rgba(160, 190, 240, 0.35)";
  for (const zone of ZONES.slice(1)) {
    const a = gridToScreen(layout, zone.from, 0);
    const b = gridToScreen(layout, zone.from, G);
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  c.setLineDash([]);
  if (!view.compact) {
    c.font = `700 ${Math.max(10, tw * 0.13)}px "Exo 2", Inter, system-ui, sans-serif`;
    c.textAlign = "center";
    c.fillStyle = "rgba(200, 220, 255, 0.6)";
    // Zone names along the front (lower-left) edge of the slab.
    for (const zone of ZONES) {
      const p = gridToScreen(layout, (zone.from + zone.to) / 2, G);
      c.fillText(zone.label, p.x - tw * 0.15, p.y + slab + tw * 0.2);
    }
    const inbound = gridToScreen(layout, -0.4, 8.5);
    c.textAlign = "right";
    c.fillStyle = "rgba(255, 190, 120, 0.85)";
    c.fillText("INBOUND", inbound.x - 6, inbound.y - 4);
    c.fillText("TRAFFIC ›", inbound.x - 6, inbound.y + tw * 0.13);
  }

  // Glowing perimeter.
  c.save();
  c.shadowColor = "rgba(61, 139, 255, 0.9)";
  c.shadowBlur = view.compact ? 4 : 12;
  c.strokeStyle = "rgba(96, 165, 255, 0.85)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(s0.x, s0.y);
  c.lineTo(s1.x, s1.y);
  c.lineTo(s2.x, s2.y);
  c.lineTo(s3.x, s3.y);
  c.closePath();
  c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ conduits

function toScreen(layout: Layout, pts: readonly Pt[]): Pt[] {
  return pts.map((p) => gridToScreen(layout, p.x, p.y));
}

function strokePath(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function chevrons(ctx: CanvasRenderingContext2D, pts: readonly Pt[], spacing: number, offset: number, size: number, color: string): void {
  ctx.fillStyle = color;
  let carry = offset % spacing;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let d = carry;
    for (; d < len - size; d += spacing) {
      const x = a.x + ux * d;
      const y = a.y + uy * d;
      ctx.beginPath();
      ctx.moveTo(x + ux * size, y + uy * size);
      ctx.lineTo(x - uy * size * 0.6, y + ux * size * 0.6);
      ctx.lineTo(x + uy * size * 0.6, y - ux * size * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    carry = d - len;
    if (carry < 0) carry = 0;
  }
}

function drawConduit(ctx: CanvasRenderingContext2D, layout: Layout, view: View, link: Link): void {
  const grid = linkPolyline(link.a, link.b);
  const pts = toScreen(layout, grid);
  const w = Math.max(6, layout.tw * 0.2);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Recessed channel.
  ctx.strokeStyle = "#050c1a";
  ctx.lineWidth = w;
  strokePath(ctx, pts);
  ctx.strokeStyle = "rgba(90, 130, 200, 0.18)";
  ctx.lineWidth = w - 3;
  strokePath(ctx, pts);
  ctx.strokeStyle = "#08132a";
  ctx.lineWidth = w - 5;
  strokePath(ctx, pts);

  if (link.status === "down") {
    ctx.strokeStyle = "rgba(251, 113, 133, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 7]);
    strokePath(ctx, pts);
    ctx.setLineDash([]);
    const mid = pointAlong(grid, 0.5);
    const m = gridToScreen(layout, mid.x, mid.y);
    ctx.fillStyle = "#1b0d18";
    ctx.beginPath();
    ctx.arc(m.x, m.y, Math.max(9, layout.tw * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 2;
    ctx.stroke();
    const k = Math.max(4, layout.tw * 0.045);
    ctx.beginPath();
    ctx.moveTo(m.x - k, m.y - k);
    ctx.lineTo(m.x + k, m.y + k);
    ctx.moveTo(m.x + k, m.y - k);
    ctx.lineTo(m.x - k, m.y + k);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const color = link.kind === "backup" ? COLORS.backup : link.a === "internet" || link.b === "internet" ? COLORS.inbound : COLORS.conduit;
  ctx.shadowColor = color;
  ctx.shadowBlur = view.compact ? 4 : 14;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = w * 0.55;
  strokePath(ctx, pts);
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(2, layout.tw * 0.028);
  strokePath(ctx, pts);
  ctx.shadowBlur = 0;
  const offset = view.reducedMotion ? 0 : (view.time / 1000) * layout.tw * 0.55;
  chevrons(ctx, pts, layout.tw * 0.42, offset, Math.max(3, layout.tw * 0.04), "rgba(230, 242, 255, 0.85)");
  if (link.kind === "backup") {
    const m = pointAlong(grid, 0.5);
    drawPolicyBadge(ctx, gridToScreen(layout, m.x, m.y), layout.tw);
  }
  ctx.restore();
}

function drawPolicyBadge(ctx: CanvasRenderingContext2D, at: Pt, tw: number): void {
  const s = Math.max(0.7, tw / 110);
  ctx.save();
  ctx.translate(at.x, at.y - 4 * s);
  ctx.scale(s, s);
  ctx.fillStyle = "#1e1b4b";
  ctx.strokeStyle = COLORS.backup;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(10, -8);
  ctx.lineTo(9, 3);
  ctx.quadraticCurveTo(6, 10, 0, 13);
  ctx.quadraticCurveTo(-6, 10, -9, 3);
  ctx.lineTo(-10, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ddd6fe";
  ctx.font = "800 8px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ACL", 0, 0);
  ctx.restore();
}

function drawCandidates(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout, view: View): void {
  for (const candidate of view.candidates) {
    if (state.builtRoutes.includes(candidate.id)) continue;
    const hovered = view.hoverCandidate === candidate.id;
    ctx.save();
    ctx.lineJoin = "round";
    ctx.strokeStyle = hovered ? "#ffffff" : "rgba(220, 235, 255, 0.6)";
    ctx.lineWidth = hovered ? 3 : 2;
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = view.reducedMotion ? 0 : -view.time / 80;
    for (const [a, b] of candidate.links) strokePath(ctx, toScreen(layout, linkPolyline(a, b)));
    // Build pad under the pin.
    const anchor = candidateAnchor(candidate);
    const p = gridToScreen(layout, anchor.x, anchor.y);
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, layout.tw * 0.32, layout.th * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ nodes

type NodeHealth = "online" | "offline" | "breached" | "idle";

export function nodeHealth(state: GameState, id: NodeId): NodeHealth {
  if (id !== "finance" && id !== "hr") return "idle";
  if (state.tokens.some((t) => t.state === "delivered" && !t.permitted && t.at === id)) return "breached";
  if (!findPath(state.links, "internet", id)) return "offline";
  if (missingDependency(state.links, id)) return "offline";
  return "online";
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alpha))})`;
}

function drawPedestal(ctx: CanvasRenderingContext2D, layout: Layout, gx: number, gy: number, rim: string, selected: boolean): number {
  const h = PEDESTAL_H * layout.th;
  const cx = gx + 0.5;
  const cy = gy + 0.5;
  const r = PEDESTAL_R;
  const { top } = isoBox(ctx, layout, cx - r, cy - r, r * 2, r * 2, h, "#15253f", "#0e1a30", "#0a1426");
  // Bevelled inner plate.
  const inner = 0.16;
  const up = (p: Pt) => ({ x: p.x, y: p.y - h });
  const plate = [
    gridToScreen(layout, cx - r + inner, cy - r + inner),
    gridToScreen(layout, cx + r - inner, cy - r + inner),
    gridToScreen(layout, cx + r - inner, cy + r - inner),
    gridToScreen(layout, cx - r + inner, cy + r - inner),
  ].map(up);
  ctx.beginPath();
  ctx.moveTo(plate[0].x, plate[0].y);
  for (const p of plate.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = "#1a2d4c";
  ctx.fill();
  ctx.save();
  ctx.shadowColor = rim;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = selected ? "#ffffff" : rim;
  ctx.lineWidth = selected ? 3 : 1.6;
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (const p of top.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  return h;
}

function drawDome(ctx: CanvasRenderingContext2D, x: number, baseY: number, r: number, view: View): void {
  const shimmer = view.reducedMotion ? 0.5 : 0.5 + 0.25 * Math.sin(view.time / 700);
  ctx.save();
  const g = ctx.createRadialGradient(x, baseY - r * 0.55, r * 0.1, x, baseY - r * 0.3, r);
  g.addColorStop(0, `rgba(120, 200, 255, ${0.05 + shimmer * 0.06})`);
  g.addColorStop(0.75, `rgba(61, 139, 255, ${0.12 + shimmer * 0.08})`);
  g.addColorStop(1, "rgba(120, 200, 255, 0.35)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, baseY, r, r * 0.5, 0, 0, Math.PI, false);
  ctx.ellipse(x, baseY, r, r * 1.05, 0, Math.PI, Math.PI * 2, false);
  ctx.fill();
  ctx.strokeStyle = `rgba(150, 215, 255, ${0.5 + shimmer * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#60a5fa";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(x, baseY, r, r * 1.05, 0, Math.PI, Math.PI * 2, false);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, baseY, r, r * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(150, 215, 255, 0.25)";
  for (const k of [0.35, 0.7]) {
    ctx.beginPath();
    ctx.ellipse(x, baseY - r * 1.05 * k, r * Math.sqrt(1 - k * k), r * 0.5 * Math.sqrt(1 - k * k), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// Holographic gateway wall, standing across the inbound path. More rules, denser wall.
function drawHoloWall(ctx: CanvasRenderingContext2D, layout: Layout, gx: number, gy: number, height: number, lift: number, view: View, rules: number): void {
  const a = gridToScreen(layout, gx + 0.95, gy + 0.05);
  const b = gridToScreen(layout, gx + 0.95, gy + 0.95);
  a.y -= lift;
  b.y -= lift;
  const flicker = view.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(view.time / 260);
  ctx.save();
  const g = ctx.createLinearGradient(0, a.y - height, 0, a.y);
  g.addColorStop(0, `rgba(120, 210, 255, ${0.05 * flicker})`);
  g.addColorStop(1, `rgba(61, 160, 255, ${0.32 * flicker})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y - height);
  ctx.lineTo(a.x, a.y - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = `rgba(160, 225, 255, ${0.8 * flicker})`;
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 10;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(160, 225, 255, ${0.22 * flicker})`;
  ctx.lineWidth = 1;
  const bars = Math.min(10, 3 + rules * 2);
  for (let i = 1; i < bars; i += 1) {
    const t = i / bars;
    ctx.beginPath();
    ctx.moveTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    ctx.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScanRings(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, view: View): void {
  ctx.save();
  for (let i = 0; i < 3; i += 1) {
    const phase = view.reducedMotion ? i / 3 : (view.time / 1600 + i / 3) % 1;
    ctx.strokeStyle = `rgba(110, 231, 249, ${0.55 * (1 - phase)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (0.5 + phase), r * 0.5 * (0.5 + phase), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

type LabelJob = { x: number; y: number; baseY: number; text: string; status: string | null; health: NodeHealth; selected: boolean };

function drawNodes(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout, view: View, labels: LabelJob[]): void {
  const order = [...NODES].sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
  for (const node of order) {
    const p = nodeScreen(layout, node.id);
    const size = layout.tw * (view.compact ? 1.15 : 1.3);
    const health = nodeHealth(state, node.id);
    const selected = view.selectedNode === node.id;
    const rim = health === "breached" ? COLORS.red : health === "offline" ? "#64748b" : health === "online" ? COLORS.online : "#4f8dff";

    // Ground glow.
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.5);
    const pulse = view.reducedMotion ? 0.6 : 0.6 + 0.2 * Math.sin(view.time / 500 + node.gx);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, layout.tw * 0.95);
    glow.addColorStop(0, hexAlpha(rim, 0.35 * pulse));
    glow.addColorStop(1, hexAlpha(rim, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, layout.tw * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const lift = drawPedestal(ctx, layout, node.gx, node.gy, rim, selected);
    if (node.id === "inspect") drawScanRings(ctx, p.x, p.y - lift, layout.tw * 0.5, view);

    const image = sprites.get(node.sprite);
    if (image) {
      ctx.save();
      if (health === "offline") ctx.filter = "grayscale(0.9) brightness(0.55)";
      ctx.drawImage(image, p.x - size / 2, p.y - lift - size * 0.74, size, size);
      ctx.restore();
    }
    if (node.id === "core") drawDome(ctx, p.x, p.y - lift + layout.th * 0.05, layout.tw * 0.62, view);
    if (node.id === "gateway") {
      const rules = state.rules.filter((rule) => rule.id !== "legacy").length;
      drawHoloWall(ctx, layout, node.gx, node.gy, size * 0.62, lift, view, rules);
    }

    // Delivery pulse.
    const delivered = state.tokens.filter((t) => t.state === "delivered" && t.at === node.id && t.permitted && state.tick - t.resolvedTick < 40);
    if (delivered.length && !view.reducedMotion) {
      const age = (state.tick - delivered[delivered.length - 1].resolvedTick) / 40;
      ctx.save();
      ctx.translate(p.x, p.y - lift);
      ctx.scale(1, 0.5);
      ctx.strokeStyle = hexAlpha(COLORS.online, 1 - age);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, layout.tw * (0.35 + age * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    labels.push({
      x: p.x,
      y: p.y - lift - size * 0.82,
      baseY: p.y + layout.th * 0.75,
      text: (layout.tw < 70 ? node.short : node.label).toUpperCase(),
      status: health === "offline" ? "OFFLINE" : health === "breached" ? "UNAUTHORIZED ACCESS" : null,
      health,
      selected,
    });
  }
}

function drawLabels(ctx: CanvasRenderingContext2D, labels: readonly LabelJob[], layout: Layout): void {
  const small = layout.tw < 70;
  const fontSize = small ? 9 : Math.max(11, Math.min(14, layout.tw * 0.12));
  for (const label of labels) {
    ctx.save();
    ctx.font = `700 ${fontSize}px "Exo 2", Inter, system-ui, sans-serif`;
    ctx.letterSpacing = small ? "0.5px" : "1.5px";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(label.text).width + 14;
    const h = fontSize + 8;
    ctx.fillStyle = "rgba(4, 10, 24, 0.82)";
    roundRect(ctx, label.x - w / 2, label.y - h / 2, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = label.selected ? "#ffffff" : label.health === "breached" ? COLORS.red : "rgba(96, 165, 255, 0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#eaf2ff";
    ctx.fillText(label.text, label.x, label.y + 0.5);
    if (label.status) {
      ctx.font = `800 ${fontSize - 1}px Inter, system-ui, sans-serif`;
      ctx.letterSpacing = "0.5px";
      const sw = ctx.measureText(label.status).width + 12;
      ctx.fillStyle = label.health === "offline" ? "#334155" : "#9f1239";
      // Status sits under the building so it never stacks on a neighbour's label.
      roundRect(ctx, label.x - sw / 2, label.baseY - h / 2, sw, h, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label.status, label.x, label.baseY + 0.5);
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ tokens

function tokenPosition(state: GameState, token: Token, layout: Layout, alpha: number): Pt {
  if (!token.to) return nodeScreen(layout, token.at);
  const progress = Math.min(1, token.progress + (state.phase === "running" ? alpha * (TOKEN_SPEED / nodeDistance(token.at, token.to)) : 0));
  const g = pointAlong(linkPolyline(token.at, token.to), progress);
  return gridToScreen(layout, g.x, g.y);
}

export function drawToken(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, assessment: Assessment | undefined, alpha = 1): void {
  const color = assessment === "permitted" ? COLORS.cyan : assessment === "violates" ? COLORS.red : COLORS.amber;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  // Glowing orb behind the glyph.
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
  halo.addColorStop(0, hexAlpha(color, 0.6));
  halo.addColorStop(1, hexAlpha(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#0b1220";
  if (assessment === "permitted") {
    ctx.fillStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, 0);
    ctx.lineTo(-r * 0.1, r * 0.4);
    ctx.lineTo(r * 0.5, -r * 0.35);
    ctx.stroke();
  } else if (assessment === "violates") {
    ctx.fillStyle = COLORS.red;
    roundRect(ctx, -r, -r, r * 2, r * 2, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.45);
    ctx.lineTo(r * 0.45, r * 0.45);
    ctx.moveTo(r * 0.45, -r * 0.45);
    ctx.lineTo(-r * 0.45, r * 0.45);
    ctx.stroke();
  } else {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 0, 0, 0, r * 1.2);
    g.addColorStop(0, "#fff3c4");
    g.addColorStop(1, COLORS.amber);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.2);
    ctx.lineTo(r * 1.2, 0);
    ctx.lineTo(0, r * 1.2);
    ctx.lineTo(-r * 1.2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0b1220";
    ctx.font = `800 ${r * 1.3}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 0, r * 0.08);
  }
  ctx.restore();
}

function drawTokens(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout, view: View): void {
  const r = Math.max(4, layout.tw * 0.07);
  const waitingAt = new Map<NodeId, number>();
  const lift = layout.th * 0.35;

  for (const token of state.tokens) {
    const assessment = state.assessments[token.flow];
    const dim = view.focusFlow && view.focusFlow !== token.flow ? 0.35 : 1;
    if (token.state === "moving" || token.state === "waiting") {
      let p = tokenPosition(state, token, layout, view.alpha);
      if (!token.to) {
        const n = waitingAt.get(token.at) ?? 0;
        waitingAt.set(token.at, n + 1);
        p = { x: p.x + layout.tw * 0.42 + (n % 4) * r * 1.8, y: p.y - Math.floor(n / 4) * r * 2 };
      }
      drawToken(ctx, p.x, p.y - lift, r, assessment, dim);
    } else if (token.state === "blocked") {
      const age = state.tick - token.resolvedTick;
      if (age < 45) {
        const p = nodeScreen(layout, "gateway");
        const fade = view.reducedMotion ? 1 : 1 - age / 45;
        const cx = p.x - layout.tw * 0.45;
        const cy = p.y - lift - (view.reducedMotion ? 0 : age * 0.4);
        drawToken(ctx, cx, cy, r, assessment, fade * dim);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = "#f8fafc";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - r * 1.4, cy - r * 1.4);
        ctx.lineTo(cx + r * 1.4, cy + r * 1.4);
        ctx.stroke();
        ctx.restore();
      }
    } else if (token.state === "failed") {
      const age = state.tick - token.resolvedTick;
      if (age < 45) {
        const p = nodeScreen(layout, token.at);
        drawToken(ctx, p.x + layout.tw * 0.3, p.y - lift, r, assessment, (1 - age / 45) * dim);
      }
    }
  }

  const rejected = state.tokens.filter((t) => t.permitted && t.state === "blocked").length;
  if (rejected > 0) {
    const p = nodeScreen(layout, "gateway");
    badge(ctx, p.x, p.y + layout.th * 1.1, `${rejected} approved request${rejected === 1 ? "" : "s"} rejected`, "#7c2d12", "#fed7aa");
  }
  const failed = state.tokens.filter((t) => t.reason === "dependency").length;
  if (failed > 0) {
    const p = nodeScreen(layout, "finance");
    badge(ctx, p.x, p.y + layout.th * 1.5, `${failed} failed: no database`, "#3f3f46", "#fde68a");
  }
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg: string): void {
  ctx.save();
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = bg;
  roundRect(ctx, x - w / 2, y - 11, w, 22, 11);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawScene(ctx: CanvasRenderingContext2D, state: GameState, view: View): Layout {
  const layout = computeLayout(view.width, view.height, view.compact, view.insets);
  // Hidden or not-yet-laid-out canvases have no size; drawing would throw.
  if (view.width < 1 || view.height < 1) return layout;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  drawStatic(ctx, layout, view);
  for (const link of state.links) drawConduit(ctx, layout, view, link);
  drawCandidates(ctx, state, layout, view);
  const labels: LabelJob[] = [];
  drawNodes(ctx, state, layout, view, labels);
  drawTokens(ctx, state, layout, view);
  drawLabels(ctx, labels, layout);
  return layout;
}
