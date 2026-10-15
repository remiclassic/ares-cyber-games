import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type TutorialPage } from "../ui/tutorial";
import { FIRST_ORBIT } from "./data/mission";
import { ACTIVITY_ID, createCloudHost } from "./host";
import { WEIGHTS, summarize } from "./sim/mission";
import { renderDebrief } from "./ui/debrief";
import { CloudGame } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const AUTOPILOT_KEY = "ares-cc:autopilot";
const mission = FIRST_ORBIT;
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createCloudHost();
let runs = 0;
let autopilot = false;
try {
  autopilot = localStorage.getItem(AUTOPILOT_KEY) === "1";
} catch {
  // Non-essential.
}

$("#logo").innerHTML = LOGO;
const nextBar = $("#next-step");

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const modelHtml = `
  <div class="split">
    <div><h4>The provider is responsible for</h4><ul>${mission.serviceModel.provider.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
    <div><h4>You, the customer, are responsible for</h4><ul>${mission.serviceModel.customer.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>
  </div>`;

function rememberAutopilot(value: boolean): void {
  autopilot = value;
  try {
    localStorage.setItem(AUTOPILOT_KEY, value ? "1" : "0");
  } catch {
    // Non-essential.
  }
}

const pill = (label: string) => `<span class="tut-pill">${esc(label)}</span>`;
const pct = (weight: number) => Math.round(weight * 100);

// The first-time walkthrough: the mission and service model, what is on screen, the moves, how a
// change is judged (a made-up example), and how it is scored, with the settings on the last page.
function tutorialPages(retry: boolean): TutorialPage[] {
  const [surge, quiet, access] = mission.checkpoints;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">${esc(mission.serviceModel.summary)} You are on call for three situations: a <strong>${esc(surge.title.toLowerCase())}</strong>, a <strong>${esc(quiet.title.toLowerCase())}</strong> and an <strong>${esc(access.title.toLowerCase())}</strong>.</p>
        <p>At each checkpoint you choose one configuration change and say why. The simulation then shows what your change does. A poor change can be revised, at a cost.</p>
        <p class="tut-muted">Service model: ${esc(mission.serviceModel.name)}. These are the parts this mission is about:</p>
        <div class="tut-model">${modelHtml}</div>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${ICONS.arrow}</span><span><b>The route</b>Your ship flies between three stations. Glowing <em>diagnostic chips</em> on the way are evidence.</span></div>
          <div><span class="tut-ico box">${ICONS.doc}</span><span><b>Situation panel</b>Right. The goal, the requirements, the evidence you hold and the <em>Scenario estimate</em>.</span></div>
          <div><span class="tut-ico box">${ICONS.rightsize}</span><span><b>Change cards</b>Bottom, at a checkpoint. Instance counts or permissions, and <em>Why this change?</em></span></div>
          <div><span class="tut-ico box">${ICONS.coin}</span><span><b>Top bar</b>Mission step, Budget in credits (starts at ${mission.budget}), and live availability or backup status.</span></div>
        </div>
        <p class="tut-note">${ICONS.pulse}<span>The <strong>Scenario estimate</strong> uses only what you know so far. Its "It assumes" list says what you have not checked. The simulation applies every rule, including those.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Fly and collect</b><span class="how">Steer with <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> through the chips. There is nothing to dodge. <kbd>T</kbd> or ${pill("Let autopilot fly this leg")} flies it for you and collects every chip. <kbd>P</kbd> pauses, <kbd>M</kbd> mutes.</span></span></li>
          <li><span><b>Check the evidence</b><span class="how">At the station, press ${pill("Pull from station log")} for any chip you missed (free). Some checkpoints offer ${pill(`Inspect · ${mission.fees.inspect} credits`)} to check one more thing.</span></span></li>
          <li><span><b>Make one change</b><span class="how">Use ${pill("−")} and ${pill("+")} to set instance counts, or untick permissions in ${pill("Narrow access")}. Watch the Scenario estimate update.</span></span></li>
          <li><span><b>Say why, then apply</b><span class="how">Choose a reason under <em>Why this change?</em>, then press ${pill("Apply change")}.</span></span></li>
          <li><span><b>Read the consequence</b><span class="how">Press ${pill(`Revise · ${mission.fees.revise} credits`)} to try again (up to ${mission.maxAttempts} attempts per checkpoint), or ${pill("Continue")}.</span></span></li>
        </ol>
        <p class="tut-muted">Navigation pauses while you decide. Everything at a checkpoint works with <kbd>Tab</kbd>, <kbd>Space</kbd> and <kbd>Enter</kbd>.</p>`,
    },
    {
      title: "How a change is judged",
      body: `
        <p>Each checkpoint lists its requirements: serve enough requests, keep the policy, stay under the cost ceiling, and keep the stated task working. A made-up example, not one of the checkpoints:</p>
        <div class="tut-ex">
          <div class="row"><span class="then">Search service:</span><span>peak 900 requests per second. Each instance serves 200. Policy: 20% headroom above the peak.</span></div>
          <div class="row"><span class="then">Needed:</span><span>900 × 1.2 = <b>1,080</b> requests per second of capacity.</span></div>
          <div class="row"><span class="tag hot">4 instances</span><span class="arrow">→</span><span>800: requests are lost at the peak.</span></div>
          <div class="row"><span class="tag hot">5 instances</span><span class="arrow">→</span><span>1,000: serves the peak, but short of the headroom policy.</span></div>
          <div class="row"><span class="tag ok">6 instances</span><span class="arrow">→</span><span>1,200: meets both. More only adds cost.</span></div>
        </div>
        <ol class="tut-moves">
          <li><span><b>Leanest change that meets every requirement.</b><span class="how">Every running instance is billed, so extra capacity costs points too.</span></span></li>
          <li><span><b>Access works the same way.</b><span class="how">Keep exactly what the stated task needs. Remove too little and the review fails; remove too much and the task breaks.</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Continuity <small>${pct(WEIGHTS.continuity)}%</small></b>The service, or the stated task, keeps working.</div>
          <div><b>Policy <small>${pct(WEIGHTS.policy)}%</small></b>Headroom on every service, or least privilege.</div>
          <div><b>Resources <small>${pct(WEIGHTS.resource)}%</small></b>Run cost and revision fees against the leanest change. Inspecting is not counted.</div>
          <div><b>Reasoning <small>${pct(WEIGHTS.justification)}%</small></b>Your reason is sound and fits the change you made.</div>
        </div>
        <p>Each checkpoint scores out of 100 on its final attempt; your learning score is the average. The access review's security objective is reported on its own, so a good average cannot cover for it. Flying is reported separately and never scored.</p>
        ${retry ? `<p class="tut-note">${ICONS.check}<span>Retry: the same three checkpoints, starting fresh with a full budget.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-auto" ${autopilot ? "checked" : ""} /> Autopilot: fly each leg for me</label>
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-motion" ${settings.reducedMotion ? "checked" : ""} /> Reduced motion</label>
        </div>`,
    },
  ];
}

