import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import {
  CLUE_LABELS,
  OUTCOME_TEXT,
  PASS_OWN_RATIO,
  PASS_RATIO,
  POINTS,
  allPrompts,
  bestResponse,
  createGame,
  currentPrompt,
  evidenceOf,
  feedbackFor,
  hintsAllowed,
  next,
  respond,
  stageOf,
  summarize,
  takeHint,
  type GameState,
  type Outcome,
  type Pick,
  type Prompt,
  type Response,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-mfa-fatigue/the-long-day/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PHONE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const LAPTOP = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5" stroke="currentColor" stroke-width="1.8"/><path d="M2 19h20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const SHIELD = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

const RESPONSE_UI: Readonly<Record<Response, { label: string; key: string; sub: string; icon: string }>> = {
  approve: { label: "Approve", key: "A", sub: "It's me signing in", icon: "✓" },
  deny: { label: "Deny", key: "D", sub: "Block this sign-in", icon: "✕" },
  report: { label: "Report", key: "R", sub: "Deny and report: it's not me", icon: "⚑" },
};

const OUTCOME_TONE: Readonly<Record<Outcome, "good" | "hint" | "bad">> = {
  "signed-in": "good",
  reported: "good",
  blocked: "hint",
  "blocked-self": "hint",
  "false-alarm": "bad",
  breach: "bad",
};

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let hintText: string | null = null;
const started = performance.now();

$("#logo").innerHTML = LOGO;

function lastPick(): Pick | undefined {
  return state.phase === "answered" ? state.picks[state.picks.length - 1] : undefined;
}

function promptById(id: string): Prompt {
  return allPrompts(SCENARIO).find((prompt) => prompt.id === id)!;
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const prompt = currentPrompt(state);
  const stage = stageOf(SCENARIO, prompt.id);
  const prompts = allPrompts(SCENARIO);
  const pick = lastPick();
  const summary = summarize(state);
  $("#status").innerHTML = `
    <div class="clock">${esc(prompt.time)}</div>
    <div class="count"><strong>${state.index + 1}/${prompts.length}</strong><span>Prompt</span></div>
    <div class="count"><strong>${summary.total}</strong><span>Points</span></div>`;
  renderTimeline(prompt);
  $("#desk-head").innerHTML = `<h2>${esc(stage.title)}</h2><span class="phase-pill">${stage.final ? "No hints" : prompt.guided ? "Guided" : "Hints free"}</span>`;

  const coach = prompt.guided && !pick
    ? `<div class="coach"><strong>Your first prompt, guided.</strong> Look at three things before you decide: <b>what you are doing</b> on the left, <b>the app and place</b> on the push, and <b>the number</b> on your screen versus the phone. All three match here.</div>`
    : "";
  const feedback = pick
    ? `<div class="feedback-box ${OUTCOME_TONE[pick.outcome]}" role="status"><strong>${pick.correct ? "Right call." : pick.outcome === "breach" ? "Breach." : "Not the best call."}</strong> ${esc(feedbackFor(prompt, pick.response))}</div>`
    : hintText
      ? `<div class="feedback-box hint" role="status"><strong>Hint.</strong> ${esc(hintText)}</div>`
      : "";

  $("#desk").innerHTML = `
    ${coach}
    <div class="scene">
      <article class="context" aria-label="Right now" tabindex="-1">
        <p class="kicker">Right now · ${esc(prompt.time)}</p>
        <h3>${esc(prompt.doing)}</h3>
        <p class="where">${esc(prompt.where)}</p>
        <div class="screen-card ${prompt.screenNumber !== undefined ? "on" : "off"}" id="your-screen">
          ${LAPTOP}
          ${
            prompt.screenNumber !== undefined
              ? `<span>Your sign-in screen says<br /><b>Enter <em>${prompt.screenNumber}</em> in your app</b></span>`
              : `<span>No number on any screen in front of you</span>`
          }
        </div>
      </article>
      ${phone(prompt, pick)}
    </div>
    <div class="responses" role="group" aria-label="Your answer">
      ${(Object.keys(RESPONSE_UI) as Response[])
        .map((response) => {
          const ui = RESPONSE_UI[response];
          const chosen = pick?.response === response;
          const best = pick && bestResponse(prompt) === response;
          return `<button class="resp resp-${response} ${chosen ? "chosen" : ""} ${best ? "best" : ""}" data-resp="${response}" ${pick ? "disabled" : ""}>
            <i aria-hidden="true">${ui.icon}</i><span><b>${ui.label}</b><small>${ui.sub}</small></span><kbd>${ui.key}</kbd></button>`;
        })
        .join("")}
    </div>
    ${feedback}
    <div class="bench-actions">
      ${
        pick
          ? `<button class="btn primary" data-act="next">${state.index + 1 < prompts.length ? "Next" : "See debrief"} <kbd>N</kbd></button>`
          : hintsAllowed(state)
            ? `<button class="btn" data-act="hint" ${hintText ? "disabled" : ""}>Hint <kbd>H</kbd></button>`
            : `<span class="muted small">Final scenario: no hints.</span>`
      }
    </div>`;
  renderNext();
}

function phone(prompt: Prompt, pick: Pick | undefined): string {
  const stamp = pick ? `<div class="stamp ${OUTCOME_TONE[pick.outcome]}">${pick.response === "approve" ? "Approved" : pick.response === "deny" ? "Denied" : "Reported"}</div>` : "";
  return `
    <div class="phone" aria-label="Your phone">
      <div class="phone-bar"><span>${esc(prompt.time)}</span><span class="notch"></span><span>5G ▮▮▮</span></div>
      <div class="phone-body">
        ${prompt.message ? `<div class="sms" id="sms"><b>${esc(prompt.message.from)}</b><p>${esc(prompt.message.text)}</p></div>` : ""}
        <div class="push" id="push" role="alert">
          <div class="push-head">${SHIELD}<span>Kestrel Authenticator</span></div>
          <h4>Approve sign-in?</h4>
          <dl>
            <div><dt>App</dt><dd>${esc(prompt.app)}</dd></div>
            <div><dt>Location</dt><dd>${esc(prompt.location)}</dd></div>
            <div><dt>Time</dt><dd>${esc(prompt.time)}</dd></div>
          </dl>
          ${prompt.number !== undefined ? `<div class="match" id="push-number"><span>Number shown</span><b>${prompt.number}</b><small>Does it match your sign-in screen?</small></div>` : `<p class="nomatch">No number match for this app.</p>`}
          ${stamp}
        </div>
      </div>
    </div>`;
}

function renderTimeline(current: Prompt): void {
  const currentStage = stageOf(SCENARIO, current.id);
  const doneIds = new Map(state.picks.map((pick) => [pick.prompt, pick]));
  $("#timeline").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">${PHONE} Your day</h2><span class="phase-pill">${esc(SCENARIO.employee.split(",")[0])}</span></div>
    <div class="d-scroll">
      <p class="muted small">${esc(SCENARIO.employee)}, ${esc(SCENARIO.org)}. Fictional.</p>
      ${SCENARIO.stages
        .map((stage) => {
          type Row = { time: string; html: string };
          const rows: Row[] = [
            ...stage.beats.map((beat) => ({ time: beat.time, html: `<li class="beat"><time>${esc(beat.time)}</time><span>${esc(beat.text)}</span></li>` })),
            // Future prompts stay hidden: when the phone will buzz is part of the evidence.
            ...stage.prompts
              .filter((prompt) => prompt.id === current.id || doneIds.has(prompt.id))
              .map((prompt) => {
                const done = doneIds.get(prompt.id);
                const cls = done ? (done.correct ? "ok" : done.outcome === "breach" ? "breach" : "miss") : "now";
                return { time: prompt.time, html: `<li class="ev ${cls}"><time>${esc(prompt.time)}</time><span>${esc(prompt.app)} prompt${done ? ` · ${RESPONSE_UI[done.response].label}` : ""}</span></li>` };
              }),
          ].sort((a, b) => a.time.localeCompare(b.time));
          const on = stage.id === currentStage.id;
          return `<section class="stage ${on ? "on" : ""}"><h3>${esc(stage.title)}</h3>${on ? `<p>${esc(stage.lesson)}</p>` : ""}<ol class="day">${rows.map((row) => row.html).join("")}</ol></section>`;
        })
        .join("")}
    </div>`;
}

function renderNext(): void {
  const pick = lastPick();
  const prompt = currentPrompt(state);
  const last = state.index + 1 >= allPrompts(SCENARIO).length;
  let step: NextStep;
  if (pick) {
    step = {
      label: "Done",
      tone: pick.outcome === "breach" || pick.outcome === "false-alarm" ? "warn" : "ready",
      text: `<strong>+${pick.points} points.</strong> Read why, then press <strong>${last ? "See debrief" : "Next"}</strong> (or <kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else if (prompt.guided) {
    step = {
      text: `Compare <strong>your screen</strong> (${prompt.screenNumber}) with <strong>the number on the push</strong> (${prompt.number}). You started this sign-in, so press <strong>Approve</strong> (<kbd>A</kbd>).`,
      targets: ["#your-screen", "#push-number", ".resp-approve"],
    };
  } else {
    step = {
      text: `Did you start this sign-in? Check what you are doing, then <strong>Approve</strong> (<kbd>A</kbd>), <strong>Deny</strong> (<kbd>D</kbd>) or <strong>Report</strong> (<kbd>R</kbd>).`,
      hint: hintsAllowed(state) ? (hintText ? "The hint is in the yellow box." : "<strong>Hint</strong> (<kbd>H</kbd>) is free.") : "Final scenario: no hints.",
      targets: [".responses"],
    };
  }
  renderNextStep($("#next-step"), step);
}

function onRespond(response: Response): void {
  const pick = respond(state, response);
  if (!pick) return;
  hintText = null;
  play(pick.correct ? "success" : pick.outcome === "breach" ? "fail" : "setback");
  post("statement", { at: new Date().toISOString(), verb: "answered", object: pick.prompt, result: { correct: pick.correct, response, outcome: pick.outcome } });
  announce(feedbackFor(currentPrompt(state), response));
  render();
  document.querySelector<HTMLElement>("[data-act=next]")?.focus();
}

function onHint(): void {
  const text = takeHint(state);
  if (!text) return;
  hintText = text;
  render();
}

function goNext(): void {
  next(state);
  render();
  if (state.phase === "done") return;
  const prompt = currentPrompt(state);
  play("alarm");
  announce(`${prompt.time}. ${prompt.doing} Your phone buzzes: ${prompt.app} sign-in from ${prompt.location}.`);
  document.querySelector<HTMLElement>(".context")?.focus();
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-resp]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  if (target.dataset.resp) return onRespond(target.dataset.resp as Response);
  const act = target.dataset.act;
  if (act === "hint") onHint();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (state.phase === "play" && key === "a") onRespond("approve");
  else if (state.phase === "play" && key === "d") onRespond("deny");
  else if (state.phase === "play" && key === "r") onRespond("report");
  else if (key === "h" && state.phase === "play") onHint();
  else if (key === "n" && state.phase === "answered") goNext();
  else return;
  event.preventDefault();
});

