import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { CHALLENGES, ORG } from "./data";
import {
  POINTS,
  coachFor,
  createGame,
  currentChallenge,
  giveUp,
  lockIn,
  meetsTarget,
  next,
  observe,
  pick,
  summarize,
  takeHint,
  type BuildChallenge,
  type GameState,
  type PickChallenge,
  type Target,
} from "./engine";
import { KIND_LABEL, MAX_LENGTH, TIER_LABEL, YEAR_SECONDS, analyze, guessesLabel, type Analysis } from "./estimator";

// PRIVACY: typed passwords live only in the input element and in local variables of this module.
// They are never sent (the host messages below carry ids, scores and pattern names only), never
// written to storage, never logged, and the input is wiped when a challenge ends.

const ACTIVITY_ID = "ares-password-forge/halden-works/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ANVIL = `<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M4 8h30c0 6 4 9 10 9v3c-6 0-9 2-11 5H17c-2-3-5-5-9-5V14c-2 0-4-2-4-6Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M15 25h20l3 9H12Z" fill="currentColor" opacity=".35" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
const SHIELD = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>`;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(CHALLENGES);
let live: Analysis = analyze("");
let message: { tone: "good" | "bad" | "hint"; html: string } | null = null;
const started = performance.now();

$("#logo").innerHTML = LOGO;

// ---------- pieces ----------
const TIER_TONE = { breached: "bad", instant: "bad", weak: "warn", fair: "ok", strong: "good" } as const;
const BAR_MIN = -3; // log10 seconds
const BAR_MAX = Math.log10(1e12 * YEAR_SECONDS);

function barPct(seconds: number): number {
  if (!Number.isFinite(seconds)) return 100;
  if (seconds <= 0) return 0;
  return Math.max(0, Math.min(100, ((Math.log10(seconds) - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));
}

function crackerPanel(analysis: Analysis, opts: { target?: Target; caption?: string } = {}): string {
  const empty = analysis.length === 0;
  const tone = empty ? "" : TIER_TONE[analysis.tier];
  return `<section class="cracker" aria-label="Cracker panel">
    <header><h3>Cracker panel</h3>${empty ? `<span class="tier">Waiting for input</span>` : `<span class="tier ${tone}">${TIER_LABEL[analysis.tier]}</span>`}</header>
    ${opts.caption ? `<p class="muted small">${opts.caption}</p>` : ""}
    <ul class="attackers">${analysis.attackers
      .map((attacker) => {
        const stuffing = attacker.id === "stuffing";
        const cls = empty ? "" : stuffing ? (analysis.breach ? "bad" : "good") : attacker.seconds < 3600 ? "bad" : attacker.seconds < YEAR_SECONDS ? "warn" : attacker.seconds < 100 * YEAR_SECONDS ? "ok" : "good";
        const marker = opts.target && attacker.id === "smart" ? `<i class="target" style="left:${barPct(opts.target.seconds)}%" title="Target: ${esc(opts.target.label)}"></i>` : "";
        return `<li class="atk ${attacker.id} ${cls}">
          <div class="atk-head"><b>${esc(attacker.name)}</b><strong>${empty ? "–" : esc(attacker.label)}</strong></div>
          <div class="bar" aria-hidden="true"><span style="width:${empty ? 0 : stuffing ? (analysis.breach ? 2 : 100) : barPct(attacker.seconds)}%"></span>${marker}</div>
          <small>${esc(attacker.detail)}</small>
        </li>`;
      })
      .join("")}</ul>
    ${opts.target ? `<p class="target-line"><i class="target-key"></i> Target: the <b>offline smart cracker</b> needs at least <b>${esc(opts.target.label)}</b>, and no breach-list match.</p>` : ""}
  </section>`;
}

function workingPanel(analysis: Analysis): string {
  if (!analysis.length) return "";
  return `<section class="working" aria-label="The cracker's working">
    <h3>The cracker's working</h3>
    <ol class="segments">${analysis.segments
      .map(
        (segment) => `<li class="seg ${segment.kind}">
          <span class="seg-kind">${KIND_LABEL[segment.kind]}</span>
          <code>${esc(segment.token).replace(/ /g, "␣")}</code>
          <span class="seg-guess">×${esc(guessesLabel(segment.log10)).replace(/\^(\d+)/, "<sup>$1</sup>")}</span>
          <span class="seg-note">${esc(segment.note)}</span>
        </li>`,
      )
      .join("")}</ol>
    <p class="muted small">Multiply the pieces: about <b>${guessesLabel(analysis.patternLog10).replace(/\^(\d+)/, "<sup>$1</sup>")}</b> guesses${analysis.breach ? `, but it is in a breach list, so it is tried in the first ${guessesLabel(9).replace(/\^(\d+)/, "<sup>$1</sup>")}` : ""}.</p>
    ${analysis.findings.length ? `<ul class="findings">${analysis.findings.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
  </section>`;
}

