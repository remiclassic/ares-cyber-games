import { play } from "../../ui/audio";
import { $, announce, esc, isModalOpen } from "../../ui/dom";
import { renderNextStep, type NextStep } from "../../ui/tutorial";
import type { CounterplayHost } from "../host";
import { apply, card, createGame, currentHand, currentIncident, fitOf, noteFor, techniqueOf } from "../sim/engine";
import type { Command, Fit, GameState, Hand, Scenario } from "../sim/types";
import { ICONS, cardIcon } from "./icons";

export const FIT_LABEL: Record<Fit, string> = { counter: "Countered", partial: "Partial", miss: "Missed" };

export function toast(message: string, kind: "reward" | "warn" | "" = ""): void {
  const element = document.createElement("div");
  element.className = `toast ${kind}`;
  element.textContent = message;
  $("#toasts").appendChild(element);
  window.setTimeout(() => element.remove(), 3200);
}

export class CounterplayGame {
  state: GameState;

  constructor(
    private readonly scenario: Scenario,
    private readonly host: CounterplayHost,
    private readonly onDone: (state: GameState) => void,
  ) {
    this.state = createGame(scenario, "init");
    for (const id of ["#table", "#incident"]) $(id).addEventListener("click", (event) => this.onAction(event));
    document.addEventListener("keydown", (event) => this.onKey(event));
  }

  start(seed: string, attempt: number): void {
    this.state = createGame(this.scenario, seed, attempt);
    this.host.started(seed);
    this.render();
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

  private onAction(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!target || (target as HTMLButtonElement).disabled) return;
    const { act, value } = target.dataset;
    if (act === "identify") this.identify(value!);
    else if (act === "play") this.playCard(value!);
    else if (act === "next") this.next();
  }

  private onKey(event: KeyboardEvent): void {
    if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
    if (this.state.phase === "identify" && ["1", "2", "3"].includes(event.key)) {
      event.preventDefault();
      this.identify(currentHand(this.state).options[Number(event.key) - 1]);
    }
  }

  private identify(choice: string): void {
    if (!this.run({ type: "identify", choice })) return;
    this.host.record({ verb: "assessed", object: currentHand(this.state).technique, result: { named: choice } });
    play("click");
    announce(`You named it: ${choice}. Now choose a response card.`);
    this.render();
    document.querySelector<HTMLElement>("#hand .rcard:not(:disabled)")?.focus();
  }

  private playCard(id: string): void {
    const handIndex = this.state.hands.length - 1;
    if (!this.run({ type: "play", card: id })) return;
    const hand = this.lastHand(handIndex);
    this.host.record({ verb: "responded", object: hand.technique, result: { card: id, fit: hand.fit } });
    play(hand.fit === "counter" ? "success" : hand.fit === "partial" ? "block" : "alarm");
    const tech = techniqueOf(currentIncident(this.state), hand.technique);
    announce(`The technique was ${tech.name}. ${card(this.scenario, id).name}: ${FIT_LABEL[hand.fit!]}. Defender ${this.state.defender}, actor ${this.state.attacker}.`);
    this.render();
    document.querySelector<HTMLElement>("[data-key='next']")?.focus();
  }

  private lastHand(index: number): Hand {
    return this.state.phase === "over" ? this.state.records[this.state.records.length - 1].hands[index] : this.state.hands[index];
  }

  private next(): void {
    if (!this.run({ type: "next" })) return;
    if (this.state.phase === "done") {
      this.onDone(this.state);
      return;
    }
    this.render();
    if (this.state.phase === "identify" && this.state.hands.length === 1) {
      announce(`Incident ${this.state.incidentIndex + 1}: ${currentIncident(this.state).title}.`);
      $("#incident").querySelector<HTMLElement>("h2")?.focus();
    } else {
      announce("New telemetry. Name the technique.");
      document.querySelector<HTMLElement>("#telemetry")?.focus();
    }
  }

  // ---------- rendering ----------