// ---------- debrief ----------

function renderDebrief(): void {
  const summary = summarize(state);
  const evidence = evidenceOf(state);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, evidence, picks: state.picks });
  try {
    localStorage.setItem("ares-mfa:lastResult", JSON.stringify({ summary, evidence }));
  } catch {
    // Optional.
  }
  const habit =
    summary.breaches > 0
      ? `You approved <strong>${summary.breaches}</strong> prompt${summary.breaches === 1 ? "" : "s"} you didn't start. That is the whole attack: the attacker already had the password and only needed one tap. Approve only what you just started.`
      : summary.own.deny + summary.own.report > 0
        ? `No breach, but you blocked <strong>${summary.own.deny + summary.own.report}</strong> of your own sign-ins and lost about ${summary.lostMinutes} minutes. Denying everything is not safety, it is a different failure: use the context to tell yours apart.`
        : summary.attacker.deny > 0
          ? `Every sign-in of yours went through and nothing got in. You denied <strong>${summary.attacker.deny}</strong> attacker prompt${summary.attacker.deny === 1 ? "" : "s"} without reporting: an unexpected prompt means your password is out, so report it so it can be reset.`
          : "Every one of your sign-ins went through, and every attacker prompt was reported.";
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Score ${summary.total}<small>/${summary.max}</small> · ${summary.passed ? "Day secured" : summary.breaches ? "Account breached" : "Below the bar"}</h2>
        <p class="muted">${summary.ownSignIns} of ${summary.ownTotal} of your sign-ins completed · ${summary.attacker.report} attacker prompts reported, ${summary.attacker.deny} denied, ${summary.attacker.approve} approved · ${summary.lostMinutes} minutes lost · ${summary.hints} hint${summary.hints === 1 ? "" : "s"} (not scored). Pass: no breach, ${Math.round(PASS_RATIO * 100)}% of the points, and ${Math.round(PASS_OWN_RATIO * 100)}% of your own sign-ins.</p>
      </header>
      <div class="score-grid wide">${summary.byStage.map((entry) => tile(entry.title, entry.points, entry.max)).join("")}${tile("Your sign-ins", summary.ownSignIns, summary.ownTotal)}</div>
      <section class="panel"><h3>Your habit</h3><p>${habit}</p></section>
      <section class="panel">
        <h3>Learning evidence <span class="muted small">(separate from the score)</span></h3>
        <ul class="evidence">
          ${evidence.skills
            .map((skill) => `<li class="ev-${skill.level}"><b>${skill.level === "shown" ? "Shown" : skill.level === "partial" ? "Partly" : skill.level === "n/a" ? "n/a" : "Not yet"}</b><span>${esc(skill.label)}</span><small>${skill.shown}/${skill.of}</small></li>`)
            .join("")}
          <li class="ev-${evidence.final.correct === evidence.final.of ? "shown" : evidence.final.correct ? "partial" : "not-yet"}"><b>Final</b><span>After-hours scenario, no hints</span><small>${evidence.final.correct}/${evidence.final.of}</small></li>
          <li class="ev-${evidence.unaided.correct === evidence.unaided.of ? "shown" : "partial"}"><b>Unaided</b><span>Best call on decisions made without a hint</span><small>${evidence.unaided.correct}/${evidence.unaided.of}</small></li>
        </ul>
      </section>
      <section class="panel">
        <h3>Replay: every prompt and the clue</h3>
        <div class="replay">
          ${state.picks
            .map((pick) => {
              const prompt = promptById(pick.prompt);
              const best = bestResponse(prompt);
              return `<article class="rp ${pick.correct ? "ok" : pick.outcome === "breach" ? "breach" : "miss"}">
                <header><time>${esc(prompt.time)}</time><b>${esc(prompt.app)}</b><span>${esc(prompt.location)}${prompt.number !== undefined ? ` · number ${prompt.number}` : ""}${prompt.screenNumber !== undefined ? ` · your screen ${prompt.screenNumber}` : ""}</span>
                  <em class="${prompt.origin}">${prompt.origin === "you" ? "Yours" : "Attacker"}</em></header>
                <p class="muted small">${esc(prompt.doing)}</p>
                <p class="chips">${prompt.clues.map((clue) => `<span class="chip ${clue === "yours" || clue === "match" ? "cool" : "hot"}">${esc(CLUE_LABELS[clue])}</span>`).join("")}</p>
                <p><strong>You: ${RESPONSE_UI[pick.response].label}${pick.correct ? "" : ` · Best: ${RESPONSE_UI[best].label}`}.</strong> ${esc(OUTCOME_TEXT[pick.outcome])}</p>
                <p class="muted small">${esc(prompt.why)}</p>
              </article>`;
            })
            .join("")}
        </div>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional · Content to be reviewed with SMEs (docs/design/MFA_FATIGUE.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function tile(label: string, value: number, max: number): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong></div>`;
}

// ---------- walkthrough ----------

function tutorialPages(retry: boolean): TutorialPage[] {
  const prompts = allPrompts(SCENARIO);
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are ${esc(SCENARIO.employee)} at ${esc(SCENARIO.org)}. Your sign-ins need a tap on your phone to approve them.</p>
        <p class="tut-lead">Today an attacker has your password. All they need is <strong>one tap from you</strong>, so they will keep buzzing your phone until you give in.</p>
        <p class="tut-note">${PHONE}<span>The one rule: <strong>approve only a sign-in you started a moment ago.</strong></span></p>`,
    },
    {
      title: "Read the context",
      body: `
        <div class="tut-ex">
          <div class="row"><span class="tag">Left: your day</span><span class="then">what you are doing, where, and when</span></div>
          <div class="row"><span class="tag sensor">Your screen</span><span class="then">the number your sign-in page shows, if you are signing in</span></div>
          <div class="row"><span class="tag">The phone</span><span class="then">app, location, time and number on the push</span></div>
        </div>
        <p>The push looks the same whether it is yours or the attacker's. <strong>The context is the evidence:</strong> were you signing in? Does the number match your screen? A text telling you to approve is part of the attack.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Approve</b> <kbd>A</kbd><span class="how">Only for a sign-in you just started, with a matching number if there is one.</span></span></li>
          <li><span><b>Deny</b> <kbd>D</kbd><span class="how">Blocks this one push. Safe, but if it was yours you are locked out of your own work.</span></span></li>
          <li><span><b>Report</b> <kbd>R</kbd><span class="how">Denies and tells security it wasn't you, so they can reset your password. Best for any prompt you didn't start.</span></span></li>
        </ol>
        <p class="tut-muted">The first prompt is guided. Hints (<kbd>H</kbd>) are free until the final, after-hours scenario. Then press <span class="tut-pill">Next</span> (<kbd>N</kbd>).</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>${POINTS.you.approve} <small>points</small></b>Approve your own sign-in. Deny it: ${POINTS.you.deny}. Report it: ${POINTS.you.report}.</div>
          <div><b>${POINTS.attacker.report} <small>points</small></b>Report the attacker. Deny only: ${POINTS.attacker.deny}.</div>
          <div><b>${POINTS.attacker.approve} <small>points</small></b>Approve the attacker: that is the breach, and it fails the day.</div>
        </div>
        <p>${prompts.length} prompts. Approving everything fails, and so does denying everything. Learning evidence is reported separately from the score; speed is never scored.</p>
        ${retry ? `<p class="tut-note">${PHONE}<span>Starting again: same day, fresh score.</span></p>` : ""}
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
  state = createGame(SCENARIO);
  hintText = null;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.org} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Start the day",
    onStart: () => document.querySelector<HTMLElement>(".resp-approve")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
