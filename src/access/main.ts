import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO, SYSTEMS } from "./data";
import {
  EVENT_LABELS,
  EXCESS_PENALTY,
  LEVEL_LABELS,
  LINGER_PENALTY,
  PASS_RATIO,
  PASS_WORK_RATIO,
  REQUEST_POINTS,
  UNTIDY_PENALTY,
  commit,
  createGame,
  currentRequest,
  cycleGrant,
  evidenceOf,
  hintsAllowed,
  next,
  setGrant,
  summarize,
  takeHint,
  type Cap,
  type Decision,
  type Evaluation,
  type GameState,
  type Grant,
  type Issue,
  type Item,
  type ItemResult,
  type Request,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-least-privilege/the-access-desk/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const KEY = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="8" cy="15" r="4.2" stroke="currentColor" stroke-width="1.8"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M13.5 9.5l2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const INBOX = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 13 6 5h12l3 8v6H3v-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 13h5l1.5 2.5h5L16 13h5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

const KIND_LABELS: Readonly<Record<Request["kind"], string>> = {
  joiner: "Joiner",
  mover: "Mover",
  contractor: "Contractor",
  manager: "Manager",
  breakglass: "Break-glass",
  final: "Final",
};

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let hintText: string | null = null;
const started = performance.now();

$("#logo").innerHTML = LOGO;

function capText(cap: Cap): string {
  return `${SYSTEMS[cap.system] ?? cap.system} · ${LEVEL_LABELS[cap.level]}`;
}

function capChips(caps: readonly Cap[]): string {
  return caps.map((cap) => `<span class="cap cap-${cap.level}">${esc(capText(cap))}</span>`).join("");
}

function grantLabel(request: Request, itemId: string, grant: Grant): string {
  const held = request.held.includes(itemId);
  if (grant === "none") return held ? "Remove" : "Not granted";
  if (grant === "timed") return `Time-limited (${request.timedLabel})`;
  return held ? "Keep" : "Permanent";
}

function lastDecision(): Decision | undefined {
  return state.phase === "answered" ? state.decisions[state.decisions.length - 1] : undefined;
}

function itemOf(request: Request, id: string): Item {
  return request.catalogue.find((item) => item.id === id)!;
}

function matchesBest(request: Request): boolean {
  return request.catalogue.every((item) => state.selection[item.id] === (request.best[item.id] ?? "none"));
}

// ---------- play ----------

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const request = currentRequest(state);
  const decision = lastDecision();
  const summary = summarize(state);
  const total = SCENARIO.requests.length;
  $("#status").innerHTML = `
    <div class="count first"><strong>${state.index + 1}/${total}</strong><span>Request</span></div>
    <div class="count"><strong>${summary.total}</strong><span>Points</span></div>`;
  renderRequest(request, decision?.result);
  $("#desk-head").innerHTML = `<h2>${KEY} ${decision ? "The week plays out" : "Access catalogue"}</h2><span class="phase-pill">${request.final ? "No hints" : request.guided ? "Guided" : "Hints free"}</span>`;
  $("#desk").innerHTML = decision ? playback(request, decision) : catalogue(request);
  renderNext();
}

function renderRequest(request: Request, result: Evaluation | undefined): void {
  $("#request").innerHTML = `
    <div class="col-head"><h2 tabindex="-1" id="request-title">${INBOX} Request</h2><span class="phase-pill">${esc(KIND_LABELS[request.kind])}</span></div>
    <div class="d-scroll">
      <div class="who">
        <p class="kicker">${esc(request.title)}</p>
        <h3>${esc(request.person)}</h3>
        <p class="job">${esc(request.job)}</p>
      </div>
      <blockquote class="ask"><p>“${esc(request.ask)}”</p><footer>${esc(request.from)}</footer></blockquote>
      <p class="context-note"><b>What you know.</b> ${esc(request.context)}</p>
      <h4 class="sub-head">What ${esc(request.person.split(" ")[0])} will actually do</h4>
      <ol class="tasks" id="tasks">
        ${request.tasks
          .map((task) => {
            const outcome = result?.tasks.find((entry) => entry.task === task.id);
            const cls = outcome ? (outcome.works ? "works" : "blocked") : "";
            const mark = outcome ? (outcome.works ? "✓" : "✕") : "•";
            // The need is spelled out only on the guided request and once the week has played out:
            // reading it from the task is the skill.
            const need = request.guided || outcome ? `<small>${capChips([task.needs])}<span class="dur">${task.duration === "standing" ? "Ongoing" : "Temporary"}</span></small>` : "";
            return `<li class="${cls}" data-id="${esc(task.id)}"><i aria-hidden="true">${mark}</i><span>${esc(task.text)}${outcome ? `<span class="sr-only"> ${outcome.works ? "works" : "blocked"}</span>` : ""}${need}</span></li>`;
          })
          .join("")}
      </ol>
    </div>`;
}

