import { describe, expect, it } from "vitest";
import { SCENARIO } from "../src/wifi/data";
import {
  BASE_DRAIN,
  PASS_RATIO,
  POINTS,
  SHORTCUT_CEILING,
  allStops,
  availability,
  availableOptions,
  bestOption,
  choose,
  createGame,
  currentStop,
  evidenceOf,
  feedbackFor,
  hintsAllowed,
  isLate,
  maxPoints,
  next,
  optionOf,
  pointsFor,
  stageOf,
  summarize,
  takeHint,
  type GameState,
  type Option,
  type Tag,
} from "../src/wifi/engine";

type Strategy = (state: GameState) => Option;

function playAll(strategy: Strategy): GameState {
  const state = createGame(SCENARIO);
  while (state.phase !== "done") {
    expect(choose(state, strategy(state).id)).not.toBeNull();
    next(state);
  }
  return state;
}

// Picks the first available option carrying one of the tags, in order of preference; when none is
// available, does nothing (the "refuse" option, which every stop has and which is always available).
const prefer =
  (...tags: Tag[]): Strategy =>
  (state) => {
    const available = availableOptions(state);
    for (const tag of tags) {
      const hit = available.find((option) => option.tags.includes(tag));
      if (hit) return hit;
    }
    return available.find((option) => option.tags.includes("refuse"))!;
  };

const best: Strategy = (state) => bestOption(state);
const refuseEverything = prefer("refuse");
const connectToAnything = prefer("naive");
const vpnFixesEverything = prefer("vpn", "naive");
// "Never connect to anything that isn't mine": own hotspot or nothing on network stops; the best
// action where no network is involved (own charger, privacy filter, decline the file).
const neverConnect: Strategy = (state) => {
  const stop = currentStop(state);
  const hasNetwork = stop.options.some((option) => option.tags.includes("hotspot"));
  return hasNetwork ? prefer("hotspot")(state) : bestOption(state);
};

const stops = allStops(SCENARIO);

describe("wi-fi or why not: content", () => {
  it("has nine stops over the six places, with unique ids", () => {
    expect(stops).toHaveLength(9);
    expect(new Set(stops.map((stop) => stop.id)).size).toBe(stops.length);
    for (const stop of stops) expect(new Set(stop.options.map((option) => option.id)).size).toBe(stop.options.length);
    const places = stops.map((stop) => stop.place).join(" | ");
    for (const word of ["Lounge", "flight", "Hotel", "Café", "Hall", "taxi"]) expect(places).toContain(word);
  });

  it("gives every stop evidence, a reason, clues for the debrief and between 3 and 6 options", () => {
    for (const stop of stops) {
      expect(stop.around.length).toBeGreaterThan(0);
      expect(stop.screens.length).toBeGreaterThan(0);
      expect(stop.clues.length).toBeGreaterThanOrEqual(3);
      expect(stop.why.length).toBeGreaterThan(40);
      expect(stop.options.length).toBeGreaterThanOrEqual(3);
      expect(stop.options.length).toBeLessThanOrEqual(6);
      for (const option of stop.options) {
        expect(option.result.length).toBeGreaterThan(20);
        expect(option.risk === "compromise").toBe(option.compromise !== undefined);
      }
    }
  });

  it("guides only the first stop and gives hints everywhere except the final stage", () => {
    expect(stops.filter((stop) => stop.guided).map((stop) => stop.id)).toEqual([stops[0].id]);
    const last = SCENARIO.stages[SCENARIO.stages.length - 1];
    expect(SCENARIO.stages.filter((stage) => stage.final)).toEqual([last]);
    expect(last.stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of stops) expect(stop.hint.length > 0).toBe(!stageOf(SCENARIO, stop.id).final);
  });

  it("uses only .example domains", () => {
    const text = JSON.stringify(SCENARIO);
    const domains = text.match(/[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|example)\b/gi) ?? [];
    expect(domains.length).toBeGreaterThan(3);
    for (const domain of domains) expect(domain.endsWith(".example")).toBe(true);
  });

  it("always leaves one option that needs no phone and no data, and one option at full marks", () => {
    for (const stop of stops) {
      expect(stop.options.some((option) => option.needsPhone === false && !option.data)).toBe(true);
      expect(maxPoints(stop)).toBe(POINTS.safe);
    }
  });

  it("covers every named hazard", () => {
    const kinds = new Set(stops.flatMap((stop) => stop.screens.map((screen) => screen.kind)));
    for (const kind of ["wifi", "portal", "prompt", "warning", "doc", "qr"]) expect(kinds.has(kind as never)).toBe(true);
    const compromises = new Set(stops.flatMap((stop) => stop.options.map((option) => option.compromise)));
    for (const kind of ["credentials", "session", "device"]) expect(compromises.has(kind as never)).toBe(true);
  });
});

