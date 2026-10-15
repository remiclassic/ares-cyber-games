import "./style.css";
import { COURSE_CONTEXT } from "./integration/course";
import { createHost, readLastResult, type NavigationTarget } from "./integration/host";
import { drawScene, loadSprites } from "./render/renderer";
import { createGame } from "./sim/engine";
import { setSoundEnabled } from "./ui/audio";
import { renderDebrief } from "./ui/debrief";
import { $, esc, loadSettings, pct, saveSettings } from "./ui/dom";
import { GameController } from "./ui/game";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let stopDebrief: (() => void) | null = null;
let runs = 0;

function show(screen: "course" | "game" | "debrief" | "mission"): void {
  for (const id of ["course", "game", "debrief", "mission"]) $(`#${id}`).hidden = id !== screen;
  if (screen !== "debrief") {
    stopDebrief?.();
    stopDebrief = null;
  }
  window.scrollTo(0, 0);
  $(`#${screen}`).querySelector<HTMLElement>("h1, [tabindex='-1']")?.focus();
}

const host = createHost((target: NavigationTarget) => {
  if (target === "study") renderCourse();
  else renderMission();
});

const game = new GameController(
  settings,
  host,
  (summary) => {
    show("debrief");
    stopDebrief = renderDebrief(summary, settings, host, { retry: () => startPractice() });
    $("#debrief-title").focus();
  },
  () => renderCourse(),
);

function startPractice(): void {
  runs += 1;
  show("game");
  // A new seed each run varies traffic order and which link fails.
  const seed = runs === 1 && !readLastResult() ? "first-run" : `run-${Date.now().toString(36)}`;
  game.start(seed, runs === 1);
}

function renderCourse(): void {
  game.stop();
  const last = readLastResult();
  $("#course").innerHTML = `
    <div class="course-top">
      <div class="brand">CYBER RANGE<span> ·</span> COURSES</div>
      ${COURSE_CONTEXT.mock ? `<span class="mock-flag" title="Placeholder course content — replace with the selected module">MOCK COURSE ENTRY</span>` : ""}
    </div>
    <div class="course-body">
      <div class="crumbs">${esc(COURSE_CONTEXT.courseTitle)} › ${esc(COURSE_CONTEXT.moduleTitle)}</div>
      <h1 id="course-title" tabindex="-1">Study Material</h1>
      <p class="muted">Work through the readings, then practice the ideas before your mission.</p>
      <h2>Readings and media</h2>
      <ul class="study-list">
        ${COURSE_CONTEXT.studyMaterial
          .map((item) => `<li class="study-item"><span class="study-kind">${esc(item.kind)}</span><span class="grow">${esc(item.title)}</span><span class="muted">${item.minutes} min</span></li>`)
          .join("")}
      </ul>
      <h2>Interactive practice</h2>
      <div class="practice-card">
        <div class="practice-art"><canvas id="practice-art" aria-hidden="true"></canvas></div>
        <div class="practice-info">
          <span class="tag">Practice · about 5 minutes</span>
          <h3>Keep Finance Online</h3>
          <p class="meta">Protect the network <em>and</em> keep services available. Three short rounds, a decision replay, and a debrief.</p>
          <ul class="objectives">${COURSE_CONTEXT.moduleObjectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
          <button class="btn primary" id="start-practice">${last ? "Practice again" : "Start practice"} →</button>
          ${last ? `<div class="last-result">✓ Completed · game score ${pct(last.score.total)} · ${new Date(last.completedAt).toLocaleString()}</div>` : ""}
        </div>
      </div>
      <h2>Mission</h2>
      <ul class="study-list"><li class="study-item"><span class="study-kind">Mission</span><span class="grow">${esc(COURSE_CONTEXT.missionTitle)}</span><button class="btn small" id="go-mission">Open</button></li></ul>
    </div>`;
  $("#start-practice").addEventListener("click", startPractice);
  $("#go-mission").addEventListener("click", renderMission);
  show("course");
  drawPreview();
}

function drawPreview(): void {
  const canvas = $("#practice-art") as HTMLCanvasElement;
  const state = createGame("preview");
  state.links.push({ id: "core-finance", a: "core", b: "finance", status: "up", kind: "primary" });
  loadSprites().then(() => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    drawScene(canvas.getContext("2d")!, state, {
      width: rect.width, height: rect.height, dpr, time: 0, alpha: 0, reducedMotion: true,
      selectedNode: null, candidates: [], hoverCandidate: null, focusFlow: null, compact: true,
    });
  });
}

function renderMission(): void {
  game.stop();
  $("#mission").innerHTML = `
    <div class="course-top"><div class="brand">CYBER RANGE<span> ·</span> MISSIONS</div><span class="mock-flag">MOCK MISSION</span></div>
    <div class="course-body">
      <div class="crumbs">${esc(COURSE_CONTEXT.courseTitle)} › ${esc(COURSE_CONTEXT.moduleTitle)}</div>
      <h1 id="mission-title" tabindex="-1">${esc(COURSE_CONTEXT.missionTitle)}</h1>
      <p>In the real course this button hands off to the live range mission. The practice host would send a navigate message with target <code>mission</code>.</p>
      <h2>What you practiced</h2>
      <ul class="objectives">${COURSE_CONTEXT.moduleObjectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      <button class="btn" id="back-study">← Back to study material</button>
    </div>`;
  $("#back-study").addEventListener("click", renderCourse);
  show("mission");
}

renderCourse();
