import { play } from "../../ui/audio";
import { $, announce, esc, isModalOpen, showModal } from "../../ui/dom";
import type { TriageHost } from "../host";
import {
  apply,
  assessmentAt,
  createGame,
  getAlert,
  hasNewEvidence,
  incidentMembers,
  laneLoad,
  placedCount,
  readyToSubmit,
  summarize,
} from "../sim/engine";
import { LANES, type Alert, type Command, type GameState, type Lane, type Phase, type ReasonId, type Scenario, type Update } from "../sim/types";
import { ICONS, alertIcon } from "./icons";

type Tab = "evidence" | "impact" | "analysis";

export const LANE_META: Record<Lane, { title: string; sub: string; icon: string; key: string }> = {
  immediate: { title: "Immediate", sub: "Respond now", icon: ICONS.alert, key: "1" },
  investigate: { title: "Investigate", sub: "Look deeper", icon: ICONS.search, key: "2" },
  monitor: { title: "Monitor", sub: "Keep an eye on it", icon: ICONS.bars, key: "3" },
};

const PHASE_LABEL = ["Shift start", "Update 1 of 2", "Update 2 of 2"] as const;

export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export function toast(text: string, kind: "info" | "reward" | "warn" = "info"): void {
  const item = document.createElement("div");
  item.className = `toast ${kind}`;
  item.textContent = text;
  $("#toasts").appendChild(item);
  window.setTimeout(() => item.remove(), 4200);
}

export class TriageGame {
  private state!: GameState;
  private selected = "";
  private tab: Tab = "evidence";
  private linking = false;
  // The justification list is open (it collapses to one line once a reason is chosen).
  private choosing = false;
  private timed = true;
  private elapsed = 0;
  private lastTick = 0;
  private ticker: number | null = null;
  private dragging: string | null = null;

  constructor(
    private readonly scenario: Scenario,
    private readonly host: TriageHost,
    private readonly onDone: (state: GameState, timed: boolean) => void,
  ) {
    this.bind();
  }

  start(timed: boolean): void {
    this.state = createGame(this.scenario);
    this.timed = timed;
    this.elapsed = 0;
    this.tab = "evidence";
    this.linking = false;
    this.selected = this.scenario.alerts[0].id;
    this.send({ type: "inspect", alert: this.selected });
    this.host.started();
    this.render();
    this.lastTick = performance.now();
    this.ticker ??= window.setInterval(() => this.tick(), 250);
  }

  setTimed(timed: boolean): void {
    this.timed = timed;
    this.renderTop();
    this.paintClock();
  }

  stop(): void {
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.ticker = null;
  }

  // ---------- clock ----------
  private tick(): void {
    const now = performance.now();
    const delta = (now - this.lastTick) / 1000;
    this.lastTick = now;
    // The clock holds while a briefing or update is being read.
    if (isModalOpen() || document.hidden || this.state.done) return;
    this.elapsed += delta;
    this.paintClock();
    if (this.timed && this.elapsed >= this.scenario.seconds[this.state.phase]) {
      toast("Time. The shift moves on with the board as it stands.", "warn");
      this.submit(true);
    }
  }

  private paintClock(): void {
    const clock = document.querySelector<HTMLElement>("#clock");
    if (!clock) return;
    const left = this.scenario.seconds[this.state.phase] - this.elapsed;
    clock.textContent = this.timed ? clockText(left) : clockText(this.elapsed);
    clock.parentElement?.classList.toggle("low", this.timed && left <= 15);
  }

  // ---------- commands ----------
  private send(command: Command): boolean {
    const result = apply(this.state, command);
    if (!result.ok) {
      toast(result.error, "warn");
      announce(result.error);
      play("fail");
    }
    return result.ok;
  }

  private select(id: string): void {
    const hadNew = hasNewEvidence(this.state, id);
    if (id !== this.selected || hadNew) this.tab = "evidence";
    if (id !== this.selected) this.linking = this.choosing = false;
    this.selected = id;
    if (!this.state.inspected[id]) this.host.record({ verb: "inspected", object: id, result: { phase: this.state.phase } });
    this.send({ type: "inspect", alert: id });
    this.render();
  }