  render(): void {
    this.renderStatus();
    this.renderIncident();
    this.renderTable();
    this.renderNext();
  }

  // The live "Next" bar: the one thing to do in this phase, with a ring on where to do it. It
  // reads out what the table already shows and never hints at the technique or the card.
  private renderNext(): void {
    const state = this.state;
    const last = state.incidentIndex + 1 >= this.scenario.incidents.length;
    let step: NextStep;
    if (state.phase === "over") {
      const record = state.records[state.records.length - 1];
      step = {
        label: "Done",
        tone: "ready",
        text: `Incident closed, ${record.score.defender}–${record.score.attacker}. Read the recap of each hand, then press <strong>${last ? "See debrief" : "Next incident"}</strong>.`,
        hint: last ? "" : `Incident ${state.incidentIndex + 2} of ${this.scenario.incidents.length} starts with a full new toolkit.`,
        targets: ['[data-key="next"]'],
      };
    } else if (state.phase === "reveal") {
      const hand = currentHand(state);
      const result = hand.fit === "counter" ? "You countered it and score a point." : hand.fit === "miss" ? "Your card missed, so the actor scores." : "A partial: nobody scores.";
      step = {
        label: "Done",
        tone: "ready",
        text: `${result} Read why below, then press <strong>Next telemetry</strong>.`,
        hint: `You ${state.defender}, actor ${state.attacker}. First to ${this.scenario.target} wins the incident.`,
        targets: ['[data-key="next"]'],
      };
    } else if (state.phase === "respond") {
      const left = state.toolkit.length;
      step = {
        text: `Now play a response card: click the one in <strong>Your toolkit</strong> that stops the technique you named. ${left} card${left === 1 ? "" : "s"} left.`,
        hint: "Each card works once per incident. Pick the one that removes what the actor just used, not one that only sounds related.",
        targets: ["#hand"],
      };
    } else {
      const hand = currentHand(state);
      const tech = techniqueOf(currentIncident(state), hand.technique);
      step = {
        text: `Read the <strong>${esc(tech.source)}</strong> telemetry, then name the technique: click an option below or press <kbd>1</kbd>–<kbd>3</kbd>.`,
        hint: "Your choice locks in. Find the field that sets it apart from the two look-alikes: who, from where, how often, what changed.",
        targets: [".id-options"],
      };
    }
    renderNextStep($("#next-step"), step);
  }

  private renderStatus(): void {
    const pips = (filled: number, cls: string) =>
      Array.from({ length: this.scenario.target }, (_, index) => `<i class="pip ${cls} ${index < filled ? "on" : ""}"></i>`).join("");
    $("#status").innerHTML = `
      <div class="track" title="First to ${this.scenario.target}"><span>You</span><span class="pips">${pips(this.state.defender, "def")}</span></div>
      <div class="track" title="First to ${this.scenario.target}"><span>Actor</span><span class="pips">${pips(this.state.attacker, "atk")}</span></div>
      <div class="count"><strong>${this.state.incidentIndex + 1}/${this.scenario.incidents.length}</strong><span>Incident</span></div>`;
  }

  private renderIncident(): void {
    const incident = currentIncident(this.state);
    const hands = this.state.phase === "over" ? this.state.records[this.state.records.length - 1].hands : this.state.hands;
    const played = hands.filter((hand) => hand.fit);
    $("#incident").innerHTML = `
      <div class="col-head"><h2 tabindex="-1">${ICONS.log}Incident</h2><span class="phase-pill">${this.state.incidentIndex + 1} of ${this.scenario.incidents.length}</span></div>
      <div class="d-scroll">
        <h3 class="case-title">${esc(incident.title)}</h3>
        <p class="brief">${esc(incident.brief)}</p>
        <p class="indicator">${ICONS.actor}<span>The actor is after: <strong>${esc(incident.objective)}</strong>. First to ${this.scenario.target}: you score on a counter, they score on a miss.</span></p>
        ${this.state.incidentIndex === 0 && played.length === 0 ? `<div class="coach"><strong>Each hand:</strong> read the telemetry, name the technique, then play the response card that stops it. Every card can be used once in this incident, so think about what you will need later.</div>` : ""}
        <h4 class="sub-head">Hands so far</h4>
        ${
          played.length
            ? `<ol class="hands">${played
                .map((hand) => {
                  const tech = techniqueOf(incident, hand.technique);
                  return `<li class="fit-${hand.fit}"><strong>${esc(tech.name)}</strong><span>${esc(card(this.scenario, hand.card!).name)} · <b>${FIT_LABEL[hand.fit!]}</b>${hand.identified === tech.name ? "" : " · named wrong"}</span></li>`;
                })
                .join("")}</ol>`
            : `<p class="muted small">No hands played yet.</p>`
        }
      </div>`;
  }

