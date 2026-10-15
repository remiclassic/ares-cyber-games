import { play } from "../../ui/audio";
import { renderNextStep, type NextStep } from "../../ui/tutorial";
import { $, announce, esc, isModalOpen } from "../../ui/dom";
import type { BlastHost } from "../host";
import { apply, createGame, currentCase, markedBehind, minutesLeft, readingOf, triageResult } from "../sim/engine";
import type { CaseDef, Command, Decision, GameState, Host, HostOutcome, Scenario, Sensor } from "../sim/types";
import { ICONS, hostIcon, sensorIcon } from "./icons";

type Selection = Readonly<{ type: "host" | "sensor"; id: string }> | null;

const SENSOR_KIND: Record<Sensor["kind"], string> = {
  dns: "DNS forwarder",
  proxy: "Proxy NAT pool",
  ids: "Network IDS summary",
  vpn: "VPN concentrator",
};

export const DECISIONS: Record<Decision, { label: string; key: string; help: string }> = {
  isolate: { label: "Isolate", key: "1", help: "Cut it off the network. Stops the attacker; the user or service stops too." },
  keep: { label: "Keep online", key: "2", help: "Leave it running. Right only when the evidence clears it." },
  watch: { label: "Watch", key: "3", help: "Keep it running under extra monitoring. The honest call only when the evidence cannot decide." },
};

const VERDICT: Record<HostOutcome["verdict"], { label: string; tone: string }> = {
  contained: { label: "Contained", tone: "good" },
  missed: { label: "Missed", tone: "bad" },
  "watched-compromised": { label: "Still active", tone: "bad" },
  "kept-clean": { label: "Kept online", tone: "good" },
  "over-isolated": { label: "Over-isolated", tone: "warn" },
  "watched-clean": { label: "Watched", tone: "ok" },
};

export function toast(message: string, kind: "reward" | "warn" | "" = ""): void {
  const element = document.createElement("div");
  element.className = `toast ${kind}`;
  element.textContent = message;
  $("#toasts").appendChild(element);
  window.setTimeout(() => element.remove(), 3200);
}

export class BlastGame {
  state: GameState;
  private selected: Selection = null;
  private caseStarted = performance.now();

