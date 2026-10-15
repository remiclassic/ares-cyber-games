import {
  ACTION_COSTS,
  APPROVED_SUPPLIERS,
  CHECKPOINTS,
  FINAL_CHALLENGE,
  NODE_BY_ID,
  NODES,
  ORG_POLICY,
  SETBACK_LIMIT,
  SETBACK_REPAIR_GRANT,
  TICKS_PER_SECOND,
  serviceLabel,
} from "../data/scenario";
import type { AresHost } from "../integration/host";
import { candidateAnchor, computeLayout, drawScene, gridToScreen, loadSprites, nodeHealth, nodeScreen, type Insets, type View } from "../render/renderer";
import { advance, apply, createGame, currentRound, flowsFor, inspectionAvailable, lastResult, roundsFor, step } from "../sim/engine";
import { describeRule } from "../sim/explain";
import { evaluate } from "../sim/policy";
import { createRng, shuffle } from "../sim/rng";
import { calculateScore } from "../sim/scoring";
import type { Assessment, Command, DestId, FlowDef, GameState, NodeId, Rule, ServiceId, SourceId } from "../sim/types";
import { play, setSoundEnabled } from "./audio";
import { $, announce, closeModal, esc, isModalOpen, pct, saveSettings, showModal, type Settings } from "./dom";

type RuleDraft = Omit<Rule, "id">;
type PanelMode =
  | { kind: "overview" }
  | { kind: "inspect" }
  | { kind: "evidence"; flow: SourceId }
  | { kind: "rule"; draft: RuleDraft; ruleId?: string }
  | { kind: "route" }
  | { kind: "node"; id: NodeId };

export type RunSummary = Readonly<{
  state: GameState;
  checkpoints: Record<string, { answer: string; correct: boolean }>;
  finalChallenge: { answer: string; correct: boolean } | null;
  startedAt: number;
}>;