  private renderTable(): void {
    if (this.state.phase === "over") {
      this.renderOver();
      return;
    }
    const incident = currentIncident(this.state);
    const hand = currentHand(this.state);
    const tech = techniqueOf(incident, hand.technique);
    const revealed = this.state.phase === "reveal";
    const identified = hand.identified;
    $("#table-head").innerHTML = `<h2>${ICONS.cards}Hand ${this.state.hands.length}</h2><span>${revealed ? "Reveal" : identified ? "Step 2 of 2: respond" : "Step 1 of 2: name it"}</span>`;
    $("#table-main").innerHTML = `
      <div class="d-scroll table-body">
        <section class="duel">
          <div class="facedown ${revealed ? "flipped" : ""}" aria-live="polite">
            ${
              revealed
                ? `<span class="kicker">Actor played</span><strong>${esc(tech.name)}</strong><span class="attack">${esc(tech.attack)}</span>`
                : `<span class="back">${ICONS.question}</span><span class="kicker">Actor's card</span><strong>Face down</strong>`
            }
          </div>
          <div class="console" id="telemetry" tabindex="-1" aria-label="Telemetry from ${esc(tech.source)}">
            <div class="console-head">${ICONS.terminal}<span>${esc(tech.source)}</span></div>
            <code>${esc(hand.telemetry)}</code>
          </div>
        </section>
        ${revealed ? this.revealPanel(hand) : this.identifyPanel(hand)}
        <section class="hand-wrap" aria-labelledby="hand-title">
          <h4 class="sub-head" id="hand-title">Your toolkit · ${this.state.toolkit.length} card${this.state.toolkit.length === 1 ? "" : "s"} left</h4>
          <div class="hand ${this.state.phase === "identify" ? "waiting" : ""}" id="hand">${this.handCards(hand, revealed)}</div>
        </section>
      </div>`;
  }

  private identifyPanel(hand: Hand): string {
    return `<section class="identify" aria-labelledby="id-title">
      <h4 class="sub-head" id="id-title">${ICONS.eye}What technique does this telemetry show?</h4>
      <div class="id-options">${hand.options
        .map(
          (option, index) =>
            `<button class="id-opt ${hand.identified === option ? "on" : ""}" data-act="identify" data-value="${esc(option)}" ${hand.identified ? "disabled" : ""} aria-pressed="${hand.identified === option}"><kbd>${index + 1}</kbd>${esc(option)}</button>`,
        )
        .join("")}</div>
      ${hand.identified ? `<p class="muted small">Locked in. Now play a response card below. You see whether you named it right when the card is revealed.</p>` : ""}
    </section>`;
  }

  private revealPanel(hand: Hand): string {
    const incident = currentIncident(this.state);
    const tech = techniqueOf(incident, hand.technique);
    const named = hand.identified === tech.name;
    const better = hand.fit !== hand.bestAvailable && hand.bestCards.length ? hand.bestCards.map((id) => card(this.scenario, id).name).join(" or ") : "";
    return `<section class="reveal fit-${hand.fit}">
      <div class="verdict-row">
        <span class="fit-badge ${hand.fit}">${FIT_LABEL[hand.fit!]}</span>
        <span>${hand.fit === "counter" ? "You score." : hand.fit === "miss" ? "The actor scores." : "Nobody scores."}</span>
      </div>
      <p><strong>${named ? "✓ You named it." : `✕ You named it “${esc(hand.identified!)}”.`}</strong> ${esc(tech.tell)}</p>
      <p><strong>${esc(card(this.scenario, hand.card!).name)}:</strong> ${esc(noteFor(tech, hand.card!))}</p>
      ${better ? `<p class="better">Better play still in your toolkit: <strong>${esc(better)}</strong>.</p>` : ""}
      <button class="btn primary" data-act="next" data-key="next">${ICONS.next}Next telemetry</button>
    </section>`;
  }

  private handCards(hand: Hand, revealed: boolean): string {
    const incident = currentIncident(this.state);
    const all = incident.toolkit;
    return all
      .map((id) => {
        const entry = card(this.scenario, id);
        const usedHere = revealed && hand.card === id;
        const spent = !this.state.toolkit.includes(id) && !usedHere;
        const canPlay = this.state.phase === "respond" && !spent;
        const tech = techniqueOf(incident, hand.technique);
        const fit = usedHere ? fitOf(tech, id) : null;
        return `<button class="rcard ${spent ? "spent" : ""} ${usedHere ? `played ${fit}` : ""}" data-act="play" data-value="${id}" ${canPlay ? "" : "disabled"} aria-label="${esc(entry.name)}${spent ? ", already used" : ""}">
          <span class="rc-icon">${cardIcon(entry)}</span>
          <strong>${esc(entry.name)}</strong>
          <span class="rc-detail">${esc(entry.detail)}</span>
          ${spent ? `<em class="rc-tag">Used</em>` : usedHere ? `<em class="rc-tag ${fit}">${FIT_LABEL[fit!]}</em>` : ""}
        </button>`;
      })
      .join("");
  }

  private renderOver(): void {
    const record = this.state.records[this.state.records.length - 1];
    const incident = currentIncident(this.state);
    const s = record.score;
    const headline = s.result === "evicted" ? "Actor evicted" : s.result === "breached" ? "The actor got what they came for" : "Stalemate";
    $("#table-head").innerHTML = `<h2>${ICONS.cards}Incident closed</h2><span>${s.defender}–${s.attacker}</span>`;
    $("#table-main").innerHTML = `
      <div class="d-scroll table-body">
        <section class="over ${s.result}">
          <p class="kicker">${esc(incident.title)}</p>
          <h3>${headline}: ${s.total}<small>/100</small></h3>
          <div class="score-grid three">
            ${tile("Named it", s.identify, 30, `${record.grades.filter((grade) => grade.identify).length} of ${record.grades.length} techniques named from the telemetry`)}
            ${tile("Response", s.response, 40, `${record.grades.filter((grade) => grade.response === 1).length} of ${record.grades.length} best plays with the cards you had left`)}
            ${tile("Outcome", s.outcome, 30, s.result === "evicted" ? "You reached three first" : s.result === "breached" ? "The actor reached three first" : "Nobody reached three")}
          </div>
          <ol class="recap">${record.hands
            .map((hand, index) => {
              const tech = techniqueOf(incident, hand.technique);
              const grade = record.grades[index];
              return `<li class="fit-${hand.fit}"><div><strong>${esc(tech.name)}</strong> <span class="attack">${esc(tech.attack)}</span></div>
                <div class="small">${grade.identify ? "✓ named" : `✕ named “${esc(hand.identified ?? "")}”`} · ${esc(card(this.scenario, hand.card!).name)} → <b>${FIT_LABEL[hand.fit!]}</b>. ${esc(grade.note)}</div></li>`;
            })
            .join("")}</ol>
          <button class="btn primary" data-act="next" data-key="next">${this.state.incidentIndex + 1 < this.scenario.incidents.length ? "Next incident" : "See debrief"}</button>
        </section>
      </div>`;
  }
}

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}