  constructor(
    private readonly scenario: Scenario,
    private readonly host: BlastHost,
    private readonly onDone: (state: GameState) => void,
  ) {
    this.state = createGame(scenario, "init");
    document.addEventListener("keydown", (event) => this.onKey(event));
    $("#map").addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-select]");
      if (target) this.select({ type: target.dataset.select as "host" | "sensor", id: target.dataset.id! });
    });
    $("#details").addEventListener("click", (event) => this.onAction(event));
    $("#casefile").addEventListener("click", (event) => this.onAction(event));
    $("#submit-slot").addEventListener("click", (event) => this.onAction(event));
  }

  start(seed: string, attempt: number): void {
    this.state = createGame(this.scenario, seed, attempt);
    this.selected = null;
    this.caseStarted = performance.now();
    this.host.started(seed);
    this.render();
  }

  private get def(): CaseDef {
    return currentCase(this.state);
  }

  private run(command: Command): boolean {
    const result = apply(this.state, command);
    if (!result.ok) {
      toast(result.error, "warn");
      play("setback");
      return false;
    }
    return true;
  }

  private select(selection: Selection): void {
    this.selected = selection;
    play("click");
    this.render();
    const name = selection ? (selection.type === "host" ? this.hostById(selection.id).label : this.sensorById(selection.id).label) : "";
    if (name) announce(`${name} selected.`);
  }

  private hostById(id: string): Host {
    return this.def.hosts.find((host) => host.id === id)!;
  }

  private sensorById(id: string): Sensor {
    return this.def.sensors.find((sensor) => sensor.id === id)!;
  }

  private read(sensorId: string): void {
    if (!this.run({ type: "read", sensor: sensorId })) return;
    const sensor = this.sensorById(sensorId);
    const count = readingOf(this.state, sensorId)!;
    this.host.record({ verb: "inspected", object: sensorId, result: { count } });
    play(count > 0 ? "alarm" : "deliver");
    announce(`${sensor.label}: ${count} of ${sensor.covers.length} hosts behind it show the indicator.`);
    this.render();
  }

  private triage(hostId: string): void {
    if (!this.run({ type: "triage", host: hostId })) return;
    const found = triageResult(this.state, hostId)!;
    this.host.record({ verb: "triaged", object: hostId, result: { found } });
    play(found ? "alarm" : "deliver");
    announce(`${this.hostById(hostId).label}: ${found ? "indicator found" : "no sign of the indicator"}.`);
    this.render();
  }

  private decide(hostId: string, decision: Decision | null): void {
    if (this.state.phase !== "play") return;
    const next = decision;
    if (next && this.state.decisions.get(hostId) === next) return;
    if (!this.run({ type: "decide", host: hostId, decision: next })) return;
    this.host.record({ verb: "assessed", object: hostId, result: { decision: next } });
    play("click");
    announce(`${this.hostById(hostId).label}: ${next ? DECISIONS[next].label : "decision cleared"}.`);
    this.render();
  }

  private submit(): void {
    const seconds = Math.round((performance.now() - this.caseStarted) / 1000);
    if (!this.run({ type: "submit", elapsedSeconds: seconds })) return;
    const record = this.state.records[this.state.records.length - 1];
    this.host.record({ verb: "submitted", object: record.caseId, result: { score: record.score.total } });
    play(record.score.total >= 80 ? "success" : "setback");
    this.selected = null;
    this.render();
    announce(`Case closed. Score ${record.score.total} of 100.`);
    $("#casefile").querySelector<HTMLElement>("h2")?.focus();
  }

  private answer(choice: number): void {
    if (!this.run({ type: "answer", choice })) return;
    const record = this.state.records[this.state.records.length - 1];
    this.host.record({ verb: "answered", object: record.caseId, result: { correct: record.answer!.correct } });
    play(record.answer!.correct ? "success" : "setback");
    this.render();
    $("#casefile").querySelector<HTMLElement>("[data-key='next']")?.focus();
  }

  private next(): void {
    if (!this.run({ type: "next" })) return;
    if (this.state.phase === "done") {
      this.onDone(this.state);
      return;
    }
    this.selected = null;
    this.caseStarted = performance.now();
    this.render();
    announce(`Case ${this.state.caseIndex + 1}: ${this.def.title}.`);
    $("#casefile").querySelector<HTMLElement>("h2")?.focus();
  }

  private onAction(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!target || (target as HTMLButtonElement).disabled) return;
    const { act, id, value } = target.dataset;
    if (act === "read") this.read(id!);
    else if (act === "triage") this.triage(id!);
    else if (act === "decide") this.decide(id!, value as Decision);
    else if (act === "select") this.select({ type: value as "host" | "sensor", id: id! });
    else if (act === "submit") this.submit();
    else if (act === "answer") this.answer(Number(value));
    else if (act === "next") this.next();
  }

  private onKey(event: KeyboardEvent): void {
    if (isModalOpen() || $("#game").hidden) return;
    if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return;
    const selected = this.selected;
    if (event.key === "Escape" && selected) {
      this.select(null);
      return;
    }
    if (!selected || this.state.phase !== "play") return;
    const key = event.key.toLowerCase();
    if (selected.type === "sensor" && key === "r") this.read(selected.id);
    else if (selected.type === "host" && key === "t") this.triage(selected.id);
    else if (selected.type === "host" && ["1", "2", "3"].includes(key)) this.decide(selected.id, (["isolate", "keep", "watch"] as const)[Number(key) - 1]);
    else if (selected.type === "host" && (key === "0" || key === "backspace")) this.decide(selected.id, null);
    else return;
    event.preventDefault();
  }

  // ---------- rendering ----------

  render(): void {
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
    this.renderStatus();
    this.renderCasefile();
    this.renderMap();
    this.renderDetails();
    this.renderFooter();
    this.renderNext();
    if (focusKey) document.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  private renderStatus(): void {
    const left = minutesLeft(this.state);
    const decided = this.def.hosts.filter((host) => this.state.decisions.has(host.id)).length;
    $("#status").innerHTML = `
      <div class="clock ${left < this.scenario.costs.triage ? "low" : ""}" title="Case time left">${ICONS.clock}<span>${left}<small> min</small></span></div>
      <div class="count"><strong>${this.state.caseIndex + 1}/${this.scenario.cases.length}</strong><span>Case</span></div>
      <div class="count"><strong>${decided}/${this.def.hosts.length}</strong><span>Decided</span></div>`;
  }

  private renderCasefile(): void {
    const def = this.def;
    const record = this.state.phase === "result" ? this.state.records[this.state.records.length - 1] : null;
    const head = `
      <div class="col-head"><h2 tabindex="-1">${ICONS.radius}Case file</h2><span class="phase-pill">${record ? "Closed" : "Open"}</span></div>`;
    if (record) {
      const s = record.score;
      const check = record.check;
      $("#casefile").innerHTML = `${head}
        <div class="d-scroll">
          <p class="kicker">Case ${this.state.caseIndex + 1} of ${this.scenario.cases.length} · ${esc(def.site)}</p>
          <h3 class="case-title">${esc(def.title)}: ${s.total}<small>/100</small></h3>
          <div class="score-grid">
            ${tile("Containment", s.containment, 40, `${s.compromisedIsolated} of ${s.compromisedTotal} compromised isolated`)}
            ${tile("Continuity", s.continuity, 30, s.cleanIsolated ? `${s.cleanIsolated} clean host${s.cleanIsolated > 1 ? "s" : ""} taken offline` : "No clean host taken offline")}
            ${tile("Evidence", s.evidence, 20, `${record.outcomes.filter((o) => o.supported).length} of ${record.outcomes.length} decisions backed by evidence`)}
            ${tile("Efficiency", s.efficiency, 10, `${s.triagesUsed} triage${s.triagesUsed === 1 ? "" : "s"} used, ${s.triagesNeeded} needed at best`)}
          </div>
          ${
            check
              ? `<section class="check" aria-labelledby="check-q">
                  <h4>${ICONS.question}Reasoning check</h4>
                  <p id="check-q"><strong>${esc(check.question)}</strong></p>
                  <div class="options">
                    ${check.options
                      .map((option, index) => {
                        const answered = record.answer;
                        const cls = answered ? (index === check.correct ? "right" : index === answered.choice ? "wrong" : "") : "";
                        return `<button class="option ${cls}" data-act="answer" data-value="${index}" data-key="answer-${index}" ${answered ? "disabled" : ""}>${esc(option)}</button>`;
                      })
                      .join("")}
                  </div>
                  ${record.answer ? `<p class="feedback ${record.answer.correct ? "good" : "bad"}">${record.answer.correct ? "Right." : "Not quite."} ${esc(check.explain)}</p>` : ""}
                </section>`
              : ""
          }
          <button class="btn primary" data-act="next" data-key="next" ${check && !record.answer ? "disabled" : ""}>${this.state.caseIndex + 1 < this.scenario.cases.length ? "Next case" : "See debrief"}</button>
          <p class="muted small">Select any host on the map to see what was true and why your call scored as it did.</p>
        </div>`;
      return;
    }
    const log = this.state.log.filter((command) => command.type === "read" || command.type === "triage");
    $("#casefile").innerHTML = `${head}
      <div class="d-scroll">
        <p class="kicker">Case ${this.state.caseIndex + 1} of ${this.scenario.cases.length} · ${esc(def.site)}</p>
        <h3 class="case-title">${esc(def.title)}</h3>
        <p class="brief">${esc(def.brief)}</p>
        <p class="indicator">${ICONS.search}<span>Indicator: hosts that <strong>${esc(this.scenario.indicator)}</strong>.</span></p>
        <h4 class="sub-head">Evidence log</h4>
        ${
          log.length
            ? `<ol class="log">${log
                .map((command) => {
                  if (command.type === "read") {
                    const sensor = this.sensorById(command.sensor);
                    const count = readingOf(this.state, sensor.id)!;
                    return `<li class="${count ? "hot" : "cool"}">${sensorIcon(sensor.kind)}<span><strong>${esc(sensor.label)}</strong> counted <b>${count}</b> of ${sensor.covers.length} hosts</span></li>`;
                  }
                  if (command.type === "triage") {
                    const host = this.hostById(command.host);
                    const found = triageResult(this.state, host.id);
                    return `<li class="${found ? "hot" : "cool"}">${hostIcon(host.kind)}<span><strong>${esc(host.label)}</strong> triage: ${found ? "<b>indicator found</b>" : "no sign of it"}</span></li>`;
                  }
                  return "";
                })
                .join("")}</ol>`
            : `<p class="muted small">Nothing gathered yet.</p>`
        }
        <p class="costs">${ICONS.clock}<span>Read a sensor <b>${this.scenario.costs.readSensor} min</b> · Triage a host <b>${this.scenario.costs.triage} min</b> · Budget <b>${def.budgetMinutes} min</b></span></p>
      </div>`;
  }

  // The "Next" bar above the map: one plain instruction for the current moment, and a pulsing
  // ring on whatever it asks you to click. It describes the method, never the answer.
  private renderNext(): void {
    const bar = $("#next-step");
    const def = this.def;
    const { readSensor, triage } = this.scenario.costs;
    let tone = "";
    let label = "Next";
    let text: string;
    let hint = "";
    let targets: string[] = [];
    if (this.state.phase === "result") {
      const record = this.state.records[this.state.records.length - 1];
      const answered = !record.check || record.answer;
      label = "Done";
      tone = "ready";
      text = answered
        ? `<strong>Red rings show which computers were really infected.</strong> Click any computer to see why your call scored as it did, then press <strong>${this.state.caseIndex + 1 < this.scenario.cases.length ? "Next case" : "See debrief"}</strong> on the left.`
        : `<strong>Case closed.</strong> Answer the reasoning check on the left to continue.`;
      targets = answered ? ['[data-act="next"]'] : ['#casefile .check'];
    } else {
      const sel = this.selected;
      const left = minutesLeft(this.state);
      const unread = def.sensors.filter((sensor) => !this.state.reads.has(sensor.id));
      const undecided = def.hosts.filter((host) => !this.state.decisions.has(host.id));
      const selHost = sel?.type === "host" ? sel.id : null;
      const offBy = def.sensors.find((sensor) => {
        const count = readingOf(this.state, sensor.id);
        if (count === null) return false;
        const marked = markedBehind(this.state, sensor.id);
        const watching = sensor.covers.some((id) => this.state.decisions.get(id) === "watch");
        return marked > count || (marked < count && !watching);
      });
      if (sel?.type === "sensor" && !this.state.reads.has(sel.id) && left >= readSensor) {
        text = `Press <strong>Read sensor</strong> in the right panel (or <kbd>R</kbd>) to see how many of its ${this.sensorById(sel.id).covers.length} computers are infected.`;
        targets = ['[data-act="read"]'];
      } else if (unread.length === def.sensors.length && left >= readSensor) {
        text = `<strong>Click a hexagon</strong> on the map to select a sensor, then read it.`;
        hint = `Sensors are cheap (${readSensor} min) and each one covers several computers. Always start with them.`;
        targets = unread.map((sensor) => `[data-key="s-${sensor.id}"]`);
      } else if (unread.length && left >= readSensor) {
        text = `Read the other sensor${unread.length > 1 ? "s" : ""} too: <strong>${unread.length} still showing ?</strong>. Click ${unread.length > 1 ? "one" : "it"}, then press Read sensor.`;
        targets = unread.map((sensor) => `[data-key="s-${sensor.id}"]`);
      } else if (this.state.triages.size === 0 && undecided.length === def.hosts.length && left >= triage) {
        text = `The counts say <strong>how many</strong> computers are infected, not which. Where they leave a real question, click that computer and press <strong>Triage host</strong> (${triage} min).`;
        hint = def.guided
          ? "Which computer would settle the most if you checked it? Look for the one both sensors can see."
          : "Use the zeros first: a sensor that counted 0 clears every computer behind it. If the counts already settle everything, you can skip triage.";
        targets = selHost && triageResult(this.state, selHost) === null ? ['[data-act="triage"]'] : [];
      } else if (undecided.length) {
        text = `Decide every computer: click one, then choose <strong>Isolate</strong>, <strong>Keep online</strong> or <strong>Watch</strong>. <strong>${undecided.length} left.</strong>`;
        hint = "Aim to make each sensor's x/y badge match: computers you isolate behind it / its count.";
        targets = selHost && !this.state.decisions.has(selHost) ? ["#details .decisions"] : [];
      } else if (offBy) {
        tone = "warn";
        label = "Check";
        text = `<strong>${esc(offBy.label)}</strong> counted ${readingOf(this.state, offBy.id)}, but you marked ${markedBehind(this.state, offBy.id)} behind it to isolate.`;
        hint = "Your isolations do not add up to its count. You can still close the case, but check that first.";
        targets = [`[data-key="s-${offBy.id}"]`];
      } else {
        tone = "ready";
        label = "Ready";
        text = `Every computer has a decision and the counts add up. Press <strong>Close case</strong> at the bottom right.`;
        targets = ['[data-act="submit"]'];
      }
    }
    renderNextStep(bar, { label, tone: tone as NextStep["tone"], text, hint, targets });
  }

  private renderMap(): void {
    const def = this.def;
    const result = this.state.phase === "result" ? this.state.records[this.state.records.length - 1] : null;
    const pos = (x: number, y: number) => `left:${6 + x * 0.88}%;top:${8 + y * 0.84}%`;
    const px = (x: number) => 6 + x * 0.88;
    const py = (y: number) => 8 + y * 0.84;
    const sel = this.selected;
    const lines = def.sensors
      .flatMap((sensor) =>
        sensor.covers.map((hostId) => {
          const host = this.hostById(hostId);
          const lit = sel && ((sel.type === "sensor" && sel.id === sensor.id) || (sel.type === "host" && sel.id === hostId));
          const read = this.state.reads.has(sensor.id);
          return `<line x1="${px(sensor.x)}" y1="${py(sensor.y)}" x2="${px(host.x)}" y2="${py(host.y)}" class="${lit ? "lit" : ""} ${read ? "read" : ""}"/>`;
        }),
      )
      .join("");
    const sensors = def.sensors
      .map((sensor) => {
        const count = readingOf(this.state, sensor.id);
        const marked = markedBehind(this.state, sensor.id);
        const match = count === null ? "" : marked === count ? "ok" : marked > count ? "over" : "under";
        const isSel = sel?.type === "sensor" && sel.id === sensor.id;
        return `<button class="node sensor ${count === null ? "unread" : count > 0 ? "hot" : "cool"} ${isSel ? "selected" : ""}" style="${pos(sensor.x, sensor.y)}"
            data-select="sensor" data-id="${sensor.id}" data-key="s-${sensor.id}"
            aria-label="${esc(sensor.label)}: ${count === null ? "not read" : `counted ${count} of ${sensor.covers.length}`}${count === null ? "" : `, ${marked} marked for isolation`}">
            <span class="hex">${sensorIcon(sensor.kind)}<b>${count === null ? "?" : count}</b></span>
            <span class="tag">${esc(sensor.label)}</span>
            ${count !== null && this.state.phase === "play" ? `<span class="match ${match}" title="Hosts you marked to isolate behind this sensor / its count">${marked}/${count}</span>` : ""}
          </button>`;
      })
      .join("");
    const hosts = def.hosts
      .map((host) => {
        const decision = this.state.phase === "play" ? this.state.decisions.get(host.id) : (result?.decisions[host.id] as Decision | undefined);
        const tri = triageResult(this.state, host.id);
        const outcome = result?.outcomes.find((entry) => entry.host === host.id);
        const isSel = sel?.type === "host" && sel.id === host.id;
        const classes = [
          "node",
          "host",
          host.kind,
          tri === null ? "" : tri ? "tri-hot" : "tri-cool",
          decision ? `d-${decision}` : "",
          outcome ? `truth-${outcome.truth} v-${VERDICT[outcome.verdict].tone}` : "",
          isSel ? "selected" : "",
        ].join(" ");
        const label = `${host.label}, ${host.role}${tri === null ? "" : tri ? ", triage found the indicator" : ", triage clean"}${decision ? `, ${DECISIONS[decision].label}` : ", undecided"}${outcome ? `, ${outcome.truth}, ${VERDICT[outcome.verdict].label}` : ""}`;
        return `<button class="${classes}" style="${pos(host.x, host.y)}" data-select="host" data-id="${host.id}" data-key="h-${host.id}" aria-label="${esc(label)}">
            <span class="disc">${hostIcon(host.kind)}${host.weight > 1 ? `<i class="crit" title="Critical service">!</i>` : ""}</span>
            <span class="tag">${esc(host.label)}</span>
            ${decision ? `<span class="mark">${ICONS[decision]}</span>` : `<span class="mark none" aria-hidden="true">?</span>`}
            ${outcome ? `<span class="verdict">${VERDICT[outcome.verdict].label}</span>` : ""}
          </button>`;
      })
      .join("");
    $("#map").innerHTML = `<svg class="links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${sensors}${hosts}`;
    $("#map-title").innerHTML = `${ICONS.radius}${esc(def.title)}`;
    $("#map-legend").innerHTML = result
      ? `<span class="legend"><i class="lg truth"></i>Red ring = really compromised</span>`
      : `<span class="legend"><i class="lg hexi"></i>Sensor · <i class="lg disci"></i>Host</span>`;
  }

  private renderDetails(): void {
    const sel = this.selected;
    const playing = this.state.phase === "play";
    const left = minutesLeft(this.state);
    if (!sel) {
      $("#details").innerHTML = `
        <div class="col-head"><h2>${ICONS.search}Details</h2></div>
        <div class="d-scroll empty">
          <p>Select a <strong>sensor</strong> (hexagon) or a <strong>host</strong> on the map.</p>
          <ul class="howto">
            <li>${ICONS.dns}<span><strong>Sensors</strong> count how many hosts behind them show the indicator, but not which.</span></li>
            <li>${ICONS.search}<span><strong>Triage</strong> confirms one host. It costs ${this.scenario.costs.triage} minutes, so spend it where it settles the most.</span></li>
            <li>${ICONS.isolate}<span><strong>Decide</strong> every host: Isolate, Keep online, or Watch.</span></li>
          </ul>
          <p class="muted small">Keys: select with Tab, then <kbd>R</kbd> read · <kbd>T</kbd> triage · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> decide · <kbd>0</kbd> clear · <kbd>Esc</kbd> deselect.</p>
        </div>`;
      return;
    }
    if (sel.type === "sensor") {
      const sensor = this.sensorById(sel.id);
      const count = readingOf(this.state, sensor.id);
      const marked = markedBehind(this.state, sensor.id);
      $("#details").innerHTML = `
        <div class="col-head"><h2>${sensorIcon(sensor.kind)}Sensor</h2><span>${SENSOR_KIND[sensor.kind]}</span></div>
        <div class="d-scroll">
          <h3 class="d-title">${esc(sensor.label)}</h3>
          ${
            count === null
              ? `<p>Not read yet. It covers <strong>${sensor.covers.length} hosts</strong>.</p>
                 ${playing ? `<button class="btn primary act" data-act="read" data-id="${sensor.id}" data-key="read" ${left < this.scenario.costs.readSensor ? "disabled" : ""}>${ICONS.search}Read sensor · ${this.scenario.costs.readSensor} min <kbd>R</kbd></button>` : ""}`
              : `<div class="reading ${count ? "hot" : "cool"}"><strong>${count}</strong><span>of ${sensor.covers.length} hosts behind it show the indicator</span></div>
                 ${
                   playing
                     ? `<p class="match-line ${marked === count ? "ok" : marked > count ? "over" : "under"}">You have marked <strong>${marked}</strong> of them to isolate${marked === count ? ", which matches." : marked > count ? ", more than it counted." : "."}</p>`
                     : ""
                 }`
          }
          <div class="why"><h4>Why only a count?</h4><p>${esc(sensor.why)}</p></div>
          <h4 class="sub-head">Hosts behind it</h4>
          <ul class="behind">${sensor.covers
            .map((id) => {
              const host = this.hostById(id);
              const decision = this.state.decisions.get(id);
              const tri = triageResult(this.state, id);
              return `<li><button class="link-row" data-act="select" data-value="host" data-id="${id}" data-key="row-${id}">${hostIcon(host.kind)}<span><strong>${esc(host.label)}</strong> ${esc(host.role)}</span>${tri === null ? "" : `<em class="${tri ? "hot" : "cool"}">${tri ? "found" : "clean"}</em>`}${decision ? `<em class="dec">${DECISIONS[decision].label}</em>` : ""}</button></li>`;
            })
            .join("")}</ul>
        </div>`;
      return;
    }
    const host = this.hostById(sel.id);
    const tri = triageResult(this.state, host.id);
    const decision = this.state.decisions.get(host.id);
    const record = this.state.phase === "result" ? this.state.records[this.state.records.length - 1] : null;
    const outcome = record?.outcomes.find((entry) => entry.host === host.id);
    const seenBy = this.def.sensors.filter((sensor) => sensor.covers.includes(host.id));
    $("#details").innerHTML = `
      <div class="col-head"><h2>${hostIcon(host.kind)}Host</h2><span>${host.weight > 1 ? `<b class="crit-pill">Critical service</b>` : esc(host.kind)}</span></div>
      <div class="d-scroll">
        <h3 class="d-title">${esc(host.label)}</h3>
        <p class="muted">${esc(host.role)}</p>
        ${
          outcome
            ? `<div class="outcome ${VERDICT[outcome.verdict].tone}"><strong>${outcome.truth === "compromised" ? "Was compromised" : "Was clean"} · ${VERDICT[outcome.verdict].label}</strong><p>${esc(outcome.why)}</p></div>`
            : ""
        }
        <h4 class="sub-head">Seen by</h4>
        <ul class="behind">${seenBy
          .map((sensor) => {
            const count = readingOf(this.state, sensor.id);
            return `<li><button class="link-row" data-act="select" data-value="sensor" data-id="${sensor.id}" data-key="row-${sensor.id}">${sensorIcon(sensor.kind)}<span><strong>${esc(sensor.label)}</strong> ${count === null ? "not read" : `counted ${count} of ${sensor.covers.length}`}</span></button></li>`;
          })
          .join("")}</ul>
        <h4 class="sub-head">Host triage</h4>
        ${
          tri === null
            ? playing
              ? `<p class="small muted">Pull this host's EDR timeline and DNS cache. Confirms whether it shows the indicator.</p>
                 <button class="btn act" data-act="triage" data-id="${host.id}" data-key="triage" ${left < this.scenario.costs.triage ? "disabled" : ""}>${ICONS.search}Triage host · ${this.scenario.costs.triage} min <kbd>T</kbd></button>
                 ${left < this.scenario.costs.triage ? `<p class="small warn-text">Not enough case time left for a triage.</p>` : ""}`
              : `<p class="small muted">Not triaged.</p>`
            : `<div class="reading ${tri ? "hot" : "cool"} small-reading"><strong>${tri ? "Found" : "Clean"}</strong><span>${tri ? "The host beacons to the indicator domain." : "No sign of the indicator on this host."}</span></div>`
        }
        <h4 class="sub-head">Your decision</h4>
        <div class="decisions" role="group" aria-label="Decision for ${esc(host.label)}">
          ${(Object.keys(DECISIONS) as Decision[])
            .map(
              (key) => `<button class="dec-btn dec-${key} ${decision === key ? "on" : ""}" data-act="decide" data-id="${host.id}" data-value="${key}" data-key="dec-${key}" aria-pressed="${decision === key}" ${playing ? "" : "disabled"}>
                ${ICONS[key]}<span><strong>${DECISIONS[key].label}</strong><small>${DECISIONS[key].help}</small></span><kbd>${DECISIONS[key].key}</kbd></button>`,
            )
            .join("")}
        </div>
      </div>`;
  }

  private renderFooter(): void {
    const steps = [
      { label: "Read sensors", done: this.state.reads.size === this.def.sensors.length },
      { label: "Triage", done: this.state.triages.size > 0 },
      { label: "Contain", done: this.def.hosts.every((host) => this.state.decisions.has(host.id)) },
    ];
    $("#steps").innerHTML = steps.map((step, index) => `<span class="${step.done ? "done" : ""}">${index + 1}. ${step.label}</span>`).join("<i></i>");
    if (this.state.phase !== "play") {
      $("#submit-slot").innerHTML = "";
      return;
    }
    const undecided = this.def.hosts.filter((host) => !this.state.decisions.has(host.id)).length;
    $("#submit-slot").innerHTML = `<button class="btn primary submit" data-act="submit" data-key="submit" ${undecided ? "disabled" : ""}>${ICONS.shield}${undecided ? `Decide ${undecided} more` : "Close case"}</button>`;
  }
}

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}