const ICONS = { inspect: "🔍", rule: "🛡️", route: "⇄", revise: "✎" };
const ACTION_ART: Record<"inspect" | "rule" | "route" | "revise", string | null> = {
  inspect: "latency-trap",
  rule: "firewall",
  route: "relay",
  revise: null,
};
const SVG = {
  waves: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9c2.5-3 5.5-3 8 0s5.5 3 8 0"/><path d="M4 15c2.5-3 5.5-3 8 0s5.5 3 8 0"/></svg>`,
  shield: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/></svg>`,
};
const DEST_LABEL: Record<DestId, string> = { finance: "Finance", hr: "HR" };

export class GameController {
  state!: GameState;
  private panel: PanelMode = { kind: "overview" };
  private hoverCandidate: string | null = null;
  private focusFlow: SourceId | null = null;
  private guideStep = -1;
  private checkpoints: Record<string, { answer: string; correct: boolean }> = {};
  private finalChallenge: { answer: string; correct: boolean } | null = null;
  private startedAt = 0;
  private acc = 0;
  private last = 0;
  private frame = 0;
  private running = false;
  private canvas = $("#board") as HTMLCanvasElement;
  private ctx = this.canvas.getContext("2d")!;
  private size = { width: 0, height: 0, dpr: 1 };
  private lastPhase = "";
  private guideTarget: HTMLElement | null = null;
  private guideTargetFn: (() => HTMLElement | null) | null = null;

  constructor(
    private settings: Settings,
    private host: AresHost,
    private onFinish: (summary: RunSummary) => void,
    private onExit: () => void,
  ) {
    void loadSprites();
    new ResizeObserver(() => this.resize()).observe($("#board-wrap"));
    $("#panel").addEventListener("click", (event) => this.onPanelClick(event));
    $("#panel").addEventListener("change", (event) => this.onPanelChange(event));
    $("#panel").addEventListener("mouseover", (event) => this.onPanelHover(event));
    $("#panel").addEventListener("mouseout", () => {
      if (this.hoverCandidate) this.hoverCandidate = null;
    });
    $("#dock").addEventListener("click", (event) => this.onDockClick(event));
    $("#hud").addEventListener("click", (event) => this.onHudClick(event));
    $("#board-overlay").addEventListener("click", (event) => this.onOverlayClick(event));
    $("#board-overlay").addEventListener("mouseover", (event) => {
      this.hoverCandidate = (event.target as HTMLElement).closest<HTMLElement>("[data-candidate]")?.dataset.candidate ?? null;
    });
    $("#board-overlay").addEventListener("focusin", (event) => {
      this.hoverCandidate = (event.target as HTMLElement).closest<HTMLElement>("[data-candidate]")?.dataset.candidate ?? null;
    });
    document.addEventListener("keydown", (event) => this.onKey(event));
    window.addEventListener("resize", () => this.positionCoach());
  }

  start(seed: string, withGuide: boolean): void {
    this.state = createGame(seed);
    this.panel = { kind: "overview" };
    this.checkpoints = {};
    this.finalChallenge = null;
    this.startedAt = Date.now();
    this.guideStep = -1;
    this.focusFlow = null;
    this.host.started(seed);
    this.refresh();
    this.resize();
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
    this.showIntro(withGuide);
  }

  stop(): void {
    this.running = false;
    this.hideCoach();
  }

  applySettings(settings: Settings): void {
    this.settings = settings;
    setSoundEnabled(settings.sound);
  }

  // ---------------------------------------------------------------- loop
  private loop(now: number): void {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.state;
    if (s.phase === "running" && !isModalOpen()) {
      this.acc += dt * (this.settings.fast ? 2 : 1);
      const stepDuration = 1 / TICKS_PER_SECOND;
      while (this.acc >= stepDuration && s.phase === "running") {
        this.acc -= stepDuration;
        const before = this.counts();
        step(s);
        this.cue(before);
      }
      if (s.phase !== "running") this.acc = 0;
    }
    this.draw(now);
    this.frame += 1;
    if (s.phase !== this.lastPhase) {
      this.lastPhase = s.phase;
      this.onPhaseChange();
    } else if (s.phase === "running" && this.frame % 12 === 0) {
      this.renderHud();
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  private counts() {
    const s = this.state.stats;
    return { d: s.supplier.delivered + s.hrstaff.delivered, b: s.supplier.blocked + s.hrstaff.blocked + s.unknown.blocked, x: s.unknown.delivered };
  }

  private cue(before: ReturnType<GameController["counts"]>): void {
    const after = this.counts();
    if (after.x > before.x) play("alarm");
    else if (after.b > before.b) play("block");
    else if (after.d > before.d) play("deliver");
  }

  private draw(now: number): void {
    const { width, height, dpr } = this.size;
    if (!width) return;
    const view: View = {
      width,
      height,
      dpr,
      time: now,
      alpha: this.acc * TICKS_PER_SECOND,
      reducedMotion: this.settings.reducedMotion,
      selectedNode: this.panel.kind === "node" ? this.panel.id : null,
      candidates: this.panel.kind === "route" || (this.guideStep >= 1 && this.guideStep <= 2) ? currentRound(this.state).candidates : [],
      hoverCandidate: this.hoverCandidate,
      focusFlow: this.focusFlow,
      insets: this.boardInsets(),
    };
    drawScene(this.ctx, this.state, view);
  }

  // Space the floating HUD, decision card and action cards leave for the board.
  private boardInsets(): Insets {
    const panel = $("#panel");
    if (getComputedStyle(panel).position !== "absolute") return { top: 0, right: 0, bottom: 0, left: 0 };
    const wrap = $("#board-wrap").getBoundingClientRect();
    const hud = $("#hud").getBoundingClientRect();
    const dock = $("#dock").getBoundingClientRect();
    const side = panel.getBoundingClientRect();
    return { top: hud.bottom - wrap.top + 44, right: wrap.right - side.left + 6, bottom: wrap.bottom - dock.top + 4, left: 12 };
  }

  private resize(): void {
    const wrap = $("#board-wrap");
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = { width: rect.width, height: rect.height, dpr };
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.renderOverlay();
    this.positionCoach();
  }

  // ---------------------------------------------------------------- phase flow
  private onPhaseChange(): void {
    const s = this.state;
    this.refresh();
    if (s.phase === "paused" && s.pause && s.pause.eventKey !== "manual") {
      play("setback");
      announce(`${s.pause.title}. ${s.pause.message}`);
      showModal({
        kicker: "Simulation paused",
        title: s.pause.title,
        body: `<p>${esc(s.pause.message)}</p><p class="hint">The wave waits while you plan. Press <span class="kbd">L</span> or <strong>Resume</strong> when ready.</p>`,
        actions: [
          { label: "Plan my response", primary: true, onClick: () => this.openForPause() },
        ],
      });
    } else if (s.phase === "roundEnd") {
      this.showRoundResult();
    }
  }

  private openForPause(): void {
    const s = this.state;
    if (s.pause?.eventKey.startsWith("arrive:")) {
      this.focusFlow = "unknown";
      this.setPanel({ kind: "inspect" });
    } else {
      this.setPanel({ kind: "route" });
    }
  }

  private showIntro(withGuide: boolean): void {
    const def = currentRound(this.state);
    showModal({
      kicker: "Interactive practice · about 5 minutes",
      title: "Keep Finance Online",
      wide: true,
      body: `
        <p>You run a small organization's network. Requests travel from the <strong>Internet</strong> through a <strong>Gateway</strong> to services such as <strong>HR</strong> and <strong>Finance</strong>.</p>
        <p><strong>Your challenge:</strong> protect the network <em>and</em> keep services available. Blocking everything protects nothing useful if the organization can no longer work.</p>
        <div class="two-col">
          <div class="card">
            <h3 style="margin-top:0">Each round</h3>
            <ol class="policy">
              <li>Read the objective.</li>
              <li>Inspect the board and evidence.</li>
              <li>Spend action points (AP) on actions.</li>
              <li>Launch the wave and watch the result.</li>
              <li>Read the explanation, then adapt.</li>
            </ol>
          </div>
          <div class="card">
            <h3 style="margin-top:0">Reading traffic</h3>
            <div class="legend-grid">
              <i class="glyph amber" aria-hidden="true">?</i><span><strong>Amber diamond:</strong> needs review. All new traffic starts here.</span>
              <i class="glyph cyan" aria-hidden="true">✓</i><span><strong>Cyan circle:</strong> you judged it permitted.</span>
              <i class="glyph red" aria-hidden="true">✕</i><span><strong>Red square:</strong> you judged it a policy violation.</span>
            </div>
            <p class="hint">Colors reflect <em>your</em> judgment after inspecting — the game never reveals the answer by color.</p>
          </div>
        </div>
        <p class="hint">Planning pauses the simulation. Nothing requires fast clicking. Keyboard: <span class="kbd">1</span>–<span class="kbd">4</span> actions, <span class="kbd">L</span> launch/resume, <span class="kbd">P</span> pause, <span class="kbd">?</span> help.</p>
        <div class="card"><strong>${esc(def.title)}</strong><p class="situation">${esc(def.situation)}</p></div>`,
      actions: [
        ...(withGuide ? [{ label: "Skip guide", onClick: () => this.afterIntro(false) }] : []),
        { label: withGuide ? "Start with guide" : "Start", primary: true, onClick: () => this.afterIntro(withGuide) },
      ],
    });
  }

  private afterIntro(guide: boolean): void {
    if (guide) {
      this.guideStep = 0;
      this.showCoach();
    }
    announce(`Objective: ${currentRound(this.state).objective}`);
  }

  private showRoundIntro(kind: "next" | "repeat"): void {
    const s = this.state;
    const def = currentRound(s);
    const extra =
      kind === "repeat"
        ? `<p><strong>Repair and replay.</strong> You received ${SETBACK_REPAIR_GRANT} AP to repair. Your earlier changes are still in place — use <strong>Revise</strong> (${ACTION_COSTS.revise} AP) to change or remove them, or try something new.</p>`
        : def.id === "review"
          ? `<div class="card"><strong>${ICONS.rule} Access rules unlocked.</strong><p>Rules match a <em>source</em>, <em>destination</em>, and <em>service</em>. The gateway checks <strong>DENY rules first</strong>, then ALLOW rules; anything unmatched is denied.</p></div>`
          : def.id === "recover"
            ? `<div class="card"><strong>${ICONS.route} Backup routes available.</strong><p>A backup route creates an alternate connection. All traffic still enters through the Gateway, so your rules apply on every path.</p></div>`
            : "";
    showModal({
      kicker: kind === "repeat" ? `Attempt ${s.attempt + 1}` : `+${def.apGrant} AP`,
      title: def.title,
      body: `<p class="situation">${esc(def.situation)}</p><p><strong>Objective:</strong> ${esc(def.objective)}</p>${extra}`,
      actions: [{ label: "Plan this round", primary: true, onClick: () => announce(`Objective: ${def.objective}`) }],
    });
  }

  private showRoundResult(): void {
    const s = this.state;
    const result = lastResult(s)!;
    const flows = flowsFor(s);
    const def = currentRound(s);
    const score = calculateScore(s);
    play(result.outcome === "success" ? "success" : result.outcome === "setback" ? "setback" : "fail");
    const rows = def.flows
      .map((id) => {
        const st = result.stats[id];
        return `<tr><td>${esc(this.flowName(flows[id]))} → ${DEST_LABEL[flows[id].dest]}</td><td>${st.delivered}</td><td>${st.blocked}</td><td>${st.failed}</td></tr>`;
      })
      .join("");
    const outcomeLabel = { success: "✓ Success", setback: "↺ Recoverable setback", retry: "✕ Retry" }[result.outcome];
    announce(`${outcomeLabel}. ${result.explanations.join(" ")}`);
    const continueLabel =
      result.outcome === "success" ? (s.round + 1 >= 3 ? "Continue to final challenge" : "Continue") : result.outcome === "setback" ? "Repair and replay round" : "Retry scenario";
    showModal({
      kicker: def.title,
      title: result.headline,
      wide: true,
      body: `
        <span class="outcome ${result.outcome}">${outcomeLabel}</span>
        ${result.outcome !== "success" ? `<span class="muted" style="margin-left:8px">Setbacks ${s.setbacks} of ${SETBACK_LIMIT}</span>` : ""}
        <ul class="explain">${result.explanations.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
        <table class="stat-table"><thead><tr><th>Traffic</th><th>Delivered</th><th>Denied at gateway</th><th>Failed / lost</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="hint">Run score so far — Service ${pct(score.service)} · Security ${pct(score.security)} · Efficiency ${pct(score.efficiency)}</p>`,
      actions: [{ label: continueLabel, primary: true, onClick: () => this.afterResult() }],
    });
  }

  private afterResult(): void {
    const s = this.state;
    const result = lastResult(s)!;
    const def = currentRound(s);
    if (result.outcome === "success" && def.checkpoint && !this.checkpoints[def.checkpoint]) {
      this.showCheckpoint(def.checkpoint, () => this.afterResult());
      return;
    }
    const next = advance(s);
    this.panel = { kind: "overview" };
    this.focusFlow = null;
    this.refresh();
    if (next === "next") this.showRoundIntro("next");
    else if (next === "repeat") this.showRoundIntro("repeat");
    else if (next === "complete") this.showFinalChallenge();
    else {
      this.host.record({ verb: "retried", object: "scenario", result: { setbacks: s.setbacks } });
      showModal({
        kicker: "Failure limit reached",
        title: "Let's try that again",
        body: `<p>The network had ${SETBACK_LIMIT} setbacks. You'll restart with different traffic and a different failure, so the same lessons apply in a fresh situation.</p>`,
        actions: [{ label: "Retry scenario", primary: true, onClick: () => this.start(`retry-${Date.now().toString(36)}`, false) }],
      });
    }
  }

  private showCheckpoint(id: string, then: () => void): void {
    const checkpoint = CHECKPOINTS[id];
    let chosen: string | null = null;
    const modal = showModal({
      kicker: "Reasoning checkpoint",
      title: checkpoint.prompt,
      body: `<div class="choice-row" role="radiogroup">${this.shuffled(checkpoint.options, id)
        .map((option) => `<button class="btn" role="radio" aria-checked="false" data-option="${option.id}">${esc(option.text)}</button>`)
        .join("")}</div><div class="card" id="cp-feedback" hidden></div>`,
      actions: [{ label: "Continue", primary: true, onClick: then }],
      onMount: (root) => {
        const continueButton = root.querySelector<HTMLButtonElement>(".actions .btn")!;
        continueButton.disabled = true;
        root.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((button) =>
          button.addEventListener("click", () => {
            if (chosen) return;
            chosen = button.dataset.option!;
            const option = checkpoint.options.find((item) => item.id === chosen)!;
            this.checkpoints[id] = { answer: option.id, correct: option.correct };
            this.host.record({ verb: "answered", object: `checkpoint:${id}`, result: { answer: option.id, correct: option.correct } });
            root.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((b) => {
              b.setAttribute("aria-checked", String(b === button));
              b.setAttribute("aria-pressed", String(b === button));
              b.disabled = b !== button;
            });
            const feedback = root.querySelector<HTMLElement>("#cp-feedback")!;
            feedback.hidden = false;
            const correct = checkpoint.options.find((item) => item.correct)!;
            feedback.innerHTML = `<strong>${option.correct ? "✓ Well reasoned." : "Not quite."}</strong><p>${esc(option.feedback)}</p>${
              option.correct ? "" : `<p class="hint">Stronger reason: “${esc(correct.text)}”</p>`
            }`;
            continueButton.disabled = false;
            continueButton.focus();
            announce(feedback.textContent ?? "");
          }),
        );
      },
    });
    void modal;
  }

  private showFinalChallenge(): void {
    let chosen: string | null = null;
    showModal({
      kicker: "Final challenge · no hints",
      title: "Apply it to a fresh example",
      wide: true,
      body: `<p>${esc(FINAL_CHALLENGE.prompt)}</p><div class="choice-row" role="radiogroup">${this.shuffled(FINAL_CHALLENGE.options, "final")
        .map((option) => `<button class="btn" role="radio" aria-checked="false" data-option="${option.id}" style="font-family:ui-monospace,Consolas,monospace">${esc(option.text)}</button>`)
        .join("")}</div><div class="card" id="fc-feedback" hidden></div>`,
      actions: [{ label: "See your debrief", primary: true, onClick: () => this.finish() }],
      onMount: (root) => {
        const continueButton = root.querySelector<HTMLButtonElement>(".actions .btn")!;
        continueButton.disabled = true;
        root.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((button) =>
          button.addEventListener("click", () => {
            if (chosen) return;
            chosen = button.dataset.option!;
            const option = FINAL_CHALLENGE.options.find((item) => item.id === chosen)!;
            this.finalChallenge = { answer: option.id, correct: option.correct };
            this.host.record({ verb: "answered", object: "final-challenge", result: { answer: option.id, correct: option.correct } });
            root.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((b) => {
              b.setAttribute("aria-checked", String(b === button));
              b.setAttribute("aria-pressed", String(b === button));
              b.disabled = b !== button;
            });
            const feedback = root.querySelector<HTMLElement>("#fc-feedback")!;
            feedback.hidden = false;
            feedback.innerHTML = `<strong>${option.correct ? "✓ Correct." : "Not the best fit."}</strong><p>${esc(FINAL_CHALLENGE.feedback[option.id])}</p>`;
            continueButton.disabled = false;
            continueButton.focus();
            announce(feedback.textContent ?? "");
          }),
        );
      },
    });
  }

  private finish(): void {
    this.stop();
    this.onFinish({ state: this.state, checkpoints: this.checkpoints, finalChallenge: this.finalChallenge, startedAt: this.startedAt });
  }

  // ---------------------------------------------------------------- commands
  private run(command: Command): boolean {
    const result = apply(this.state, command);
    if (!result.ok) {
      announce(result.error);
      const err = document.querySelector("#panel .err");
      if (err) err.textContent = result.error;
      return false;
    }
    play("click");
    this.record(command);
    this.advanceGuide(command);
    this.refresh();
    return true;
  }

  private record(command: Command): void {
    const verb =
      command.type === "inspect" ? "inspected" : command.type === "assess" ? "assessed" : command.type === "launch" ? "launched" : "configured";
    if (command.type === "pause") return;
    const detail =
      command.type === "addRule"
        ? describeRule(command.rule, this.state)
        : command.type === "reviseRule"
          ? command.rule
            ? `revise ${command.ruleId} → ${describeRule(command.rule, this.state)}`
            : `remove ${command.ruleId}`
          : JSON.stringify(command);
    this.host.record({ verb, object: `${currentRound(this.state).id}:${command.type}`, result: { detail, ap: this.state.ap } });
  }

  private launchOrResume(): void {
    const s = this.state;
    if (s.phase === "planning" || s.phase === "paused") {
      closeModal();
      this.run({ type: "launch" });
      announce(s.tick === 0 ? "Wave launched." : "Resumed.");
    }
  }

  private pauseIfRunning(): void {
    if (this.state.phase === "running") this.run({ type: "pause" });
  }

  // ---------------------------------------------------------------- rendering
  refresh(): void {
    this.renderHud();
    this.renderDock();
    this.renderPanel();
    this.renderOverlay();
    this.renderBanner();
  }

  private renderBanner(): void {
    const s = this.state;
    const banner = $("#status-banner");
    banner.className = `status-banner ${s.phase}`;
    banner.textContent =
      s.phase === "planning"
        ? "Planning — simulation paused"
        : s.phase === "paused"
          ? `Paused${s.pause && s.pause.eventKey !== "manual" ? ` — ${s.pause.title}` : ""}`
          : s.phase === "running"
            ? `Wave in progress${this.settings.fast ? " · 2×" : ""}`
            : "";
  }

  private renderHud(): void {
    const s = this.state;
    const def = currentRound(s);
    const score = calculateScore(s);
    const total = roundsFor(s).length;
    const wave = s.phase === "roundEnd" ? 1 : s.schedule.length ? s.spawnIndex / s.schedule.length : 0;
    const row = (label: string, value: number, tone: string, title: string) =>
      `<div class="integrity-row" title="${title}"><span>${label}</span><div class="meter ${tone}"><i style="width:${Math.round(value * 100)}%"></i></div><b>${pct(value)}</b></div>`;
    $("#hud").innerHTML = `
      <div class="hud-tile round">
        <span class="hud-icon" aria-hidden="true">${SVG.waves}</span>
        <div class="grow">
          <div class="hud-v">Round ${s.round + 1}<small>/ ${total} · ${esc(def.title.replace(/^Round \d+ — /, ""))}${s.attempt ? ` · attempt ${s.attempt + 1}` : ""}</small></div>
          <div class="meter gold" aria-hidden="true"><i style="width:${Math.round(wave * 100)}%"></i></div>
          <div class="hud-sub">${esc(def.objective)}</div>
        </div>
      </div>
      <div class="hud-tile ap" aria-label="Action points: ${s.ap} available">
        <span class="hud-icon" aria-hidden="true"><span class="coin"></span></span>
        <div><div class="hud-k">Action points</div><div class="hud-v">${s.ap}<small>+${def.apGrant} / round</small></div></div>
      </div>
      <div class="hud-tile integrity" aria-label="Score components">
        <span class="hud-icon" aria-hidden="true">${SVG.shield}</span>
        <div class="integrity-rows">
          ${row("Service", score.service, "green", "Approved requests delivered")}
          ${row("Security", score.security, "blue", "Prohibited requests denied")}
          ${row("Efficiency", score.efficiency, "gold", "Action points used wisely")}
        </div>
      </div>
      <div class="hud-tile hud-tools">
        <div class="pips" aria-label="Setbacks ${s.setbacks} of ${SETBACK_LIMIT}">${Array.from({ length: SETBACK_LIMIT }, (_, i) => `<span class="pip ${i < s.setbacks ? "on" : ""}" title="Setbacks"></span>`).join("")}</div>
        <button class="icon-btn" data-hud="help" aria-label="Help and controls">?</button>
        <button class="icon-btn" data-hud="settings" aria-label="Settings">⚙</button>
        <button class="icon-btn" data-hud="exit" aria-label="Exit practice">✕</button>
      </div>`;
  }

  private renderDock(): void {
    const s = this.state;
    const def = currentRound(s);
    const active = this.panel.kind;
    const card = (kind: "inspect" | "rule" | "route" | "revise", key: string, name: string, desc: string) => {
      const allowed = def.allowedActions.includes(kind);
      const cost = ACTION_COSTS[kind];
      const affordable = s.ap >= cost;
      const locked = !allowed ? (kind === "rule" ? "Unlocks in round 2" : "Not needed this round") : !affordable ? "Not enough AP" : "";
      const pressed =
        (kind === "inspect" && (active === "inspect" || active === "evidence")) ||
        (kind === "rule" && active === "rule") ||
        (kind === "route" && active === "route");
      const art = ACTION_ART[kind];
      return `<button class="action-card" data-action="${kind}" ${allowed && affordable && s.phase !== "roundEnd" ? "" : "disabled"} aria-pressed="${pressed}" aria-keyshortcuts="${key}" aria-label="${name}, ${cost} action points. ${locked || desc}">
        <span class="art" aria-hidden="true">${art ? `<img src="./assets/${art}.png" alt="" />` : `<span class="glyph-art">${ICONS.revise}</span>`}</span>
        <span class="nm">${name}</span>
        <span class="price" aria-hidden="true"><span class="coin"></span>${cost}</span>
        <span class="ds" aria-hidden="true">${locked ? esc(locked) : esc(desc)} <kbd>${key}</kbd></span>
      </button>`;
    };
    const launchLabel = s.phase === "planning" ? "▶ Launch wave" : s.phase === "paused" ? "▶ Resume" : s.phase === "running" ? "❚❚ Pause" : "…";
    $("#dock").innerHTML = `
      ${card("inspect", "1", "Inspect", "Reveals evidence")}
      ${card("rule", "2", "Access rule", "Allow or deny traffic")}
      ${card("route", "3", def.id === "recover" ? "Backup route" : "Add route", "Connects services")}
      ${card("revise", "4", "Revise", "Change a decision")}
      <button class="btn primary launch" data-action="launch" aria-keyshortcuts="L" ${s.phase === "roundEnd" || s.phase === "complete" ? "disabled" : ""}>${launchLabel}</button>`;
  }

  private flowName(flow: FlowDef): string {
    return this.state.inspected.includes(flow.id) ? `${flow.label} (${flow.address})` : flow.address;
  }

  private glyph(assessment: Assessment | undefined): string {
    if (assessment === "permitted") return `<i class="glyph cyan" aria-label="Judged permitted">✓</i>`;
    if (assessment === "violates") return `<i class="glyph red" aria-label="Judged violation">✕</i>`;
    return `<i class="glyph amber" aria-label="Needs review">?</i>`;
  }

  private renderPanel(): void {
    const panel = $("#panel");
    const s = this.state;
    const def = currentRound(s);
    const flows = flowsFor(s);
    const back = `<button class="btn small ghost back" data-act="overview">← Back to overview</button>`;
    const art = (sprite: string) => `<div class="panel-art" aria-hidden="true"><img src="./assets/${sprite}.png" alt="" /></div>`;
    let html = "";

    switch (this.panel.kind) {
      case "overview": {
        html = `
          <div class="kicker">${esc(def.title)}</div>
          <h2>${esc(def.objective)}</h2>
          <p class="situation">${esc(def.situation)}</p>
          ${s.pause && s.pause.eventKey !== "manual" ? `<div class="card" style="border-color:var(--amber)"><strong>${esc(s.pause.title)}</strong><p>${esc(s.pause.message)}</p></div>` : ""}
          <h3>Traffic this round</h3>
          ${def.flows.map((id) => this.flowCard(flows[id])).join("")}
          <h3>Gateway rules</h3>
          <p class="rule-order">Checked in order: <strong>DENY</strong> rules → <strong>ALLOW</strong> rules → otherwise denied.</p>
          ${this.rulesList()}
          ${s.builtRoutes.length ? `<h3>Routes you built</h3>${this.routesList()}` : ""}
          <h3>Organization policy</h3>
          <div class="card"><ol class="policy">${ORG_POLICY.map((line) => `<li>${esc(line)}</li>`).join("")}</ol>
          <p class="hint">Approved suppliers: ${APPROVED_SUPPLIERS.map(esc).join(", ")}</p></div>`;
        break;
      }
      case "inspect": {
        html = `${back}<div class="kicker">Action · ${ACTION_COSTS.inspect} AP</div><h2>Inspect activity</h2>${art("latency-trap")}
          <p class="hint">Inspection reveals request details recorded at the Inspection Point. It does not decide for you — compare the evidence with the organization's policy.</p>
          ${def.flows.map((id) => this.flowCard(flows[id], true)).join("")}`;
        break;
      }
      case "evidence": {
        const flow = flows[this.panel.flow];
        const assessment = s.assessments[flow.id];
        const opt = (verdict: Assessment, label: string) =>
          `<button class="btn" data-act="assess" data-flow="${flow.id}" data-verdict="${verdict}" aria-pressed="${assessment === verdict}">${label}</button>`;
        html = `${back}<div class="kicker">Evidence · Inspection Point</div><h2>${esc(flow.address)}</h2>
          <div class="card"><ul class="evidence">${flow.evidence.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
          <h3>Compare with policy</h3>
          <div class="card"><ol class="policy">${ORG_POLICY.map((line) => `<li>${esc(line)}</li>`).join("")}</ol>
          <p class="hint">Approved suppliers: ${APPROVED_SUPPLIERS.map(esc).join(", ")}</p></div>
          <h3>Your judgment (free)</h3>
          <div class="choice-row">
            ${opt("permitted", `${this.glyph("permitted")} Permitted by policy`)}
            ${opt("violates", `${this.glyph("violates")} Violates policy`)}
            ${opt("unsure", `${this.glyph(undefined)} Not sure yet`)}
          </div>
          <p class="hint">Your judgment colors this traffic on the board. Only your rules change what the gateway does.</p>
          ${def.allowedActions.includes("rule") ? `<button class="btn primary" style="margin-top:12px" data-act="rule-for" data-flow="${flow.id}">${ICONS.rule} Write a rule for this traffic</button>` : ""}`;
        break;
      }
      case "rule": {
        const draft = this.panel.draft;
        const editing = this.panel.ruleId;
        const cost = editing ? ACTION_COSTS.revise : ACTION_COSTS.rule;
        const sourceOptions = [`<option value="any">Any external source</option>`, ...def.flows.map((id) => `<option value="${id}" ${draft.source === id ? "selected" : ""}>${esc(this.flowName(flows[id]))}</option>`)];
        const services: ServiceId[] = ["invoice", "hrportal", "admin"];
        html = `${back}<div class="kicker">Action · ${cost} AP</div><h2>${editing ? "Revise rule" : "Apply access rule"}</h2>${art("firewall")}
          <div class="form-grid">
            <div><span class="hint">Action</span><br/><div class="seg" role="group" aria-label="Rule action">
              <button class="deny" data-act="draft-action" data-value="deny" aria-pressed="${draft.action === "deny"}">DENY</button>
              <button class="allow" data-act="draft-action" data-value="allow" aria-pressed="${draft.action === "allow"}">ALLOW</button>
            </div></div>
            <label>Source<select data-field="source">${sourceOptions.join("")}</select></label>
            <label>Destination<select data-field="dest">
              <option value="any" ${draft.dest === "any" ? "selected" : ""}>Any destination</option>
              <option value="finance" ${draft.dest === "finance" ? "selected" : ""}>Finance</option>
              <option value="hr" ${draft.dest === "hr" ? "selected" : ""}>HR</option>
            </select></label>
            <label>Service<select data-field="service">
              <option value="any" ${draft.service === "any" ? "selected" : ""}>Any</option>
              ${services.map((id) => `<option value="${id}" ${draft.service === id ? "selected" : ""}>${esc(serviceLabel(id, s.variant))}</option>`).join("")}
            </select></label>
            <div class="preview" id="rule-preview">${this.rulePreview(draft, editing)}</div>
            <div class="err" role="alert"></div>
            <button class="btn primary" data-act="rule-apply">${editing ? "Save revision" : "Apply rule"} (${cost} AP)</button>
          </div>`;
        break;
      }
      case "route": {
        const routeWord = def.id === "recover" ? "backup route" : "route";
        html = `${back}<div class="kicker">Action · ${ACTION_COSTS.route} AP</div><h2>Add ${routeWord}</h2>${art("relay")}
          <p class="hint">Dashed lines on the board show where a connection can be built. Traffic takes the shortest working path, and every path still starts at the Gateway.</p>
          ${def.candidates
            .map((candidate) => {
              const built = s.builtRoutes.includes(candidate.id);
              return `<div class="card route-option" data-candidate="${candidate.id}">
                <span class="label"><span class="pin">${this.optionLetter(candidate.id)}</span> ${esc(candidate.label)}</span>
                <span class="hint">${esc(candidate.description)}</span>
                <div>${built ? `<span class="outcome success">Built</span>` : `<button class="btn small primary" data-act="build" data-route="${candidate.id}">Build (${ACTION_COSTS.route} AP)</button>`}</div>
              </div>`;
            })
            .join("") || `<p class="muted">No new connections are available this round.</p>`}
          <div class="err" role="alert"></div>
          ${s.builtRoutes.length ? `<h3>Built routes</h3>${this.routesList()}` : ""}`;
        break;
      }
      case "node": {
        const node = NODE_BY_ID[this.panel.id];
        const health = nodeHealth(s, node.id);
        const links = s.links.filter((link) => link.a === node.id || link.b === node.id);
        html = `${back}<div class="kicker">${esc(node.zone)} zone</div><h2>${esc(node.label)}</h2>${art(node.sprite)}
          <p>${esc(node.role)}</p>
          ${health !== "idle" ? `<p><strong>Status:</strong> ${health === "online" ? "Online" : health === "offline" ? "Offline — missing a connection or dependency" : "Unauthorized access occurred"}</p>` : ""}
          <h3>Connections</h3>
          ${links.length ? `<ul class="policy">${links.map((link) => `<li>${esc(NODE_BY_ID[link.a === node.id ? link.b : link.a].label)} — ${link.status === "up" ? (link.kind === "backup" ? "backup link" : "up") : "DOWN"}</li>`).join("")}</ul>` : `<p class="muted">Not connected.</p>`}
          ${node.dependsOn ? `<p class="hint">Depends on: ${node.dependsOn.map((id) => esc(NODE_BY_ID[id].label)).join(", ")} (over internal links).</p>` : ""}`;
        break;
      }
    }
    const scroll = panel.scrollTop;
    panel.innerHTML = html;
    panel.scrollTop = this.panel.kind === "overview" ? scroll : 0;
  }

  private flowCard(flow: FlowDef, inspectMode = false): string {
    const s = this.state;
    const inspected = s.inspected.includes(flow.id);
    const available = inspectionAvailable(s, flow.id);
    const assessment = s.assessments[flow.id];
    const service = inspected ? serviceLabel(flow.service, s.variant) : "service not yet inspected";
    let action = "";
    if (inspected) action = `<button class="btn small" data-act="evidence" data-flow="${flow.id}">Evidence</button>`;
    else if (currentRound(s).allowedActions.includes("inspect"))
      action = `<button class="btn small ${inspectMode ? "primary" : ""}" data-act="inspect" data-flow="${flow.id}" ${available && s.ap >= ACTION_COSTS.inspect ? "" : "disabled"}>Inspect · ${ACTION_COSTS.inspect}</button>`;
    return `<div class="card flow ${this.focusFlow === flow.id ? "focus" : ""}" data-flow-card="${flow.id}">
      ${this.glyph(assessment)}
      <div><div class="name">${esc(this.flowName(flow))}</div><div class="sub">→ ${DEST_LABEL[flow.dest]} · ${esc(service)}</div>
      ${!available && !inspected ? `<div class="sub">Bypasses the Inspection Point — no evidence recorded.</div>` : ""}</div>
      ${action}
    </div>`;
  }

  private rulesList(): string {
    const s = this.state;
    if (!s.rules.length) return `<p class="muted">No rules — everything is denied by default.</p>`;
    const canRevise = currentRound(s).allowedActions.includes("revise") && s.ap >= ACTION_COSTS.revise;
    const sorted = [...s.rules].sort((a, b) => (a.action === b.action ? 0 : a.action === "deny" ? -1 : 1));
    return sorted
      .map((rule) => {
        const [head, ...rest] = describeRule(rule, this.state).split(" ");
        return `<div class="card"><div class="rule"><div><span class="act ${rule.action}">${esc(head)}</span>${esc(rest.join(" "))}${rule.note ? `<span class="note">${esc(rule.note)}</span>` : ""}</div>
          <div style="display:flex;gap:6px">
            <button class="btn small" data-act="revise-rule" data-rule="${rule.id}" ${canRevise ? "" : "disabled"} aria-label="Edit rule">Edit · ${ACTION_COSTS.revise}</button>
            <button class="btn small danger" data-act="remove-rule" data-rule="${rule.id}" ${canRevise ? "" : "disabled"} aria-label="Remove rule">Remove · ${ACTION_COSTS.revise}</button>
          </div></div></div>`;
      })
      .join("");
  }

  private routesList(): string {
    const s = this.state;
    const rounds = [0, 1, 2].map((i) => ({ ...currentRound({ ...s, round: i } as GameState) }));
    const all = rounds.flatMap((round) => round.candidates);
    const canRevise = s.ap >= ACTION_COSTS.revise && currentRound(s).allowedActions.includes("revise");
    return s.builtRoutes
      .map((id) => {
        const candidate = all.find((item) => item.id === id);
        return `<div class="card rule"><span>${esc(candidate?.label ?? id)}</span><button class="btn small danger" data-act="remove-route" data-route="${id}" ${canRevise ? "" : "disabled"}>Remove · ${ACTION_COSTS.revise}</button></div>`;
      })
      .join("");
  }

  private rulePreview(draft: RuleDraft, editing?: string): string {
    const s = this.state;
    const flows = flowsFor(s);
    const def = currentRound(s);
    const rules = editing ? s.rules.map((rule) => (rule.id === editing ? { ...draft, id: rule.id } : rule)) : [...s.rules, { ...draft, id: "draft" }];
    const items = def.flows.map((id) => {
      const flow = flows[id];
      const decision = evaluate(rules, flow);
      const matches = draft.source === "any" || draft.source === id;
      const matchesFully = matches && (draft.dest === "any" || draft.dest === flow.dest) && (draft.service === "any" || draft.service === flow.service);
      return `<li><span class="${decision.allowed ? "ok" : "no"}" aria-hidden="true">${decision.allowed ? "✓" : "−"}</span><span>${esc(this.flowName(flow))} → ${DEST_LABEL[flow.dest]}: <strong>${decision.allowed ? "allowed" : "denied"}</strong>${matchesFully ? " <em>(matches this rule)</em>" : ""}</span></li>`;
    });
    return `<strong>${esc(describeRule(draft, s))}</strong><div class="hint">At the gateway, with your other rules:</div><ul class="tradeoff">${items.join("")}</ul>`;
  }

  private renderOverlay(): void {
    if (!this.state) return;
    const overlay = $("#board-overlay");
    const { width, height } = this.size;
    if (!width) return;
    const layout = computeLayout(width, height, false, this.boardInsets());
    const s = this.state;
    const parts: string[] = [];
    for (const node of NODES) {
      const p = nodeScreen(layout, node.id);
      const health = nodeHealth(s, node.id);
      const size = layout.tw * 1.1;
      parts.push(
        `<button class="node-hit" data-node="${node.id}" style="left:${p.x}px;top:${p.y}px;width:${size}px;height:${size}px" aria-label="${esc(node.label)}${health === "offline" ? ", offline" : health === "breached" ? ", unauthorized access" : ""}. Show details."></button>`,
      );
    }
    const def = currentRound(s);
    if (this.panel.kind === "route" || (this.guideStep >= 1 && this.guideStep <= 2)) {
      for (const candidate of def.candidates) {
        if (s.builtRoutes.includes(candidate.id)) continue;
        const anchor = candidateAnchor(candidate);
        const p = gridToScreen(layout, anchor.x, anchor.y);
        const letter = this.optionLetter(candidate.id);
        parts.push(`<button class="route-hit" data-route="${candidate.id}" data-candidate="${candidate.id}" style="left:${p.x}px;top:${p.y}px" aria-label="Build option ${letter}: ${esc(candidate.label)}, ${ACTION_COSTS.route} action points" title="${esc(candidate.label)}">${letter}</button>`);
      }
    }
    overlay.innerHTML = parts.join("");
    this.positionCoach();
  }

  private optionLetter(routeId: string): string {
    const index = currentRound(this.state).candidates.findIndex((candidate) => candidate.id === routeId);
    return String.fromCharCode(65 + Math.max(0, index));
  }

  // Seeded so the correct answer isn't always in the same position.
  private shuffled<T>(items: readonly T[], salt: string): T[] {
    return shuffle(createRng(`${this.state.seed}:${salt}`), [...items]);
  }

  private setPanel(mode: PanelMode): void {
    this.panel = mode;
    if (mode.kind === "route") this.advanceGuideTo(2, 1);
    this.renderPanel();
    this.renderDock();
    this.renderOverlay();
    const heading = $("#panel").querySelector<HTMLElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------------- events
  private onDockClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button || button.disabled) return;
    this.dockAction(button.dataset.action!);
  }

  private dockAction(action: string): void {
    const s = this.state;
    const def = currentRound(s);
    if (action === "launch") {
      if (s.phase === "running") this.pauseIfRunning();
      else this.launchOrResume();
      return;
    }
    const kind = action as "inspect" | "rule" | "route" | "revise";
    if (!def.allowedActions.includes(kind) || s.ap < ACTION_COSTS[kind] || s.phase === "roundEnd") return;
    this.pauseIfRunning();
    if (kind === "inspect") this.setPanel({ kind: "inspect" });
    else if (kind === "rule") this.setPanel({ kind: "rule", draft: { action: "deny", source: "any", dest: "any", service: "any" } });
    else if (kind === "route") this.setPanel({ kind: "route" });
    else {
      this.setPanel({ kind: "overview" });
      $("#panel").querySelector<HTMLElement>("[data-act='revise-rule'], [data-act='remove-route']")?.focus();
    }
  }

  private onHudClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-hud]");
    if (!button) return;
    const kind = button.dataset.hud;
    if (kind === "help") this.showHelp();
    if (kind === "settings") this.showSettings();
    if (kind === "exit") {
      this.pauseIfRunning();
      showModal({
        title: "Leave practice?",
        body: "<p>Your progress in this run will be lost. You can start again from Study Material.</p>",
        dismissible: true,
        actions: [
          { label: "Keep playing", onClick: () => undefined },
          { label: "Leave", primary: true, onClick: () => { this.stop(); this.onExit(); } },
        ],
      });
    }
  }

  private onOverlayClick(event: Event): void {
    const target = event.target as HTMLElement;
    const route = target.closest<HTMLElement>("[data-route]");
    if (route) {
      this.pauseIfRunning();
      if (this.run({ type: "addRoute", routeId: route.dataset.route! })) {
        announce("Route built.");
        this.setPanel({ kind: "overview" });
      }
      return;
    }
    const node = target.closest<HTMLElement>("[data-node]");
    if (node) this.setPanel({ kind: "node", id: node.dataset.node as NodeId });
  }

  private onPanelHover(event: Event): void {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-candidate]");
    this.hoverCandidate = card?.dataset.candidate ?? null;
    const flowCard = (event.target as HTMLElement).closest<HTMLElement>("[data-flow-card]");
    this.focusFlow = (flowCard?.dataset.flowCard as SourceId) ?? (this.panel.kind === "evidence" ? this.panel.flow : null);
  }

  private onPanelChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.panel.kind !== "rule" || !select.dataset.field) return;
    const field = select.dataset.field as "source" | "dest" | "service";
    (this.panel.draft as unknown as Record<string, string>)[field] = select.value;
    $("#rule-preview").innerHTML = this.rulePreview(this.panel.draft, this.panel.ruleId);
  }

  private onPanelClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!button || button.disabled) return;
    const s = this.state;
    const flow = button.dataset.flow as SourceId | undefined;
    switch (button.dataset.act) {
      case "overview":
        this.setPanel({ kind: "overview" });
        break;
      case "inspect":
        this.pauseIfRunning();
        if (flow && this.run({ type: "inspect", flow })) {
          announce(`Inspected ${flowsFor(s)[flow].address}. Evidence shown.`);
          this.focusFlow = flow;
          this.setPanel({ kind: "evidence", flow });
        }
        break;
      case "evidence":
        if (flow) {
          this.focusFlow = flow;
          this.setPanel({ kind: "evidence", flow });
        }
        break;
      case "assess":
        if (flow && this.run({ type: "assess", flow, verdict: button.dataset.verdict as Assessment })) this.setPanel({ kind: "evidence", flow });
        break;
      case "rule-for": {
        if (!flow) break;
        const def = flowsFor(s)[flow];
        this.setPanel({ kind: "rule", draft: { action: s.assessments[flow] === "permitted" ? "allow" : "deny", source: flow, dest: def.dest, service: def.service } });
        break;
      }
      case "draft-action":
        if (this.panel.kind === "rule") {
          this.panel.draft.action = button.dataset.value as Rule["action"];
          this.renderPanel();
        }
        break;
      case "rule-apply":
        if (this.panel.kind === "rule") {
          const draft = { ...this.panel.draft };
          const ok = this.panel.ruleId
            ? this.run({ type: "reviseRule", ruleId: this.panel.ruleId, rule: draft })
            : this.run({ type: "addRule", rule: draft });
          if (ok) {
            announce(`Rule saved: ${describeRule(draft, s)}`);
            this.setPanel({ kind: "overview" });
          }
        }
        break;
      case "revise-rule": {
        const rule = s.rules.find((item) => item.id === button.dataset.rule);
        if (rule) {
          this.pauseIfRunning();
          this.setPanel({ kind: "rule", ruleId: rule.id, draft: { action: rule.action, source: rule.source, dest: rule.dest, service: rule.service } });
        }
        break;
      }
      case "remove-rule":
        this.pauseIfRunning();
        if (this.run({ type: "reviseRule", ruleId: button.dataset.rule!, rule: null })) announce("Rule removed.");
        break;
      case "build":
        this.pauseIfRunning();
        if (this.run({ type: "addRoute", routeId: button.dataset.route! })) {
          announce("Route built.");
          this.setPanel({ kind: "overview" });
        }
        break;
      case "remove-route":
        this.pauseIfRunning();
        if (this.run({ type: "removeRoute", routeId: button.dataset.route! })) announce("Route removed.");
        break;
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.running || isModalOpen() || $("#game").hidden) return;
    const target = event.target as HTMLElement;
    if (target.tagName === "SELECT" || target.tagName === "INPUT" || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const map: Record<string, string> = { "1": "inspect", "2": "rule", "3": "route", "4": "revise", i: "inspect", r: "rule", b: "route" };
    if (map[key]) {
      event.preventDefault();
      this.dockAction(map[key]);
    } else if (key === "l" || (key === " " && target === document.body)) {
      event.preventDefault();
      this.launchOrResume();
    } else if (key === "p") {
      event.preventDefault();
      this.pauseIfRunning();
    } else if (key === "escape") {
      this.setPanel({ kind: "overview" });
    } else if (key === "?" || key === "h") {
      this.showHelp();
    }
  }

  showHelp(): void {
    this.pauseIfRunning();
    showModal({
      title: "How to play",
      dismissible: true,
      wide: true,
      body: `
        <p><strong>Observe → inspect → choose → watch the consequence → adapt.</strong></p>
        <div class="two-col">
          <div class="card"><h3 style="margin-top:0">Actions</h3>
            <p>${ICONS.inspect} <strong>Inspect activity</strong> (${ACTION_COSTS.inspect} AP) — reveals evidence. You decide what it means.</p>
            <p>${ICONS.rule} <strong>Apply access rule</strong> (${ACTION_COSTS.rule} AP) — allow or deny a source, destination, and service.</p>
            <p>${ICONS.route} <strong>Add route</strong> (${ACTION_COSTS.route} AP) — connect services or add a backup path.</p>
            <p>${ICONS.revise} <strong>Revise</strong> (${ACTION_COSTS.revise} AP) — change or remove an earlier rule or route.</p></div>
          <div class="card"><h3 style="margin-top:0">Keyboard</h3>
            <div class="legend-grid">
              <span class="kbd">Tab</span><span>Move between controls and board buildings</span>
              <span class="kbd">1–4</span><span>Inspect · Rule · Route · Revise</span>
              <span class="kbd">L</span><span>Launch or resume the wave</span>
              <span class="kbd">P</span><span>Pause</span>
              <span class="kbd">Esc</span><span>Back to overview / close dialogs</span>
              <span class="kbd">?</span><span>This help</span>
            </div></div>
        </div>
        <h3>Traffic symbols</h3>
        <div class="legend-grid">
          <i class="glyph amber">?</i><span>Needs review — all new traffic starts amber.</span>
          <i class="glyph cyan">✓</i><span>You judged it permitted after inspecting.</span>
          <i class="glyph red">✕</i><span>You judged it a policy violation after inspecting.</span>
        </div>
        <p class="hint">Score: 40% approved service delivered · 40% prohibited activity denied · 20% efficient AP use. Blocking everything can't win.</p>`,
      actions: [{ label: "Close", primary: true, onClick: () => undefined }],
    });
  }

  showSettings(): void {
    this.pauseIfRunning();
    const toggles: [keyof Settings, string][] = [
      ["sound", "Sound effects"],
      ["reducedMotion", "Reduced motion"],
      ["largeText", "Larger text"],
      ["fast", "Faster waves (2×)"],
    ];
    showModal({
      title: "Settings",
      dismissible: true,
      body: toggles
        .map(([key, label]) => `<label class="toggle"><span>${label}</span><input type="checkbox" data-setting="${key}" ${this.settings[key] ? "checked" : ""}/></label>`)
        .join(""),
      actions: [{ label: "Done", primary: true, onClick: () => undefined }],
      onMount: (root) =>
        root.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) =>
          input.addEventListener("change", () => {
            this.settings[input.dataset.setting as keyof Settings] = input.checked;
            saveSettings(this.settings);
            this.applySettings(this.settings);
            this.resize();
            this.renderBanner();
          }),
        ),
    });
  }

  // ---------------------------------------------------------------- guide
  private advanceGuide(command: Command): void {
    if (command.type === "addRoute") this.advanceGuideTo(3, 2);
    if (command.type === "launch") this.advanceGuideTo(4, 3);
  }

  // Learners may act ahead of the guide; jump forward rather than stall.
  private advanceGuideTo(next: number, from: number): void {
    if (this.guideStep < 0 || this.guideStep > from) return;
    this.guideStep = next;
    this.showCoach();
  }

  private showCoach(): void {
    const coach = $("#coach");
    this.guideTarget?.classList.remove("spotlight");
    const steps: { target: () => HTMLElement | null; title: string; text: string; next?: boolean }[] = [
      {
        target: () => document.querySelector("[data-node='finance']"),
        title: "This is Finance",
        text: "It processes supplier invoices using the database on the Core server. Right now Finance isn't connected to anything.",
        next: true,
      },
      {
        target: () => document.querySelector("[data-action='route']"),
        title: "Connect Finance",
        text: "Choose Add route (or press 3) to see where a connection can be built.",
      },
      {
        target: () => $("#panel"),
        title: "Pick the right link",
        text: "Two links are possible. Which one lets Finance reach its database on the Core server? Build one.",
      },
      {
        target: () => document.querySelector("[data-action='launch']"),
        title: "Watch the result",
        text: "Launch the wave (or press L). Requests travel from the Internet through the Gateway. Watch whether invoices reach Finance.",
      },
    ];
    if (this.guideStep < 0 || this.guideStep >= steps.length) {
      this.hideCoach();
      return;
    }
    const current = steps[this.guideStep];
    coach.hidden = false;
    coach.innerHTML = `<strong>${esc(current.title)}</strong><span>${esc(current.text)}</span>
      <div class="row"><button class="btn ghost" data-coach="skip">Skip guide</button>${current.next ? `<button class="btn" data-coach="next">Next</button>` : `<span class="hint">Step ${this.guideStep + 1} of ${steps.length}</span>`}</div>`;
    coach.querySelector("[data-coach='skip']")!.addEventListener("click", () => {
      this.guideStep = -1;
      this.hideCoach();
      this.renderOverlay();
    });
    coach.querySelector("[data-coach='next']")?.addEventListener("click", () => {
      this.guideStep += 1;
      this.showCoach();
      this.renderOverlay();
      document.querySelector<HTMLElement>("[data-action='route']")?.focus();
    });
    this.guideTargetFn = current.target;
    this.positionCoach();
    announce(`${current.title}. ${current.text}`);
  }

  private positionCoach(): void {
    const coach = $("#coach");
    if (coach.hidden || !this.guideTargetFn) return;
    // Board overlay buttons are re-rendered, so resolve the target each time.
    const target = this.guideTargetFn();
    if (target !== this.guideTarget) {
      this.guideTarget?.classList.remove("spotlight");
      target?.classList.add("spotlight");
      this.guideTarget = target;
    }
    if (!this.guideTarget) return;
    const rect = this.guideTarget.getBoundingClientRect();
    const cw = 300;
    const ch = coach.offsetHeight || 140;
    let side: "top" | "bottom" | "left" = "top";
    let left = rect.left + rect.width / 2 - cw / 2;
    let top = rect.top - ch - 14;
    if (this.guideTarget.id === "panel" && window.innerWidth > 960) {
      side = "left";
      left = rect.left - cw - 16;
      top = rect.top + 120;
    } else if (top < 8) {
      side = "bottom";
      top = rect.bottom + 14;
    }
    const clamped = Math.max(8, Math.min(window.innerWidth - cw - 8, left));
    coach.style.setProperty("--arrow", `${Math.max(12, Math.min(cw - 24, rect.left + rect.width / 2 - clamped - 7))}px`);
    coach.dataset.side = side;
    coach.style.left = `${clamped}px`;
    coach.style.top = `${top}px`;
  }

  private hideCoach(): void {
    $("#coach").hidden = true;
    this.guideTarget?.classList.remove("spotlight");
    this.guideTarget = null;
    this.guideTargetFn = null;
  }
}
