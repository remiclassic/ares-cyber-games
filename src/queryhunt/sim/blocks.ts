import type { Tile } from "./types";

// Guided blocks. Each tile carries an authored SQL fragment; the tray is always
// read in clause order, so the learner sees how the blocks become a statement.

const ORDER: Record<Tile["kind"], number> = { source: 0, join: 1, filter: 2, group: 3, sort: 4 };
const SINGLE: ReadonlySet<Tile["kind"]> = new Set(["source", "join", "group", "sort"]);

export function addTile(tray: readonly Tile[], tile: Tile): Tile[] {
  if (tray.some((t) => t.id === tile.id)) return [...tray];
  const kept = SINGLE.has(tile.kind) ? tray.filter((t) => t.kind !== tile.kind) : [...tray];
  return [...kept, tile].sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

export function removeTile(tray: readonly Tile[], id: string): Tile[] {
  return tray.filter((t) => t.id !== id);
}

export function buildSql(tray: readonly Tile[]): string | null {
  const source = tray.find((t) => t.kind === "source");
  if (!source || source.kind !== "source") return null;
  const join = tray.find((t) => t.kind === "join");
  const group = tray.find((t) => t.kind === "group");
  const sort = tray.find((t) => t.kind === "sort");
  const filters = tray.filter((t) => t.kind === "filter");

  let select = source.select;
  if (group?.kind === "group") select = group.select;
  else if (join?.kind === "join") select = `${source.table}.*, ${join.select}`;

  const lines = [`SELECT ${select}`, `FROM ${source.table}`];
  if (join?.kind === "join") lines.push(join.sql);
  filters.forEach((f, i) => f.kind === "filter" && lines.push(`${i === 0 ? "WHERE" : "  AND"} ${f.sql}`));
  if (group?.kind === "group") lines.push(`GROUP BY ${group.by}`);
  if (sort?.kind === "sort") lines.push(`ORDER BY ${sort.sql}`);
  return lines.join("\n");
}