  private place(id: string, lane: Lane): void {
    if (this.state.placements[id]?.lane === lane) {
      this.select(id);
      return;
    }
    if (!this.send({ type: "place", alert: id, lane })) return;
    play("click");
    this.host.record({ verb: "prioritized", object: id, result: { lane, phase: this.state.phase } });
    announce(`${getAlert(this.scenario, id).title} set to ${LANE_META[lane].title}. Pick a justification.`);
    this.select(id);
  }

  private justify(reason: ReasonId): void {
    if (!this.send({ type: "justify", alert: this.selected, reason })) return;
    play("click");
    this.choosing = false;
    this.host.record({ verb: "justified", object: this.selected, result: { reason, phase: this.state.phase } });
    this.render();
  }

  private link(id: string, other: string): void {
    if (!this.send({ type: "link", alert: id, with: other })) return;
    play("deliver");
    this.linking = false;
    this.host.record({ verb: "linked", object: id, result: { with: other, phase: this.state.phase } });
    announce(`${getAlert(this.scenario, id).title} linked with ${getAlert(this.scenario, other).title} as one incident.`);
    this.select(id);
  }

  private submit(timedOut = false): void {
    const phase = this.state.phase;
    if (!this.send({ type: "submit", elapsedSeconds: Math.round(this.elapsed), timedOut })) return;
    this.host.record({ verb: "submitted", object: `round-${phase}`, result: { timedOut } });
    this.elapsed = 0;
    this.linking = false;
    if (this.state.done) {
      this.stop();
      this.onDone(this.state, this.timed);
      return;
    }
    const rewards = summarize(this.state).rewards.filter((reward) => reward.phase === phase);
    rewards.forEach((reward, index) => window.setTimeout(() => toast(reward.text, "reward"), index * 350));
    this.render();
    this.showUpdate(this.scenario.updates[this.state.phase - 1], true);
  }

  private showUpdate(update: Update, fresh: boolean): void {
    if (fresh) play("alarm");
    const names = update.affects.map((id) => getAlert(this.scenario, id).title);
    showModal({
      kicker: `${update.clock} · ${update.from}`,
      title: update.title,
      body: `${update.body.map((line) => `<p>${esc(line)}</p>`).join("")}
        <p class="note">${ICONS.review}<span>New evidence added to: <strong>${esc(names.join(", "))}</strong>. Re-read it, then revise the board if the evidence supports a change.</span></p>`,
      actions: [{ label: fresh ? "Back to the queue" : "Close", primary: true, onClick: () => undefined }],
      dismissible: !fresh,
      onClose: () => {
        this.lastTick = performance.now();
      },
    });
  }

