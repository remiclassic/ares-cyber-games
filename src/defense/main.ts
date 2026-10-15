import "../ui/practice.css";
import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, showTutorial, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data/scenario";
import { ACTIVITY_ID, createDefenseHost } from "./host";
import { renderDebrief } from "./ui/debrief";
import { DefenseGame } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createDefenseHost();
const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
let attempt = 0;
const started = performance.now();

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.layers;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new DefenseGame(SCENARIO, host, () => settings.reducedMotion, (state) => {
  show("debrief");
  const summary = renderDebrief(state, { retry: () => briefing(true) });
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((performance.now() - started) / 1000),
    seed: state.seed,
    attempt: state.attempt,
    score: summary,
    learningEvidence: state.records.filter((record) => record.check).map((record) => ({ waveId: record.waveId, question: record.check!.question, correct: !!record.answer?.correct })),
    waves: state.records,
  });
  $("#debrief-title").focus();
});

// The first-time walkthrough: the mission, how to read the board, the moves, how a campaign is
// stopped, and how it is scored. Reopenable at any time from the header.
function tutorialPages(retry: boolean): TutorialPage[] {
  const [first, second] = SCENARIO.waves;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">Attackers are coming for <strong>${esc(SCENARIO.crownJewels.toLowerCase())}</strong> at ${esc(SCENARIO.org)}. You are the security architect: you choose which defences to buy, before each attack.</p>
        <ol class="tut-moves">
          <li><span><b>The week has ${SCENARIO.waves.length} waves</b>: ${SCENARIO.waves.map((wave) => esc(wave.title.split(":")[0])).join(", ")}.<span class="how">Each wave brings new attack campaigns and a little more budget.</span></span></li>
          <li><span><b>Each wave you plan, then run.</b><span class="how">Buy security controls with your credits, then watch the attacks play out against them.</span></span></li>
          <li><span><b>Controls stay bought all week.</b><span class="how">Unspent credits carry over to the next wave.</span></span></li>
        </ol>
        <p class="tut-note">${ICONS.layers}<span>You cannot afford everything. The skill is layering: making sure each attack would still be stopped if one of your defences failed.</span></p>`,
    },
    {
      title: "Reading the board",
      body: `
        <p>The middle of the screen is the <strong>attack chain</strong>. Every attack has to get through all five stages, left to right, to reach the crown jewels.</p>
        <div class="tut-ex">
          <div class="row">${SCENARIO.stages.map((stage, index) => `${index ? '<span class="arrow">→</span>' : ""}<span class="tag">${esc(stage.name)}</span>`).join("")}<span class="arrow">→</span><span class="tag hot">Crown jewels</span></div>
        </div>
        <div class="tut-legend">
          <div><span class="tut-ico box">A</span><span><b>Each row is one campaign</b>One attacker crew, with its plan written out stage by stage.</span></div>
          <div><span class="tut-ico box">1 2</span><span><b>Numbers are its preferences</b>Where a cell lists several techniques, the attacker tries 1 first, then 2 if 1 is blocked.</span></div>
          <div><span class="tut-ico box">${ICONS.block}</span><span><b>Struck-through means blocked</b>When a control you bought blocks a technique, it is crossed out and the control's name appears beside it.</span></div>
          <div><span class="tut-ico box">${ICONS.credits}</span><span><b>Top right: credits, friction, wave</b>What you can still spend, and how much disruption the business will accept.</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read the threat intel</b> on the left<span class="how">Who is attacking this wave, and what they are after.</span></span></li>
          <li><span><b>Buy controls</b> from the panel on the right<span class="how">Each card says exactly what it <span class="tut-pill">Blocks</span>, <span class="tut-pill">Detects</span> or helps you <span class="tut-pill">Recover</span> from, its cost in credits, and its business friction. Press <span class="tut-pill">Deploy</span> to buy it, <span class="tut-pill">Remove</span> to get the credits back. The board updates straight away.</span></span></li>
          <li><span><b>Run the wave</b><span class="how">Press the <span class="tut-pill">Run</span> button at the bottom right. Each campaign moves through the stages, one column at a time.</span></span></li>
          <li><span><b>Read the wave report</b><span class="how">It shows where each campaign was stopped, and whether that stop had a backup. Answer one quick question, then plan the next wave.</span></span></li>
        </ol>`,
    },
    {
      title: "How an attack is stopped",
      body: `
        <ol class="tut-moves">
          <li><span><b>Block every option at any one stage</b> and the campaign stops there.<span class="how">If a cell lists two techniques and you only block the first, the attacker just uses the second.</span></span></li>
          <li><span><b>Earlier is better.</b><span class="how">Any attack that gets past initial access has a foothold, and that always costs some damage, even if you stop it later.</span></span></li>
          <li><span><b>Detection needs someone to respond.</b><span class="how">A control that only detects does nothing on its own. With the 24×7 SOC deployed, a detected attack is contained, but it gets one more stage first.</span></span></li>
          <li><span><b>Recovery is not prevention.</b><span class="how">Backups limit the damage from ransomware. The encryption still happens.</span></span></li>
        </ol>
        <div class="tut-ex">
          <div class="row"><span class="then">Depth, in one picture:</span></div>
          <div class="row"><span class="tag">Stage 1: blocked</span><span class="arrow">+</span><span class="tag">Stage 3: blocked</span><span class="arrow">→</span><span class="tag ok">If either control fails, the other still stops it</span></div>
        </div>
        <p class="tut-note">${ICONS.question}<span>${esc(first.title.split(":")[0])}'s crews follow fixed plans. From ${esc(second.title.split(":")[0])}, they adapt: block their favourite route and they switch to their next one.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Outcome <small>50</small></b>Damage to the crown jewels. Footholds count too.</div>
          <div><b>Depth <small>25</small></b>For each stopped attack: would it still be stopped if that control failed?</div>
          <div><b>Friction <small>25</small></b>Stay within the friction the business accepts (shown top right).</div>
        </div>
        <p>Every wave is scored out of 100. The debrief at the end shows what each control did across the week.</p>
        <p class="tut-muted">There is no timer. Take as long as you like to plan.</p>
        ${retry ? `<p class="tut-note">${ICONS.retry}<span>Retry: the actors change some of their preferences. A plan that only matched last run's exact paths may not hold.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-motion" ${settings.reducedMotion ? "checked" : ""} /> Reduce motion (show wave results at once)</label>
          <label class="tut-check"><input type="checkbox" id="opt-large" ${settings.largeText ? "checked" : ""} /> Larger text</label>
        </div>`,
    },
  ];
}

function bindSettings(root: HTMLElement): void {
  const bind = (id: string, key: "sound" | "reducedMotion" | "largeText") =>
    root.querySelector<HTMLInputElement>(id)!.addEventListener("change", (event) => {
      settings[key] = (event.target as HTMLInputElement).checked;
      saveSettings(settings);
      setSoundEnabled(settings.sound);
    });
  bind("#opt-sound", "sound");
  bind("#opt-motion", "reducedMotion");
  bind("#opt-large", "largeText");
}

function briefing(retry = false): void {
  if (retry) {
    attempt += 1;
    host.record({ verb: "retried", object: SCENARIO.id, result: { attempt } });
  }
  show("game");
  game.start(seed, attempt);
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.title} · How to play`,
    pages,
    // A retry opens on the last page: the scoring reminder and the retry note.
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Plan again" : "Start planning",
    onStart: () => $("#intel").querySelector<HTMLElement>("h2")?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.title} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

briefing();
