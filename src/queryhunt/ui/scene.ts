import { esc } from "../../ui/dom";

// The incident map: an isometric office and server floor drawn as plain SVG.
// Six rooms on a 15 x 10 grid; five hold an evidence checkpoint. A room stays
// dark until the investigation reaches it.

const U = 34;
const COS = 0.866;
const ROOM = 5;
const WALL = 2.3;

type Shade = readonly [top: string, left: string, right: string];
type Item = { depth: number; svg: string };

const px = (x: number, y: number, z = 0): [number, number] => [(x - y) * U * COS, (x + y) * U * 0.5 - z * U];
const pt = (x: number, y: number, z = 0): string => px(x, y, z).map((n) => n.toFixed(1)).join(",");
const poly = (points: string[], fill: string, extra = ""): string => `<polygon points="${points.join(" ")}" fill="${fill}" ${extra}/>`;

function box(x: number, y: number, z: number, w: number, d: number, h: number, shade: Shade): string {
  return (
    poly([pt(x, y + d, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x, y + d, z + h)], shade[1]) +
    poly([pt(x + w, y, z), pt(x + w, y + d, z), pt(x + w, y + d, z + h), pt(x + w, y, z + h)], shade[2]) +
    poly([pt(x, y, z + h), pt(x + w, y, z + h), pt(x + w, y + d, z + h), pt(x, y + d, z + h)], shade[0])
  );
}

const WOOD: Shade = ["#5b7396", "#34496b", "#243653"];
const METAL: Shade = ["#3d5378", "#243656", "#182641"];
const DARK: Shade = ["#2a3c5c", "#19263f", "#111b30"];

const item = (x: number, y: number, w: number, d: number, svg: string): Item => ({ depth: x + y + (w + d) / 2, svg });

function desk(x: number, y: number, screen = "#39d0ff"): Item {
  const glow = poly([pt(x + 0.5, y + 0.3, 0.68), pt(x + 1.1, y + 0.3, 0.68), pt(x + 1.1, y + 0.3, 1.08), pt(x + 0.5, y + 0.3, 1.08)], screen, 'class="screen"');
  return item(
    x,
    y,
    1.6,
    1.3,
    box(x, y, 0, 1.6, 0.8, 0.58, WOOD) + box(x + 0.45, y + 0.22, 0.58, 0.7, 0.08, 0.55, DARK) + glow + box(x + 0.55, y + 1.0, 0, 0.5, 0.45, 0.34, DARK),
  );
}

function rack(x: number, y: number, led: string): Item {
  let leds = "";
  for (let i = 0; i < 6; i++) {
    const z = 0.3 + i * 0.3;
    const [x1, y1] = px(x + 0.14, y + 0.9, z);
    const [x2, y2] = px(x + 0.76, y + 0.9, z);
    leds += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i % 3 === 1 ? "#7cf5c0" : led}" stroke-width="2" stroke-linecap="round" class="led" opacity="${i % 2 ? 0.95 : 0.6}"/>`;
  }
  return item(x, y, 0.9, 0.9, box(x, y, 0, 0.9, 0.9, 2.05, METAL) + leds);
}

function plant(x: number, y: number): Item {
  const [cx, cy] = px(x + 0.2, y + 0.2, 0.75);
  return item(x, y, 0.4, 0.4, box(x, y, 0, 0.4, 0.4, 0.35, DARK) + `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="13" ry="15" fill="#2f8f5f"/><ellipse cx="${(cx - 4).toFixed(1)}" cy="${(cy - 5).toFixed(1)}" rx="7" ry="8" fill="#4dbb80"/>`);
}

const block = (x: number, y: number, w: number, d: number, h: number, shade: Shade = METAL): Item => item(x, y, w, d, box(x, y, 0, w, d, h, shade));

// A lit panel on a back wall (windows, wall displays).
function wallPanel(axis: "x" | "y", a: number, b: number, z0: number, z1: number, fill: string): string {
  const p = (t: number, z: number): string => (axis === "y" ? pt(t, 0, z) : pt(0, t, z));
  return poly([p(a, z0), p(b, z0), p(b, z1), p(a, z1)], fill, 'class="screen"');
}

type Room = { col: number; row: number; node: number | null; floor: string; items: (ox: number, oy: number) => Item[]; wall?: (ox: number, oy: number) => string };