function catalogue(request: Request): string {
  const coach = request.guided
    ? `<div class="coach"><strong>Your first request, guided.</strong> Each task in the request needs one <b>system</b> at one <b>level</b> (View, Change or Admin). Find the smallest grant that covers both tasks. A <b>role</b> is a ready-made bundle for a job; a <b>right</b> is a single permission.</div>`
    : "";
  const hint = hintText ? `<div class="feedback-box hint" role="status"><strong>Hint.</strong> ${esc(hintText)}</div>` : "";
  return `
    ${coach}
    <ul class="catalogue" id="catalogue" aria-label="Access you can grant">
      ${request.catalogue
        .map((item, index) => {
          const grant = state.selection[item.id];
          const held = request.held.includes(item.id);
          const options: readonly Grant[] = ["none", "timed", "perm"];
          return `<li class="item ${item.kind} g-${grant} ${held ? "held" : ""}" data-id="${esc(item.id)}">
            <div class="item-main">
              <kbd aria-hidden="true">${index + 1}</kbd>
              <div>
                <p class="item-name"><em class="kind">${item.kind === "role" ? "Role" : "Right"}</em><b>${esc(item.name)}</b>${held ? `<span class="tag-held">Has it now</span>` : ""}</p>
                ${item.note ? `<p class="item-note">${esc(item.note)}</p>` : ""}
                <p class="caps">${capChips(item.caps)}</p>
              </div>
            </div>
            <div class="seg" role="group" aria-label="${esc(item.name)}">
              ${options
                .map((option) => {
                  const label = option === "none" ? (held ? "Remove" : "No") : option === "timed" ? request.timedLabel : held ? "Keep" : "Permanent";
                  return `<button type="button" class="seg-btn s-${option}" data-act="set" data-id="${esc(item.id)}" data-value="${option}" aria-pressed="${grant === option}" aria-label="${esc(item.name)}: ${esc(grantLabel(request, item.id, option))}">${option === "timed" ? `<span aria-hidden="true">⏱</span> ` : ""}${esc(label)}</button>`;
                })
                .join("")}
            </div>
          </li>`;
        })
        .join("")}
    </ul>
    ${hint}
    <div class="bench-actions">
      <button class="btn primary" data-act="commit">Commit access <kbd>C</kbd></button>
      ${hintsAllowed(state) ? `<button class="btn" data-act="hint" ${hintText ? "disabled" : ""}>Hint <kbd>H</kbd></button>` : `<span class="muted small">Final request: no hints.</span>`}
      <span class="muted small keys">Keys <kbd>1</kbd>–<kbd>${request.catalogue.length}</kbd> step a row: no → time-limited → permanent.</span>
    </div>`;
}

function issueBadge(issue: Issue): string {
  if (issue.kind === "excess" || issue.kind === "linger") return EVENT_LABELS[issue.event!];
  return issue.kind === "renewal" ? "Expired mid-job" : "Clutter";
}

