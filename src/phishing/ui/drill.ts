import { play } from "../../ui/audio";
import { announce, esc, isModalOpen } from "../../ui/dom";
import { MESSAGES, ORG_REFERENCE, SCENARIO } from "../data/messages";
import type { DrillHost } from "../host";
import { MAX_EVIDENCE, PAR_SECONDS, orderMessages, scoreDecision, speedBonus } from "../sim/drill";
import type { BodyBlock, Cue, CueFlag, CueKind, Decision, Message, Quality, Verdict } from "../sim/types";
import { icon, type IconName } from "./icons";

export type DrillRun = Readonly<{ seed: string; order: readonly Message[]; decisions: readonly Decision[]; durationSeconds: number }>;

export const VERDICT_LABEL: Record<Verdict, string> = { report: "Report phishing", safe: "Mark safe", verify: "Verify first" };
const VERDICT_ICON: Record<Verdict, IconName> = { report: "alert", safe: "shield", verify: "phone" };
const VERDICT_KEY: Record<Verdict, string> = { report: "R", safe: "S", verify: "V" };
const VERDICT_HINT: Record<Verdict, string> = {
  report: "Send to security",
  safe: "Allow the message",
  verify: "Check by a trusted channel",
};

const CUE_ICON: Record<CueKind, IconName> = {
  sender: "mail", replyTo: "reply", link: "link", attachment: "clip", request: "doc", tone: "chat", context: "building",
};
const FLAG_LABEL: Record<CueFlag, string> = { suspicious: "Suspicious", matches: "Matches", policy: "Needs a check", weak: "Weak alone" };
const QUALITY_TITLE: Record<Quality, string> = {
  correct: "Correct decision",
  partial: "Safe, but not the best response",
  wrong: "Not quite",
};
const QUALITY_ICON: Record<Quality, IconName> = { correct: "check", partial: "minus", wrong: "cross" };

const COACH_STEPS = [
  "Start with who sent it. Select the sender's address to inspect it.",
  "Now check where the link really goes. Select the link or the button in the message.",
  "Pick up to two cues that support your decision with “Use as evidence”.",
  "Choose a response. Evidence that backs a correct decision builds your streak.",
] as const;