const ROOMS: Room[] = [
  {
    col: 0,
    row: 0,
    node: null,
    floor: "#1c3355",
    items: (x, y) => [block(x + 1.3, y + 1.5, 2.4, 1.2, 0.52, WOOD), block(x + 0.6, y + 1.8, 0.45, 0.45, 0.34, DARK), block(x + 2.2, y + 0.8, 0.45, 0.45, 0.34, DARK), block(x + 2.2, y + 3.0, 0.45, 0.45, 0.34, DARK), plant(x + 4.2, y + 0.4)],
    wall: (x, y) => wallPanel("x", y + 0.8, y + 3.6, 0.7, 1.9, "url(#qh-map)") + wallPanel("y", x + 1, x + 2.2, 0.8, 1.9, "#1d3557") + wallPanel("y", x + 2.7, x + 3.9, 0.8, 1.9, "#1d3557"),
  },
  {
    col: 1,
    row: 0,
    node: 2,
    floor: "#1b3658",
    items: (x, y) => [block(x + 0.5, y + 0.6, 2.3, 0.8, 0.58, WOOD), desk(x + 0.5, y + 1.9, "#7cf5c0"), block(x + 3.7, y + 0.4, 0.9, 0.5, 1.2), plant(x + 4.4, y + 4.3)],
    wall: (x) => wallPanel("y", x + 0.5, x + 2.1, 0.75, 1.95, "#1f6fae") + wallPanel("y", x + 2.4, x + 4.5, 0.75, 1.95, "url(#qh-map)"),
  },
  {
    col: 2,
    row: 0,
    node: 3,
    floor: "#172f4e",
    items: (x, y) => [rack(x + 0.4, y + 0.3, "#39d0ff"), rack(x + 1.5, y + 0.3, "#39d0ff"), rack(x + 2.6, y + 0.3, "#39d0ff"), rack(x + 3.7, y + 0.3, "#39d0ff"), rack(x + 0.4, y + 1.6, "#39d0ff"), rack(x + 1.5, y + 1.6, "#39d0ff")],
  },
  {
    col: 0,
    row: 1,
    node: 0,
    floor: "#1c3355",
    items: (x, y) => [desk(x + 0.5, y + 0.5), desk(x + 2.8, y + 0.5), desk(x + 0.5, y + 2.2), block(x + 0.25, y + 4.0, 0.5, 0.8, 1.3, WOOD), plant(x + 4.4, y + 0.4)],
    wall: (_x, y) => wallPanel("x", y + 0.6, y + 2.0, 0.8, 1.9, "#1d3557") + wallPanel("x", y + 2.6, y + 4.2, 0.8, 1.9, "#1d3557"),
  },
  {
    col: 1,
    row: 1,
    node: 1,
    floor: "#1b3658",
    items: (x, y) => [desk(x + 0.5, y + 0.5), desk(x + 0.5, y + 1.9), block(x + 3.7, y + 0.4, 1.0, 0.5, 1.15), block(x + 0.5, y + 4.2, 1.6, 0.5, 0.9), plant(x + 4.4, y + 4.3)],
  },
  {
    col: 2,
    row: 1,
    node: 4,
    floor: "#33263a",
    items: (x, y) => [rack(x + 0.4, y + 0.4, "#ff6f61"), rack(x + 1.5, y + 0.4, "#ff6f61"), block(x + 3.6, y + 0.5, 1.0, 1.0, 0.7, DARK), block(x + 0.4, y + 4.1, 0.8, 0.6, 0.6, DARK)],
  },
];

const NODE_AT = 3.1;
const roomOf = (node: number): Room => ROOMS.find((r) => r.node === node)!;
const nodeFloor = (node: number): [number, number] => {
  const r = roomOf(node);
  return [r.col * ROOM + NODE_AT, r.row * ROOM + NODE_AT];
};

const GLYPH = {
  doc: '<path d="M-6-9h8l5 5v13h-13z M2-9v5h5 M-3 0h7 M-3 4h7" />',
  check: '<path d="M-7 0l5 5 9-10" />',
  lock: '<path d="M-6-1h12v9h-12z M-3-1v-4a3 3 0 0 1 6 0v4" />',
  flag: '<path d="M-5 9v-18 M-5-8h11l-3 4 3 4h-11" />',
};

export type SceneNode = Readonly<{ title: string; state: "locked" | "active" | "done" }>;

