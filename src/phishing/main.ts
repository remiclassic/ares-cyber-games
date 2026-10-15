import "../style.css";
import "./phishing.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, showTutorial, type TutorialPage } from "../ui/tutorial";
import { MESSAGES, ORG_REFERENCE, SCENARIO } from "./data/messages";
import { ACTIVITY_ID, createDrillHost, readLastDrillResult } from "./host";
import {
  ACCURACY_POINTS,
  EVIDENCE_POINTS,
  MAX_EVIDENCE,
  PAR_SECONDS,
  PARTIAL_REPORT_POINTS,
  PARTIAL_SAFE_POINTS,
  SPEED_MAX,
  STREAK_CAP,
  STREAK_STEP,
  summarize,
} from "./sim/drill";
import { renderDrillDebrief } from "./ui/debrief";
import { DrillController } from "./ui/drill";
import { icon } from "./ui/icons";

type Screen = "intro" | "drill" | "drill-debrief";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createDrillHost();
let runs = 0;

function show(screen: Screen): void {
  for (const id of ["intro", "drill", "drill-debrief"]) $(`#${id}`).hidden = id !== screen;
  window.scrollTo(0, 0);
}

const drill = new DrillController($("#drill"), host, (run) => {
  drill.stop();
  const summary = summarize(run.order, run.decisions);
  host.record({ verb: "completed", object: ACTIVITY_ID, result: { total: summary.total, rating: summary.rating } });
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: run.durationSeconds,
    seed: run.seed,
    score: summary,
    decisions: run.decisions,
  });
  renderDrillDebrief($("#drill-debrief"), run.order, run.decisions, summary, { retry: startDrill, home: renderIntro });
  show("drill-debrief");
  $("#drill-debrief-title").focus();
});

const KICKER = "Phishing Speed Drill · How to play";
const BATCHES = [1, 2, 3].map((batch) => MESSAGES.filter((m) => m.batch === batch).length);

