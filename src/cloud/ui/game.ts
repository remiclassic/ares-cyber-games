import { createRng, shuffle } from "../../sim/rng";
import { play, setSoundEnabled } from "../../ui/audio";
import { $, announce, esc, isModalOpen, saveSettings, type Settings } from "../../ui/dom";
import { isTutorialOpen, renderNextStep, type NextStep } from "../../ui/tutorial";
import type { CloudHost } from "../host";
import { COLLECT_RADIUS, LATERAL_LIMIT, SEGMENTS, offsetPoint, tangentAt } from "../render/route";
import { Scene, type SceneView, type StationMode, type StationView } from "../render/scene";
import { describeChange, num, percent } from "../sim/explain";
import { apply, createGame, currentCheckpoint, currentPlan, currentRecord, estimate, knownFacts } from "../sim/mission";
import { evaluateAccess, evaluateCapacity, initialPlan, objectivesMet } from "../sim/rules";
import type { AccessCheckpoint, Attempt, CapacityCheckpoint, Checkpoint, CheckpointRecord, Command, Evidence, GameState, Mission, NavigationReport, Plan, StationId } from "../sim/types";
import { EVIDENCE_ICON, ICONS } from "./icons";

const LEG_SECONDS = 7.5;
const STATION: Record<StationId, { name: string; sub: string }> = {
  "eu-central": { name: "EU-CENTRAL", sub: "Checkout • Payments" },
  "us-west": { name: "US-WEST", sub: "Storefront • eCommerce" },
  "ap-southeast": { name: "AP-SOUTHEAST", sub: "Analytics • Backup" },
};
const KIND_ICON: Record<string, string> = { surge: ICONS.surge, quiet: ICONS.quiet, access: ICONS.access };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const chipsOf = (checkpoint: Checkpoint): Evidence[] => checkpoint.evidence.filter((entry) => entry.source === "chip");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

type Options = Readonly<{
  mission: Mission;
  host: CloudHost;
  settings: Settings;
  onAutopilot: (value: boolean) => void;
  onComplete: (state: GameState, navigation: NavigationReport) => void;
}>;

export class CloudGame {
  private state: GameState;
  private draft: Plan;
  private why: string | null = null;
  private readonly scene = new Scene($("#scene") as HTMLCanvasElement);
  private readonly panel = $("#panel");
  private readonly dock = $("#dock");
  private readonly held = new Set<string>();
  private flight = { t: 0, lateral: 0, thrust: 1, steer: 0 };
  private navigation = { seconds: 0, autopilotLegs: new Set<number>() };
  private autopilot = false;
  private paused = false;
  private run = 0;
  private clock = 0;
  private lastFrame = 0;

  constructor(private readonly options: Options) {
    this.state = createGame(options.mission);
    this.draft = currentPlan(this.state);
    this.bindTools();
    document.addEventListener("keydown", (event) => this.onKey(event));
    document.addEventListener("keyup", (event) => this.held.delete(event.key.toLowerCase()));
    window.addEventListener("blur", () => this.held.clear());
    this.panel.addEventListener("click", (event) => this.onClick(event));
    this.dock.addEventListener("click", (event) => this.onClick(event));
    this.dock.addEventListener("change", (event) => this.onChange(event));
    requestAnimationFrame((now) => this.frame(now));
  }

  start(autopilot: boolean): void {
    this.run += 1;
    this.state = createGame(this.options.mission);
    this.draft = currentPlan(this.state);
    this.why = null;
    this.flight = { t: 0, lateral: 0, thrust: 1, steer: 0 };
    this.navigation = { seconds: 0, autopilotLegs: new Set() };
    this.autopilot = autopilot;
    this.paused = false;
    this.options.host.started();
    this.render();
  }

  setAutopilot(value: boolean): void {
    this.autopilot = value;
    this.syncTools();
    if (this.state.stage === "travel") this.render();
  }

  syncTools(): void {
    const { settings } = this.options;
    const set = (id: string, pressed: boolean, label: string) => {
      const button = $(id);
      button.setAttribute("aria-pressed", String(pressed));
      button.querySelector("b")!.textContent = label;
    };
    set("#btn-auto", this.autopilot, this.autopilot ? "On" : "Off");
    set("#btn-pause", this.paused, this.paused ? "Paused" : "Running");
    set("#btn-sound", !settings.sound, settings.sound ? "On" : "Muted");
    set("#btn-motion", settings.reducedMotion, settings.reducedMotion ? "Reduced" : "Full");
    ($("#btn-pause") as HTMLButtonElement).disabled = this.state.stage !== "travel";
    $("#paused").hidden = !(this.paused && this.state.stage === "travel");
    this.renderNext();
  }

