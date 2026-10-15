// Seeded mulberry32-style generator with an FNV-1a seed hash, adapted from
// GridWatch: Signal Breach's src/sim/rng.ts. Same seed => same traffic order.

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const FALLBACK_NONZERO_SEED = 2779096485;

export type Rng = { state: number };

export function createRng(seed: string): Rng {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return { state: (hash >>> 0) || FALLBACK_NONZERO_SEED };
}

export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let mixed = rng.state;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: Rng, minInclusive: number, maxExclusive: number): number {
  return Math.floor(nextFloat(rng) * (maxExclusive - minInclusive)) + minInclusive;
}

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = nextInt(rng, 0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
