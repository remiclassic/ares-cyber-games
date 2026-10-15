import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
import { FIRST_ORBIT } from "./data/mission";
import { ACTIVITY_ID, createCloudHost } from "./host";
import { summarize } from "./sim/mission";
import { renderDebrief } from "./ui/debrief";
import { CloudGame } from "./ui/game";
import { LOGO } from "./ui/icons";

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

function help(): void {
  showModal({
    kicker: "Help",
    title: "How Cloud Command works",
    dismissible: true,
    wide: true,
    body: `
      <p><strong>Travel</strong> to a checkpoint, <strong>inspect</strong> the evidence, <strong>compare</strong> changes, <strong>choose and justify</strong> one, then watch the simulated consequence.</p>
      <ul>
        <li><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> steer the ship through diagnostic chips. There is nothing to dodge.</li>
        <li><kbd>T</kbd> switches autopilot, which flies the leg and collects every chip. <kbd>P</kbd> pauses. <kbd>M</kbd> mutes.</li>
        <li>Navigation always pauses while you read evidence or decide. Everything at a checkpoint works with <kbd>Tab</kbd>, <kbd>Space</kbd> and <kbd>Enter</kbd>.</li>
        <li>Your learning score comes only from decisions. Flying is reported separately.</li>
      </ul>
      <h3>Service model: ${esc(mission.serviceModel.name)}</h3>
      <p>${esc(mission.serviceModel.summary)}</p>
      ${modelHtml}
      <p class="sme">Scenario content pending SME review</p>`,
    actions: [{ label: "Close", primary: true, onClick: () => undefined }],
  });
}

const game = new CloudGame({
  mission,
  host,
  settings,
  onHelp: help,
  onAutopilot: rememberAutopilot,
  onComplete: (state, navigation) => {
    const summary = summarize(state);
    show("debrief");
    renderDebrief(state, summary, navigation, { retry: () => briefing() });
    host.complete({ activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score: summary, navigation, checkpoints: state.records });
    $("#debrief-title").focus();
  },
});

// Development hook: lets automated flow checks step the loop when the window is not being drawn.
if (import.meta.env.DEV) (window as unknown as { aresCloud: CloudGame }).aresCloud = game;

function briefing(): void {
  if (runs > 0) host.record({ verb: "retried", object: mission.id });
  runs += 1;
  show("game");
  game.start(autopilot);
  showModal({
    kicker: `Mission briefing · ${mission.organisation}`,
    title: `Ares: Cloud Command — ${mission.title}`,
    wide: true,
    body: `
      <p>${esc(mission.serviceModel.summary)} You are on call for three situations: a <strong>traffic surge</strong>, a <strong>quiet period</strong> and an <strong>access review</strong>.</p>
      <p>Fly between stations, collect diagnostic chips, then choose a configuration change and say why. The simulation shows what your change does. A poor change can be revised, at a cost.</p>
      <h3>Service model: ${esc(mission.serviceModel.name)}</h3>
      ${modelHtml}
      <p class="note">Flying only moves you between tasks. Your learning score comes from decisions, and navigation is reported separately.</p>
      <label class="check"><input type="checkbox" id="opt-auto" ${autopilot ? "checked" : ""} /> Autopilot: fly each leg for me and collect every chip</label>
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
      <label class="check"><input type="checkbox" id="opt-motion" ${settings.reducedMotion ? "checked" : ""} /> Reduced motion</label>
      <p class="sme">Prototype · fictional data · scenario content pending SME review</p>`,
    actions: [{ label: "Start mission", primary: true, onClick: () => $("#panel").querySelector<HTMLElement>("h2")?.focus() }],
    onMount: (root) => {
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
    },
  });
}

briefing();