  // ---------- input ----------
  private bindTools(): void {
    const { settings } = this.options;
    $("#tools").innerHTML = `
      <button class="tool" id="btn-auto" aria-pressed="false" title="Autopilot flies each leg and collects every chip (T)">Autopilot <b></b></button>
      <button class="tool" id="btn-pause" aria-pressed="false" title="Pause navigation (P)">Flight <b></b></button>
      <button class="tool" id="btn-sound" aria-pressed="false" title="Mute or unmute sound (M)">Sound <b></b></button>
      <button class="tool" id="btn-motion" aria-pressed="false" title="Reduce motion">Motion <b></b></button>`;
    $("#btn-auto").addEventListener("click", () => this.toggleAutopilot());
    $("#btn-pause").addEventListener("click", () => this.togglePause());
    $("#btn-sound").addEventListener("click", () => this.toggleSound());
    $("#btn-motion").addEventListener("click", () => {
      settings.reducedMotion = !settings.reducedMotion;
      saveSettings(settings);
      this.syncTools();
    });
  }

  private toggleAutopilot(): void {
    this.setAutopilot(!this.autopilot);
    this.options.onAutopilot(this.autopilot);
    announce(this.autopilot ? "Autopilot on" : "Autopilot off");
  }

  private toggleSound(): void {
    const { settings } = this.options;
    settings.sound = !settings.sound;
    saveSettings(settings);
    setSoundEnabled(settings.sound);
    this.syncTools();
  }

  private togglePause(): void {
    if (this.state.stage !== "travel") return;
    this.paused = !this.paused;
    this.syncTools();
    announce(this.paused ? "Navigation paused" : "Navigation resumed");
  }

