import { describe, expect, it } from "vitest";
import { SERVICES } from "../src/ports/data";
import { SHIPS, grade, score, serviceOptions, upgradeLabel } from "../src/ports/engine";

describe("Port Authority", () => {
  it("only asks for an upgrade where a secure version exists", () => {
    for (const ship of SHIPS) {
      if (ship.action === "upgrade") expect(upgradeLabel(ship), ship.id).not.toBeNull();
      expect(SERVICES.find((s) => s.id === ship.service)?.port, ship.id).toBe(ship.port);
    }
  });

  it("offers four distinct services, one of them right, none sharing the port", () => {
    for (const ship of SHIPS) {
      const options = serviceOptions(ship, 7);
      expect(new Set(options).size).toBe(4);
      expect(options).toContain(ship.service);
      const ports = options.filter((id) => id !== ship.service).map((id) => SERVICES.find((s) => s.id === id)!.port);
      expect(ports).not.toContain(ship.port);
    }
  });

  it("covers all three decisions and scores 100 for a perfect run", () => {
    expect(new Set(SHIPS.map((s) => s.action))).toEqual(new Set(["allow", "block", "upgrade"]));
    expect(score(SHIPS.map((s) => ({ service: s.service, action: s.action })))).toBe(100);
    expect(grade(SHIPS[0], { service: SHIPS[0].service, action: "block" }).points).toBe(1);
    // Allowing everything is not a strategy.
    expect(score(SHIPS.map((s) => ({ service: s.service, action: "allow" })))).toBeLessThan(60);
  });
});
