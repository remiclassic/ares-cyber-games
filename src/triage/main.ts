import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, showTutorial, type TutorialPage } from "../ui/tutorial";
import { BUSY_MORNING } from "./data/scenario";
import { ACTIVITY_ID, createTriageHost } from "./host";
import { POINTS } from "./sim/engine";
import { renderDebrief } from "./ui/debrief";
import { TriageGame, clockText } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const scenario = BUSY_MORNING;
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createTriageHost();
let stopReplay: (() => void) | null = null;
let timed = true;
let runs = 0;

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.play;
$("#steps").innerHTML = `
  <span>${ICONS.review}Review evidence</span><i></i>
  <span>${ICONS.rank}Rank urgency</span><i></i>
  <span>${ICONS.explain}Explain your choices</span>`;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new TriageGame(scenario, host, (state, wasTimed) => {
  show("debrief");
  const { summary, stop } = renderDebrief(state, wasTimed, { retry: () => briefing() });
  stopReplay = stop;
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: summary.seconds,
    timed: wasTimed,
    score: summary,
    rounds: state.rounds,
  });
  $("#debrief-title").focus();
});

const KICKER = `${scenario.title} · How to play`;

// The first-time walkthrough: the mission, what is on the screen, the moves, how confidence and
// impact work together (a made-up example), and how it is scored. Reopenable from the header.
function tutorialPages(retry: boolean): TutorialPage[] {
  const { best, ok, reason, revised, link, missed, overescalated, wrongLink } = POINTS;
  const budget = scenario.seconds.reduce((sum, seconds) => sum + seconds, 0);
  const [first, second, third] = scenario.seconds.map(clockText);
  const total = scenario.alerts.length;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">It is ${scenario.clock[0]} on a busy morning. <strong>${total} security alerts</strong> are waiting, and only <strong>${scenario.immediateCapacity} analysts</strong> can respond right now.</p>
        <p class="tut-lead">Your job: put the alerts in order of urgency, and say why.</p>
        <ol class="tut-moves">
          <li><span><b>Read the evidence</b> behind each alert, not just its label.</span></li>
          <li><span><b>Rank it</b>: Immediate (respond now), Investigate (look deeper) or Monitor (keep an eye on it).</span></li>
          <li><span><b>Revise as you learn more.</b> The shift has three rounds. After rounds 1 and 2 an update arrives with new evidence.</span></li>
        </ol>
        <p class="tut-note">${ICONS.shield}<span>A loud alert may be routine. A quiet one may sit on a critical system. The evidence decides, not the severity tag.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${ICONS.bars}</span><span><b>Alert queue (left)</b>All ${total} alerts, with their severity tags. Badges flag <em>New evidence</em> and <em>Needs a reason</em>.</span></div>
          <div><span class="tut-ico box">${ICONS.alert}</span><span><b>Triage board (middle)</b>Three lanes: Immediate, Investigate, Monitor. Immediate shows analysts in use, out of ${scenario.immediateCapacity}.</span></div>
          <div><span class="tut-ico box">${ICONS.search}</span><span><b>Alert details (right)</b>The selected alert, with tabs: <em>Evidence</em> (timeline), <em>Business impact</em> (the asset), <em>Analysis</em> (known and unknown).</span></div>
          <div><span class="tut-ico box">${ICONS.shield}</span><span><b>Confidence and impact tiles</b>Under the tabs. Confidence: how strongly the evidence points to real malicious activity. Impact: how much the affected asset matters.</span></div>
          <div><span class="tut-ico box">${ICONS.clock}</span><span><b>Clock and count (top right)</b>Time left in the round (time spent, if untimed) and how many alerts you have ranked.</span></div>
        </div>
        <p class="tut-note">${ICONS.review}<span>The bar above the columns always says what to do next and rings what to click.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Select an alert</b><span class="how">Click its card in the queue, or step through with the arrows at the top of Alert details (or <kbd>[</kbd> <kbd>]</kbd>). Read its Evidence tab and the two tiles.</span></span></li>
          <li><span><b>Set a priority</b><span class="how">Under <b>Your call</b>, press <span class="tut-pill">Immediate</span> <span class="tut-pill">Investigate</span> or <span class="tut-pill">Monitor</span> (or <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>). You can also drag the card onto a lane.</span></span></li>
          <li><span><b>Pick a justification</b><span class="how">Choose the reason that best supports your priority from the list under <b>Why?</b> <span class="tut-pill">Change</span> reopens the list.</span></span></li>
          <li><span><b>Link alerts that are one incident</b> (optional)<span class="how">Press <span class="tut-pill">Same incident as another alert?</span> and pick the other alert, or drag one queue card onto another. A linked incident needs one analyst. <span class="tut-pill">Unlink</span> undoes it.</span></span></li>
          <li><span><b>Submit the round</b><span class="how">When all ${total} alerts have a priority and a justification, press <span class="tut-pill">Submit triage</span> at the bottom right (<span class="tut-pill">Submit final triage</span> in round 3).</span></span></li>
        </ol>
        <p class="tut-note">${ICONS.megaphone}<span>After each update, press <strong>Back to the queue</strong>, then open the alerts marked <em>New evidence</em>. The banner above the lanes shows the update again.</span></p>`,
    },
    {
      title: "Confidence and impact",
      body: `
        <p>Urgency comes from two things together: how sure the evidence is, and how much the asset matters. (A made-up example, not one of today's alerts.)</p>
        <div class="tut-ex">
          <div class="row"><span class="tag hot">Tagged High</span><span>Malware blocked on a lobby kiosk</span><span class="arrow">→</span><span class="then">confidence high, impact low, file already quarantined</span></div>
          <div class="row"><span class="tag ok">Tagged Low</span><span>Unusual sign-in to the payroll server</span><span class="arrow">→</span><span class="then">confidence unclear, impact critical</span></div>
        </div>
        <ol class="tut-moves">
          <li><span><b>The tag is how loud an alert is, not how much it matters.</b><span class="how">The kiosk alert is loud, but the threat is contained on a low-value device.</span></span></li>
          <li><span><b>Thin evidence on a critical asset can still need an analyst.</b><span class="how">The payroll sign-in is quiet, but if it is real the damage is large. Someone should confirm or rule it out.</span></span></li>
          <li><span><b>Explained activity can wait.</b><span class="how">A schedule, a change ticket or the owner can account for something that looks alarming.</span></span></li>
        </ol>
        <p class="tut-note">${ICONS.link}<span>Immediate holds only ${scenario.immediateCapacity} incidents at once. If it is full, move something out, or link alerts that really are the same activity so they share one analyst.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <p>Every alert is scored in every round, against what the evidence supported at that point.</p>
        <div class="tut-score">
          <div><b>Priority <small>+${best}</small></b>For the strongest priority. A defensible but weaker one earns +${ok}.</div>
          <div><b>Justification <small>+${reason}</small></b>When your reason fits the evidence, on a good priority.</div>
          <div><b>Revised <small>+${revised}</small></b>Moving an alert to its new strongest priority after an update changed it.</div>
          <div><b>Links <small>+${link}</small></b>Each correct link on the final board. A wrong link costs ${Math.abs(wrongLink)}.</div>
          <div><b>Mistakes <small>${missed} / ${overescalated}</small></b>${missed} for a critical alert left in Monitor or unranked. ${overescalated} for a routine one sent to Immediate.</div>
        </div>
        <p>Your result is <strong>decision quality</strong>: your points as a percentage of the best possible. Time is shown separately and never adds points.</p>
        <p class="tut-muted">Timed shift: ${first}, ${second} and ${third} for the three rounds. When a round's time runs out, the board is submitted as it stands. The clock pauses while an update or this guide is open.</p>
        ${retry ? `<p class="tut-note">${ICONS.review}<span>Same alerts and updates as last time. Use what the debrief showed you.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-timed" ${timed ? "checked" : ""} /> Timed shift (${esc(clockText(budget))} across three rounds)</label>
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
        </div>`,
    },
  ];
}

function bindSettings(root: HTMLElement): void {
  root.querySelector<HTMLInputElement>("#opt-timed")?.addEventListener("change", (event) => {
    timed = (event.target as HTMLInputElement).checked;
    game.setTimed(timed);
  });
  root.querySelector<HTMLInputElement>("#opt-sound")?.addEventListener("change", (event) => {
    settings.sound = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
    setSoundEnabled(settings.sound);
  });
}

function briefing(): void {
  stopReplay?.();
  stopReplay = null;
  const retry = runs > 0;
  if (retry) host.record({ verb: "retried", object: scenario.id });
  runs += 1;
  show("game");
  game.start(timed);
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: KICKER,
    pages,
    // A retry opens on the last page: the scoring reminder and the settings.
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start the shift again" : "Start shift",
    onStart: () => $("#queue").focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

briefing();