// One line of evidence per catalogue item the learner touched or should have touched.
function grantRows(request: Request, result: Evaluation): { item: Item; entry: ItemResult; tone: "good" | "warn" | "bad"; html: string }[] {
  return result.items
    .filter((entry) => entry.grant !== "none" || entry.held || entry.best !== "none")
    .map((entry) => {
      const item = itemOf(request, entry.item);
      let tone: "good" | "warn" | "bad" = "good";
      let html: string;
      if (entry.grant === "none") {
        if (entry.best === "none") html = `<p>Removed. Nothing from the old job is left behind to be misused.</p>`;
        else {
          tone = "warn";
          html = `<p>${entry.held ? "Removed, but the work still needs it." : "Not granted, and the work needs it."} See the blocked task${entry.best === "timed" ? `; the fitting grant was time-limited (${esc(request.timedLabel)})` : ""}.</p>`;
        }
      } else if (entry.issues.length === 0) {
        html = `<p>Used for the work, every day. Nothing extra for an attacker or a slip to reach${entry.grant === "timed" ? `, and it removes itself after ${esc(request.timedLabel)}` : ""}.</p>`;
      } else {
        tone = entry.issues.some((issue) => issue.kind === "excess" || issue.kind === "linger") ? "bad" : "warn";
        html = entry.issues
          .map((issue) => `<p><span class="ev-badge ${issue.kind}">${esc(issueBadge(issue))}</span> ${esc(issue.text)} <b class="pen">−${issue.penalty}</b></p>`)
          .join("");
      }
      return { item, entry, tone, html };
    });
}

function grantRowHtml(request: Request, row: ReturnType<typeof grantRows>[number], index: number): string {
  const { item, entry } = row;
  return `<li class="out ${row.tone}" style="--i:${index}" data-id="${esc(item.id)}">
    <header><em class="kind ${item.kind}">${item.kind === "role" ? "Role" : "Right"}</em><b>${esc(item.name)}</b><span class="you-set">${esc(grantLabel(request, item.id, entry.grant))}</span></header>
    ${row.html}
  </li>`;
}

function playback(request: Request, decision: Decision): string {
  const result = decision.result;
  const blocked = request.tasks.filter((task) => !result.tasks.find((entry) => entry.task === task.id)!.works);
  const rows = grantRows(request, result);
  const verdict = result.perfect ? "Least privilege." : result.incident ? "Major incident." : result.working < request.tasks.length ? "Work blocked." : "Not the minimum.";
  const tone = result.perfect ? "good" : result.incident || result.points < REQUEST_POINTS / 2 ? "bad" : "hint";
  return `
    <div class="feedback-box ${tone}" role="status" id="verdict"><strong>${verdict}</strong> ${result.working} of ${request.tasks.length} tasks work (${result.workPoints} points)${result.penalties ? `, problem grants −${result.penalties}` : ""}: <b>${result.points}/${REQUEST_POINTS}</b>.</div>
    ${
      blocked.length
        ? `<ul class="outcomes" aria-label="Blocked work">${blocked.map((task, index) => `<li class="out warn" style="--i:${index}"><header><span class="ev-badge blocked">Blocked work</span><b>${esc(task.text)}</b></header><p>${esc(task.blocked)}</p></li>`).join("")}</ul>`
        : ""
    }
    <ul class="outcomes" aria-label="Each grant, tested">${rows.map((row, index) => grantRowHtml(request, row, index + blocked.length)).join("")}</ul>
    <p class="lesson"><b>Takeaway.</b> ${esc(request.lesson)}</p>
    <div class="bench-actions">
      <button class="btn primary" data-act="next">${state.index + 1 < SCENARIO.requests.length ? "Next request" : "See debrief"} <kbd>N</kbd></button>
    </div>`;
}