function privacyNote(): string {
  return `<p class="privacy">${SHIELD}<span><b>Practice only.</b> What you type stays in this page's memory: it is never sent, saved or logged, and it is wiped when the challenge ends. Even so, <b>never type a real password</b> here.</span></p>`;
}

function evidenceLine(password: string): string {
  const analysis = analyze(password);
  const smart = analysis.attackers.find((entry) => entry.id === "smart")!;
  return `<span class="evidence"><code>${esc(password)}</code> → offline smart cracker: <b>${esc(smart.label)}</b>${analysis.breach ? " (breach-list match)" : ""}</span>`;
}

// ---------- render ----------
function render(): void {
  if (state.phase === "done") return renderDebrief();
  const challenge = currentChallenge(state);
  const total = summarize(state).total;
  $("#status").innerHTML = `
    <div class="count"><strong>${state.index + 1}/${CHALLENGES.length}</strong><span>Challenge</span></div>
    <div class="count"><strong>${total}</strong><span>Points</span></div>`;
  $("#plan").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Forge orders</h2><span class="phase-pill">${CHALLENGES.length} challenges</span></div>
    <div class="d-scroll">
      <ol class="orders">${CHALLENGES.map((entry, index) => {
        const result = state.results.find((r) => r.id === entry.id);
        const cls = result ? (result.passed ? "done" : "missed") : index === state.index ? "now" : "";
        return `<li class="order ${cls}"><span class="pip" aria-hidden="true">${result ? (result.passed ? "✓" : "✕") : index + 1}</span><span><b>${esc(entry.title)}</b><small>${entry.kind === "build" ? "Build" : "Pick"}${result ? ` · ${result.points} pts` : ""}</small></span></li>`;
      }).join("")}</ol>
      <section class="stage on"><h3>${esc(challenge.title)}</h3><p>${esc(challenge.lesson)}</p></section>
      ${privacyNote()}
      <p class="muted small">Points: build challenges ${POINTS.max} for meeting the target, minus ${POINTS.failedLockIn} per failed lock-in (not below ${POINTS.buildFloor}); 0 if you ask for the example. Picks: ${POINTS.pick} if right first time. Hints are free.</p>
    </div>`;
  $("#bench-head").innerHTML = `<h2>${esc(challenge.title)}</h2><span>${challenge.kind === "build" ? "Build" : "Pick"} · ${state.index + 1} of ${CHALLENGES.length}</span>`;
  if (challenge.kind === "build") renderBuild(challenge);
  else renderPick(challenge);
  renderNext();
}

function renderBuild(challenge: BuildChallenge): void {
  const answered = state.phase === "answered";
  $("#bench").innerHTML = `
    <article class="brief-card"><span class="anvil">${ANVIL}</span><div><p>${esc(challenge.brief)}</p><p class="target-pill">Target: offline smart cracker ≥ <b>${esc(challenge.target.label)}</b> · not in a breach list</p></div></article>
    <div class="forge-input">
      <label for="pw">Your made-up password <span class="muted small">(up to ${MAX_LENGTH} characters)</span></label>
      <div class="input-row">
        <input id="pw" type="text" maxlength="${MAX_LENGTH}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" ${answered ? "disabled" : ""} aria-describedby="pw-note" />
        <button class="btn primary" data-act="lock" ${answered ? "disabled" : ""}>Lock it in <kbd>Enter</kbd></button>
      </div>
      <p id="pw-note" class="muted small">Made up for this game only. Never a real password.</p>
    </div>
    ${challenge.guided ? `<div class="coach" id="coach" aria-live="polite"></div>` : ""}
    <div id="msg"></div>
    <div id="live-panels"></div>
    <div class="bench-actions">
      ${
        answered
          ? `<button class="btn primary" data-act="next">${state.index + 1 < CHALLENGES.length ? "Next challenge" : "See debrief"} <kbd>N</kbd></button>`
          : `<button class="btn" data-act="hint">Hint</button>${challenge.guided ? "" : `<button class="btn" data-act="giveup">Show me an example (0 pts)</button>`}`
      }
    </div>`;
  const input = $("#pw") as HTMLInputElement;
  if (!answered) {
    input.value = challenge.start;
    live = analyze(challenge.start);
  }
  input.addEventListener("input", () => {
    live = analyze(input.value);
    observe(state, live);
    message = null;
    renderLive();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onLock();
    }
  });
  renderLive();
}

function renderLive(): void {
  const challenge = currentChallenge(state);
  if (challenge.kind !== "build") return;
  $("#live-panels").innerHTML = crackerPanel(live, { target: challenge.target }) + workingPanel(live);
  $("#msg").innerHTML = message ? `<div class="feedback-box ${message.tone}" role="status">${message.html}</div>` : "";
  const coach = document.querySelector<HTMLElement>("#coach");
  if (coach && state.phase === "play") coach.innerHTML = `<strong>Coach:</strong> ${coachFor(live, challenge.target)}`;
  if (coach && state.phase === "answered") coach.innerHTML = `<strong>Coach:</strong> Done. Next you will judge passwords without typing.`;
  renderNext();
}

function renderPick(challenge: PickChallenge): void {
  const answered = state.phase === "answered";
  const result = state.results.find((entry) => entry.id === challenge.id);
  const subject = challenge.subject ? analyze(challenge.subject.password) : null;
  const showWorking = subject && (challenge.subject!.reveal === "all" || answered);
  $("#bench").innerHTML = `
    <article class="brief-card"><span class="anvil">${ANVIL}</span><div><p>${esc(challenge.brief)}</p></div></article>
    ${subject ? `<div class="subject"><span class="muted small">The password</span><code>${esc(challenge.subject!.password)}</code></div>${crackerPanel(subject)}${showWorking ? workingPanel(subject) : ""}` : ""}
    <h3 class="prompt">${esc(challenge.prompt)}</h3>
    <div class="choices ${challenge.optionsArePasswords ? "pw" : ""}" role="group" aria-label="Options">
      ${challenge.options
        .map((option, index) => {
          const chosen = result?.picked === option.id;
          const cls = answered ? (option.correct ? "right" : chosen ? "wrong" : "") : "";
          const body = challenge.optionsArePasswords ? `<code>${esc(option.label)}</code>` : `<span>${esc(option.label)}</span>`;
          return `<button class="choice ${cls}" data-option="${option.id}" ${answered ? "disabled" : ""}><kbd>${index + 1}</kbd>${body}</button>`;
        })
        .join("")}
    </div>
    <div id="msg"></div>
    ${answered ? pickReveal(challenge) : ""}
    <div class="bench-actions">${answered ? `<button class="btn primary" data-act="next">${state.index + 1 < CHALLENGES.length ? "Next challenge" : "See debrief"} <kbd>N</kbd></button>` : ""}</div>`;
  $("#msg").innerHTML = message ? `<div class="feedback-box ${message.tone}" role="status">${message.html}</div>` : "";
}

function pickReveal(challenge: PickChallenge): string {
  if (challenge.optionsArePasswords) {
    return `<section class="panel compare"><h3>What the cracker panel says</h3>
      <table class="plan-table"><thead><tr><th scope="col">Password</th><th scope="col">Online</th><th scope="col">Offline smart</th><th scope="col">Stuffing</th><th scope="col">Why</th></tr></thead><tbody>
      ${challenge.options
        .map((option) => {
          const a = analyze(option.label);
          const at = (id: string) => esc(a.attackers.find((entry) => entry.id === id)!.label);
          return `<tr class="${option.correct ? "exact" : ""}"><th scope="row"><code>${esc(option.label)}</code></th><td>${at("online")}</td><td><b>${at("smart")}</b></td><td>${a.breach ? "instantly" : "no match"}</td><td>${esc(option.why)} <span class="muted">Pieces: ${[...new Set(a.segments.map((segment) => KIND_LABEL[segment.kind]))].join(", ")}.</span></td></tr>`;
        })
        .join("")}</tbody></table></section>`;
  }
  return `<section class="panel compare"><h3>Every option, with evidence</h3><ul class="habits">${challenge.options
    .map((option) => `<li class="${option.correct ? "good" : ""}"><strong>${option.correct ? "Right: " : ""}${esc(option.label)}</strong><br /><span class="muted">${esc(option.why)}</span>${option.evidence ? `<br />${evidenceLine(option.evidence)}` : ""}</li>`)
    .join("")}</ul></section>`;
}

function renderNext(): void {
  const challenge = currentChallenge(state);
  let step: NextStep;
  if (state.phase === "answered") {
    const result = state.results[state.results.length - 1];
    step = {
      label: "Done",
      tone: result.passed ? "ready" : "warn",
      text: `<strong>+${result.points} points.</strong> Read the evidence, then press <strong>${state.index + 1 < CHALLENGES.length ? "Next challenge" : "See debrief"}</strong> (or <kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else if (challenge.kind === "build") {
    const ready = meetsTarget(live, challenge.target);
    step = ready
      ? { label: "Ready", tone: "ready", text: `The smart cracker needs ${esc(live.attackers.find((entry) => entry.id === "smart")!.label)}. Press <strong>Lock it in</strong> (or <kbd>Enter</kbd>).`, targets: ['[data-act="lock"]'] }
      : {
          text: `Edit the password until the <strong>offline smart cracker</strong> needs at least <strong>${esc(challenge.target.label)}</strong>. The panel updates as you type.`,
          hint: live.breach ? "It is in a breach list: change it completely, not just the end." : "Read the cracker's working to see which pieces are cheap. <strong>Hint</strong> is free.",
          targets: ["#pw"],
        };
  } else {
    step = { text: `${esc(challenge.prompt)} Click an option, or press <kbd>1</kbd>–<kbd>${challenge.options.length}</kbd>.`, hint: challenge.subject ? "Use the cracker panel as evidence." : "Think like the smart cracker, not like a password-rules checklist.", targets: [".choices"] };
  }
  renderNextStep($("#next-step"), step);
}

// ---------- actions ----------
function onLock(): void {
  const challenge = currentChallenge(state);
  const input = document.querySelector<HTMLInputElement>("#pw");
  if (challenge.kind !== "build" || !input || state.phase !== "play") return;
  if (!input.value) {
    message = { tone: "hint", html: "<strong>Empty.</strong> Type a made-up password first." };
    return renderLive();
  }
  const outcome = lockIn(state, input.value)!;
  live = outcome.analysis;
  if (!outcome.passed) {
    play("setback");
    const smart = outcome.analysis.attackers.find((entry) => entry.id === "smart")!.label;
    const why = outcome.analysis.breach ? "It matches a breach list, so stuffing gets it instantly." : `The offline smart cracker needs only ${esc(smart)}; the target is ${esc(challenge.target.label)}.`;
    message = { tone: "bad", html: `<strong>Not yet.</strong> ${why} ${challenge.guided ? "" : `Each failed lock-in costs ${POINTS.failedLockIn} points.`} Check the cracker's working for the cheap pieces.` };
    announce(`Not yet. ${why}`);
    return renderLive();
  }
  play("success");
  post("statement", { at: new Date().toISOString(), verb: "completed", object: challenge.id, result: { success: true, points: outcome.points, patterns: [...new Set(outcome.analysis.segments.map((segment) => segment.kind))] } });
  message = { tone: "good", html: `<strong>Forged. +${outcome.points} points.</strong> The smart cracker needs ${esc(outcome.analysis.attackers.find((entry) => entry.id === "smart")!.label)}. ${esc(outcome.analysis.findings[0] ?? "")}` };
  announce("Forged.");
  wipeAndShow();
}

function onGiveUp(): void {
  const example = giveUp(state);
  if (!example) return;
  live = analyze(example);
  message = { tone: "hint", html: `<strong>Example (made up).</strong> <code>${esc(example)}</code> meets the target: look at the cracker's working below to see why. 0 points this time.` };
  post("statement", { at: new Date().toISOString(), verb: "skipped", object: currentChallenge(state).id, result: { success: false } });
  wipeAndShow();
}

// Ends a build challenge: the typed text is cleared from the input; only the analysis on screen
// remains, and it is dropped when the next challenge starts.
function wipeAndShow(): void {
  const keep = live;
  render();
  const input = document.querySelector<HTMLInputElement>("#pw");
  if (input) input.value = "";
  live = keep;
  renderLive();
  document.querySelector<HTMLElement>("[data-act=next]")?.focus();
}

function onHint(): void {
  const hint = takeHint(state);
  if (!hint) return;
  message = { tone: "hint", html: `<strong>Hint.</strong> ${esc(hint)}` };
  renderLive();
}

function onPick(optionId: string): void {
  const challenge = currentChallenge(state);
  const option = pick(state, optionId);
  if (!option || challenge.kind !== "pick") return;
  play(option.correct ? "success" : "setback");
  const right = challenge.options.find((entry) => entry.correct)!;
  message = option.correct
    ? { tone: "good", html: `<strong>Right.</strong> ${esc(option.why)}` }
    : { tone: "bad", html: `<strong>Not this one.</strong> ${esc(option.why)} ${option.evidence ? evidenceLine(option.evidence) : ""}<br /><strong>Best answer:</strong> ${esc(right.label.replace(/[.:]$/, ""))}. ${esc(right.why)}` };
  post("statement", { at: new Date().toISOString(), verb: "answered", object: challenge.id, result: { correct: option.correct, chose: option.id } });
  announce(option.correct ? "Right." : "Not this one.");
  render();
  document.querySelector<HTMLElement>("[data-act=next]")?.focus();
}

function goNext(): void {
  next(state);
  message = null;
  live = analyze("");
  render();
  if (state.phase === "done") return;
  announce(currentChallenge(state).title);
  $("#bench").scrollTop = 0;
  (document.querySelector<HTMLElement>("#pw") ?? document.querySelector<HTMLElement>(".choice"))?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-option]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target.dataset.option) return onPick(target.dataset.option);
  const act = target.dataset.act;
  if (act === "lock") onLock();
  else if (act === "hint") onHint();
  else if (act === "giveup") onGiveUp();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  if ((event.target as HTMLElement).closest("input, textarea")) return;
  const key = event.key.toLowerCase();
  const challenge = currentChallenge(state);
  if (state.phase === "play" && challenge.kind === "pick" && /^[1-9]$/.test(key)) {
    const option = challenge.options[Number(key) - 1];
    if (!option) return;
    onPick(option.id);
  } else if (key === "n" && state.phase === "answered") goNext();
  else return;
  event.preventDefault();
});

