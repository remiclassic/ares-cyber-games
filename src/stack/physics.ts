// A small soft physics pile: circles under gravity that collide with each other and the walls,
// settle, and come to rest. Tuned to feel soft and readable rather than realistic.

export type Body = {
  key: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  spin: number;
  held: boolean;
  restFor: number; // seconds spent nearly still
};

export type World = { width: number; height: number; bodies: Body[] };

const GRAVITY = 1700;
const SUBSTEPS = 4;
const ITERATIONS = 3;

export function step(world: World, dt: number): void {
  const h = Math.min(dt, 1 / 30) / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s += 1) {
    for (const body of world.bodies) {
      if (body.held) continue;
      body.vy += GRAVITY * h;
      body.vx *= 0.995;
      body.x += body.vx * h;
      body.y += body.vy * h;
      body.angle += body.spin * h;
      body.spin *= 0.96;
    }
    for (let it = 0; it < ITERATIONS; it += 1) {
      for (let i = 0; i < world.bodies.length; i += 1) {
        const a = world.bodies[i];
        for (let j = i + 1; j < world.bodies.length; j += 1) {
          const b = world.bodies[j];
          if (a.held || b.held) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const push = (min - d) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const impulse = -rel * 0.6;
            a.vx -= nx * impulse;
            a.vy -= ny * impulse;
            b.vx += nx * impulse;
            b.vy += ny * impulse;
            const tangent = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
            a.spin += tangent * 0.002;
            b.spin -= tangent * 0.002;
          }
        }
      }
      for (const body of world.bodies) {
        if (body.held) continue;
        if (body.x < body.r) {
          body.x = body.r;
          body.vx = Math.abs(body.vx) * 0.3;
        }
        if (body.x > world.width - body.r) {
          body.x = world.width - body.r;
          body.vx = -Math.abs(body.vx) * 0.3;
        }
        if (body.y > world.height - body.r) {
          body.y = world.height - body.r;
          body.vy = -Math.abs(body.vy) * 0.2;
          body.vx *= 0.85;
          body.spin *= 0.8;
        }
      }
    }
  }
  for (const body of world.bodies) {
    const still = Math.abs(body.vx) + Math.abs(body.vy) < 40;
    body.restFor = still && !body.held ? body.restFor + dt : 0;
  }
}

export function bodyAt(world: World, x: number, y: number, except?: Body): Body | null {
  let best: Body | null = null;
  let bestDistance = Infinity;
  for (const body of world.bodies) {
    if (body === except) continue;
    const d = Math.hypot(body.x - x, body.y - y);
    if (d < body.r * 1.05 && d < bestDistance) {
      best = body;
      bestDistance = d;
    }
  }
  return best;
}