  private onKey(event: KeyboardEvent): void {
    if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "m") return this.toggleSound();
    if (key === "t") return this.toggleAutopilot();
    if (key === "p") return this.togglePause();
    if (this.state.stage !== "travel") return;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
      this.held.add(key);
      event.preventDefault();
    }
  }

  private onClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!button || (button as HTMLButtonElement).disabled) return;
    const act = button.dataset.act!;
    const checkpoint = currentCheckpoint(this.state);
    if (act === "auto") return this.toggleAutopilot();
    if (act === "pull") {
      if (this.send({ type: "collect", evidence: button.dataset.id!, via: "station" })) {
        play("click");
        this.options.host.record({ verb: "collected", object: button.dataset.id!, result: { via: "station" } });
        this.render();
      }
    } else if (act === "inspect") {
      if (this.send({ type: "inspect" })) {
        play("deliver");
        const found = checkpoint.evidence.find((entry) => entry.source === "inspect")!;
        this.options.host.record({ verb: "inspected", object: checkpoint.id });
        this.render();
        announce(`${found.title}. ${found.lines.join(" ")}`);
      }
    } else if (act === "step" && checkpoint.kind === "capacity") {
      const entry = checkpoint.adjustable.find((candidate) => candidate.service === button.dataset.id)!;
      const next = clamp(this.draft.instances[entry.service] + Number(button.dataset.by), entry.min, entry.max);
      this.draft = { ...this.draft, instances: { ...this.draft.instances, [entry.service]: next } };
      play("click");
      this.render();
    } else if (act === "apply") this.applyChange();
    else if (act === "revise") {
      if (this.send({ type: "revise" })) {
        this.options.host.record({ verb: "revised", object: checkpoint.id });
        this.draft = currentPlan(this.state);
        this.why = null;
        this.render();
        this.focusTitle();
        announce(`Revising. ${this.options.mission.fees.revise} credits charged.`);
      }
    } else if (act === "continue") this.advance();
  }

  private onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.name === "why") this.why = input.value;
    else if (input.dataset.perm) {
      const id = input.dataset.perm;
      this.draft = { ...this.draft, grants: input.checked ? [...this.draft.grants, id] : this.draft.grants.filter((grant) => grant !== id) };
    } else return;
    play("click");
    this.render();
  }

  private send(command: Command): boolean {
    const result = apply(this.state, command);
    if (!result.ok) announce(result.error);
    return result.ok;
  }

  // ---------- flow ----------
  private applyChange(): void {
    if (!this.why) return;
    const checkpoint = currentCheckpoint(this.state);
    if (!this.send({ type: "apply", plan: this.draft, justification: this.why })) return;
    const attempt = this.lastAttempt()!;
    const met = objectivesMet(attempt.outcome);
    this.scene.pulse(checkpoint.station, met);
    play(met ? "success" : "setback");
    this.options.host.record({
      verb: "applied",
      object: checkpoint.id,
      result: { change: attempt.change, justification: attempt.justification, justified: attempt.justified, continuity: attempt.outcome.continuity, policy: attempt.outcome.policy },
    });
    this.render();
    this.focusTitle();
    announce(`${this.headline(checkpoint, attempt)}. ${attempt.lines.join(" ")}`);
  }

  private advance(): void {
    const checkpoint = currentCheckpoint(this.state);
    if (!this.send({ type: "continue" })) return;
    this.options.host.record({ verb: "continued", object: checkpoint.id });
    if (this.state.stage === "complete") {
      const records = this.state.records;
      this.options.onComplete(this.state, {
        chipsInFlight: records.reduce((sum, record) => sum + record.flightChips.length, 0),
        chipsTotal: this.options.mission.checkpoints.reduce((sum, entry) => sum + chipsOf(entry).length, 0),
        autopilotSegments: this.navigation.autopilotLegs.size,
        segments: SEGMENTS.length,
        flightSeconds: Math.round(this.navigation.seconds),
      });
      return;
    }
    this.flight = { t: 0, lateral: 0, thrust: 1, steer: 0 };
    this.draft = currentPlan(this.state);
    this.why = null;
    play("click");
    this.render();
    this.focusTitle();
    announce(`Leg ${this.state.index + 1}. Travelling to ${STATION[currentCheckpoint(this.state).station].name}.`);
  }

  private arrive(): void {
    if (!this.send({ type: "arrive" })) return;
    const checkpoint = currentCheckpoint(this.state);
    this.held.clear();
    this.draft = currentPlan(this.state);
    this.why = null;
    play("alarm");
    this.render();
    this.focusTitle();
    announce(`Checkpoint ${this.state.index + 1}: ${checkpoint.title}. ${checkpoint.brief} Navigation is paused while you decide.`);
  }

  private stepFlight(dt: number): void {
    const index = this.state.index;
    const segment = SEGMENTS[index];
    const checkpoint = currentCheckpoint(this.state);
    const record = currentRecord(this.state);
    const chips = chipsOf(checkpoint);
    const tangent = tangentAt(segment, this.flight.t);
    let steer = 0;
    let forward = 1;
    if (this.autopilot) {
      this.navigation.autopilotLegs.add(index);
      const next = segment.chips.find((chip, i) => !record.evidence.includes(chips[i].id) && chip.t > this.flight.t - 0.03);
      steer = clamp(((next ? next.offset : 0) - this.flight.lateral) / 8, -1, 1);
      forward = this.options.settings.reducedMotion ? 2 : 1.15;
    } else {
      // Keys steer in screen space: the part across the route moves the ship sideways, the part along it changes speed.
      const has = (...keys: string[]) => keys.some((key) => this.held.has(key));
      const kx = (has("arrowright", "d") ? 1 : 0) - (has("arrowleft", "a") ? 1 : 0);
      const ky = (has("arrowdown", "s") ? 1 : 0) - (has("arrowup", "w") ? 1 : 0);
      steer = clamp(kx * -tangent.y + ky * tangent.x, -1, 1);
      const along = kx * tangent.x + ky * tangent.y;
      forward = along > 0.3 ? 1.7 : along < -0.3 ? 0.45 : 1;
    }
    this.flight.steer = steer;
    this.flight.thrust = forward;
    this.flight.lateral = clamp(this.flight.lateral + steer * 130 * dt, -LATERAL_LIMIT, LATERAL_LIMIT);
    this.flight.t = Math.min(1, this.flight.t + (dt * forward) / LEG_SECONDS);
    // The approach lines the ship up with the checkpoint ring.
    if (this.flight.t > 0.88) this.flight.lateral *= Math.max(0, 1 - dt * 5);
    this.navigation.seconds += dt;

    const ship = offsetPoint(segment, this.flight.t, this.flight.lateral);
    segment.chips.forEach((chip, i) => {
      if (record.evidence.includes(chips[i].id)) return;
      const point = offsetPoint(segment, chip.t, chip.offset);
      if (Math.hypot(point.x - ship.x, point.y - ship.y) > COLLECT_RADIUS) return;
      if (!this.send({ type: "collect", evidence: chips[i].id, via: "flight" })) return;
      this.scene.burst(point, "56,214,245");
      this.scene.floatText(point, chips[i].title);
      play("deliver");
      this.options.host.record({ verb: "collected", object: chips[i].id, result: { via: "flight" } });
      this.render();
      announce(`Diagnostic chip collected: ${chips[i].title}`);
    });
    if (this.flight.t >= 1) this.arrive();
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0);
    this.lastFrame = now;
    requestAnimationFrame((next) => this.frame(next));
    const game = $("#game");
    if (game.hidden) return;
    this.clock += dt;
    // Flight stands still while any dialog, including the "How to play" walkthrough, is open.
    if (isTutorialOpen()) this.held.clear();
    else if (this.state.stage === "travel" && !this.paused && !isModalOpen()) this.stepFlight(dt);
    const outer = game.getBoundingClientRect();
    const cell = $("#scene-cell").getBoundingClientRect();
    this.scene.layout(outer.width, outer.height, { x: cell.left - outer.left, y: cell.top - outer.top, w: cell.width, h: cell.height });
    this.scene.draw(this.sceneView(), this.clock, dt);
  }

  // ---------- scene state ----------
  private sceneView(): SceneView {
    const state = this.state;
    const index = Math.min(state.index, SEGMENTS.length - 1);
    const segment = SEGMENTS[index];
    const travelling = state.stage === "travel";
    const t = travelling ? this.flight.t : 1;
    const tangent = tangentAt(segment, Math.min(t, 0.999));
    const point = offsetPoint(segment, t, travelling ? this.flight.lateral : 0);
    const checkpoint = currentCheckpoint(state);
    const record = currentRecord(state);
    const chips = chipsOf(checkpoint);
    return {
      stations: this.options.mission.checkpoints.map((entry, i) => this.stationView(entry, state.records[i], i)),
      segment: index,
      completed: state.records.filter((entry) => entry.done).length,
      target: travelling || state.stage === "complete" ? null : index,
      ship: {
        x: point.x,
        y: point.y,
        angle: Math.atan2(tangent.y, tangent.x) + (travelling ? this.flight.steer * 0.3 : 0),
        thrust: travelling && !this.paused ? this.flight.thrust : 0,
      },
      chips: travelling
        ? segment.chips.map((chip, i) => ({ ...offsetPoint(segment, chip.t, chip.offset), icon: chips[i].icon, collected: record.evidence.includes(chips[i].id) }))
        : [],
      reducedMotion: this.options.settings.reducedMotion,
    };
  }

  private stationView(checkpoint: Checkpoint, record: CheckpointRecord, index: number): StationView {
    const { mission } = this.options;
    const state = this.state;
    const meta = STATION[checkpoint.station];
    const reached = index < state.index || (index === state.index && state.stage !== "complete");
    const attempt = record.attempts[record.attempts.length - 1];
    const known = knownFacts(checkpoint, record);
    let mode: StationMode = "ok";
    let sign: string | undefined;

    if (checkpoint.kind === "capacity") {
      const focus = mission.services.find((service) => service.id === checkpoint.focus)!;
      const count = state.instances[focus.id];
      // Before a change the station shows the load it has now; afterwards, the simulated peak.
      const live = attempt?.outcome.kind === "capacity" ? attempt.outcome : evaluateCapacity(mission, checkpoint, state.instances, { peak: false, dependency: true, usage: true });
      const served = live.services.find((entry) => entry.id === focus.id)!;
      const overloaded = !live.continuity;
      if (reached) {
        if (attempt) mode = overloaded ? "degraded" : objectivesMet(attempt.outcome) ? "resolved" : "waste";
        else mode = overloaded ? "alert" : "waste";
        sign = overloaded ? "OVERLOAD" : mode !== "waste" ? undefined : attempt && !attempt.outcome.policy ? "LOW HEADROOM" : "IDLE CAPACITY";
      }
      const dependency = checkpoint.adjustable.find((entry) => entry.service !== focus.id);
      return {
        id: checkpoint.station,
        ...meta,
        mode,
        sign,
        pods: { count, busy: reached ? Math.min(count, served.offered / focus.unitCapacity) : count },
        satellite: dependency
          ? {
              label: known.includes("dependency") ? mission.services.find((service) => service.id === dependency.service)!.name.toUpperCase() : "DEPENDENCY",
              count: state.instances[dependency.service],
              hot: attempt?.outcome.kind === "capacity" && attempt.outcome.constraint === dependency.service,
              known: known.includes("dependency"),
            }
          : undefined,
      };
    }

    const live = evaluateAccess(checkpoint, state.grants);
    if (reached) {
      mode = !attempt ? "review" : !live.continuity ? "degraded" : live.policy ? "resolved" : "review";
      sign = !attempt ? "ACCESS REVIEW" : !live.continuity ? "BACKUP FAILED" : live.policy ? undefined : "EXCESS ACCESS";
    }
    return { id: checkpoint.station, ...meta, mode, sign, keys: { held: live.granted.length, flagged: live.excess.length, settled: !!attempt }, beam: live.continuity };
  }

  private lastAttempt(): Attempt | undefined {
    const attempts = currentRecord(this.state).attempts;
    return attempts[attempts.length - 1];
  }

  private headline(checkpoint: Checkpoint, attempt: Attempt): string {
    const { continuity, policy } = attempt.outcome;
    if (objectivesMet(attempt.outcome)) return "Objectives met";
    if (checkpoint.kind === "capacity") return !continuity ? "Requests are still being lost" : policy ? "Available, but over the cost ceiling" : "Available, but short of the headroom policy";
    return continuity ? "Still more access than the task needs" : "The backup task broke";
  }

  // ---------- rendering ----------
  private focusTitle(): void {
    this.panel.querySelector<HTMLElement>("h2")?.focus();
  }

  private render(): void {
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.fid;
    const scroll = this.panel.scrollTop;
    const stage = this.state.stage;
    this.renderHud();
    if (stage === "travel") {
      this.panel.innerHTML = this.travelPanel();
      this.dock.innerHTML = "";
    } else if (stage === "decide") {
      this.panel.innerHTML = this.decidePanel();
      this.dock.innerHTML = this.decideDock();
    } else if (stage === "outcome") {
      this.panel.innerHTML = this.outcomePanel();
      this.dock.innerHTML = "";
    }
    this.dock.hidden = stage !== "decide";
    $("#game").dataset.stage = stage;
    this.panel.scrollTop = stage === "decide" ? scroll : 0;
    if (focused) document.querySelector<HTMLElement>(`[data-fid="${focused}"]`)?.focus();
    this.syncTools();
  }

  // The "Next" bar: one plain instruction for this moment, and a ring on what to click. It reads out
  // what the panel and the scenario estimate already show, and never says which change is right.
  private renderNext(): void {
    const bar = document.querySelector<HTMLElement>("#next-step");
    if (!bar || $("#game").hidden) return;
    const { mission } = this.options;
    const state = this.state;
    if (state.stage === "complete") return;
    const checkpoint = currentCheckpoint(state);
    const record = currentRecord(state);
    const chips = chipsOf(checkpoint);
    const got = chips.filter((chip) => record.evidence.includes(chip.id)).length;
    const station = STATION[checkpoint.station].name;
    let step: NextStep;
    if (state.stage === "travel") {
      step = this.paused
        ? { text: `<strong>Navigation paused.</strong> Press <kbd>P</kbd> or the <strong>Flight</strong> button to resume.`, targets: ["#btn-pause"] }
        : this.autopilot
          ? { label: "Flying", text: `Autopilot is flying to <strong>${station}</strong> and collecting every chip (${got} of ${chips.length}). Read each chip in the panel as it arrives.`, hint: `Press <kbd>T</kbd> to take the controls.` }
          : {
              text: `Fly to <strong>${station}</strong>: steer through the diagnostic chips with <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. <strong>${got} of ${chips.length}</strong> collected.`,
              hint: "Nothing to dodge, and a missed chip can be pulled at the station. Or press T to let autopilot fly.",
              targets: ['[data-act="auto"]'],
            };
    } else if (state.stage === "decide") {
      const missing = chips.filter((chip) => !record.evidence.includes(chip.id));
      const changed = JSON.stringify(this.draft) !== JSON.stringify(currentPlan(state));
      const outcome = estimate(state, this.draft).outcome;
      const problems: string[] = [];
      if (outcome.kind === "capacity" && checkpoint.kind === "capacity") {
        const focus = mission.services.find((service) => service.id === checkpoint.focus)!;
        if (!outcome.continuity) problems.push(`${esc(focus.name)} availability ${percent(outcome.availability)}`);
        if (!outcome.policy) problems.push("Headroom policy not met");
        if (!outcome.withinCost) problems.push(`run cost ${num(outcome.windowCost)}, over the ceiling of ${num(checkpoint.costCeiling)}`);
      } else if (outcome.kind === "access") {
        if (!outcome.continuity) problems.push(`the stated task fails without ${outcome.missing.map(esc).join(", ")}`);
        if (outcome.excess.length) problems.push(`${plural(outcome.excess.length, "permission")} beyond the task`);
      }
      const inspect = checkpoint.inspect && !record.inspected ? ` ${esc(checkpoint.inspect.title)} costs ${mission.fees.inspect} credits if you need to check one.` : "";
      if (missing.length) {
        step = {
          text: `${plural(missing.length, "chip")} ${missing.length === 1 ? "was" : "were"} not collected in flight. Press <strong>Pull from station log</strong> in the panel to read ${missing.length === 1 ? "it" : "each one"}. It is free.`,
          targets: ['[data-act="pull"]'],
        };
      } else if (!changed) {
        step = {
          text:
            checkpoint.kind === "capacity"
              ? `Read the evidence and the requirements in the panel, then set instance counts with <strong>−</strong> and <strong>+</strong> in the card${checkpoint.adjustable.length > 1 ? "s" : ""} below.`
              : `Read the evidence in the panel, then in <strong>Narrow access: ${esc(checkpoint.account)}</strong> untick each permission the stated task does not need.`,
          hint: `The Scenario estimate updates as you change things. Its "It assumes" list shows what you have not checked.${inspect}`,
          targets: [checkpoint.kind === "capacity" ? ".dock .stepper" : ".dock .perms"],
        };
      } else if (problems.length) {
        step = {
          label: "Check",
          tone: "warn",
          text: `Your Scenario estimate shows: <strong>${problems.join("; ")}</strong>.`,
          hint: this.why ? "Adjust the change, or press Apply change if you are sure." : "Adjust the change, or choose a reason under Why this change? and apply it anyway.",
          targets: [".estimate"],
        };
      } else if (!this.why) {
        step = {
          text: `Under <strong>Why this change?</strong>, choose the reason that matches your evidence and your change.`,
          hint: `The estimate meets every requirement it knows about.${inspect}`,
          targets: [".dock .reasons"],
        };
      } else {
        step = { label: "Ready", tone: "ready", text: `Press <strong>Apply change</strong> to run the simulation.`, hint: `Change: ${esc(describeChange(mission, checkpoint, this.draft))}.`, targets: ['[data-act="apply"]'] };
      }
    } else {
      const attempt = this.lastAttempt()!;
      const met = objectivesMet(attempt.outcome);
      const left = mission.maxAttempts - record.attempts.length;
      const next = state.index === mission.checkpoints.length - 1 ? "Finish mission" : "Continue";
      step = met
        ? { label: "Done", tone: "ready", text: `<strong>Objectives met.</strong> Read what the simulation shows, then press <strong>${next}</strong>.`, targets: ['[data-act="continue"]'] }
        : {
            label: "Result",
            tone: "warn",
            text: `<strong>${esc(this.headline(checkpoint, attempt))}.</strong> Read what the simulation shows${left > 0 ? `, then press <strong>Revise · ${mission.fees.revise} credits</strong> to try again (${plural(left, "revision")} left) or <strong>${next}</strong> to accept it` : `, then press <strong>${next}</strong>`}.`,
            targets: [left > 0 ? '[data-act="revise"]' : '[data-act="continue"]'],
          };
    }
    renderNextStep(bar, step);
  }

  private renderHud(): void {
    const { mission } = this.options;
    const state = this.state;
    const total = mission.checkpoints.length;
    const checkpoint = currentCheckpoint(state);
    const attempt = this.lastAttempt();
    let label: string;
    let value: string;
    let ratio: number;
    if (checkpoint.kind === "capacity") {
      const focus = mission.services.find((service) => service.id === checkpoint.focus)!;
      const live = attempt?.outcome ?? evaluateCapacity(mission, checkpoint, state.instances, { peak: false, dependency: true, usage: true });
      label = `${focus.name} availability ${attempt ? "at peak" : "now"}`;
      value = percent(live.availability);
      ratio = live.availability;
    } else {
      const live = evaluateAccess(checkpoint, state.grants);
      label = "Backup task";
      value = live.continuity ? "Running" : "Failing";
      ratio = live.availability;
    }
    const steps = mission.checkpoints.map((_, i) => `<li class="${state.records[i].done ? "done" : i === state.index ? "now" : ""}"></li>`).join("");
    $("#hud-live").innerHTML = `
      <div class="tile"><span class="lbl">Mission</span><strong>${Math.min(state.index + 1, total)} / ${total}</strong><ol class="track" aria-hidden="true">${steps}</ol></div>
      <div class="tile"><i class="coin">${ICONS.coin}</i><div><span class="lbl">Budget</span><strong>${num(state.budget)}</strong></div></div>
      <div class="tile"><i class="pulse ${ratio >= 0.99 ? "" : "bad"}">${ICONS.pulse}</i><div><span class="lbl">${esc(label)}</span><strong>${esc(value)}</strong></div><i class="meter ${ratio >= 0.99 ? "" : "bad"}"><b style="width:${Math.round(ratio * 100)}%"></b></i></div>`;
  }

  private head(kicker: string, title: string, goal: string, icon: string, tone: string): string {
    return `<div class="sit-head ${tone}"><i>${icon}</i><div><p class="kicker">${esc(kicker)}</p><h2 tabindex="-1">${esc(title)}</h2><p class="goal">${esc(goal)}</p></div></div>`;
  }

  private travelPanel(): string {
    const checkpoint = currentCheckpoint(this.state);
    const record = currentRecord(this.state);
    const slots = chipsOf(checkpoint)
      .map((chip) => (record.evidence.includes(chip.id) ? `<li class="got">${EVIDENCE_ICON[chip.icon]}<span>${esc(chip.title)}</span>${ICONS.check}</li>` : `<li>${ICONS.lock}<span>Diagnostic chip</span></li>`))
      .join("");
    return `
      ${this.head(`Leg ${this.state.index + 1} of ${SEGMENTS.length}`, `En route to ${STATION[checkpoint.station].name}`, `Next: ${checkpoint.title}`, ICONS.arrow, "travel")}
      <p class="brief">Fly through the diagnostic chips on the way. Each one is a piece of evidence for the decision at the checkpoint.</p>
      <h3>Diagnostic chips</h3>
      <ul class="slots">${slots}</ul>
      <div class="keys">
        <p><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> steer</p>
        <p><kbd>T</kbd> autopilot · <kbd>P</kbd> pause · <kbd>M</kbd> mute</p>
      </div>
      <p class="note">There is nothing to dodge. A chip you miss can be pulled from the station log at the checkpoint, and flying never changes your learning score.</p>
      <button class="btn" data-act="auto" data-fid="auto">${this.autopilot ? "Autopilot is flying. Take the controls" : "Let autopilot fly this leg"}</button>
      <p class="sme">Scenario content pending SME review</p>`;
  }

  private evidenceList(checkpoint: Checkpoint, record: CheckpointRecord): string {
    return checkpoint.evidence
      .map((entry) => {
        if (record.evidence.includes(entry.id)) {
          return `<li class="ev"><i>${EVIDENCE_ICON[entry.icon]}</i><div><strong>${esc(entry.title)}</strong>${entry.lines.map((line) => `<p>${esc(line)}</p>`).join("")}</div></li>`;
        }
        if (entry.source === "inspect") return "";
        return `<li class="ev missing"><i>${ICONS.lock}</i><div><strong>${esc(entry.title)}</strong><p>Not collected in flight.</p><button class="btn small" data-act="pull" data-id="${entry.id}" data-fid="pull-${entry.id}">Pull from station log</button></div></li>`;
      })
      .join("");
  }

  private decidePanel(): string {
    const { mission } = this.options;
    const state = this.state;
    const checkpoint = currentCheckpoint(state);
    const record = currentRecord(state);
    const guess = estimate(state, this.draft);
    const outcome = guess.outcome;
    const row = (label: string, value: string, tone = "") => `<div class="row ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
    let rows: string;
    if (outcome.kind === "capacity" && checkpoint.kind === "capacity") {
      const focus = mission.services.find((service) => service.id === checkpoint.focus)!;
      rows =
        row(`${focus.name} availability`, percent(outcome.availability), outcome.continuity ? "good" : "bad") +
        row("Headroom policy", outcome.policy ? "Met" : "Not met", outcome.policy ? "good" : "bad") +
        row(`Run cost (ceiling ${num(checkpoint.costCeiling)})`, `${num(outcome.costPerHour)}/h × ${checkpoint.windowHours} h = ${num(outcome.windowCost)}`, outcome.withinCost ? "good" : "bad") +
        row("Budget after this window", `${num(state.budget - outcome.windowCost)} credits`);
    } else if (outcome.kind === "access") {
      rows =
        row("Stated task", outcome.continuity ? "Runs" : `Fails without ${outcome.missing.join(", ")}`, outcome.continuity ? "good" : "bad") +
        row("Access beyond the task", outcome.excess.length ? plural(outcome.excess.length, "permission") : "None", outcome.policy ? "good" : "bad");
    } else rows = "";
    const found = record.evidence.length;
    const attempt = record.attempts.length + 1;
    return `
      ${this.head(`Checkpoint ${state.index + 1} of ${mission.checkpoints.length} · ${STATION[checkpoint.station].name}${attempt > 1 ? ` · attempt ${attempt}` : ""}`, checkpoint.title, checkpoint.goal, KIND_ICON[checkpoint.id] ?? ICONS.surge, checkpoint.kind === "access" ? "violet" : checkpoint.id === "surge" ? "red" : "amber")}
      <p class="brief">${esc(checkpoint.brief)}</p>
      <ul class="reqs">${checkpoint.requirements.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      <h3>Evidence <span>${found} collected</span></h3>
      <ul class="evidence">${this.evidenceList(checkpoint, record)}</ul>
      <h3>Scenario estimate</h3>
      <div class="estimate" aria-live="polite">
        ${rows}
        <p class="assume">An estimate from what you know so far, not a guarantee. It assumes:</p>
        <ul class="assumptions">${guess.assumptions.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      </div>
      <p class="sme">Scenario content pending SME review</p>`;
  }

  private decideDock(): string {
    const { mission } = this.options;
    const state = this.state;
    const checkpoint = currentCheckpoint(state);
    const record = currentRecord(state);
    const known = knownFacts(checkpoint, record);
    const cards = checkpoint.kind === "capacity" ? this.capacityCards(checkpoint) : this.accessCard(checkpoint, known.includes("usage"));

    let inspect = "";
    if (checkpoint.inspect) {
      const fact = checkpoint.evidence.find((entry) => entry.source === "inspect")?.reveals;
      const seen = !record.inspected && fact !== undefined && known.includes(fact);
      inspect = `
        <article class="card">
          <div class="card-top"><i>${ICONS.inspect}</i><div><h4>${esc(checkpoint.inspect.title)}</h4><p>${esc(checkpoint.inspect.blurb)}</p></div></div>
          <button class="btn" data-act="inspect" data-fid="inspect" ${record.inspected ? "disabled" : ""}>${record.inspected ? "Inspected" : `Inspect · ${mission.fees.inspect} credits`}</button>
          ${seen ? '<p class="card-foot">Your evidence already points here.</p>' : ""}
        </article>`;
    }

    const order = shuffle(createRng(`${this.run}:${checkpoint.id}`), checkpoint.justifications.map((entry) => entry.id));
    const reasons = order
      .map((id) => checkpoint.justifications.find((entry) => entry.id === id)!)
      .filter((entry) => !entry.needs || known.includes(entry.needs))
      .map((entry) => `<label class="reason ${this.why === entry.id ? "on" : ""}"><input type="radio" name="why" value="${entry.id}" data-fid="why-${entry.id}" ${this.why === entry.id ? "checked" : ""} /><span>${esc(entry.text)}</span></label>`)
      .join("");
    return `
      ${inspect}${cards}
      <section class="decide" aria-labelledby="why-title">
        <h4 id="why-title">Why this change?</h4>
        <div class="reasons" role="radiogroup" aria-labelledby="why-title">${reasons}</div>
        <div class="decide-foot">
          <p><span>Change</span>${esc(describeChange(mission, checkpoint, this.draft))}</p>
          <button class="btn primary" data-act="apply" data-fid="apply" ${this.why ? "" : "disabled"}>Apply change ${ICONS.arrow}</button>
        </div>
      </section>`;
  }

  private capacityCards(checkpoint: CapacityCheckpoint): string {
    const { mission } = this.options;
    const known = knownFacts(checkpoint, currentRecord(this.state));
    return checkpoint.adjustable
      .filter((entry) => !entry.needs || known.includes(entry.needs))
      .map((entry) => {
        const service = mission.services.find((candidate) => candidate.id === entry.service)!;
        const count = this.draft.instances[entry.service];
        const was = mission.initialInstances[entry.service];
        const delta = count - was;
        return `
          <article class="card ${delta !== 0 ? "changed" : ""}">
            <div class="card-top"><i>${entry.card === "add" ? ICONS.add : ICONS.rightsize}</i><div><h4>${esc(entry.title)}</h4><p>${esc(entry.blurb)}</p></div></div>
            <div class="stepper" role="group" aria-label="${esc(service.name)} instances">
              <button data-act="step" data-id="${entry.service}" data-by="-1" data-fid="minus-${entry.service}" aria-label="One fewer ${esc(service.name)} instance" ${count <= entry.min ? "disabled" : ""}>−</button>
              <output aria-live="polite"><strong>${count}</strong> instances<small>${num(count * service.unitCapacity)} rps · ${num(count * service.unitCost)} credits/h</small></output>
              <button data-act="step" data-id="${entry.service}" data-by="1" data-fid="plus-${entry.service}" aria-label="One more ${esc(service.name)} instance" ${count >= entry.max ? "disabled" : ""}>+</button>
            </div>
            <p class="card-foot">Started at ${was}${delta !== 0 ? ` · <b>${delta > 0 ? "+" : "−"}${Math.abs(delta)}</b>` : " · no change"}</p>
          </article>`;
      })
      .join("");
  }

  private accessCard(checkpoint: AccessCheckpoint, usageKnown: boolean): string {
    const toggles = checkpoint.permissions
      .filter((entry) => initialPlan(this.options.mission).grants.includes(entry.id))
      .map((entry) => {
        const on = this.draft.grants.includes(entry.id);
        return `<label class="perm ${on ? "on" : ""}"><input type="checkbox" data-perm="${entry.id}" data-fid="perm-${entry.id}" ${on ? "checked" : ""} /><span><b>${esc(entry.id)}</b><small>${esc(entry.allows)}${usageKnown ? ` · last used ${esc(entry.lastUsed)}` : ""}</small></span></label>`;
      })
      .join("");
    return `
      <article class="card wide ${this.draft.grants.length !== this.options.mission.initialGrants.length ? "changed" : ""}">
        <div class="card-top"><i>${ICONS.access}</i><div><h4>Narrow access: ${esc(checkpoint.account)}</h4><p>Untick a permission to remove it from the account.</p></div></div>
        <div class="perms" role="group" aria-label="Permissions held by ${esc(checkpoint.account)}">${toggles}</div>
      </article>`;
  }

  private outcomePanel(): string {
    const { mission } = this.options;
    const state = this.state;
    const checkpoint = currentCheckpoint(state);
    const record = currentRecord(state);
    const attempt = this.lastAttempt()!;
    const { outcome } = attempt;
    const met = objectivesMet(outcome);
    const reason = checkpoint.justifications.find((entry) => entry.id === attempt.justification)!;
    const badge = (ok: boolean, label: string) => `<span class="badge ${ok ? "good" : "bad"}">${ok ? ICONS.check : ICONS.cross}${esc(label)}</span>`;
    const surprised = attempt.estimate.outcome.continuity !== outcome.continuity || attempt.estimate.outcome.policy !== outcome.policy;
    // Cost is the same in the estimate and the simulation, so it never causes a surprise.
    const left = mission.maxAttempts - record.attempts.length;
    const last = state.index === mission.checkpoints.length - 1;
    return `
      ${this.head(`Observed consequence · attempt ${record.attempts.length}`, this.headline(checkpoint, attempt), checkpoint.title, met ? ICONS.check : ICONS.cross, met ? "green" : "red")}
      <div class="badges">
        ${badge(outcome.continuity, "Service continuity")}
        ${badge(outcome.policy, checkpoint.kind === "access" ? "Least privilege" : "Headroom policy")}
        ${checkpoint.kind === "capacity" ? badge(outcome.withinCost, "Cost ceiling") : ""}
        ${badge(attempt.justified, "Reasoning supports the change")}
      </div>
      <p class="change"><span>Your change</span>${esc(attempt.change)}</p>
      <h3>What the simulation shows</h3>
      <ul class="lines">${attempt.lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
      ${surprised ? `<div class="gap"><strong>Why this differs from your estimate</strong><p>The estimate assumed: ${attempt.estimate.assumptions.map(esc).join(" ")}</p><p>The simulation applies every rule in the scenario, including what had not been checked.</p></div>` : ""}
      <h3>Your reasoning</h3>
      <div class="reasoning ${attempt.justified ? "good" : "bad"}"><p>“${esc(reason.text)}”</p><p>${esc(reason.feedback)}${reason.valid && !attempt.justified ? " Here it does not match the change you made, or the result it led to." : ""}</p></div>
      <p class="note">${outcome.windowCost > 0 ? `Continuing charges ${num(outcome.windowCost)} credits for this window. ` : ""}${met ? "" : left > 0 ? `You can revise this change for ${mission.fees.revise} credits (${plural(left, "revision")} left).` : "No revisions left at this checkpoint."}</p>
      <div class="actions">
        <button class="btn" data-act="revise" data-fid="revise" ${left > 0 ? "" : "disabled"}>Revise · ${mission.fees.revise} credits</button>
        <button class="btn primary" data-act="continue" data-fid="continue">${last ? "Finish mission" : "Continue"} ${ICONS.arrow}</button>
      </div>
      <p class="sme">Scenario content pending SME review</p>`;
  }
}