// The walkthrough: the mission, what is on the screen, the moves, the three responses (made-up
// examples), and how it is scored. Reopenable from the drill header.
function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are covering the Acme operations inbox (${esc(SCENARIO.inbox)}) this morning. <strong>${MESSAGES.length} messages</strong> arrive in ${BATCHES.length} batches of ${BATCHES.join(", ")}.</p>
        <p class="tut-lead">For each one, decide what to do, and back the decision with evidence from the message:</p>
        <ol class="tut-moves">
          <li><span><b>Inspect it</b>: who sent it, where replies go, where its links and attachments really lead, what it asks for.</span></li>
          <li><span><b>Compare it</b> with what Acme has on file: its addresses, payroll provider, suppliers and policy.</span></li>
          <li><span><b>Respond</b>: report it, mark it safe, or verify it through a trusted channel first.</span></li>
        </ol>
        <p class="tut-note">${icon("clock")}<span>The first message is guided and untimed. After that, each message has a ${PAR_SECONDS}-second clock for a small speed bonus. Nothing happens when it runs out.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${icon("mail")}</span><span><b>Inbox (left)</b>Messages that have arrived. A tick, dash or cross shows how each finished one went.</span></div>
          <div><span class="tut-ico box">${icon("doc")}</span><span><b>Message (middle)</b>The open message. The sender, links, buttons, attachments and <em>show reply-to</em> can all be clicked to inspect.</span></div>
          <div><span class="tut-ico box">${icon("search")}</span><span><b>Inspector (right)</b>One row per cue. Inspected cues show plain facts. The <em>Acme reference</em> tab lists what Acme has on file.</span></div>
          <div><span class="tut-ico box">${icon("star")}</span><span><b>Top bar</b>Message number, the clock and its speed bonus, your streak and your score.</span></div>
        </div>
        <p class="tut-note">${icon("chevron")}<span>The bar under the top bar always says what to do next.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Inspect cues</b><span class="how">Click the sender, a link, a button or an attachment in the message, or press <span class="tut-pill">Inspect</span> on a cue in the Inspector. Each one shows its facts, never a verdict.</span></span></li>
          <li><span><b>Pick your evidence</b><span class="how">On an inspected cue, press <span class="tut-pill">Use as evidence</span>. Up to ${MAX_EVIDENCE} cues. <span class="tut-pill">Remove from evidence</span> swaps one out.</span></span></li>
          <li><span><b>Respond</b><span class="how">Press <span class="tut-pill">Report phishing</span> <kbd>R</kbd>, <span class="tut-pill">Mark safe</span> <kbd>S</kbd> or <span class="tut-pill">Verify first</span> <kbd>V</kbd> under the message. A decision is final.</span></span></li>
          <li><span><b>Learn why, then move on</b><span class="how">The Inspector now marks each cue, and missed cues are flagged. Press <span class="tut-pill">Next message</span> <kbd>N</kbd> (<span class="tut-pill">See debrief</span> after the last one).</span></span></li>
        </ol>`,
    },
    {
      title: "Three responses",
      body: `
        <p>Pick the response the evidence supports. (Made-up messages, not ones from the drill.)</p>
        <div class="tut-ex">
          <div class="row"><span class="tag hot">Report phishing</span><span class="then">The evidence shows it is malicious. Say a "delivery fee" notice from <b>quickship-parcels.example</b> links to <b>quickship-pay.example</b>, and Acme has no such supplier.</span></div>
          <div class="row"><span class="tag ok">Mark safe</span><span class="then">The evidence shows it is genuine. Say a canteen menu from an <b>@acme.example</b> address links to <b>intranet.acme.example</b> and asks for nothing.</span></div>
          <div class="row"><span class="tag">Verify first</span><span class="then">The inbox alone cannot settle it, and acting on it if it were fake would do real harm. Check with the sender through a channel you already trust, such as a number on file, not one given in the message.</span></div>
        </div>
        <p class="tut-note">${icon("alert")}<span>Look at what a cue <strong>shows</strong>, not how a message feels. After you decide, each cue is marked Suspicious, Matches, Needs a check, or Weak alone.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Decision <small>+${ACCURACY_POINTS}</small></b>For the best response. Verify first when the inbox already settled it: +${PARTIAL_SAFE_POINTS}. Reporting a request that needed a check: +${PARTIAL_REPORT_POINTS} if the check would have found it malicious.</div>
          <div><b>Evidence <small>+${EVIDENCE_POINTS} each</small></b>Per relevant cue you picked, up to ${MAX_EVIDENCE}. Only on a correct decision.</div>
          <div><b>Streak <small>up to +${STREAK_STEP * STREAK_CAP}</small></b>Correct decisions in a row, each backed by a relevant cue: +${STREAK_STEP} for the 2nd, +${STREAK_STEP * 2} for the 3rd, +${STREAK_STEP * STREAK_CAP} from then on.</div>
          <div><b>Speed <small>up to +${SPEED_MAX}</small></b>Only on a correct decision. It shrinks to 0 over ${PAR_SECONDS} seconds.</div>
        </div>
        <p>Any other response scores 0 for that message, and a correct decision with no relevant cue resets your streak. Reporting everything cannot earn a top result.</p>
        <p class="tut-muted">Your rating compares your score with a perfect run without speed bonus. The clock pauses while this guide is open.</p>
        ${retry ? `<p class="tut-note">${icon("check")}<span>The first batch keeps its order. Later batches are shuffled.</span></p>` : ""}`,
    },
  ];
}

function startDrill(): void {
  runs += 1;
  const retry = runs > 1;
  if (retry) host.record({ verb: "retried", object: ACTIVITY_ID });
  show("drill");
  // A new seed reorders the later batches; the first batch keeps its teaching order.
  drill.start(runs === 1 && !readLastDrillResult() ? "first-run" : `run-${Date.now().toString(36)}`);
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: KICKER,
    pages,
    // Another run opens on the scoring page, one click from the drill.
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start the drill again" : "Start the drill",
    onStart: () => document.querySelector<HTMLElement>("#mail-subject")?.focus(),
  });
}

function renderIntro(): void {
  drill.stop();
  const last = readLastDrillResult();
  $("#intro").innerHTML = `
    <div class="course-top"><div class="brand">PROJECT ARES<span> ·</span> CYBERSECURITY TRAINING</div><span class="mock-flag" title="Draft content, to be reviewed with SMEs">DRAFT CONTENT</span></div>
    <div class="course-body">
      <div class="crumbs">Practice · about 4 minutes</div>
      <h1 id="intro-title" tabindex="-1">Phishing Speed Drill</h1>
      <p class="intro-lead">${esc(SCENARIO.brief)}</p>
      <h2>What Acme has on file</h2>
      <div class="intro-ref">${ORG_REFERENCE.map((s) => `<div><h3>${esc(s.title)}</h3><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>
      <p class="muted">This reference stays available during the drill. A short "How to play" opens when you start, and the first message is guided and untimed.</p>
      <div class="final-actions">
        <button class="btn primary" id="start-drill">${last ? "Play again" : "Start the drill"} →</button>
      </div>
      ${last ? `<div class="last-result">✓ Last run · score ${last.score.total} · ${last.score.correct} of ${last.decisions.length} correct · ${new Date(last.completedAt).toLocaleString()}</div>` : ""}
    </div>`;
  $("#start-drill").addEventListener("click", startDrill);
  show("intro");
}

// The drill re-renders its header, so the controller re-attaches this button after each render.
const help = addHelpButton(() => {
  if ($("#drill").hidden) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(false), startLabel: "Back to the drill", midGame: true, onStart: () => {} });
}, "#drill .drill-brand");
help.classList.remove("floating");
help.remove();
drill.setHelpButton(help);

renderIntro();