// ---------- debrief ----------
function renderDebrief(): void {
  const summary = summarize(state);
  post("completed", {
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((performance.now() - started) / 1000),
    score: summary,
    results: state.results.map((result) => ({ id: result.id, points: result.points, passed: result.passed, picked: result.picked, hints: result.hints, lockIns: result.attempts.length, sawLeet: result.sawLeet })),
  });
  const century = state.results.find((result) => result.id === "century");
  const centuryPass = century?.attempts.find((attempt) => attempt.passed);
  const evidence: string[] = [];
  if (summary.leetTried) evidence.push(`You tried letter-for-symbol swaps in ${summary.leetTried} build${summary.leetTried === 1 ? "" : "s"}. Each time the cracker undid them: a swap only doubles the guesses.`);
  if (summary.patternsLockedIn.length) evidence.push(`Failed lock-ins leaned on cheap patterns: ${summary.patternsLockedIn.map((kind) => KIND_LABEL[kind].toLowerCase()).join(", ")}.`);
  if (centuryPass) evidence.push(`Your century-vault password was made of: ${centuryPass.kinds.map((kind) => KIND_LABEL[kind].toLowerCase()).join(", ")}, about ${guessesLabel(centuryPass.log10).replace(/\^(\d+)/, "<sup>$1</sup>")} guesses. (The password itself was never kept.)`);
  else if (century?.gaveUp) evidence.push("You asked for an example on the century vault. Try again: four or five unrelated, uncommon words get there.");
  const reuse = state.results.find((result) => result.id === "reuse");
  if (reuse && !reuse.passed) evidence.push("On the reuse trap you did not pick a unique password plus MFA. A leaked password is useless only if it is not used anywhere else.");
  if (!evidence.length) evidence.push("Clean run: you built for length and unpredictability and spotted every trap.");
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(ORG)} forge</p>
        <h2 id="debrief-title" tabindex="-1">Forge score ${summary.total}<small>/${summary.max}</small></h2>
        <p class="muted">${summary.passed} of ${CHALLENGES.length} challenges met · ${summary.failedLockIns} failed lock-in${summary.failedLockIns === 1 ? "" : "s"} · ${summary.hints} hint${summary.hints === 1 ? "" : "s"} (free) · ${summary.gaveUp} example${summary.gaveUp === 1 ? "" : "s"} shown.</p>
      </header>
      <div class="score-grid wide six">${summary.byChallenge.map((entry) => tile(entry.title, entry.points, POINTS.max)).join("")}</div>
      <section class="panel"><h3>What your play showed</h3><ul class="habits">${evidence.map((line) => `<li>${line}</li>`).join("")}</ul></section>
      <section class="panel"><h3>Where it went wrong</h3>${missedPicks()}</section>
      <section class="panel"><h3>How password strength actually works</h3>
        <ul class="habits">
          <li><strong>Length and unpredictability win.</strong> Crackers guess human habits first: common passwords, words, swaps like @ for a, keyboard walks, years and dates, a ! on the end. Symbol rules followed the usual way are just another pattern.</li>
          <li><strong>Unique beats strong.</strong> A password leaked anywhere is tried everywhere (credential stuffing). Use a different password for every site.</li>
          <li><strong>Let a password manager do it.</strong> It generates and remembers long random passwords. Keep a long passphrase of unrelated words for the few you must remember, such as the manager itself.</li>
          <li><strong>Turn on MFA.</strong> It stops a stolen password from being enough on its own.</li>
        </ul>
      </section>
      <section class="panel"><h3>About the cracker panel</h3><p class="muted">It is a simplified, educational model: real crackers have far bigger wordlists and smarter rules, and real speeds depend on how the site stores passwords. Treat its times as a comparison, not a guarantee. Nothing you typed was sent or saved.</p></section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional · Content pending SME review (docs/design/PASSWORD_FORGE.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function missedPicks(): string {
  const missed = state.results.filter((result) => result.kind === "pick" && !result.passed);
  if (!missed.length) return "<p>Nothing: every pick was right.</p>";
  return `<ul class="habits">${missed
    .map((result) => {
      const challenge = CHALLENGES.find((entry) => entry.id === result.id) as PickChallenge;
      const chosen = challenge.options.find((option) => option.id === result.picked)!;
      const right = challenge.options.find((option) => option.correct)!;
      return `<li><strong>${esc(challenge.title)}</strong>: you picked “${esc(chosen.label)}”. ${esc(chosen.why)}${chosen.evidence ? ` ${evidenceLine(chosen.evidence)}` : ""}<br /><span class="muted">Best answer: ${esc(right.label)} ${esc(right.why)}</span></li>`;
    })
    .join("")}</ul>`;
}

function tile(label: string, value: number, max: number): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong></div>`;
}

// ---------- how to play ----------
function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">${esc(ORG)} forges locks, and its passwords are a mess. Over ${CHALLENGES.length} short challenges you build passwords and judge them while a <strong>cracker panel</strong> estimates how long each would survive.</p>
        <p class="tut-note">${ANVIL}<span>The one question: <strong>how would a cracker that knows every word and every human habit guess this?</strong></span></p>
        ${privacyNote()}`,
    },
    {
      title: "The cracker panel",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">1</span><span><b>Online, throttled</b>The live login page lets an attacker try about 100 guesses an hour.</span></div>
          <div><span class="tut-ico box">2</span><span><b>Offline brute force</b>A stolen password database, every combination tried. What naive meters assume.</span></div>
          <div><span class="tut-ico box">3</span><span><b>Offline smart cracker</b>Same speed, but words, swaps, keyboard walks, dates and repeats first. <em>This is the one the targets use.</em></span></div>
          <div><span class="tut-ico box">4</span><span><b>Credential stuffing</b>Passwords leaked elsewhere, replayed here. Length cannot help.</span></div>
        </div>
        <p class="muted small">Below the panel, <strong>the cracker's working</strong> shows how it split your password into pieces and what each piece cost it.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Build</b><span class="how">Type a made-up password and watch the panel. When the smart cracker needs long enough, press <span class="tut-pill">Lock it in</span> (<kbd>Enter</kbd>).</span></span></li>
          <li><span><b>Pick</b><span class="how">Choose the strongest password, or the reason one is weak. Click, or press <kbd>1</kbd>–<kbd>4</kbd>. One pick.</span></span></li>
          <li><span><b>Read the evidence</b><span class="how">Every answer is explained with the cracker's numbers. Then <span class="tut-pill">Next challenge</span> (<kbd>N</kbd>).</span></span></li>
        </ol>
        <p class="muted small">The first challenge has a coach. Do what it says, even when you suspect a trap.</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>${POINTS.max} <small>points</small></b>Build: meet the target. Each failed lock-in costs ${POINTS.failedLockIn} (not below ${POINTS.buildFloor}).</div>
          <div><b>${POINTS.pick} <small>points</small></b>Pick: right first time.</div>
          <div><b>0 <small>points</small></b>Asking for an example, or a wrong pick.</div>
        </div>
        <p>${CHALLENGES.length} challenges, up to ${CHALLENGES.length * POINTS.max} points. Hints are free; speed is never scored.</p>
        ${retry ? `<p class="tut-note">${ANVIL}<span>Starting again: same challenges, fresh score.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
        </div>`,
    },
  ];
}

function bindSettings(root: HTMLElement): void {
  root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
    settings.sound = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
    setSoundEnabled(settings.sound);
  });
}

let attempt = 0;

function start(): void {
  const retry = attempt > 0;
  attempt += 1;
  state = createGame(CHALLENGES);
  message = null;
  live = analyze("");
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${ORG} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Light the forge",
    onStart: () => document.querySelector<HTMLElement>("#pw")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${ORG} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
