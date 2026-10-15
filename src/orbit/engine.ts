// Tactic Orbit rules. Pure: no DOM. Ships fly in on a fixed schedule; tagging a ship with one
// of its technique's tactics raises the shield. Ships that arrive untagged cost integrity.
import { TECHNIQUES, WAVES, type TacticId, type Technique } from "./data";

export const FLIGHT_SECONDS = 16; // time from spawn to impact (calm mode stops ships short)
export const SPAWN_GAP = 4; // seconds between ships in a wave
export const MAX_INTEGRITY = 5;

export function technique(id: string): Technique {
  const found = TECHNIQUES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown technique ${id}`);
  return found;
}

export type Ship = { key: number; technique: string; born: number; tries: number; result: "flying" | "shielded" | "impact"; angle: number };

export function isRight(techniqueId: string, tactic: TacticId): boolean {
  return technique(techniqueId).tactics.includes(tactic);
}

// 100 for a first-try tag, 50 for a second, 0 after that or on impact.
export function pointsFor(ship: Ship): number {
  if (ship.result !== "shielded") return 0;
  return ship.tries === 1 ? 100 : ship.tries === 2 ? 50 : 0;
}

export function waveSchedule(wave: number): { technique: string; at: number }[] {
  return WAVES[wave].map((id, i) => ({ technique: id, at: 1 + i * SPAWN_GAP }));
}