describe("wi-fi or why not: rules", () => {
  it("scores by delivery and risk", () => {
    const lounge = stops[0];
    expect(pointsFor(lounge, optionOf(lounge, "venue"))).toBe(POINTS.safe);
    expect(pointsFor(lounge, optionOf(lounge, "twin-vpn"))).toBe(POINTS.minor);
    expect(pointsFor(lounge, optionOf(lounge, "twin"))).toBe(POINTS.exposed);
    expect(pointsFor(lounge, optionOf(lounge, "skip"))).toBe(POINTS.missed);
    const hotel = stops.find((stop) => stop.id === "hotel-portal")!;
    expect(pointsFor(hotel, optionOf(hotel, "portal"))).toBe(POINTS.compromise);
    // No task at the file stop: declining is the full-marks answer.
    const drop = stops.find((stop) => stop.id === "drop")!;
    expect(drop.task).toBeUndefined();
    expect(pointsFor(drop, optionOf(drop, "decline"))).toBe(POINTS.safe);
  });

  it("treats low-risk tasks on the venue's own Wi-Fi as full marks, with no data used", () => {
    for (const stop of stops.filter((entry) => entry.task?.sensitivity === "low" && entry.options.some((o) => o.tags.includes("venue")))) {
      const venue = stop.options.find((option) => option.tags.includes("venue"))!;
      expect(pointsFor(stop, venue)).toBe(POINTS.safe);
      expect(venue.data ?? 0).toBe(0);
      expect(venue.tags).not.toContain("vpn");
    }
  });

  it("makes verification cost time: queueing at the conference makes the call late", () => {
    const hall = stops.find((stop) => stop.id === "hall")!;
    const verify = optionOf(hall, "verify");
    expect(isLate(hall, verify)).toBe(true);
    expect(pointsFor(hall, verify)).toBe(POINTS.late);
    expect(feedbackFor(hall, verify)).toContain("late");
    const hotel = stops.find((stop) => stop.id === "hotel-portal")!;
    expect(isLate(hotel, optionOf(hotel, "verify"))).toBe(false);
  });

  it("drains the battery every stop, charges, and spends data", () => {
    const state = createGame(SCENARIO);
    choose(state, "hotspot");
    expect(state.battery).toBe(SCENARIO.startBattery - 10 - BASE_DRAIN);
    expect(state.data).toBe(SCENARIO.startData - 15);
    next(state);
    choose(state, "own");
    expect(state.battery).toBe(SCENARIO.startBattery - 10 - BASE_DRAIN + 45 - BASE_DRAIN);
  });

  it("blocks options the resources can't pay for, and rejects them in choose", () => {
    const state = createGame(SCENARIO);
    state.index = stops.findIndex((stop) => stop.id === "hall");
    const hotspot = optionOf(currentStop(state), "hotspot");
    expect(availability(state, hotspot).ok).toBe(false);
    expect(availability(state, hotspot).reason).toContain("MB");
    expect(choose(state, "hotspot")).toBeNull();
    state.battery = 0;
    expect(availableOptions(state).map((option) => option.id)).toEqual(["skip"]);
    expect(choose(state, "nope")).toBeNull();
  });

  it("only accepts one answer per stop, and hints only outside the final stage", () => {
    const state = createGame(SCENARIO);
    expect(takeHint(state)).toBe(stops[0].hint);
    const pick = choose(state, "venue")!;
    expect(pick.hinted).toBe(true);
    expect(choose(state, "twin")).toBeNull();
    next(state);
    expect(state.hinted).toBe(false);
    state.index = stops.length - 1;
    expect(hintsAllowed(state)).toBe(false);
    expect(takeHint(state)).toBeNull();
  });
});

