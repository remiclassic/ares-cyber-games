import "../style.css";
import "./phishing.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings } from "../ui/dom";
import { ORG_REFERENCE, SCENARIO } from "./data/messages";
import { ACTIVITY_ID, createDrillHost, readLastDrillResult } from "./host";
import { summarize } from "./sim/drill";
import { renderDrillDebrief } from "./ui/debrief";
import { DrillController } from "./ui/drill";

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

function startDrill(): void {
  runs += 1;
  if (runs > 1) host.record({ verb: "retried", object: ACTIVITY_ID });
  show("drill");
  // A new seed reorders the later batches; the first batch keeps its teaching order.
  drill.start(runs === 1 && !readLastDrillResult() ? "first-run" : `run-${Date.now().toString(36)}`);
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
      <div class="intro-steps">
        <div><b>1 · Inspect</b><span>Check the sender, the reply-to address, and where links really go.</span></div>
        <div><b>2 · Pick evidence</b><span>Choose up to two cues that support your decision.</span></div>
        <div><b>3 · Respond</b><span>Report phishing, mark safe, or verify through a trusted channel.</span></div>
        <div><b>4 · Learn why</b><span>See what each cue showed and which ones you missed.</span></div>
      </div>
      <h2>Scoring</h2>
      <ul class="objectives">
        <li>Accuracy earns most of the score. Evidence that backs a correct decision adds points and builds a streak.</li>
        <li>Speed is a small bonus, and only after a correct decision.</li>
        <li>Reporting everything can't earn a top result: false alarms score nothing.</li>
      </ul>
      <h2>What Acme has on file</h2>
      <div class="intro-ref">${ORG_REFERENCE.map((s) => `<div><h3>${esc(s.title)}</h3><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>
      <p class="muted">This reference stays available during the drill. The first message is guided and untimed.</p>
      <div class="final-actions">
        <button class="btn primary" id="start-drill">${last ? "Play again" : "Start the drill"} →</button>
      </div>
      ${last ? `<div class="last-result">✓ Last run · score ${last.score.total} · ${last.score.correct} of ${last.decisions.length} correct · ${new Date(last.completedAt).toLocaleString()}</div>` : ""}
    </div>`;
  $("#start-drill").addEventListener("click", startDrill);
  show("intro");
}

renderIntro();
