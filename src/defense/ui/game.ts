import { play } from "../../ui/audio";
import { renderNextStep, type NextStep } from "../../ui/tutorial";
import { $, announce, esc } from "../../ui/dom";
import type { DefenseHost } from "../host";
import { MAX_DAMAGE, apply, control, createGame, currentWave, deployed, frictionOf, prefs, technique } from "../sim/engine";
import type { Campaign, CampaignRun, Command, Control, Effect, GameState, Scenario, StageId, Step } from "../sim/types";
import { ICONS, stageIcon } from "./icons";

const RESULT_LABEL: Record<Step["result"], string> = {
  ran: "Ran",
  blocked: "Blocked",
  detected: "Detected",
  contained: "Contained",
  recovered: "Recovered",
};

export function toast(message: string, kind: "reward" | "warn" | "" = ""): void {
  const element = document.createElement("div");
  element.className = `toast ${kind}`;
  element.textContent = message;
  $("#toasts").appendChild(element);
  window.setTimeout(() => element.remove(), 3200);
}

// Which stage a control mainly acts on, for grouping the catalog.
function primaryStage(scenario: Scenario, entry: Control): StageId {
  if (entry.responds) return "execution";
  const first = Object.keys(entry.effects)[0];
  return technique(scenario, first).stage;
}

export class DefenseGame {
  state: GameState;
  private reveal = 99;
  private timer = 0;

  constructor(
    private readonly scenario: Scenario,
    private readonly host: DefenseHost,
    private readonly reducedMotion: () => boolean,
    private readonly onDone: (state: GameState) => void,
  ) {
    this.state = createGame(scenario, "init");
    for (const id of ["#intel", "#catalog", "#submit-slot"]) $(id).addEventListener("click", (event) => this.onAction(event));
  }

  start(seed: string, attempt: number): void {
    window.clearInterval(this.timer);
    this.state = createGame(this.scenario, seed, attempt);
    this.reveal = 99;
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
    const { act, id, value } = target.dataset;
    if (act === "deploy") this.deploy(id!);
    else if (act === "remove") this.remove(id!);
    else if (act === "launch") this.launch();
    else if (act === "answer") this.answer(Number(value));
    else if (act === "next") this.next();
  }

  private deploy(id: string): void {
    if (!this.run({ type: "deploy", control: id })) return;
    this.host.record({ verb: "configured", object: id, result: { action: "deploy" } });
    play("deliver");
    announce(`${control(this.scenario, id).name} deployed. ${this.state.creditsLeft} credits left.`);
    this.render();
  }

  private remove(id: string): void {
    if (!this.run({ type: "remove", control: id })) return;
    this.host.record({ verb: "configured", object: id, result: { action: "remove" } });
    play("click");
    announce(`${control(this.scenario, id).name} removed. ${this.state.creditsLeft} credits left.`);
    this.render();
  }

  private launch(): void {
    if (!this.run({ type: "launch" })) return;
    const record = this.state.records[this.state.records.length - 1];
    this.host.record({ verb: "launched", object: record.waveId, result: { score: record.score.total, deployed: record.deployed } });
    play("alarm");
    if (this.reducedMotion()) {
      this.reveal = 99;
      this.finishReveal();
      return;
    }
    this.reveal = 0;
    this.render();
    this.timer = window.setInterval(() => {
      this.reveal += 1;
      if (this.reveal > 5) {
        window.clearInterval(this.timer);
        this.reveal = 99;
        this.finishReveal();
        return;
      }
      this.renderBoard();
    }, 650);
  }

  private finishReveal(): void {
    const record = this.state.records[this.state.records.length - 1];
    play(record.score.damage === 0 ? "success" : "setback");
    this.render();
    announce(`Wave over. Damage ${record.score.damage} of ${record.score.maxDamage}. Score ${record.score.total} of 100.`);
    $("#intel").querySelector<HTMLElement>("h2")?.focus();
  }

  private answer(choice: number): void {
    if (!this.run({ type: "answer", choice })) return;
    const record = this.state.records[this.state.records.length - 1];
    this.host.record({ verb: "answered", object: record.waveId, result: { correct: record.answer!.correct } });
    play(record.answer!.correct ? "success" : "setback");
    this.render();
    $("#intel").querySelector<HTMLElement>("[data-key='next']")?.focus();
  }