describe("wi-fi or why not: scoring", () => {
  it("best play scores the maximum and passes with no compromise and everything delivered", () => {
    const state = playAll(best);
    const summary = summarize(state);
    expect(summary.max).toBe(stops.length * POINTS.safe);
    expect(summary.total).toBe(summary.max);
    expect(summary.passed).toBe(true);
    expect(summary.compromises).toBe(0);
    expect(summary.delivered).toBe(summary.tasks);
    expect(summary.battery).toBeGreaterThan(0);
    expect(state.picks.every((pick) => pick.correct)).toBe(true);
    // Best play uses venue Wi-Fi where it is fine and saves mobile data for the taxi.
    expect(state.picks.find((pick) => pick.stop === "lounge")!.option).toBe("venue");
    expect(state.picks.find((pick) => pick.stop === "taxi")!.option).toBe("hotspot");
  });

  it("refuse everything loses: nothing delivered and the phone dies", () => {
    const summary = summarize(playAll(refuseEverything));
    expect(summary.total).toBeLessThan(summary.max * SHORTCUT_CEILING);
    expect(summary.passed).toBe(false);
    expect(summary.compromises).toBe(0);
    expect(summary.delivered).toBe(0);
    expect(summary.battery).toBe(0);
  });

  it("never connect (own hotspot or nothing) loses: the data runs out and deadlines are missed", () => {
    const state = playAll(neverConnect);
    const summary = summarize(state);
    expect(summary.total).toBeLessThan(summary.max * SHORTCUT_CEILING);
    expect(summary.passed).toBe(false);
    expect(summary.compromises).toBe(0);
    expect(summary.missed).toBeGreaterThanOrEqual(3);
    expect(summary.data).toBeLessThan(10);
    expect(state.picks.find((pick) => pick.stop === "taxi")!.delivered).toBe(false);
  });

  it("connect to anything loses: credential theft, session hijack and a compromised device", () => {
    const state = playAll(connectToAnything);
    const summary = summarize(state);
    expect(summary.total).toBeLessThan(summary.max * SHORTCUT_CEILING);
    expect(summary.passed).toBe(false);
    const kinds = state.picks.map((pick) => pick.compromise).filter(Boolean);
    expect(kinds).toContain("credentials");
    expect(kinds).toContain("session");
    expect(kinds).toContain("device");
  });

  it("VPN fixes everything loses: the VPN does not help with a fake portal, a QR link, a certificate install or a port", () => {
    const state = playAll(vpnFixesEverything);
    const summary = summarize(state);
    expect(summary.total).toBeLessThan(summary.max * SHORTCUT_CEILING);
    expect(summary.passed).toBe(false);
    expect(summary.compromises).toBeGreaterThanOrEqual(3);
    const by = (id: string) => state.picks.find((pick) => pick.stop === id)!;
    expect(by("hotel-portal").compromise).toBe("credentials");
    expect(by("cafe").compromise).toBe("credentials");
    expect(by("taxi").compromise).toBe("device");
    expect(by("gate").risk).toBe("exposed");
    // ...and it is the right call where the local network is the problem.
    expect(by("hotel-cert").points).toBe(POINTS.safe);
    expect(by("hall").points).toBe(POINTS.safe);
  });

  it("one compromise fails the trip even with a high score", () => {
    const state = playAll((s) => (currentStop(s).id === "cafe" ? optionOf(currentStop(s), "qr") : bestOption(s)));
    const summary = summarize(state);
    expect(summary.total).toBeGreaterThanOrEqual(summary.max * PASS_RATIO);
    expect(summary.compromises).toBe(1);
    expect(summary.passed).toBe(false);
  });

  it("spending data early costs the taxi: resources carry between stops", () => {
    const state = playAll((s) => {
      const hotspot = availableOptions(s).find((option) => option.tags.includes("hotspot"));
      return ["lounge", "hotel-portal", "hotel-cert"].includes(currentStop(s).id) && hotspot ? hotspot : bestOption(s);
    });
    const taxi = state.picks.find((pick) => pick.stop === "taxi")!;
    expect(taxi.option).not.toBe("hotspot");
    expect(taxi.delivered).toBe(false);
  });
});

describe("wi-fi or why not: learning evidence", () => {
  it("is separate from the score and complete for best play", () => {
    const evidence = evidenceOf(playAll(best));
    for (const skill of evidence.skills) {
      expect(skill.of).toBeGreaterThan(0);
      expect(skill.level).toBe("shown");
    }
    expect(evidence.final).toEqual({ correct: 2, of: 2 });
    expect(evidence.unaided).toEqual({ correct: stops.length, of: stops.length });
  });

  it("shows the VPN believer has not learned the VPN's limits, whatever the score", () => {
    const evidence = evidenceOf(playAll(vpnFixesEverything));
    const skill = (id: string) => evidence.skills.find((entry) => entry.skill === id)!;
    expect(skill("vpn-limits").level).toBe("not-yet");
    expect(skill("no-portal-secrets").level).toBe("not-yet");
    expect(skill("cert-warning").level).toBe("shown");
  });

  it("shows the refuser as safe but not working", () => {
    const evidence = evidenceOf(playAll(refuseEverything));
    const skill = (id: string) => evidence.skills.find((entry) => entry.skill === id)!;
    expect(skill("keeps-working").level).toBe("not-yet");
    expect(skill("no-portal-secrets").level).toBe("shown");
    expect(skill("venue-low-risk").level).toBe("not-yet");
  });

  it("counts hinted answers out of the unaided tally", () => {
    const state = createGame(SCENARIO);
    takeHint(state);
    choose(state, "venue");
    next(state);
    choose(state, "own");
    expect(evidenceOf(state).unaided).toEqual({ correct: 1, of: 1 });
  });
});