function avatarHue(text: string): number {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export class DrillController {
  private order: Message[] = [];
  private index = 0;
  private decisions: Decision[] = [];
  private streak = 0;
  private score = 0;
  private inspected = new Set<string>();
  private evidence: string[] = [];
  private decision: Decision | null = null;
  private tab: "inspector" | "reference" = "inspector";
  private seed = "";
  private startedAt = 0;
  private elapsedMs = 0;
  private lastTick = 0;
  private ticker: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly host: DrillHost,
    private readonly onComplete: (run: DrillRun) => void,
  ) {
    root.addEventListener("click", (event) => this.onClick(event));
    document.addEventListener("keydown", (event) => this.onKey(event));
  }

  start(seed: string): void {
    this.seed = seed;
    this.order = orderMessages(MESSAGES, seed);
    this.index = 0;
    this.decisions = [];
    this.streak = 0;
    this.score = 0;
    this.startedAt = Date.now();
    this.host.started(seed);
    this.openMessage();
    this.ticker ??= window.setInterval(() => this.tick(), 250);
  }

  stop(): void {
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.ticker = null;
  }

  private get message(): Message {
    return this.order[this.index];
  }

  private get coachStep(): number | null {
    if (!this.message.guided || this.decision) return null;
    if (!this.inspected.has("sender")) return 0;
    if (!this.inspected.has("link")) return 1;
    if (this.evidence.length === 0) return 2;
    return 3;
  }

  private openMessage(): void {
    this.inspected = new Set();
    this.evidence = [];
    this.decision = null;
    this.tab = "inspector";
    this.elapsedMs = 0;
    this.lastTick = performance.now();
    this.render();
    this.root.querySelector<HTMLElement>("#mail-subject")?.focus();
    const previous = this.order[this.index - 1];
    if (previous && previous.batch !== this.message.batch) {
      const arriving = this.order.filter((m) => m.batch === this.message.batch).length;
      announce(`Batch ${this.message.batch}: ${arriving} new messages arrived.`);
    }
  }

  // ---------- timing ----------
  private tick(): void {
    const now = performance.now();
    const running = !this.root.hidden && !this.decision && !this.message.guided && !isModalOpen() && document.visibilityState === "visible";
    if (running) this.elapsedMs += now - this.lastTick;
    this.lastTick = now;
    if (running) this.paintTimer();
  }

  private paintTimer(): void {
    const el = this.root.querySelector<HTMLElement>("#drill-timer");
    if (!el) return;
    const seconds = this.elapsedMs / 1000;
    el.textContent = clock(PAR_SECONDS - seconds);
    const bonus = this.root.querySelector<HTMLElement>("#drill-bonus");
    if (bonus) bonus.textContent = `Speed bonus +${speedBonus(seconds, false)}`;
    el.parentElement?.classList.toggle("spent", seconds >= PAR_SECONDS);
  }

  // ---------- input ----------
  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-inspect],[data-evidence],[data-verdict],[data-tab],[data-next]");
    if (!target || (target as HTMLButtonElement).disabled) return;
    if (target.dataset.inspect) this.inspect(target.dataset.inspect);
    else if (target.dataset.evidence) this.toggleEvidence(target.dataset.evidence);
    else if (target.dataset.verdict) this.decide(target.dataset.verdict as Verdict);
    else if (target.dataset.tab) {
      this.tab = target.dataset.tab as "inspector" | "reference";
      this.render();
    } else if (target.dataset.next !== undefined) this.next();
  }

  private onKey(event: KeyboardEvent): void {
    if (this.root.hidden || isModalOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (this.decision) {
      if (key === "n") this.next();
      return;
    }
    const verdict = (Object.keys(VERDICT_KEY) as Verdict[]).find((v) => VERDICT_KEY[v].toLowerCase() === key);
    if (verdict) {
      event.preventDefault();
      this.decide(verdict);
    }
  }

  private inspect(cueId: string): void {
    const cue = this.message.cues.find((c) => c.id === cueId);
    if (!cue) return;
    this.tab = "inspector";
    if (!this.decision && !this.inspected.has(cueId)) {
      this.inspected.add(cueId);
      play("click");
      this.host.record({ verb: "inspected", object: `${this.message.id}/${cueId}` });
      announce(`${cue.label}. ${cue.facts.join(". ")}.`);
    }
    this.render();
    this.root.querySelector<HTMLElement>(`[data-cue="${cueId}"]`)?.scrollIntoView({ block: "nearest" });
  }

  private toggleEvidence(cueId: string): void {
    if (this.decision) return;
    if (this.evidence.includes(cueId)) this.evidence = this.evidence.filter((id) => id !== cueId);
    else if (this.evidence.length < MAX_EVIDENCE) this.evidence = [...this.evidence, cueId];
    else return;
    play("click");
    this.host.record({ verb: "selected", object: `${this.message.id}/${cueId}`, result: { evidence: this.evidence } });
    this.render();
  }

  private decide(verdict: Verdict): void {
    if (this.decision) return;
    const decision = scoreDecision(this.message, verdict, this.evidence, this.elapsedMs / 1000, this.streak);
    this.decision = decision;
    this.decisions.push(decision);
    this.streak = decision.streakAfter;
    this.score += decision.points.total;
    this.tab = "inspector";
    play(decision.quality === "correct" ? "success" : decision.quality === "partial" ? "setback" : "fail");
    this.host.record({
      verb: "answered",
      object: this.message.id,
      result: { response: verdict, best: decision.best, quality: decision.quality, evidence: decision.evidence, points: decision.points.total },
    });
    this.render();
    announce(`${QUALITY_TITLE[decision.quality]}. ${this.message.feedback[verdict]}`);
    this.root.querySelector<HTMLElement>("[data-next]")?.focus();
  }

  private next(): void {
    if (!this.decision) return;
    if (this.index < this.order.length - 1) {
      this.index += 1;
      this.openMessage();
      return;
    }
    this.onComplete({
      seed: this.seed,
      order: this.order,
      decisions: this.decisions,
      durationSeconds: Math.round((Date.now() - this.startedAt) / 1000),
    });
  }

  // ---------- rendering ----------
  private render(): void {
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
    const message = this.message;
    const coach = this.coachStep;
    this.root.innerHTML = `
      <header class="drill-bar">
        <div class="drill-brand">${icon("logo")}<div><b>PROJECT ARES</b><span>Phishing Speed Drill</span></div></div>
        <div class="drill-stats">
          ${this.progressHtml()}
          ${this.timerHtml()}
          <div class="stat streak ${this.streak > 1 ? "hot" : ""}" title="Correct decisions in a row backed by relevant evidence">${icon("flame")}<span class="stat-k">Streak</span><b>${this.streak}</b></div>
          <div class="stat score">${icon("star")}<span class="stat-k">Score</span><b>${this.score}</b></div>
        </div>
      </header>
      <div class="drill-grid">
        ${this.inboxHtml()}
        <main class="mail" id="drill-main" aria-label="Message">
          ${coach !== null ? `<div class="coach-strip" role="status"><b>Guided round · step ${coach + 1} of ${COACH_STEPS.length}</b><span>${esc(COACH_STEPS[coach])}</span></div>` : ""}
          ${this.mailHtml(message, coach)}
        </main>
        ${this.inspectorHtml(message, coach)}
        ${this.decision ? this.feedbackHtml(message, this.decision) : this.actionsHtml(coach)}
      </div>
      <p class="drill-tagline" aria-hidden="true">Inspect cues <span>•</span> Choose an action <span>•</span> Learn why</p>`;
    if (focusKey) this.root.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
    this.paintTimer();
  }

  private progressHtml(): string {
    const segments = this.order
      .map((_, i) => {
        const done = this.decisions[i];
        const state = done ? done.quality : i === this.index ? "now" : "";
        return `<i class="${state}"></i>`;
      })
      .join("");
    return `<div class="stat progress"><span class="stat-k">Message</span><b>${this.index + 1} / ${this.order.length}</b><span class="segments" aria-hidden="true">${segments}</span></div>`;
  }

  private timerHtml(): string {
    if (this.message.guided) return `<div class="stat timer">${icon("clock")}<b>Guided</b><span class="stat-k">Untimed</span></div>`;
    const seconds = this.decision ? this.decision.seconds : this.elapsedMs / 1000;
    return `<div class="stat timer" role="timer">${icon("clock")}<b id="drill-timer">${clock(PAR_SECONDS - seconds)}</b><span class="stat-k" id="drill-bonus">Speed bonus +${speedBonus(seconds, false)}</span></div>`;
  }

  private inboxHtml(): string {
    const arrived = this.order.filter((m) => m.batch <= this.message.batch);
    const items = arrived
      .map((m) => {
        const i = this.order.indexOf(m);
        const done = this.decisions[i];
        const state = i === this.index ? "current" : done ? "done" : "waiting";
        const result = done
          ? `<span class="inbox-result ${done.quality}" title="${esc(QUALITY_TITLE[done.quality])}">${icon(QUALITY_ICON[done.quality])}<span class="sr-only">${esc(QUALITY_TITLE[done.quality])}</span></span>`
          : "";
        return `
          <li class="inbox-item ${state}" ${i === this.index ? 'aria-current="true"' : ""}>
            <span class="avatar" style="--hue:${avatarHue(m.initials + m.fromName)}" aria-hidden="true">${esc(m.initials)}</span>
            <span class="inbox-text">
              <span class="inbox-row"><span class="inbox-from">${esc(m.fromName)}</span><span class="inbox-time">${esc(m.time)}</span></span>
              <span class="inbox-subject">${esc(m.subject)}</span>
              <span class="inbox-preview">${esc(m.preview)}</span>
            </span>
            ${result}
          </li>`;
      })
      .join("");
    return `
      <nav class="inbox" aria-label="Inbox">
        <div class="inbox-head">${icon("mail")}<h2>Inbox</h2><span>Batch ${this.message.batch} of 3 · ${arrived.length} messages</span></div>
        <ol class="inbox-list">${items}</ol>
        <p class="inbox-foot">${esc(SCENARIO.inbox)}</p>
      </nav>`;
  }

  private flagBadge(cueId: string, text?: string): string {
    if (!this.decision) return "";
    const cue = this.message.cues.find((c) => c.id === cueId);
    if (!cue || cue.flag === "weak") return "";
    return `<span class="flag ${cue.flag}">${icon(cue.flag === "matches" ? "check" : "alert")}${esc(text ?? FLAG_LABEL[cue.flag])}</span>`;
  }

  private hotspot(cueId: string, coach: number | null): string {
    const cue = this.message.cues.find((c) => c.id === cueId);
    const classes: string[] = [];
    if (this.decision && cue && cue.flag !== "weak") classes.push(`marked-${cue.flag}`);
    if ((coach === 0 && cueId === "sender") || (coach === 1 && cueId === "link")) classes.push("coach-target");
    return classes.join(" ");
  }

  private mailHtml(m: Message, coach: number | null): string {
    const block = (b: BodyBlock, i: number): string => {
      switch (b.type) {
        case "p":
          return `<p>${esc(b.text)}</p>`;
        case "button":
          return `<p class="mail-cta-row"><button class="mail-cta ${this.hotspot(b.cue, coach)}" data-inspect="${b.cue}" data-key="b${i}" aria-label="${esc(b.text)}: inspect where this button leads">${esc(b.text)}</button></p>`;
        case "link":
          return `<p>${esc(b.lead)}</p><p class="mail-link-row"><button class="mail-link ${this.hotspot(b.cue, coach)}" data-inspect="${b.cue}" data-key="b${i}" aria-label="${esc(b.text)}: inspect where this link leads">${icon("link")}<span>${esc(b.text)}</span></button>${this.flagBadge(b.cue, m.cues.find((c) => c.id === b.cue)?.flag === "matches" ? "Link matches" : "Suspicious link")}</p>`;
        case "attachment":
          return `<p><button class="mail-attach ${this.hotspot(b.cue, coach)}" data-inspect="${b.cue}" data-key="b${i}" aria-label="Attachment ${esc(b.name)}: inspect">${icon("clip")}<span><b>${esc(b.name)}</b><small>${esc(b.meta)}</small></span></button></p>`;
        case "sign":
          return `<p class="mail-sign">${b.lines.map(esc).join("<br>")}</p>`;
      }
    };
    const senderFlag = m.cues.find((c) => c.id === "sender")?.flag;
    return `
      <div class="mail-head">
        <div class="mail-title"><h2 id="mail-subject" tabindex="-1">${esc(m.subject)}</h2><span class="chip">${m.external ? "External" : "Internal"}</span></div>
        <div class="mail-from">
          <span class="avatar big" style="--hue:${avatarHue(m.initials + m.fromName)}" aria-hidden="true">${esc(m.initials)}</span>
          <div class="mail-from-text">
            <button class="mail-sender ${this.hotspot("sender", coach)}" data-inspect="sender" data-key="sender" aria-label="Sender ${esc(m.fromName)}, ${esc(m.fromAddress)}: inspect">
              <b>${esc(m.fromName)}</b><span>&lt;${esc(m.fromAddress)}&gt;</span>
            </button>
            ${this.flagBadge("sender", senderFlag === "matches" ? "Domain matches" : "Suspicious domain")}
            <div class="mail-to">to ${esc(SCENARIO.inbox)}${m.replyTo ? ` · <button class="mail-replyto ${this.hotspot("replyTo", coach)}" data-inspect="replyTo" data-key="replyto">show reply-to</button>` : ""}</div>
          </div>
          <span class="mail-time">${esc(m.time)}</span>
        </div>
      </div>
      <article class="mail-card" aria-label="Message body">
        <div class="mail-brand"><b>${esc(m.brand.name)}</b><span>${esc(m.brand.tag)}</span></div>
        ${m.body.map(block).join("")}
      </article>`;
  }

  private cueHtml(cue: Cue, coach: number | null): string {
    const decision = this.decision;
    const open = !!decision || this.inspected.has(cue.id);
    const picked = this.evidence.includes(cue.id);
    const full = this.evidence.length >= MAX_EVIDENCE && !picked;
    const head = `${icon(CUE_ICON[cue.kind])}<span class="cue-label">${esc(cue.label)}</span>`;
    if (!open) {
      return `<li class="cue" data-cue="${cue.id}"><button class="cue-head" data-inspect="${cue.id}" data-key="cue-${cue.id}" aria-expanded="false">${head}<span class="cue-state">Inspect ${icon("chevron")}</span></button></li>`;
    }
    const facts = `<ul class="cue-facts">${cue.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`;
    if (!decision) {
      return `
        <li class="cue open ${picked ? "picked" : ""}" data-cue="${cue.id}">
          <div class="cue-head">${head}${picked ? `<span class="cue-state on">${icon("check")} Evidence</span>` : ""}</div>
          ${facts}
          <button class="evidence-btn ${coach === 2 ? "coach-target" : ""}" data-evidence="${cue.id}" data-key="evi-${cue.id}" aria-pressed="${picked}" ${full ? "disabled" : ""}>
            ${picked ? "Remove from evidence" : "Use as evidence"}
          </button>
        </li>`;
    }
    const strong = cue.strength === "strong";
    const counted = picked && strong && decision.quality === "correct";
    let note = "";
    if (counted) note = `<p class="cue-note good">${icon("check")} Your evidence · relevant</p>`;
    else if (picked && strong) note = `<p class="cue-note">${icon("check")} You picked this · relevant cue</p>`;
    else if (picked) note = `<p class="cue-note weak">${icon("minus")} Your evidence · weak on its own</p>`;
    else if (decision.missedCues.includes(cue.id)) note = `<p class="cue-note missed">${icon("alert")} Missed cue</p>`;
    else if (strong) note = `<p class="cue-note">Also relevant</p>`;
    return `
      <li class="cue open revealed ${cue.flag} ${picked ? "picked" : ""}" data-cue="${cue.id}">
        <div class="cue-head">${head}<span class="flag ${cue.flag}">${esc(FLAG_LABEL[cue.flag])}</span></div>
        ${facts}
        <p class="cue-why">${esc(cue.why)}</p>
        ${note}
      </li>`;
  }

  private inspectorHtml(m: Message, coach: number | null): string {
    const tabs = `
      <div class="tabs" role="tablist" aria-label="Inspector views">
        <button role="tab" aria-selected="${this.tab === "inspector"}" data-tab="inspector" data-key="tab-inspector">${icon("search")} Inspector</button>
        <button role="tab" aria-selected="${this.tab === "reference"}" data-tab="reference" data-key="tab-reference">${icon("building")} Acme reference</button>
      </div>`;
    const body =
      this.tab === "reference"
        ? `<div class="reference" role="tabpanel">
             <p class="panel-hint">Compare what a message asks for against what Acme has on file.</p>
             ${ORG_REFERENCE.map((s) => `<h3>${esc(s.title)}</h3><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")}
           </div>`
        : `<div role="tabpanel">
             <p class="panel-hint">${
               this.decision
                 ? "What each cue showed, and how your evidence held up."
                 : `Inspect cues, then pick up to ${MAX_EVIDENCE} that support your decision. <b>Evidence ${this.evidence.length} / ${MAX_EVIDENCE}</b>`
             }</p>
             <ul class="cues">${m.cues.map((cue) => this.cueHtml(cue, coach)).join("")}</ul>
           </div>`;
    return `<aside class="inspector" aria-label="Message inspector">${tabs}${body}</aside>`;
  }

  private actionsHtml(coach: number | null): string {
    const buttons = (Object.keys(VERDICT_LABEL) as Verdict[])
      .map(
        (v) => `
        <button class="verdict ${v} ${coach === 3 ? "coach-target" : ""}" data-verdict="${v}" data-key="verdict-${v}">
          ${icon(VERDICT_ICON[v])}
          <span><b>${VERDICT_LABEL[v]}</b><small>${VERDICT_HINT[v]}</small></span>
          <kbd aria-hidden="true">${VERDICT_KEY[v]}</kbd>
        </button>`,
      )
      .join("");
    return `<div class="actions-bar" role="group" aria-label="Choose a response">${buttons}</div>`;
  }

  private feedbackHtml(m: Message, d: Decision): string {
    const last = this.index === this.order.length - 1;
    const parts = [`<span>Decision +${d.points.accuracy}</span>`];
    if (d.points.evidence) parts.push(`<span>Evidence +${d.points.evidence}</span>`);
    if (d.points.streak) parts.push(`<span>Streak +${d.points.streak}</span>`);
    if (d.points.speed) parts.push(`<span>Speed +${d.points.speed}</span>`);
    let coaching = "";
    if (d.quality === "correct" && d.strongPicked.length === 0) {
      coaching = "No relevant evidence was selected, so the streak reset. Back your next decision with a cue.";
    } else if (d.quality !== "correct") {
      coaching = `Best response: ${VERDICT_LABEL[d.best]}. Evidence only scores when the decision is right.`;
    } else if (d.missedCues.length > 0) {
      coaching = "Missed cues are marked in the inspector.";
    }
    return `
      <div class="feedback ${d.quality}" role="group" aria-label="Feedback">
        <span class="feedback-icon">${icon(QUALITY_ICON[d.quality])}</span>
        <div class="feedback-text">
          <h3>${QUALITY_TITLE[d.quality]}${d.quality === "correct" ? ` <span>· ${esc(m.headline)}</span>` : ""}</h3>
          <p>${esc(m.feedback[d.response])}</p>
          ${coaching ? `<p class="feedback-coach">${esc(coaching)}</p>` : ""}
          <div class="points">${parts.join("")}<b>+${d.points.total}</b></div>
        </div>
        <button class="btn primary next" data-next data-key="next">${last ? "See debrief" : "Next message"} <kbd aria-hidden="true">N</kbd></button>
      </div>`;
  }
}
