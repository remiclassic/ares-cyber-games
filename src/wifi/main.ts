import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import {
  BASE_DRAIN,
  COMPROMISE_LABELS,
  PASS_MISSED,
  PASS_RATIO,
  POINTS,
  RISK_LABELS,
  allStops,
  availability,
  choose,
  createGame,
  currentStop,
  evidenceOf,
  feedbackFor,
  hintsAllowed,
  maxPoints,
  next,
  optionOf,
  pointsFor,
  stageOf,
  summarize,
  takeHint,
  type GameState,
  type Network,
  type OptionKind,
  type Pick,
  type Screen,
  type Stop,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-wifi-or-why-not/the-tallis-trip/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const svg = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const WIFI = svg(`<path d="M3 9.5a13 13 0 0 1 18 0"/><path d="M6.2 13a8.5 8.5 0 0 1 11.6 0"/><path d="M9.4 16.4a4 4 0 0 1 5.2 0"/><circle cx="12" cy="19.5" r="0.6" fill="currentColor"/>`);
const SHIELD = svg(`<path d="M12 3 5 6v5c0 4.5 3 8.4 7 10 4-1.6 7-5.5 7-10V6l-7-3Z"/>`);
const PHONE = svg(`<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.5h3"/>`);
const PERSON = svg(`<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/>`);
const PLUG = svg(`<path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v5"/>`);
const HAND = svg(`<path d="M5 12h14M13 6l6 6-6 6"/>`);
const CROSS = svg(`<circle cx="12" cy="12" r="9"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7"/>`);
const CLOCK = svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`);
const LOCK = svg(`<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`);
const PIN = svg(`<path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2"/>`);
const WARN = svg(`<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v5M12 17.5v.5"/>`);

const KIND_ICON: Readonly<Record<OptionKind, string>> = { wifi: WIFI, vpn: SHIELD, hotspot: PHONE, staff: PERSON, power: PLUG, act: HAND, decline: CROSS, wait: CLOCK };

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let hintText: string | null = null;
const started = performance.now();

$("#logo").innerHTML = LOGO;

const STOPS = allStops(SCENARIO);

function lastPick(): Pick | undefined {
  return state.phase === "answered" ? state.picks[state.picks.length - 1] : undefined;
}

function toneOf(pick: Pick): "good" | "hint" | "bad" {
  return pick.correct ? "good" : pick.risk === "compromise" || pick.risk === "exposed" ? "bad" : "hint";
}

function verdict(pick: Pick): string {
  if (pick.correct) return "Good call.";
  if (pick.compromise) return `${COMPROMISE_LABELS[pick.compromise]}.`;
  if (pick.risk === "exposed") return "Exposed.";
  if (pick.late) return "Too late.";
  if (pick.risk === "minor") return "It worked, with a small avoidable risk.";
  return "Safe, but the work didn't get done.";
}

function meter(label: string, id: string, value: number, max: number, unit: string, low: boolean): string {
  const ratio = Math.max(0, Math.min(1, value / max));
  return `<div class="meter ${low ? "low" : ""}" id="${id}" role="img" aria-label="${esc(label)}: ${value}${unit === "%" ? " percent" : " megabytes"}${low ? ", low" : ""}">
    <span>${esc(label)}</span><i><b style="width:${Math.round(ratio * 100)}%"></b></i><strong>${value}<small>${unit}</small></strong></div>`;
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const stop = currentStop(state);
  const stage = stageOf(SCENARIO, stop.id);
  const pick = lastPick();
  const summary = summarize(state);
  $("#status").innerHTML = `
    <div class="clock">${esc(stop.time.split(" · ")[1])}<small>${esc(stop.time.split(" · ")[0])}</small></div>
    <div class="count"><strong>${state.index + 1}/${STOPS.length}</strong><span>Stop</span></div>
    <div class="count"><strong>${summary.total}</strong><span>Points</span></div>`;
  renderTrip(stop);
  $("#desk-head").innerHTML = `<h2>${esc(stop.title)}</h2><span class="phase-pill">${stage.final ? "No hints" : stop.guided ? "Guided" : "Hints free"}</span>`;

  const coach =
    stop.guided && !pick
      ? `<div class="coach"><strong>Your first stop, guided.</strong> Three checks before you connect: <b>what the venue itself says</b> (the sign), <b>what the list shows</b> (names that are nearly the same are not the same), and <b>how much the task matters</b>. A boarding pass is low risk, so the lounge's own Wi-Fi is fine.</div>`
      : "";
  const dead = state.battery <= 0 && !pick ? `<div class="feedback-box bad" role="status"><strong>Your phone is dead.</strong> No hotspot, no VPN app and no sign-in prompts: only what needs no phone is left.</div>` : "";
  const feedback = pick
    ? `<div class="feedback-box ${toneOf(pick)}" role="status"><strong>${esc(verdict(pick))}</strong> ${esc(feedbackFor(stop, optionOf(stop, pick.option)))}</div>`
    : hintText
      ? `<div class="feedback-box hint" role="status"><strong>Hint.</strong> ${esc(hintText)}</div>`
      : "";
  const top = maxPoints(stop);

  $("#desk").innerHTML = `
    ${coach}
    <div class="scene">
      <article class="context" aria-label="Where you are" tabindex="-1">
        <p class="kicker">${PIN} ${esc(stop.place)} · ${esc(stop.time)}</p>
        <h3>${esc(stop.situation)}</h3>
        ${
          stop.task
            ? `<div class="task ${stop.task.sensitivity}" id="task"><div><span>Task</span><b>${esc(stop.task.label)}</b></div><em>${stop.task.sensitivity === "high" ? "Sensitive" : "Low risk"}</em><em class="due">${CLOCK} Due in ${stop.task.dueIn} min</em></div>`
            : `<div class="task none" id="task"><div><span>Task</span><b>None: handle the interruption</b></div></div>`
        }
        <h4 class="sub-head">Around you</h4>
        <ul class="around">
          ${stop.around.map((item) => `<li data-id="${esc(item.id)}"><b>${esc(item.label)}</b><span>${esc(item.text)}</span></li>`).join("")}
        </ul>
      </article>
      ${phone(stop)}
    </div>
    ${dead}
    <div class="options" role="group" aria-label="Your action">
      ${stop.options
        .map((option, index) => {
          const avail = availability(state, option);
          const chosen = pick?.option === option.id;
          const best = pick && pointsFor(stop, option) === top;
          const costs = [
            option.minutes ? `<span class="cost">${option.minutes} min</span>` : "",
            option.data ? `<span class="cost data">${option.data} MB</span>` : "",
            option.battery ? `<span class="cost batt">−${option.battery}% battery</span>` : "",
            option.charge ? `<span class="cost charge">+${option.charge}% battery</span>` : "",
          ].join("");
          const blocked = !pick && !avail.ok;
          return `<button class="opt opt-${option.kind} ${chosen ? "chosen" : ""} ${best ? "best" : ""} ${blocked ? "blocked" : ""}" data-act="choose" data-id="${esc(option.id)}" ${pick || blocked ? "disabled" : ""}>
            <kbd>${index + 1}</kbd><i aria-hidden="true">${KIND_ICON[option.kind]}</i>
            <span><b>${esc(option.label)}</b><small>${esc(option.detail)}</small><span class="costs-row">${blocked ? `<span class="cost no">${esc(avail.reason ?? "Not available")}</span>` : costs}</span></span>
            ${chosen ? `<em>${best ? "Your choice" : "You chose"}</em>` : best ? `<em>Best</em>` : ""}</button>`;
        })
        .join("")}
    </div>
    ${feedback}
    <div class="bench-actions">
      ${
        pick
          ? `<button class="btn primary" data-act="next">${state.index + 1 < STOPS.length ? "Next stop" : "See debrief"} <kbd>N</kbd></button>`
          : hintsAllowed(state)
            ? `<button class="btn" data-act="hint" ${hintText ? "disabled" : ""}>Hint <kbd>H</kbd></button>`
            : `<span class="muted small">Last day: no hints.</span>`
      }
    </div>`;
  renderNext();
}

function bars(network: Network): string {
  return `<span class="bars" role="img" aria-label="Signal ${network.bars} of 4">${[1, 2, 3, 4].map((n) => `<i class="${n <= network.bars ? "on" : ""}" style="height:${3 + n * 3}px"></i>`).join("")}</span>`;
}

function screenHtml(screen: Screen): string {
  switch (screen.kind) {
    case "wifi":
      return `<div class="ph-card wifi-list"><div class="ph-head">${WIFI}<span>Wi-Fi networks</span></div><ul>
        ${screen.networks
          .map((network) => `<li><span class="net"><b>${esc(network.name)}</b>${network.note ? `<small>${esc(network.note)}</small>` : ""}</span><span class="sec ${network.secured ? "locked" : "open"}">${network.secured ? `${LOCK}<span class="sr-only">Password needed</span>` : "Open"}</span>${bars(network)}</li>`)
          .join("")}</ul></div>`;
    case "portal":
      return `<div class="ph-card light portal"><div class="ph-url">${esc(screen.url)}</div><p class="ph-net">${esc(screen.network)}</p><h4>${esc(screen.heading)}</h4><p>${esc(screen.text)}</p>
        ${screen.fields.map((field) => `<div class="field">${esc(field)}</div>`).join("")}<div class="fake-btn">${esc(screen.button)}</div></div>`;
    case "prompt":
      return `<div class="ph-card light prompt"><p class="ph-net">${esc(screen.app)}</p><h4>${esc(screen.heading)}</h4><p>${esc(screen.text)}</p><div class="fake-row">${screen.buttons.map((button) => `<div class="fake-btn ghost">${esc(button)}</div>`).join("")}</div></div>`;
    case "warning":
      return `<div class="ph-card light warning"><div class="ph-url bad">${WARN} ${esc(screen.url)}</div><h4>${esc(screen.heading)}</h4><p>${esc(screen.text)}</p><p class="tiny">${esc(screen.detail)}</p><div class="fake-row">${screen.buttons.map((button, index) => `<div class="fake-btn ${index ? "ghost" : ""}">${esc(button)}</div>`).join("")}</div></div>`;
    case "doc":
      return `<div class="ph-card light doc"><p class="ph-net">Laptop screen · offline file</p><h4>${esc(screen.title)}</h4>${screen.lines.map((line) => `<p class="line">${esc(line)}</p>`).join("")}</div>`;
    case "qr":
      return `<div class="ph-card qr"><div class="ph-head">${esc(screen.caption)}</div><div class="qr-row"><div class="qr-art" aria-hidden="true"></div><div class="qr-link"><small>Open link?</small><b>${esc(screen.link)}</b></div></div></div>`;
  }
}

function phone(stop: Stop): string {
  const clock = stop.time.split(" · ")[1];
  const dead = state.battery <= 0;
  return `
    <div class="phone" aria-label="Your screens">
      <div class="phone-bar"><span>${esc(clock)}</span><span class="notch"></span><span class="${state.battery <= 15 ? "low" : ""}">${state.battery}%</span></div>
      <div class="phone-body" id="phone-body">${stop.screens.map(screenHtml).join("")}${dead ? `<p class="dead-note">Phone battery flat: this is what you saw before it died.</p>` : ""}</div>
    </div>`;
}

function renderTrip(current: Stop): void {
  const done = new Map(state.picks.map((pick) => [pick.stop, pick]));
  $("#trip").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">${PIN} Your trip</h2><span class="phase-pill">${esc(SCENARIO.traveller.split(" ")[0])}</span></div>
    <div class="d-scroll">
      <p class="muted small">${esc(SCENARIO.traveller)}, ${esc(SCENARIO.org)}. Fictional.</p>
      <div class="meters" id="meters">
        ${meter("Phone battery", "m-battery", state.battery, 100, "%", state.battery <= 15)}
        ${meter("Mobile data", "m-data", state.data, SCENARIO.startData, " MB", state.data < 20)}
        <p class="muted small">The phone loses ${BASE_DRAIN}% at every stop. No top-ups on the roaming pass.</p>
      </div>
      ${SCENARIO.stages
        .map((stage) => {
          const on = stage.stops.some((stop) => stop.id === current.id);
          return `<section class="stage ${on ? "on" : ""}"><h3>${esc(stage.title)}</h3>${on ? `<p>${esc(stage.lesson)}</p>` : ""}<ol class="day">
            ${stage.stops
              .map((stop) => {
                const pick = done.get(stop.id);
                const cls = pick ? (pick.correct ? "ok" : pick.risk === "compromise" ? "breach" : "miss") : stop.id === current.id ? "now" : "later";
                const note = pick ? (pick.correct ? "✓" : pick.risk === "compromise" ? "✕ compromised" : pick.risk === "exposed" ? "! exposed" : pick.late ? "! late" : pick.risk === "minor" ? "~ small risk" : "– not done") : "";
                return `<li class="ev ${cls}"><time>${esc(stop.time.split(" · ")[1])}</time><span>${esc(cls === "later" ? stop.place.split(",")[0] : stop.title)}${note ? ` <em>${note}</em>` : ""}</span></li>`;
              })
              .join("")}</ol></section>`;
        })
        .join("")}
    </div>`;
}

function renderNext(): void {
  const pick = lastPick();
  const stop = currentStop(state);
  const last = state.index + 1 >= STOPS.length;
  const keys = `<kbd>1</kbd>–<kbd>${stop.options.length}</kbd>`;
  let step: NextStep;
  if (pick) {
    step = {
      label: "Done",
      tone: pick.correct ? "ready" : "warn",
      text: `<strong>+${pick.points} points.</strong> Read why, then press <strong>${last ? "See debrief" : "Next stop"}</strong> (or <kbd>N</kbd>).`,
      targets: ['[data-act="next"]'],
    };
  } else if (stop.guided) {
    step = {
      text: `Read the <strong>sign on the desk</strong>, find that exact name in the <strong>Wi-Fi list</strong>, then choose <strong>Join “Halcyon Lounge”</strong> (<kbd>1</kbd>).`,
      targets: ['.around [data-id="sign"]', '[data-act="choose"][data-id="venue"]'],
    };
  } else {
    step = {
      text: stop.task
        ? `Read the evidence around you and on screen, weigh how sensitive <strong>${esc(stop.task.label.toLowerCase())}</strong> is, then pick an action (${keys}).`
        : `Read the prompt and what is around you, then pick an action (${keys}).`,
      hint: hintsAllowed(state) ? (hintText ? "The hint is in the yellow box." : "<strong>Hint</strong> (<kbd>H</kbd>) is free.") : "Last day: no hints. Check your battery and data first.",
      targets: [".options"],
    };
  }
  renderNextStep($("#next-step"), step);
}

function onChoose(optionId: string): void {
  const stop = currentStop(state);
  const pick = choose(state, optionId);
  if (!pick) return;
  hintText = null;
  play(pick.correct ? "success" : pick.risk === "compromise" ? "fail" : "setback");
  post("statement", { at: new Date().toISOString(), verb: "answered", object: pick.stop, result: { correct: pick.correct, option: pick.option, risk: pick.risk, delivered: pick.delivered, late: pick.late } });
  announce(`${verdict(pick)} ${feedbackFor(stop, optionOf(stop, pick.option))}`);
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
  const stop = currentStop(state);
  play("click");
  announce(`${stop.time}. ${stop.place}. ${stop.situation} Battery ${state.battery} percent, ${state.data} megabytes of data left.`);
  $("#desk").scrollTop = 0;
  document.querySelector<HTMLElement>(".context")?.focus({ preventScroll: false });
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!target || (target as HTMLButtonElement).disabled) return;
  const act = target.dataset.act;
  if (act === "choose" && target.dataset.id) onChoose(target.dataset.id);
  else if (act === "hint") onHint();
  else if (act === "next") goNext();
  else if (act === "retry") start();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (state.phase === "play" && /^[1-9]$/.test(key)) {
    const option = currentStop(state).options[Number(key) - 1];
    if (!option) return;
    onChoose(option.id);
  } else if (key === "h" && state.phase === "play") onHint();
  else if (key === "n" && state.phase === "answered") goNext();
  else return;
  event.preventDefault();
});

// ---------- debrief ----------

function outcomeLine(stop: Stop, pick: Pick): string {
  const parts: string[] = [];
  if (stop.task) parts.push(pick.delivered ? "Task delivered" : pick.late ? "Delivered late" : "Task not delivered");
  parts.push(pick.compromise ? COMPROMISE_LABELS[pick.compromise] : RISK_LABELS[pick.risk]);
  return parts.join(" · ");
}

function renderDebrief(): void {
  const summary = summarize(state);
  const evidence = evidenceOf(state);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: summary, evidence, picks: state.picks });
  try {
    localStorage.setItem("ares-wifi:lastResult", JSON.stringify({ summary, evidence }));
  } catch {
    // Optional.
  }
  const vpnSkill = evidence.skills.find((skill) => skill.skill === "vpn-limits")!;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const habit =
    summary.compromises > 0
      ? `You were compromised at <strong>${plural(summary.compromises, "stop")}</strong>. Each time the evidence was on the page: a Wi-Fi page that wanted a work password or an install, or a browser warning you clicked through. ${vpnSkill.shown < vpnSkill.of ? "A VPN protects the route to a site. It does not make a fake page, a pasted code, a cable or an install safe." : "Convenience is what these traps offer; the venue's own word is what to look for."}`
      : summary.missed > PASS_MISSED
        ? `Nothing was stolen, but <strong>${plural(summary.missed, "task")}</strong> did not arrive on time${summary.battery <= 0 ? " and your phone died on the way" : ""}. Refusing to connect is not safety, it is a different failure. Everyday tasks are fine on the venue's own Wi-Fi, which leaves your data and battery for the tasks that need them.`
        : summary.exposures > 0
          ? `The work arrived, but at <strong>${plural(summary.exposures, "stop")}</strong> you took the convenient option with nothing vouching for it. Usually nothing happens, which is why the habit sticks. The sign, the badge or the staff take ten seconds.`
          : summary.total === summary.max
            ? "Every task delivered, by a route the evidence supported, with battery and data to spare. You used venue Wi-Fi where it was fine and saved the safer routes for the work that needed them."
            : "The work arrived and nothing was compromised. Look at the stops below where a cheaper or safer route was on offer.";
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Score ${summary.total}<small>/${summary.max}</small> · ${summary.passed ? "Trip delivered" : summary.compromises ? "Compromised on the road" : "Below the bar"}</h2>
        <p class="muted">${summary.delivered} of ${summary.tasks} tasks delivered on time · ${plural(summary.compromises, "compromise")} · ${plural(summary.exposures, "exposure")} · battery ${summary.battery}% and ${summary.data} MB left · ${plural(summary.hints, "hint")} (not scored). Pass: no compromise, ${Math.round(PASS_RATIO * 100)}% of the points, and at most ${PASS_MISSED} task missed.</p>
      </header>
      <div class="score-grid wide">${summary.byStage.map((entry) => tile(entry.title, entry.points, entry.max)).join("")}${tile("Tasks on time", summary.delivered, summary.tasks)}</div>
      <section class="panel"><h3>Your habit</h3><p>${habit}</p></section>
      <section class="panel">
        <h3>Learning evidence <span class="muted small">(separate from the score)</span></h3>
        <ul class="evidence">
          ${evidence.skills
            .map((skill) => `<li class="ev-${skill.level}" data-id="${skill.skill}"><b>${skill.level === "shown" ? "Shown" : skill.level === "partial" ? "Partly" : skill.level === "n/a" ? "n/a" : "Not yet"}</b><span>${esc(skill.label)}</span><small>${skill.shown}/${skill.of}</small></li>`)
            .join("")}
          <li class="ev-${evidence.final.correct === evidence.final.of ? "shown" : evidence.final.correct ? "partial" : "not-yet"}"><b>Final</b><span>Last day, no hints</span><small>${evidence.final.correct}/${evidence.final.of}</small></li>
          <li class="ev-${evidence.unaided.correct === evidence.unaided.of ? "shown" : "partial"}"><b>Unaided</b><span>Best call on decisions made without a hint</span><small>${evidence.unaided.correct}/${evidence.unaided.of}</small></li>
        </ul>
      </section>
      <section class="panel">
        <h3>Replay: every stop and the evidence that decided it</h3>
        <div class="replay">
          ${state.picks
            .map((pick) => {
              const stop = STOPS.find((entry) => entry.id === pick.stop)!;
              const chosen = optionOf(stop, pick.option);
              const top = maxPoints(stop);
              const bestOnes = stop.options.filter((option) => pointsFor(stop, option) === top);
              return `<article class="rp ${pick.correct ? "ok" : pick.risk === "compromise" ? "breach" : "miss"}" data-id="${esc(stop.id)}">
                <header><time>${esc(stop.time)}</time><b>${esc(stop.title)}</b><span>${stop.task ? `${esc(stop.task.label)} · ${stop.task.sensitivity === "high" ? "sensitive" : "low risk"}` : "No task"}</span>
                  <em class="${pick.correct ? "you" : "attacker"}">+${pick.points}/${top}</em></header>
                <p class="chips">${stop.clues.map((clue) => `<span class="chip ${clue.tell === "trust" ? "cool" : "hot"}">${clue.tell === "trust" ? "✓" : "!"} ${esc(clue.text)}</span>`).join("")}</p>
                <p><strong>You: ${esc(chosen.label)}.</strong> ${esc(outcomeLine(stop, pick))}. ${esc(chosen.result)}</p>
                ${pick.correct ? "" : `<p><strong>Best: ${bestOnes.map((option) => esc(option.label)).join(" · or · ")}.</strong></p>`}
                <p class="muted small">${esc(stop.why)} <span class="res">After this stop: battery ${pick.battery}%, data ${pick.data} MB.</span></p>
              </article>`;
            })
            .join("")}
        </div>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional · Content to be reviewed with SMEs (docs/design/WIFI_OR_WHY_NOT.md)</p>
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
        <p class="tut-lead">You are ${esc(SCENARIO.traveller)} at ${esc(SCENARIO.org)}, on a two-day trip to close a contract.</p>
        <p class="tut-lead">The work has deadlines: a boarding pass, a contract to send, a payment to approve, a client call. At each of ${STOPS.length} stops you choose <strong>how to connect</strong>, or whether to.</p>
        <p class="tut-note">${WIFI}<span>Most public Wi-Fi is fine for everyday tasks. The skill is spotting the few situations that are not, and knowing which task deserves the safer route.</span></p>`,
    },
    {
      title: "Read the evidence",
      body: `
        <div class="tut-ex">
          <div class="row"><span class="tag">Around you</span><span class="then">the sign, your badge, a receipt, a sticker: what the venue itself says</span></div>
          <div class="row"><span class="tag sensor">Your screens</span><span class="then">the Wi-Fi list, a sign-in page, a prompt or a browser warning</span></div>
          <div class="row"><span class="tag">The task</span><span class="then">low risk or sensitive, and how many minutes you have</span></div>
        </div>
        <p>A strong signal and a familiar-looking name prove nothing. <strong>Look for what the venue vouches for</strong>, and for anything asking for more than it needs: a work password, an install, access to your files.</p>`,
    },
    {
      title: "Your moves and limits",
      body: `
        <ol class="tut-moves">
          <li><span><b>Pick one action</b> <kbd>1</kbd>–<kbd>6</kbd><span class="how">Join a network, use your hotspot, turn on the VPN first, ask staff, use your own charger, decline or wait.</span></span></li>
          <li><span><b>Watch three limits</b><span class="how">Phone battery (it drops ${BASE_DRAIN}% every stop), mobile data (${SCENARIO.startData} MB for the whole trip) and the minutes before the task is due. Each action shows its cost.</span></span></li>
          <li><span><b>Next stop</b> <kbd>N</kbd><span class="how">Read what happened and why, then move on.</span></span></li>
        </ol>
        <p class="tut-muted">The first stop is guided. Hints (<kbd>H</kbd>) are free until the last day.</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>${POINTS.safe} <small>points</small></b>Task delivered on time with no avoidable risk.</div>
          <div><b>${POINTS.minor} or ${POINTS.exposed} <small>points</small></b>Delivered with a small risk, or exposed. Late: ${POINTS.late}.</div>
          <div><b>0 <small>points</small></b>Not delivered, or compromised. One compromise fails the trip.</div>
        </div>
        <p>Refusing everything fails, connecting to anything fails, and a VPN is not a cure-all. Learning evidence is reported separately from the score; speed of play is never scored.</p>
        ${retry ? `<p class="tut-note">${PIN}<span>Starting again: same trip, fresh battery, data and score.</span></p>` : ""}
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
    startLabel: retry ? "Start again" : "Start the trip",
    onStart: () => document.querySelector<HTMLElement>('[data-act="choose"]')?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