  private next(): void {
    if (!this.run({ type: "next" })) return;
    if (this.state.phase === "done") {
      this.onDone(this.state);
      return;
    }
    this.render();
    announce(`${currentWave(this.state).title}. ${this.state.creditsLeft} credits available.`);
    $("#intel").querySelector<HTMLElement>("h2")?.focus();
  }

  // ---------- rendering ----------

  render(): void {
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
    this.renderStatus();
    this.renderIntel();
    this.renderBoard();
    this.renderCatalog();
    this.renderFooter();
    this.renderNext();
    if (focusKey) document.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  private get animating(): boolean {
    return this.reveal <= 5;
  }

  private renderStatus(): void {
    const wave = currentWave(this.state);
    const friction = frictionOf(this.scenario, deployed(this.state));
    $("#status").innerHTML = `
      <div class="meter credits" title="Budget left">${ICONS.credits}<span>${this.state.creditsLeft}<small> credits</small></span></div>
      <div class="count ${friction > wave.frictionAllowance ? "over" : ""}" title="Business friction used / accepted"><strong>${friction}/${wave.frictionAllowance}</strong><span>Friction</span></div>
      <div class="count"><strong>${this.state.waveIndex + 1}/${this.scenario.waves.length}</strong><span>Wave</span></div>`;
  }

  private renderIntel(): void {
    const wave = currentWave(this.state);
    const record = this.state.phase === "result" && !this.animating ? this.state.records[this.state.records.length - 1] : null;
    const head = `<div class="col-head"><h2 tabindex="-1">${ICONS.intel}${record ? "Wave report" : "Threat intel"}</h2><span class="phase-pill">${this.state.phase === "plan" ? "Planning" : this.animating ? "Running" : "Done"}</span></div>`;
    if (record) {
      const s = record.score;
      const check = record.check;
      $("#intel").innerHTML = `${head}
        <div class="d-scroll">
          <p class="kicker">Wave ${this.state.waveIndex + 1} of ${this.scenario.waves.length}</p>
          <h3 class="case-title">${esc(wave.title)}: ${s.total}<small>/100</small></h3>
          <div class="score-grid">
            ${tile("Outcome", s.outcome, 50, `Damage ${s.damage} of ${s.maxDamage}`)}
            ${tile("Depth", s.depth, 25, `${s.resilient} of ${s.campaigns} stops survive a control failing`)}
            ${tile("Friction", s.friction, 25, `${s.frictionUsed} used, ${s.frictionAllowance} accepted`)}
          </div>
          <ul class="verdicts">${wave.campaigns.map((campaign, index) => this.verdict(campaign, record.runs[index], record.resilience[campaign.id])).join("")}</ul>
          ${
            check
              ? `<section class="check" aria-labelledby="check-q">
                  <h4>${ICONS.question}Reasoning check</h4>
                  <p id="check-q"><strong>${esc(check.question)}</strong></p>
                  <div class="options">${check.options
                    .map((option, index) => {
                      const answered = record.answer;
                      const cls = answered ? (index === check.correct ? "right" : index === answered.choice ? "wrong" : "") : "";
                      return `<button class="option ${cls}" data-act="answer" data-value="${index}" data-key="answer-${index}" ${answered ? "disabled" : ""}>${esc(option)}</button>`;
                    })
                    .join("")}</div>
                  ${record.answer ? `<p class="feedback ${record.answer.correct ? "good" : "bad"}">${record.answer.correct ? "Right." : "Not quite."} ${esc(check.explain)}</p>` : ""}
                </section>`
              : ""
          }
          <button class="btn primary" data-act="next" data-key="next" ${check && !record.answer ? "disabled" : ""}>${this.state.waveIndex + 1 < this.scenario.waves.length ? "Plan the next wave" : "See debrief"}</button>
        </div>`;
      return;
    }
    $("#intel").innerHTML = `${head}
      <div class="d-scroll">
        <p class="kicker">Wave ${this.state.waveIndex + 1} of ${this.scenario.waves.length} · +${wave.credits} credits</p>
        <h3 class="case-title">${esc(wave.title)}</h3>
        <p class="brief">${esc(wave.brief)}</p>
        ${this.state.waveIndex === 0 ? `<div class="coach"><strong>How it works.</strong> A campaign has to get through every stage, left to right. Blocking it at <em>any</em> stage stops it. Depth means it would <em>still</em> be stopped if that one control failed. A foothold always costs something, so stopping campaigns early matters too.</div>` : ""}
        <h4 class="sub-head">Campaigns this wave</h4>
        <ul class="campaigns">${wave.campaigns
          .map(
            (campaign) => `<li><span class="tok">${esc(campaign.id.toUpperCase())}</span><div><strong>${esc(campaign.name)}</strong><span class="muted small">${esc(campaign.actor)}</span><p>${esc(campaign.intel)}</p></div></li>`,
          )
          .join("")}</ul>
        <p class="legend-line"><span class="eff block">${ICONS.block}Blocks</span><span class="eff detect">${ICONS.detect}Detects</span><span class="eff recover">${ICONS.recover}Recovers</span></p>
        <p class="muted small">Detections only stop a campaign if someone responds, one stage later.</p>
      </div>`;
  }

  private verdict(campaign: Campaign, run: CampaignRun, resilience: { resilient: boolean; failsWithout: string | null }): string {
    const stageName = (id: StageId | null) => this.scenario.stages.find((stage) => stage.id === id)?.name.toLowerCase() ?? "";
    const names = (ids: readonly string[]) => ids.map((id) => control(this.scenario, id).short).join(" + ");
    let text: string;
    let tone: string;
    if (run.stopped) {
      const how = run.steps[run.steps.length - 1].result === "contained" ? "contained by" : "blocked by";
      text = `Stopped at ${stageName(run.stoppedAt)}, ${how} ${names(run.decisive)}.`;
      if (resilience.resilient) {
        text += run.decisive.length === 1 ? ` Resilient: if ${names(run.decisive)} failed, a later layer would still stop it.` : " Resilient: it stays stopped if any one of these fails.";
        tone = "good";
      } else {
        text += ` Single point of failure: without ${control(this.scenario, resilience.failsWithout!).short} it gets through.`;
        tone = "warn";
      }
      if (run.damage) text += ` The foothold still cost ${run.damage}.`;
    } else {
      const last = run.steps[run.steps.length - 1];
      text = `Reached the crown jewels: ${technique(this.scenario, last.technique).name.toLowerCase()}. Damage ${run.damage} of ${MAX_DAMAGE}.`;
      if (last.result === "recovered") text += " Backups limited it.";
      const unanswered = run.steps.find((step) => step.unanswered);
      if (unanswered) text += ` It was detected at ${stageName(unanswered.stage)}, but nobody was there to respond.`;
      tone = "bad";
    }
    return `<li class="${tone}"><span class="tok">${esc(campaign.id.toUpperCase())}</span><div><strong>${esc(campaign.name)}</strong><p>${esc(text)}</p></div></li>`;
  }

  renderBoard(): void {
    const wave = currentWave(this.state);
    const controls = this.state.phase === "plan" ? deployed(this.state) : this.state.records[this.state.records.length - 1].deployed;
    const record = this.state.phase === "plan" ? null : this.state.records[this.state.records.length - 1];
    const stages = this.scenario.stages;
    const effectAt = (stage: StageId) => {
      const out: { id: string; effect: Effect | "responds" }[] = [];
      for (const id of controls) {
        const entry = control(this.scenario, id);
        if (entry.responds && stage === "execution") out.push({ id, effect: "responds" });
        const effect = [...new Set(Object.entries(entry.effects).filter(([tech]) => technique(this.scenario, tech).stage === stage).map(([, value]) => value))][0];
        if (effect && !(entry.responds && stage === "execution")) out.push({ id, effect });
      }
      return out;
    };
    const header = stages
      .map((stage) => {
        const acting = effectAt(stage.id);
        return `<div class="stage-head" role="columnheader">
          <span class="st-icon">${stageIcon(stage.id)}</span>
          <strong>${esc(stage.name)}</strong>
          <span class="muted small">${esc(stage.question)}</span>
          <div class="towers">${acting.length ? acting.map((entry) => `<span class="tower ${entry.effect}" title="${esc(control(this.scenario, entry.id).name)}">${ICONS[entry.effect]}${esc(control(this.scenario, entry.id).short)}</span>`).join("") : `<span class="tower none">No control</span>`}</div>
        </div>`;
      })
      .join("");
    const rows = wave.campaigns
      .map((campaign, row) => {
        const run = record?.runs[row];
        const cells = stages
          .map((stage, col) => {
            if (run) return this.runCell(run, stage.id, col);
            return this.planCell(campaign, stage.id, controls);
          })
          .join("");
        const shown = run && (this.animating ? this.reveal >= 5 : true);
        const end = run ? (shown ? `<div class="jewel ${run.stopped ? (run.damage ? "dented" : "safe") : "hit"}" role="cell"><strong>${run.damage}</strong><span>damage</span></div>` : `<div class="jewel pending" role="cell">…</div>`) : `<div class="jewel" role="cell">${ICONS.impact}</div>`;
        return `<div class="row" role="row"><div class="who" role="rowheader"><span class="tok">${esc(campaign.id.toUpperCase())}</span><span>${esc(campaign.name)}</span></div>${cells}${end}</div>`;
      })
      .join("");
    $("#board").innerHTML = `
      <div class="grid" role="table" aria-label="Attack chain board">
        <div class="row head" role="row"><div class="who" role="columnheader"><span class="muted small">Campaign</span></div>${header}<div class="jewel-head" role="columnheader">${ICONS.impact}<strong>Crown jewels</strong><span class="muted small">${esc(this.scenario.crownJewels)}</span></div></div>
        ${rows}
      </div>`;
  }

  private planCell(campaign: Campaign, stage: StageId, controls: readonly string[]): string {
    const options =
      stage === "execution"
        ? [...new Set(prefs(campaign, this.state.variant, "initial").map((id) => technique(this.scenario, id).leadsTo!))]
        : prefs(campaign, this.state.variant, stage);
    const items = options
      .map((id, index) => {
        const tech = technique(this.scenario, id);
        const acting = controls.filter((entry) => control(this.scenario, entry).effects[id]);
        const blocked = acting.some((entry) => control(this.scenario, entry).effects[id] === "block");
        return `<li class="${blocked ? "blocked" : ""}" title="${esc(tech.detail)} (${tech.attack})">
          ${options.length > 1 && stage !== "execution" ? `<i class="ord">${index + 1}</i>` : ""}<span>${esc(tech.name)}</span>
          ${acting.map((entry) => `<em class="eff ${control(this.scenario, entry).effects[id]}">${ICONS[control(this.scenario, entry).effects[id]]}${esc(control(this.scenario, entry).short)}</em>`).join("")}
        </li>`;
      })
      .join("");
    return `<div class="cell plan" role="cell"><ul>${items}</ul>${stage === "execution" && options.length > 1 ? `<span class="muted tiny">Depends on how they got in</span>` : ""}</div>`;
  }

  private runCell(run: CampaignRun, stage: StageId, col: number): string {
    const step = run.steps.find((entry) => entry.stage === stage);
    if (this.animating && col >= this.reveal) return `<div class="cell pending" role="cell"></div>`;
    if (!step) return `<div class="cell unused" role="cell"><span>Not reached</span></div>`;
    const tech = technique(this.scenario, step.technique);
    const by = step.by.map((id) => control(this.scenario, id).short).join(" + ");
    const fresh = this.animating && col === this.reveal - 1 ? "fresh" : "";
    return `<div class="cell res r-${step.result} ${fresh}" role="cell" title="${esc(tech.detail)}">
      <span class="badge">${ICONS[step.result === "ran" ? "cross" : step.result === "detected" ? "detect" : step.result === "recovered" ? "recover" : "block"]}${RESULT_LABEL[step.result]}</span>
      ${step.skipped.length ? `<s class="tiny">${step.skipped.map((id) => esc(technique(this.scenario, id).name)).join(" · ")}</s>` : ""}
      <strong>${esc(tech.name)}</strong>
      ${by ? `<span class="by">${step.result === "blocked" ? "by" : step.result === "contained" ? "by" : step.result === "recovered" ? "limited by" : "seen by"} ${esc(by)}</span>` : ""}
      ${step.unanswered ? `<span class="warn-text tiny">Alert raised, nobody responded</span>` : ""}
    </div>`;
  }

  private renderCatalog(): void {
    const planning = this.state.phase === "plan";
    const groups = this.scenario.stages.map((stage) => ({ stage, items: this.scenario.controls.filter((entry) => primaryStage(this.scenario, entry) === stage.id) }));
    $("#catalog").innerHTML = `
      <div class="col-head"><h2>${ICONS.layers}Controls</h2><span>${this.state.creditsLeft} credits</span></div>
      <div class="d-scroll">
        ${groups
          .filter((group) => group.items.length)
          .map(
            (group) => `<h4 class="sub-head">${stageIcon(group.stage.id)}${esc(group.stage.name)}</h4>
            ${group.items.map((entry) => this.controlCard(entry, planning)).join("")}`,
          )
          .join("")}
      </div>`;
  }

  private controlCard(entry: Control, planning: boolean): string {
    const locked = this.state.locked.includes(entry.id);
    const added = this.state.added.includes(entry.id);
    const effects = (["block", "detect", "recover"] as const)
      .map((effect) => {
        const list = Object.entries(entry.effects).filter(([, value]) => value === effect).map(([id]) => technique(this.scenario, id).name);
        return list.length ? `<li class="eff-line ${effect}">${ICONS[effect]}<span><b>${effect === "block" ? "Blocks" : effect === "detect" ? "Detects" : "Recovers from"}</b> ${esc(list.join(" · "))}</span></li>` : "";
      })
      .join("");
    let button: string;
    if (locked) button = `<span class="state">${ICONS.lock}In service</span>`;
    else if (added) button = `<button class="btn small-btn" data-act="remove" data-id="${entry.id}" data-key="c-${entry.id}" ${planning ? "" : "disabled"}>${ICONS.minus}Remove</button>`;
    else button = `<button class="btn small-btn primary" data-act="deploy" data-id="${entry.id}" data-key="c-${entry.id}" ${planning && entry.cost <= this.state.creditsLeft ? "" : "disabled"} aria-label="Deploy ${esc(entry.name)}, ${entry.cost} credits">${ICONS.plus}Deploy</button>`;
    return `<article class="ctl ${locked ? "locked" : added ? "added" : ""}">
      <header><strong>${esc(entry.name)}</strong><span class="cost" title="Cost">${entry.cost}</span></header>
      <p class="small">${esc(entry.detail)}</p>
      <ul class="effects">${effects}${entry.responds ? `<li class="eff-line responds">${ICONS.responds}<span><b>Responds</b> to every detection, one stage later</span></li>` : ""}</ul>
      <footer><span class="fr fr-${entry.friction}" title="${esc(entry.frictionNote)}">${ICONS.friction}Friction ${entry.friction}<em>${esc(entry.frictionNote)}</em></span>${button}</footer>
    </article>`;
  }

  // Stages where every technique this campaign could use is blocked, as the board shows it.
  private blockedStages(campaign: Campaign, controls: readonly string[]): string[] {
    const blocks = (id: string) => controls.some((entry) => control(this.scenario, entry).effects[id] === "block");
    return this.scenario.stages
      .filter((stage) => {
        const options =
          stage.id === "execution"
            ? [...new Set(prefs(campaign, this.state.variant, "initial").map((id) => technique(this.scenario, id).leadsTo!))]
            : prefs(campaign, this.state.variant, stage.id);
        return options.every(blocks);
      })
      .map((stage) => stage.name.toLowerCase());
  }

  // The "Next" bar above the board: one plain instruction for the current moment, and a pulsing
  // ring on whatever it asks you to click. It reads the board out loud; it never runs the wave.
  private renderNext(): void {
    const bar = $("#next-step");
    const wave = currentWave(this.state);
    const runLabel = `Run ${wave.title.split(":")[0]}`;
    let tone = "";
    let label = "Next";
    let text: string;
    let hint = "";
    let targets: string[] = [];
    if (this.state.phase !== "plan") {
      const record = this.state.records[this.state.records.length - 1];
      if (this.animating) {
        label = "Running";
        text = `Watch each campaign move left to right. <strong>Blocked</strong> and <strong>Contained</strong> stop it; <strong>Ran</strong> means it got through that stage.`;
      } else if (record.check && !record.answer) {
        text = `<strong>Read the wave report</strong> on the left: green stops had a backup layer, amber ones were a single point of failure, red ones got through. Then answer the question.`;
        targets = ["#intel .check"];
      } else {
        tone = "ready";
        label = "Done";
        text = `Press <strong>${this.state.waveIndex + 1 < this.scenario.waves.length ? "Plan the next wave" : "See debrief"}</strong> on the left. Controls you bought stay in service.`;
        targets = ['[data-act="next"]'];
      }
    } else {
      const controls = deployed(this.state);
      const friction = frictionOf(this.scenario, controls);
      const cheapest = Math.min(...this.scenario.controls.filter((entry) => !controls.includes(entry.id)).map((entry) => entry.cost));
      const open = wave.campaigns.filter((campaign) => this.blockedStages(campaign, controls).length === 0);
      const thin = wave.campaigns.filter((campaign) => this.blockedStages(campaign, controls).length === 1);
      if (friction > wave.frictionAllowance) {
        tone = "warn";
        label = "Check";
        text = `Friction is <strong>${friction}</strong>, over the <strong>${wave.frictionAllowance}</strong> the business accepts this wave. That will cost friction points.`;
        hint = "Remove a high-friction control, or swap it for a quieter one that blocks the same technique.";
        targets = ["#status .count"];
      } else if (this.state.added.length === 0 && this.state.waveIndex === 0) {
        text = `Pick a control in the <strong>Controls</strong> panel on the right, read what it <strong>Blocks</strong>, and press <strong>Deploy</strong>. You have ${this.state.creditsLeft} credits.`;
        hint = "Start by finding a control that blocks a technique in one of the campaign rows on the board.";
        targets = ["#catalog .col-head"];
      } else if (open.length) {
        text = `From the board: <strong>${open.map((campaign) => esc(campaign.name)).join(", ")}</strong> ${open.length > 1 ? "are" : "is"} not fully blocked at any stage yet.`;
        hint = "Block every technique listed in one cell of that row, or rely on detection only if the 24×7 SOC is deployed to respond.";
      } else if (thin.length && this.state.creditsLeft >= cheapest) {
        text = `Every campaign is blocked somewhere. For depth, give <strong>${thin.map((campaign) => esc(campaign.name)).join(", ")}</strong> a second blocked stage, so one failed control does not let it through.`;
        hint = `Or press ${runLabel} now: you have ${this.state.creditsLeft} credits left, and they carry over.`;
        targets = ['[data-act="launch"]'];
      } else {
        tone = "ready";
        label = "Ready";
        text = `Your plan is in place. Press <strong>${runLabel}</strong> at the bottom right to see how it holds.`;
        targets = ['[data-act="launch"]'];
      }
    }
    renderNextStep(bar, { label, tone: tone as NextStep["tone"], text, hint, targets });
  }

  private renderFooter(): void {
    const steps = [
      { label: "Read the intel", done: true },
      { label: "Deploy controls", done: this.state.added.length > 0 || this.state.phase !== "plan" },
      { label: "Run the wave", done: this.state.phase !== "plan" },
    ];
    $("#steps").innerHTML = steps.map((step, index) => `<span class="${step.done ? "done" : ""}">${index + 1}. ${step.label}</span>`).join("<i></i>");
    $("#submit-slot").innerHTML =
      this.state.phase === "plan" ? `<button class="btn primary submit" data-act="launch" data-key="launch">${ICONS.play}Run ${esc(currentWave(this.state).title.split(":")[0])}</button>` : "";
  }
}

function tile(label: string, value: number, max: number, note: string): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${label}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}