export function sceneSvg(nodes: readonly SceneNode[]): string {
  const step = nodes.findIndex((n) => n.state !== "done");
  const reached = step === -1 ? nodes.length - 1 : step;
  const dark = (room: Room): string => (room.node !== null && room.node > reached ? " dark" : "");

  let floors = "";
  let things = "";
  for (const room of ROOMS) {
    const x = room.col * ROOM;
    const y = room.row * ROOM;
    let floor = poly([pt(x, y), pt(x + ROOM, y), pt(x + ROOM, y + ROOM), pt(x, y + ROOM)], room.floor, 'stroke="#2c4a70" stroke-width="1"');
    for (let i = 1; i < ROOM; i++) {
      floor += `<polyline points="${pt(x + i, y)} ${pt(x + i, y + ROOM)}" class="grid"/><polyline points="${pt(x, y + i)} ${pt(x + ROOM, y + i)}" class="grid"/>`;
    }
    if (room.row === 0) floor += poly([pt(x, 0), pt(x + ROOM, 0), pt(x + ROOM, 0, WALL), pt(x, 0, WALL)], "#16294a", 'stroke="#2c4a70"');
    if (room.col === 0) floor += poly([pt(0, y), pt(0, y + ROOM), pt(0, y + ROOM, WALL), pt(0, y, WALL)], "#11213d", 'stroke="#2c4a70"');
    floor += room.wall?.(x, y) ?? "";
    const [gx, gy] = px(x + 2.5, y + 2.5);
    floor += `<ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="${U * 3.2}" ry="${U * 1.85}" fill="url(#${room.node === 4 ? "qh-pool-amber" : "qh-pool"})"/>`;
    floors += `<g class="zone${dark(room)}">${floor}</g>`;

    // Low glass partitions on the room's inner back edges, then furniture back to front.
    let inner = "";
    if (room.row > 0) inner += poly([pt(x, y), pt(x + ROOM, y), pt(x + ROOM, y, 0.75), pt(x, y, 0.75)], "rgba(90,170,230,0.13)", 'stroke="rgba(120,190,240,0.4)"');
    if (room.col > 0) inner += poly([pt(x, y), pt(x, y + ROOM), pt(x, y + ROOM, 0.75), pt(x, y, 0.75)], "rgba(90,170,230,0.09)", 'stroke="rgba(120,190,240,0.4)"');
    inner += room
      .items(x, y)
      .sort((a, b) => a.depth - b.depth)
      .map((i) => i.svg)
      .join("");
    things += `<g class="zone${dark(room)}">${inner}</g>`;
  }

  // Route between checkpoints, along the floor.
  let route = "";
  for (let i = 0; i < nodes.length - 1; i++) {
    const [ax, ay] = nodeFloor(i);
    const [bx, by] = nodeFloor(i + 1);
    const lit = nodes[i].state === "done";
    route += `<polyline points="${pt(ax, ay)} ${pt(bx, by)}" class="route${lit ? " lit" : ""}${i === nodes.length - 2 ? " final" : ""}"/>`;
  }

  let pads = "";
  let markers = "";
  nodes.forEach((node, i) => {
    const [fx, fy] = nodeFloor(i);
    const [cx, cy] = px(fx, fy);
    const final = i === nodes.length - 1;
    const cls = `node ${node.state}${final ? " final" : ""}`;
    pads += `<g class="${cls}"><ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${U * 1.05}" ry="${U * 0.6}" class="ring outer"/><ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${U * 0.7}" ry="${U * 0.4}" class="ring inner"/></g>`;
    const top = cy - U * 1.25;
    const label = node.state === "locked" ? "Unknown" : node.title;
    const width = Math.max(96, label.length * 7.4 + 46);
    const glyph = node.state === "done" ? GLYPH.check : node.state === "locked" ? GLYPH.lock : final ? GLYPH.flag : GLYPH.doc;
    markers += `<g class="${cls}">
      <line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${top.toFixed(1)}" class="beam"/>
      <circle cx="${cx.toFixed(1)}" cy="${top.toFixed(1)}" r="19" class="disc"/>
      <g transform="translate(${cx.toFixed(1)} ${top.toFixed(1)})" class="glyph">${glyph}</g>
      <g transform="translate(${(cx - width / 2).toFixed(1)} ${(top - 58).toFixed(1)})">
        <rect width="${width.toFixed(0)}" height="30" rx="6" class="tag"/>
        <text x="14" y="21" class="num">${i + 1}</text>
        <text x="34" y="20" class="name">${esc(label)}</text>
      </g>
    </g>`;
  });

  const [left] = px(0, 10);
  const [right] = px(15, 0);
  const [, bottom] = px(15, 10);
  const view = `${(left - 24).toFixed(0)} ${-WALL * U - 10} ${(right - left + 48).toFixed(0)} ${(bottom + WALL * U + 38).toFixed(0)}`;
  const slab = poly([pt(0, 10), pt(15, 10), pt(15, 10, -0.5), pt(0, 10, -0.5)], "#0b1626") + poly([pt(15, 0), pt(15, 10), pt(15, 10, -0.5), pt(15, 0, -0.5)], "#081120");

  return `<svg class="scene" viewBox="${view}" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="qh-map" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f7fc4"/><stop offset="1" stop-color="#12406e"/></linearGradient>
      <radialGradient id="qh-pool"><stop offset="0" stop-color="#8fd4ff" stop-opacity="0.3"/><stop offset="1" stop-color="#8fd4ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="qh-pool-amber"><stop offset="0" stop-color="#ffc061" stop-opacity="0.3"/><stop offset="1" stop-color="#ffc061" stop-opacity="0"/></radialGradient>
      <filter id="qh-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    ${slab}${floors}<g class="routes">${route}</g>${pads}${things}${markers}
  </svg>`;
}