function renderNext(): void {
  const decision = lastDecision();
  const request = currentRequest(state);
  const last = state.index + 1 >= SCENARIO.requests.length;
  let step: NextStep;
  if (decision) {
    step = {
      label: "Done",
      tone: decision.result.perfect ? "ready" : "warn",
      text: `<strong>${decision.result.points} of ${REQUEST_POINTS} points.</strong> Read what each grant led to, then press <strong>${last ? "See debrief" : "Next request"}</strong> (or <kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else if (request.guided && !matchesBest(request)) {
    const extra = request.catalogue.find((item) => state.selection[item.id] !== "none" && !(item.id in request.best));
    const role = itemOf(request, Object.keys(request.best)[0]);
    step = extra
      ? { text: `<strong>${esc(extra.name)}</strong> gives more than the two tasks need. Set it back to <strong>No</strong>.`, targets: [`[data-act="set"][data-id="${extra.id}"][data-value="none"]`] }
      : {
          text: `Both tasks are covered by one role. Set <strong>${esc(role.name)}</strong> to <strong>Permanent</strong>: it is her job from now on.`,
          hint: "The manager's own role would also work, and so would admin. That is the trap.",
          targets: [`[data-act="set"][data-id="${role.id}"][data-value="perm"]`],
        };
  } else if (request.guided) {
    step = { label: "Ready", tone: "ready", text: `That is the smallest set that lets Amara work. Press <strong>Commit access</strong> (<kbd>C</kbd>) and watch her week.`, targets: ['[data-act="commit"]'] };
  } else {
    step = {
      text: `Grant the least that lets every task work${request.held.length ? ", and decide what to do with the access already held" : ""}. Then <strong>Commit access</strong> (<kbd>C</kbd>).`,
      hint: hintsAllowed(state) ? (hintText ? "The hint is in the yellow box." : "<strong>Hint</strong> (<kbd>H</kbd>) is free.") : "Final request: no hints.",
      targets: [],
    };
  }
  renderNextStep($("#next-step"), step);
}

function onSet(itemId: string, grant: Grant, refocus: boolean): void {
  if (!setGrant(state, itemId, grant)) return;
  afterChange(itemId, refocus);
}

function afterChange(itemId: string, refocus: boolean): void {
  const request = currentRequest(state);
  play("click");
  render();
  announce(`${itemOf(request, itemId).name}: ${grantLabel(request, itemId, state.selection[itemId])}`);
  if (refocus) document.querySelector<HTMLElement>(`[data-act="set"][data-id="${itemId}"][data-value="${state.selection[itemId]}"]`)?.focus();
}

function onCommit(): void {
  const decision = commit(state);
  if (!decision) return;
  hintText = null;
  const request = currentRequest(state);
  const result = decision.result;
  play(result.perfect ? "success" : result.incident ? "fail" : "setback");
  post("statement", {
    at: new Date().toISOString(),
    verb: "answered",
    object: request.id,
    result: { correct: result.perfect, points: result.points, tasksWorking: result.working, tasks: request.tasks.length, incident: result.incident, selection: decision.selection },
  });
  render();
  announce(`${result.working} of ${request.tasks.length} tasks work. ${result.points} of ${REQUEST_POINTS} points. ${result.perfect ? "Least privilege." : result.incident ? "Major incident." : ""}`);
  document.querySelector<HTMLElement>("[data-act=next]")?.focus({ preventScroll: true });
  $("#desk").scrollTop = 0;
}

function onHint(): void {
  const text = takeHint(state);
  if (!text) return;
  hintText = text;
  render();
  announce(`Hint. ${text}`);
}

function goNext(): void {
  next(state);
  render();
  if (state.phase === "done") return;
  const request = currentRequest(state);
  announce(`Request ${state.index + 1}. ${request.person}, ${request.job}.`);
  $("#desk").scrollTop = 0;
  $("#request-title").focus();
  $("#request").scrollIntoView({ block: "start" });
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  const act = target.dataset.act;
  if (act === "set") onSet(target.dataset.id!, target.dataset.value as Grant, true);
  else if (act === "commit") onCommit();
  else if (act === "hint") onHint();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (state.phase === "play" && /^[1-9]$/.test(key)) {
    const item = currentRequest(state).catalogue[Number(key) - 1];
    if (!item || !cycleGrant(state, item.id)) return;
    afterChange(item.id, true);
  } else if (state.phase === "play" && key === "c") onCommit();
  else if (state.phase === "play" && key === "h") onHint();
  else if (state.phase === "answered" && key === "n") goNext();
  else return;
  event.preventDefault();
});

// ---------- debrief ----------

function renderDebrief(): void {
  const summary = summarize(state);
  const evidence = evidenceOf(state);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, evidence, decisions: state.decisions });
  try {
    localStorage.setItem("ares-access:lastResult", JSON.stringify({ summary, evidence }));
  } catch {
    // Optional.
  }
  const blockedTasks = summary.tasksTotal - summary.tasksWorking;
  const habit =
    summary.incidents > 0
      ? `You granted admin nobody needed on <strong>${summary.incidents}</strong> request${summary.incidents === 1 ? "" : "s"}, and each time one phished password or one slip turned into a company-wide incident. “Admin, to be safe” is the least safe answer on the desk.`
      : blockedTasks > summary.tasksTotal * (1 - PASS_WORK_RATIO)
        ? `Nothing was breached, but <strong>${blockedTasks}</strong> of ${summary.tasksTotal} tasks were blocked. Saying no is not least privilege: people who cannot work find a way round you, and then nobody controls the access.`
        : summary.excess > 0
          ? `The work got done, but <strong>${summary.excess}</strong> grant${summary.excess === 1 ? "" : "s"} went beyond the tasks. Each one cost nothing on the day and was the whole problem when something went wrong.`
          : summary.lingering > 0
            ? `The scope was right, but <strong>${summary.lingering}</strong> temporary need${summary.lingering === 1 ? " was" : "s were"} granted permanently. If the work has an end date, the access should have one too.`
            : summary.untidy + summary.renewals > 0
              ? `Everyone could work and nothing extra was exposed. The last step: use the role where one fits, and make standing access permanent, so the next review is easy.`
              : "Every request got exactly what the work needed: the right role, time limits on temporary work, and old access removed.";
  const headline = summary.passed ? "Desk secured" : summary.incidents ? "Major incident" : "Below the bar";
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)} · ${esc(SCENARIO.org)}</p>
        <h2 id="debrief-title" tabindex="-1">Score ${summary.total}<small>/${summary.max}</small> · ${headline}</h2>
        <p class="muted">${summary.tasksWorking} of ${summary.tasksTotal} tasks worked · ${summary.excess} grant${summary.excess === 1 ? "" : "s"} beyond the work · ${summary.lingering} temporary need${summary.lingering === 1 ? "" : "s"} left permanent · ${summary.perfect} of ${SCENARIO.requests.length} requests at the minimum · ${summary.hints} hint${summary.hints === 1 ? "" : "s"} (not scored). Pass: no unneeded admin, ${Math.round(PASS_RATIO * 100)}% of the points, and ${Math.round(PASS_WORK_RATIO * 100)}% of the tasks working.</p>
      </header>
      <div class="score-grid wide">${summary.byRequest.map((entry) => tile(entry.title, entry.points, entry.max)).join("")}</div>
      <section class="panel"><h3>Your habit</h3><p>${habit}</p></section>
      <section class="panel">
        <h3>Learning evidence <span class="muted small">(separate from the score)</span></h3>
        <ul class="evidence">
          ${evidence.skills
            .map((skill) => `<li class="ev-${skill.level}"><b>${skill.level === "shown" ? "Shown" : skill.level === "partial" ? "Partly" : skill.level === "n/a" ? "n/a" : "Not yet"}</b><span>${esc(skill.label)}</span><small>${skill.shown}/${skill.of}</small></li>`)
            .join("")}
          <li class="ev-${evidence.final.correct === evidence.final.of ? "shown" : "not-yet"}"><b>Final</b><span>Minimal sufficient set on the final request, no hints</span><small>${evidence.final.correct}/${evidence.final.of}</small></li>
          <li class="ev-${evidence.unaided.of > 0 && evidence.unaided.correct === evidence.unaided.of ? "shown" : evidence.unaided.correct ? "partial" : "not-yet"}"><b>Unaided</b><span>Minimal sufficient set on requests decided without a hint</span><small>${evidence.unaided.correct}/${evidence.unaided.of}</small></li>
        </ul>
      </section>
      <section class="panel">
        <h3>Replay: every grant and what it led to</h3>
        <div class="replay">
          ${state.decisions
            .map((decision) => {
              const request = SCENARIO.requests.find((entry) => entry.id === decision.request)!;
              const result = decision.result;
              const blocked = request.tasks.filter((task) => !result.tasks.find((entry) => entry.task === task.id)!.works);
              return `<article class="rp ${result.perfect ? "ok" : result.incident ? "breach" : "miss"}" data-id="${esc(request.id)}">
                <header><b>${esc(request.title)}</b><span>${esc(request.person)}, ${esc(request.job)}</span><em>${result.points}/${REQUEST_POINTS}${decision.hinted ? " · hint" : ""}</em></header>
                <p class="muted small">${result.working} of ${request.tasks.length} tasks worked${blocked.length ? `. Blocked: ${blocked.map((task) => esc(task.text)).join("; ")}` : ""}.</p>
                <ul class="outcomes static">
                  ${grantRows(request, result)
                    .map((row, index) => {
                      const best = row.entry.correct ? "" : `<p class="best-line">Minimum: <b>${esc(grantLabel(request, row.item.id, row.entry.best))}</b></p>`;
                      return grantRowHtml(request, row, index).replace("</li>", `${best}</li>`);
                    })
                    .join("")}
                </ul>
                <p class="muted small">${esc(request.lesson)}</p>
              </article>`;
            })
            .join("")}
        </div>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional · Content to be reviewed with SMEs (docs/design/LEAST_PRIVILEGE.md)</p>
    </div>`;
  window.scrollTo(0, 0);
  $("#debrief-title").focus();
}

function tile(label: string, value: number, max: number): string {
  const tone = value >= max * 0.85 ? "good" : value >= max * 0.5 ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong></div>`;
}

// ---------- walkthrough ----------

function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You run the access desk at ${esc(SCENARIO.org)}. People ask you for access so they can do their jobs.</p>
        <p class="tut-lead">Give too little and the work stops. Give too much and one stolen password or one slip reaches everything you granted.</p>
        <p class="tut-note">${KEY}<span>The one rule: <strong>grant the least that still lets every task work.</strong></span></p>`,
    },
    {
      title: "Read the request",
      body: `
        <div class="tut-ex">
          <div class="row"><span class="tag">The ask</span><span class="then">what they want, in their words. Often more than they need.</span></div>
          <div class="row"><span class="tag sensor">The tasks</span><span class="then">what they will actually do. This is what you grant for.</span></div>
          <div class="row"><span class="tag">What you know</span><span class="then">new starter, role change, contract end date, a real emergency</span></div>
        </div>
        <p>Each task needs one system at one level: <strong>View</strong>, <strong>Change</strong> or <strong>Admin</strong>. “Look up” is View. “Enter” or “approve” is Change. Admin is for running the system itself.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Set each row</b> <kbd>1</kbd>–<kbd>8</kbd><span class="how">No, time-limited, or permanent. A <b>role</b> is a bundle made for a job; a <b>right</b> is one permission. If a role fits, use it instead of single rights.</span></span></li>
          <li><span><b>Time-limit temporary work</b><span class="how">A contract, a two-week cover, an emergency: the access should end by itself. Standing duties get permanent access.</span></span></li>
          <li><span><b>Remove what is no longer needed</b><span class="how">Rows marked “Has it now” are access the person already holds. After a role change, take the old job's access away.</span></span></li>
          <li><span><b>Commit access</b> <kbd>C</kbd><span class="how">Their week plays out: tasks work or are blocked, and every extra grant is tested by a phish, a mistake or a forgotten account.</span></span></li>
        </ol>
        <p class="tut-muted">The first request is guided. Hints (<kbd>H</kbd>) are free until the final request. Then press <span class="tut-pill">Next</span> (<kbd>N</kbd>).</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>${REQUEST_POINTS} <small>points</small></b>Per request, shared across its tasks. A blocked task loses its share.</div>
          <div><b>−${EXCESS_PENALTY.read} to −${EXCESS_PENALTY.admin}</b>Each grant beyond the work: View −${EXCESS_PENALTY.read}, Change −${EXCESS_PENALTY.write}, Admin −${EXCESS_PENALTY.admin}.</div>
          <div><b>−${LINGER_PENALTY}</b>Temporary work granted permanently. Clutter (a one-off right where a role fits): −${UNTIDY_PENALTY}.</div>
        </div>
        <p>${SCENARIO.requests.length} requests. Granting everything fails, and so does granting nothing. Learning evidence is reported separately from the score; speed is never scored.</p>
        ${retry ? `<p class="tut-note">${KEY}<span>Starting again: same requests, fresh score.</span></p>` : ""}
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
  window.scrollTo(0, 0);
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.org} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Open the desk",
    onStart: () => $("#request-title").focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