  // ---------- events ----------
  private bind(): void {
    const root = $("#game");
    root.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (target) this.act(target);
    });
    root.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement;
      if ((event.key === "Enter" || event.key === " ") && target.matches("[role='button'][data-action]")) {
        event.preventDefault();
        this.act(target);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (isModalOpen() || $("#game").hidden || !this.state || this.state.done) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const lane = LANES.find((entry) => LANE_META[entry].key === event.key);
      if (lane) {
        event.preventDefault();
        this.place(this.selected, lane);
      } else if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        this.step(event.key === "]" ? 1 : -1);
      }
    });

    // Drag a card to a lane to set its priority, or onto another queue card to link them.
    root.addEventListener("dragstart", (event) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>("[draggable='true'][data-alert]");
      if (!card || !event.dataTransfer) return;
      this.dragging = card.dataset.alert!;
      event.dataTransfer.setData("text/plain", this.dragging);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
      root.classList.add("drag-active");
    });
    root.addEventListener("dragend", () => {
      this.dragging = null;
      root.classList.remove("drag-active");
      root.querySelectorAll(".dragging, .over").forEach((element) => element.classList.remove("dragging", "over"));
    });
    const dropTarget = (event: DragEvent) => {
      if (!this.dragging) return null;
      const element = event.target as HTMLElement;
      const lane = element.closest<HTMLElement>("[data-drop]");
      if (lane) return lane;
      const card = element.closest<HTMLElement>(".alert-card[data-alert]");
      return card && card.dataset.alert !== this.dragging ? card : null;
    };
    root.addEventListener("dragover", (event) => {
      const target = dropTarget(event);
      if (!target) return;
      event.preventDefault();
      root.querySelectorAll(".over").forEach((element) => element !== target && element.classList.remove("over"));
      target.classList.add("over");
    });
    root.addEventListener("drop", (event) => {
      const target = dropTarget(event);
      const id = this.dragging;
      if (!target || !id) return;
      event.preventDefault();
      this.dragging = null;
      root.classList.remove("drag-active");
      if (target.dataset.drop) this.place(id, target.dataset.drop as Lane);
      else this.link(id, target.dataset.alert!);
    });
  }

  private step(direction: number): void {
    const ids = this.scenario.alerts.map((alert) => alert.id);
    const next = ids[(ids.indexOf(this.selected) + direction + ids.length) % ids.length];
    this.select(next);
  }

  private act(target: HTMLElement): void {
    const { action, alert, lane, reason, tab } = target.dataset;
    switch (action) {
      case "select":
        this.select(alert!);
        break;
      case "place":
        this.place(this.selected, lane as Lane);
        break;
      case "unplace":
        if (this.send({ type: "unplace", alert: this.selected })) this.render();
        break;
      case "justify":
        this.justify(reason as ReasonId);
        break;
      case "tab":
        this.tab = tab as Tab;
        this.render();
        break;
      case "choose":
        this.choosing = !this.choosing;
        this.render();
        break;
      case "prev":
        this.step(-1);
        break;
      case "next":
        this.step(1);
        break;
      case "toggle-link":
        this.linking = !this.linking;
        this.render();
        break;
      case "link":
        this.link(this.selected, alert!);
        break;
      case "unlink":
        if (this.send({ type: "unlink", alert: this.selected })) this.render();
        break;
      case "update":
        this.showUpdate(this.scenario.updates[this.state.phase - 1], false);
        break;
      case "submit":
        if (readyToSubmit(this.state)) this.submit();
        else {
          toast(this.blocker(), "warn");
          announce(this.blocker());
        }
        break;
    }
  }

  private blocker(): string {
    const total = this.scenario.alerts.length;
    const unplaced = total - placedCount(this.state);
    if (unplaced > 0) return `${unplaced} ${unplaced === 1 ? "alert still needs" : "alerts still need"} a priority.`;
    const unjustified = this.scenario.alerts.filter((alert) => !this.state.placements[alert.id]?.reason).length;
    return `${unjustified} ${unjustified === 1 ? "alert still needs" : "alerts still need"} a justification.`;
  }

  // ---------- rendering ----------
  private render(): void {
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
    this.renderTop();
    this.renderQueue();
    this.renderBoard();
    this.renderDetails();
    this.renderBottom();
    this.paintClock();
    if (focusKey) document.querySelector<HTMLElement>(`#game [data-key="${focusKey}"]`)?.focus();
  }

  private renderTop(): void {
    const total = this.scenario.alerts.length;
    $("#status").innerHTML = `
      <div class="clock" title="${this.timed ? "Time left in this round" : "Untimed: time spent in this round"}">
        ${ICONS.clock}<span id="clock" aria-label="${this.timed ? "Time left" : "Time spent"}">00:00</span>
      </div>
      <div class="count"><strong>${placedCount(this.state)} / ${total}</strong><span>alerts</span></div>`;
  }

  private stateBadges(alert: Alert): string {
    const placement = this.state.placements[alert.id];
    const badges: string[] = [];
    if (hasNewEvidence(this.state, alert.id)) badges.push(`<span class="badge new">New evidence</span>`);
    if (this.state.links[alert.id]) badges.push(`<span class="badge linked">${ICONS.link}Linked</span>`);
    if (placement && !placement.reason) badges.push(`<span class="badge todo">Needs a reason</span>`);
    return badges.join("");
  }

  private renderQueue(): void {
    const cards = this.scenario.alerts.map((alert) => {
      const placement = this.state.placements[alert.id];
      const where = placement ? `in ${LANE_META[placement.lane].title}` : "not triaged yet";
      const fresh = hasNewEvidence(this.state, alert.id) ? ", new evidence" : "";
      return `
        <div class="alert-card sev-${alert.severity.toLowerCase()} ${alert.id === this.selected ? "selected" : ""} ${placement ? "placed" : ""}"
          role="button" tabindex="0" draggable="true" data-action="select" data-alert="${alert.id}" data-key="q-${alert.id}"
          aria-pressed="${alert.id === this.selected}"
          aria-label="${esc(`${alert.title}, ${alert.subject}, ${alert.severity} severity, ${where}${fresh}`)}">
          <span class="grip" aria-hidden="true"></span>
          <span class="a-icon">${alertIcon(alert)}</span>
          <div class="a-main">
            <div class="a-row"><strong>${esc(alert.title)}</strong><time>${alert.time}</time></div>
            <div class="a-row">
              <span class="a-sub">${esc(alert.subject)}</span>
              ${placement ? `<span class="badge lane-${placement.lane}">${LANE_META[placement.lane].title}</span>` : ""}
            </div>
            <div class="chips">
              <span class="chip cat">${alert.category}</span>
              <span class="chip sev">${alert.severity}</span>
              <span class="chip">${esc(alert.tag)}</span>
              ${this.stateBadges(alert)}
            </div>
          </div>
        </div>`;
    });
    $("#queue").innerHTML = `
      <header class="col-head"><h2>Alert queue</h2><span>${this.scenario.alerts.length} alerts</span></header>
      <div class="queue-list">${cards.join("")}</div>`;
  }

  private renderBoard(): void {
    const { phase } = this.state;
    const update = phase > 0 ? this.scenario.updates[phase - 1] : null;
    const lanes = LANES.map((lane) => {
      const meta = LANE_META[lane];
      const seen = new Set<string>();
      const cards: string[] = [];
      for (const alert of this.scenario.alerts) {
        if (this.state.placements[alert.id]?.lane !== lane || seen.has(alert.id)) continue;
        const members = incidentMembers(this.state, alert.id);
        members.forEach((member) => seen.add(member));
        cards.push(this.incidentCard(members));
      }
      const load = laneLoad(this.state, lane);
      const count = lane === "immediate" ? `${load} / ${this.scenario.immediateCapacity}` : `${load}`;
      const label = lane === "immediate" ? `${load} of ${this.scenario.immediateCapacity} analysts in use` : `${load} incidents`;
      return `
        <section class="lane lane-${lane}" aria-label="${meta.title}: ${meta.sub}">
          <header>
            <span class="lane-icon">${meta.icon}</span>
            <div><h3>${meta.title}</h3><p>${meta.sub}</p></div>
            <span class="lane-count" aria-label="${label}">${count}</span>
          </header>
          <div class="drop" data-drop="${lane}">
            ${cards.join("") || `<p class="drop-hint">Drag an alert here, or select it and press <kbd>${meta.key}</kbd></p>`}
          </div>
        </section>`;
    });
    $("#board").innerHTML = `
      <header class="col-head">
        <h2>${ICONS.clock}Triage board</h2>
        <span class="phase-pill">${this.scenario.clock[phase]} · ${PHASE_LABEL[phase]}</span>
      </header>
      ${
        update
          ? `<button class="update-banner" data-action="update" data-key="update">
              ${ICONS.megaphone}<span><strong>${esc(update.from)}:</strong> ${esc(update.title)}</span><em>Read again</em>
            </button>`
          : ""
      }
      <div class="lanes">${lanes.join("")}</div>`;
  }

  private incidentCard(members: string[]): string {
    const first = members[0];
    const placement = this.state.placements[first];
    const reason = this.scenario.reasons.find((entry) => entry.id === placement?.reason);
    const rows = members.map((id) => {
      const alert = getAlert(this.scenario, id);
      return `
        <div class="inc-row sev-${alert.severity.toLowerCase()}">
          <span class="a-icon">${alertIcon(alert)}</span>
          <div><strong>${esc(alert.title)}</strong><span>${esc(alert.subject)}</span></div>
          <time>${alert.time}</time>
        </div>`;
    });
    const titles = members.map((id) => getAlert(this.scenario, id).title).join(" and ");
    const target = members.includes(this.selected) ? this.selected : first;
    return `
      <div class="inc-card ${members.includes(this.selected) ? "selected" : ""}" role="button" tabindex="0" draggable="true"
        data-action="select" data-alert="${target}" data-key="l-${first}"
        aria-label="${esc(`${titles}. ${reason ? `Reason: ${reason.text}` : "Needs a justification"}`)}">
        ${members.length > 1 ? `<div class="inc-head">${ICONS.link}Linked incident · ${members.length} alerts</div>` : ""}
        ${rows.join("")}
        <div class="inc-reason ${reason ? "" : "todo"}">${reason ? esc(reason.text) : "Pick a justification"}</div>
      </div>`;
  }

  private renderDetails(): void {
    const { phase } = this.state;
    const alert = getAlert(this.scenario, this.selected);
    const assessment = assessmentAt(alert, phase);
    const index = this.scenario.alerts.indexOf(alert);
    const tabs: [Tab, string][] = [
      ["evidence", "Evidence"],
      ["impact", "Business impact"],
      ["analysis", "Analysis"],
    ];
    $("#details").innerHTML = `
      <header class="col-head">
        <h2>Alert details</h2>
        <span>Alert ${index + 1} of ${this.scenario.alerts.length}</span>
        <button class="nav-btn" data-action="prev" data-key="prev" aria-label="Previous alert">${ICONS.left}</button>
        <button class="nav-btn" data-action="next" data-key="next" aria-label="Next alert">${ICONS.right}</button>
      </header>
      <div class="d-scroll">
        <div class="d-head sev-${alert.severity.toLowerCase()}">
          <span class="a-icon big">${alertIcon(alert)}</span>
          <div class="a-main">
            <div class="a-row"><strong>${esc(alert.title)}</strong><time>${alert.time}</time></div>
            <div class="a-sub">${esc(alert.subject)}</div>
            <div class="a-sub">${esc(alert.summary)}</div>
            <div class="chips">
              <span class="chip cat">${alert.category}</span>
              <span class="chip sev">${alert.severity}</span>
              <span class="chip">${esc(alert.tag)}</span>
            </div>
          </div>
        </div>
        ${this.callBlock(alert)}
        <div class="tabs" role="tablist" aria-label="Alert details">
          ${tabs
            .map(
              ([id, label]) =>
                `<button role="tab" aria-selected="${this.tab === id}" class="${this.tab === id ? "on" : ""}" data-action="tab" data-tab="${id}" data-key="tab-${id}">${label}</button>`,
            )
            .join("")}
        </div>
        <div class="tab-body" role="tabpanel">${this.tabBody(alert, phase)}</div>
        <div class="tiles">
          <div class="tile impact-${assessment.impact.toLowerCase()}">
            <span class="tile-icon">${ICONS.database}</span>
            <div><span>Business impact</span><strong>${assessment.impact}</strong><p>${esc(assessment.impactNote)}</p></div>
          </div>
          <div class="tile conf-${assessment.confidence >= 70 ? "high" : assessment.confidence >= 30 ? "mid" : "low"}">
            <span class="tile-icon">${ICONS.shield}</span>
            <div><span title="How strongly the evidence supports real malicious activity">Confidence</span><strong>${assessment.confidence}%</strong><p>${esc(assessment.confidenceNote)}</p></div>
          </div>
        </div>
      </div>`;
  }

  private tabBody(alert: Alert, phase: Phase): string {
    const assessment = assessmentAt(alert, phase);
    if (this.tab === "impact") {
      return `
        <h3>Affected asset</h3>
        <dl class="facts">
          <div><dt>Asset</dt><dd>${esc(alert.asset.name)}</dd></div>
          <div><dt>Role</dt><dd>${esc(alert.asset.role)}</dd></div>
          <div><dt>Business importance</dt><dd><span class="level level-${alert.asset.importance.toLowerCase()}">${alert.asset.importance}</span></dd></div>
          <div><dt>Possible impact</dt><dd>${esc(assessment.impactNote)}</dd></div>
        </dl>`;
    }
    if (this.tab === "analysis") {
      const list = (items: readonly string[], empty: string) =>
        items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`;
      return `
        <h3>What the evidence shows</h3>${list(assessment.known, "Nothing yet.")}
        <h3>Still unknown</h3>${list(assessment.unknown, "No open questions.")}
        <p class="muted small">An alert is a signal. It becomes an incident when the evidence confirms it.</p>`;
    }
    const items = alert.evidence.filter((item) => item.from <= phase);
    return `
      <h3>Event timeline</h3>
      <ol class="timeline">
        ${items
          .map(
            (item) => `
          <li class="${item.trigger ? "trigger" : ""} ${item.from === phase && phase > 0 ? "fresh" : ""}">
            <time>${item.time}</time>
            <div><strong>${esc(item.title)}${item.from === phase && phase > 0 ? ` <span class="badge new">New</span>` : ""}</strong><span>${esc(item.detail)}</span></div>
          </li>`,
          )
          .join("")}
      </ol>`;
  }

  private callBlock(alert: Alert): string {
    const placement = this.state.placements[alert.id];
    const linked = incidentMembers(this.state, alert.id).filter((id) => id !== alert.id);
    const laneButtons = LANES.map((lane) => {
      const on = placement?.lane === lane;
      return `<button class="lane-btn lane-${lane} ${on ? "on" : ""}" aria-pressed="${on}" data-action="place" data-lane="${lane}" data-key="lane-${lane}">
        <kbd>${LANE_META[lane].key}</kbd>${LANE_META[lane].title}</button>`;
    });
    const chosen = this.scenario.reasons.find((reason) => reason.id === placement?.reason);
    const reasons = !placement
      ? `<p class="muted small why">Set a priority, then pick the justification that best supports it.</p>`
      : chosen && !this.choosing
        ? `<p class="why"><span class="muted">Why:</span> <strong>${esc(chosen.text)}</strong> <button class="text-btn" data-action="choose" data-key="choose">Change</button></p>`
        : `<h4>Why? Pick the strongest justification</h4>
          <div class="reasons" role="radiogroup" aria-label="Justification">
          ${this.scenario.reasons
            .map(
              (reason) =>
                `<button role="radio" aria-checked="${placement.reason === reason.id}" class="${placement.reason === reason.id ? "on" : ""}" data-action="justify" data-reason="${reason.id}" data-key="reason-${reason.id}" title="${esc(reason.hint)}">${esc(reason.text)}</button>`,
            )
            .join("")}
        </div>`;
    const others = this.scenario.alerts.filter((other) => other.id !== alert.id && !linked.includes(other.id));
    const linkRow = `
      <div class="link-row">
        ${
          linked.length
            ? `<span class="linked-with">${ICONS.link}One incident with <strong>${esc(linked.map((id) => getAlert(this.scenario, id).title).join(", "))}</strong></span>
               <button class="text-btn" data-action="unlink" data-key="unlink">Unlink</button>`
            : `<button class="text-btn" data-action="toggle-link" data-key="toggle-link" aria-expanded="${this.linking}">${ICONS.link}Same incident as another alert?</button>`
        }
      </div>
      ${
        this.linking && !linked.length
          ? `<div class="link-list" role="group" aria-label="Link with">
              ${others.map((other) => `<button data-action="link" data-alert="${other.id}" data-key="link-${other.id}">${alertIcon(other)}${esc(other.title)}</button>`).join("")}
            </div>`
          : ""
      }`;
    return `
      <div class="call">
        <h3>Your call${linked.length ? " for this incident" : ""}</h3>
        <div class="lane-btns" role="group" aria-label="Priority">${laneButtons.join("")}</div>
        ${reasons}
        ${linkRow}
      </div>`;
  }

  private renderBottom(): void {
    const ready = readyToSubmit(this.state);
    const last = this.state.phase === 2;
    $("#submit-slot").innerHTML = `
      <button class="submit ${ready ? "" : "blocked"}" data-action="submit" data-key="submit" aria-disabled="${!ready}">
        ${last ? "Submit final triage" : "Submit triage"}${ICONS.right}
      </button>
      <p class="submit-note" role="status">${ready ? (last ? "Ends the shift and opens the debrief." : "Locks this round in. New information follows.") : esc(this.blocker())}</p>`;
  }
}
