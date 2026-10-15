import "./style.css";
import { COURSE_CONTEXT } from "./integration/course";
import { createHost, readLastResult, type NavigationTarget } from "./integration/host";
import { drawScene, loadSprites } from "./render/renderer";
import { ACTION_COSTS, SETBACK_LIMIT, SETBACK_REPAIR_GRANT } from "./data/scenario";
import { createGame, roundsFor } from "./sim/engine";
import { setSoundEnabled } from "./ui/audio";
import { renderDebrief } from "./ui/debrief";
import { $, esc, loadSettings, pct, saveSettings, type Settings } from "./ui/dom";
import { GameController } from "./ui/game";
import { addHelpButton, showTutorial, type TutorialPage } from "./ui/tutorial";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

type PageOptions = Readonly<{ again: boolean; guideOption: boolean; settings: Settings }>;

const img = (sprite: string) => `<img src="./assets/${sprite}.png" alt="" style="width:36px;height:36px;object-fit:contain" />`;

// The walkthrough: the mission, what is on the screen, the moves, how the Gateway reads rules
// (a made-up example), and how a run is scored. The numbers come from the scenario data.
function tutorialPages({ again, guideOption, settings: current }: PageOptions): TutorialPage[] {
  const rounds = roundsFor(createGame("preview"));
  const { inspect, rule, route, revise } = ACTION_COSTS;
  const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You run a small organization's network. Requests come in from the <strong>Internet</strong>, pass through the <strong>Gateway</strong>, and go to services such as <strong>HR</strong> and <strong>Finance</strong>.</p>
        <p class="tut-lead">Your job is to protect the network <em>and</em> keep those services working, over ${rounds.length} rounds:</p>
        <ol class="tut-moves">
          ${rounds.map((round) => `<li><span><b>${esc(round.title.replace(/^Round \d+ — /, ""))}</b><span class="how">${esc(round.objective)}</span></span></li>`).join("")}
        </ol>
        <p class="tut-note">${img("firewall")}<span>Blocking everything protects nothing useful: the organization still has to work, so approved traffic must get through.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${img("source")}</span><span><b>The board</b>Internet, Gateway, Inspection Point, Core Server, HR, Finance and Backup Link. Click a building to see what it connects to and depends on.</span></div>
          <div><span class="tut-ico box"><i class="glyph amber" aria-hidden="true">?</i></span><span><b>Traffic markers</b>Requests move along the lines. Amber <b style="display:inline">?</b> means not reviewed yet. Cyan ✓ and red ✕ show <em>your</em> judgment, never the answer.</span></div>
          <div><span class="tut-ico box"><span class="coin"></span></span><span><b>Top bar</b>Round and objective, action points (AP), the Service, Security and Efficiency meters, and setbacks (${SETBACK_LIMIT} dots).</span></div>
          <div><span class="tut-ico box">${img("core")}</span><span><b>Right panel</b>The objective, this round's traffic, your Gateway rules and the organization policy. Actions open here too.</span></div>
          <div><span class="tut-ico box">${img("relay")}</span><span><b>Action cards</b>Along the bottom, each with its AP cost, and <b style="display:inline">▶ Launch wave</b> on the right.</span></div>
        </div>
        <p class="tut-note">${img("latency-trap")}<span>The bar under the top bar always says what to do next and rings what to click.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Inspect</b> · ${inspect} AP<span class="how">Press <span class="tut-pill">Inspect</span> (<kbd>1</kbd>), then <span class="tut-pill">Inspect · ${inspect}</span> on a traffic card. Read the evidence against the policy, then record <span class="tut-pill">Permitted by policy</span>, <span class="tut-pill">Violates policy</span> or <span class="tut-pill">Not sure yet</span> (free).</span></span></li>
          <li><span><b>Access rule</b> · ${rule} AP, from round 2<span class="how">Press <span class="tut-pill">Access rule</span> (<kbd>2</kbd>). Choose DENY or ALLOW, a source, a destination and a service, check the preview, then press <span class="tut-pill">Apply rule</span>.</span></span></li>
          <li><span><b>Add route</b> · ${route} AP<span class="how">Press <span class="tut-pill">Add route</span> (<kbd>3</kbd>; <span class="tut-pill">Backup route</span> in round 3), then click a lettered option on the board or <span class="tut-pill">Build</span> in the panel.</span></span></li>
          <li><span><b>Revise</b> · ${revise} AP<span class="how">Press <span class="tut-pill">Revise</span> (<kbd>4</kbd>), or <span class="tut-pill">Edit</span> / <span class="tut-pill">Remove</span> next to a rule or route in the right panel.</span></span></li>
          <li><span><b>Run the wave</b><span class="how">Press <span class="tut-pill">▶ Launch wave</span> (<kbd>L</kbd>) and watch. <span class="tut-pill">❚❚ Pause</span> (<kbd>P</kbd>) stops it and <span class="tut-pill">▶ Resume</span> (<kbd>L</kbd>) carries on.</span></span></li>
        </ol>
        <p class="tut-muted">Nothing needs fast clicking: the wave waits while you plan, and pausing is free. <kbd>Esc</kbd> returns the right panel to the overview. <kbd>?</kbd> reopens this guide.</p>`,
    },
    {
      title: "How the Gateway decides",
      body: `
        <p>Every request passes the Gateway, which checks your rules in a fixed order:</p>
        <ol class="tut-moves">
          <li><span><b>DENY rules first.</b> If one matches, the request is denied.</span></li>
          <li><span><b>Then ALLOW rules.</b> If one matches, the request goes through.</span></li>
          <li><span><b>Otherwise, denied.</b> A request that no rule matches is denied by default.</span></li>
        </ol>
        <p>A made-up example, not from the game:</p>
        <div class="tut-ex">
          <div class="row"><span class="tag ok">ALLOW 192.0.2.50 → HR : HR portal</span><span class="tag hot">DENY Any → HR : Any service</span></div>
          <div class="row"><span>192.0.2.50 → HR portal</span><span class="arrow">→</span><span class="tag hot">denied</span><span class="then">The DENY matches too, and DENY is checked first.</span></div>
          <div class="row"><span>192.0.2.80 → Finance invoice portal</span><span class="arrow">→</span><span class="tag hot">denied</span><span class="then">No rule matches it.</span></div>
        </div>
        <p class="tut-note">${img("relay")}<span>A rule matches on source, destination and service together. Every path starts at the Gateway, so your rules also apply on any route you build.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Service <small>40%</small></b>Approved requests delivered.</div>
          <div><b>Security <small>40%</small></b>Prohibited requests denied.</div>
          <div><b>Efficiency <small>20%</small></b>Spending only the AP a lean plan needs.</div>
        </div>
        <p>A round succeeds when no prohibited request gets through and enough approved requests are delivered: ${rounds.map((round) => percent(round.success.minLegitRatio)).join(", ")} in rounds 1 to ${rounds.length}, counting Finance's invoices on their own in rounds 1 and 3. Otherwise it is a <strong>setback</strong>: you get ${SETBACK_REPAIR_GRANT} AP to repair and replay the round. After ${SETBACK_LIMIT} setbacks the run restarts with different traffic and a different failure.</p>
        <p class="tut-muted">The reasoning checkpoints after rounds 2 and 3 and the final challenge are recorded as learning evidence. They do not change the game score.</p>
        ${again ? `<p class="tut-note">${img("firewall")}<span>New run: the traffic order and the link that fails can differ from last time.</span></p>` : ""}
        <div class="tut-settings">
          ${guideOption ? `<label class="tut-check"><input type="checkbox" id="opt-guide" checked /> Step-by-step guide in round 1</label>` : ""}
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${current.sound ? "checked" : ""} /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-fast" ${current.fast ? "checked" : ""} /> Faster waves (2×)</label>
        </div>`,
    },
  ];
}

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
  (withGuide) => openBriefing(withGuide),
  () => openHelp(),
);

const KICKER = "Keep Finance Online · How to play";
let briefings = 0;

// The walkthrough before a run. The first one on a page load starts at page 1; later runs (practice
// again, or a restart after three setbacks) open on the last page, one click from the board.
function openBriefing(withGuide: boolean): void {
  const again = briefings > 0;
  briefings += 1;
  let guide = withGuide;
  const pages = tutorialPages({ again, guideOption: withGuide, settings });
  showTutorial({
    kicker: KICKER,
    pages,
    startAt: again ? pages.length - 1 : 0,
    startLabel: again ? "Start again" : "Start round 1",
    onStart: () => game.begin(guide),
    onLastPage: (root) => {
      bindSettings(root);
      root.querySelector<HTMLInputElement>("#opt-guide")?.addEventListener("change", (event) => {
        guide = (event.target as HTMLInputElement).checked;
      });
    },
  });
}

function openHelp(): void {
  if ($("#game").hidden) return;
  showTutorial({
    kicker: KICKER,
    pages: tutorialPages({ again: false, guideOption: false, settings }),
    startLabel: "Back to the game",
    midGame: true,
    onStart: () => {},
    onLastPage: bindSettings,
  });
}

function bindSettings(root: HTMLElement): void {
  for (const key of ["sound", "fast"] as const) {
    root.querySelector<HTMLInputElement>(`#opt-${key}`)?.addEventListener("change", (event) => {
      settings[key] = (event.target as HTMLInputElement).checked;
      saveSettings(settings);
      game.applySettings(settings);
    });
  }
}

// The HUD is re-rendered, so the game re-attaches this button after each render.
const help = addHelpButton(openHelp, "#hud .hud-tools");
help.classList.remove("floating");
help.remove();
game.setHelpButton(help);

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
