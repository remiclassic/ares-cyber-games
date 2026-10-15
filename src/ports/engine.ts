// Port Authority rules. Pure: no DOM. Each ship: name the service from its port, then apply
// the harbour policy (allow, block, or upgrade to the secure version).
import { ROUNDS, SERVICES, service, type Action, type Ship } from "./data";

export const SHIPS: readonly Ship[] = ROUNDS.flat();

// The right service plus three others on different ports (port 22 is both SSH and SFTP, so
// never offer both).
export function serviceOptions(ship: Ship, seed: number): string[] {
  const pool = SERVICES.filter((entry) => entry.port !== ship.port);
  const picks: string[] = [];
  let s = (seed * 9301 + ship.port * 49297) % 233280;
  while (picks.length < 3) {
    s = (s * 9301 + 49297) % 233280;
    const candidate = pool[s % pool.length].id;
    if (!picks.includes(candidate)) picks.push(candidate);
  }
  const options = [...picks];
  options.splice(s % 4, 0, ship.service);
  return options;
}

export function upgradeLabel(ship: Ship): string | null {
  const secure = service(ship.service).secure;
  return secure ? `${service(secure).name} (${service(secure).port})` : null;
}

export type Answer = { service: string | null; action: Action | null };

export function grade(ship: Ship, answer: Answer): { service: boolean; action: boolean; points: number } {
  const serviceOk = answer.service === ship.service;
  const actionOk = answer.action === ship.action;
  return { service: serviceOk, action: actionOk, points: (serviceOk ? 1 : 0) + (actionOk ? 3 : 0) };
}

export function score(answers: readonly Answer[]): number {
  const total = answers.reduce((sum, answer, i) => sum + grade(SHIPS[i], answer).points, 0);
  return Math.round((100 * total) / (SHIPS.length * 4));
}