function bindSettings(root: HTMLElement): void {
  const on = (id: string, handler: (checked: boolean) => void) =>
    root.querySelector<HTMLInputElement>(id)!.addEventListener("change", (event) => handler((event.target as HTMLInputElement).checked));
  on("#opt-auto", (checked) => {
    rememberAutopilot(checked);
    game.setAutopilot(checked);
  });
  on("#opt-sound", (checked) => {
    settings.sound = checked;
    saveSettings(settings);
    setSoundEnabled(checked);
    game.syncTools();
  });
  on("#opt-motion", (checked) => {
    settings.reducedMotion = checked;
    saveSettings(settings);
    game.syncTools();
  });
}

const game = new CloudGame({
  mission,
  host,
  settings,
  onAutopilot: rememberAutopilot,
  onComplete: (state, navigation) => {
    const summary = summarize(state);
    show("debrief");
    renderDebrief(state, summary, navigation, { retry: () => briefing() });
    host.complete({ activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score: summary, navigation, checkpoints: state.records });
    // The "Next" bar moves to the top of the debrief and points at the retry.
    $("#debrief .debrief").prepend(nextBar);
    renderNextStep(nextBar, {
      label: "Done",
      tone: "ready",
      text: `<strong>Mission complete: learning score ${summary.learningScore} / 100.</strong> Read each checkpoint's better alternative, then press <strong>Retry mission</strong> at the bottom to try it again.`,
      hint: summary.securityObjectiveMet ? "" : "The security objective was not met: retry the access review to close it.",
      targets: ["#retry"],
    });
    $("#debrief-title").focus();
  },
});

// Development hook: lets automated flow checks step the loop when the window is not being drawn.
if (import.meta.env.DEV) (window as unknown as { aresCloud: CloudGame }).aresCloud = game;

function briefing(): void {
  const retry = runs > 0;
  if (retry) host.record({ verb: "retried", object: mission.id });
  runs += 1;
  $("#game .hud").after(nextBar);
  show("game");
  game.start(autopilot);
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `Cloud Command · ${mission.title} · How to play`,
    pages,
    // A retry opens on the last page: the scoring reminder and the settings.
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Start mission",
    onStart: () => $("#panel").querySelector<HTMLElement>("h2")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `Cloud Command · ${mission.title} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
}, "#game .brand > div");

briefing();
