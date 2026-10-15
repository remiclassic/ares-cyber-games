import type { StationId } from "../sim/types";

// Navigation geometry in world units. Nothing here affects the learning simulation.

export type Point = { x: number; y: number };
export const WORLD = { w: 1000, h: 600 };
export const LATERAL_LIMIT = 46;
export const COLLECT_RADIUS = 24;

export const STATIONS: Record<StationId, Point> = {
  "us-west": { x: 150, y: 245 },
  "eu-central": { x: 575, y: 150 },
  "ap-southeast": { x: 815, y: 395 },
};

export type Segment = { from: Point; ctrl: Point; to: Point; chips: { t: number; offset: number }[] };

// One leg per checkpoint, in mission order: EU-CENTRAL, US-WEST, AP-SOUTHEAST.
export const SEGMENTS: Segment[] = [
  { from: { x: 70, y: 545 }, ctrl: { x: 360, y: 500 }, to: { x: 505, y: 268 }, chips: [{ t: 0.24, offset: -30 }, { t: 0.5, offset: 30 }, { t: 0.76, offset: -24 }] },
  { from: { x: 505, y: 268 }, ctrl: { x: 430, y: 440 }, to: { x: 285, y: 335 }, chips: [{ t: 0.24, offset: 28 }, { t: 0.5, offset: -30 }, { t: 0.76, offset: 22 }] },
  { from: { x: 285, y: 335 }, ctrl: { x: 470, y: 590 }, to: { x: 690, y: 452 }, chips: [{ t: 0.22, offset: -28 }, { t: 0.5, offset: 30 }, { t: 0.78, offset: -26 }] },
];

export function pointAt(segment: Segment, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * segment.from.x + 2 * u * t * segment.ctrl.x + t * t * segment.to.x,
    y: u * u * segment.from.y + 2 * u * t * segment.ctrl.y + t * t * segment.to.y,
  };
}

export function tangentAt(segment: Segment, t: number): Point {
  const x = 2 * (1 - t) * (segment.ctrl.x - segment.from.x) + 2 * t * (segment.to.x - segment.ctrl.x);
  const y = 2 * (1 - t) * (segment.ctrl.y - segment.from.y) + 2 * t * (segment.to.y - segment.ctrl.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

// A point `offset` units to the side of the route at t.
export function offsetPoint(segment: Segment, t: number, offset: number): Point {
  const point = pointAt(segment, t);
  const tangent = tangentAt(segment, t);
  return { x: point.x - tangent.y * offset, y: point.y + tangent.x * offset };
}

export function segmentLength(segment: Segment): number {
  let length = 0;
  let previous = segment.from;
  for (let step = 1; step <= 24; step += 1) {
    const point = pointAt(segment, step / 24);
    length += Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  return length;
}
