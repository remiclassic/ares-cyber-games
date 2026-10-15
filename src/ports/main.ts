import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { POLICY, ROUNDS, service, type Action } from "./data";
import { SHIPS, grade, score, serviceOptions, upgradeLabel, type Answer } from "./engine";

const ACTIVITY_ID = "ares-port-authority/v0.1";
const post = (type: string, payload: unknown) => {
  if (window.parent !== window) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
$("#logo").innerHTML = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const seed = Math.floor(Math.random() * 1000);
let index = 0;
let answers: Answer[] = SHIPS.map(() => ({ service: null, action: null }));

const roundOf = (i: number) => ROUNDS.findIndex((_, r) => ROUNDS.slice(0, r + 1).flat().length > i);

function shipSvg(port: number, outcome: Action | null): string {
  return `<svg class="harbour" viewBox="0 0 800 260" role="img" aria-label="Ship carrying port ${port}">
    <defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f3a66"/><stop offset="1" stop-color="#06213f"/></linearGradient></defs>
    <rect width="800" height="260" fill="url(#sea)"/>
    <g stroke="#2c6aa6" stroke-width="3" fill="none" opacity=".6"><path d="M0 70q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0"/><path d="M0 200q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0"/></g>
    <g class="docks">
      <rect x="640" y="20" width="160" height="62" rx="6" class="dock allow ${outcome === "allow" ? "lit" : ""}"/><text x="720" y="57" text-anchor="middle">ALLOW BERTH</text>
      <rect x="640" y="99" width="160" height="62" rx="6" class="dock upgrade ${outcome === "upgrade" ? "lit" : ""}"/><text x="720" y="136" text-anchor="middle">UPGRADE YARD</text>
      <rect x="640" y="178" width="160" height="62" rx="6" class="dock block ${outcome === "block" ? "lit" : ""}"/><text x="720" y="215" text-anchor="middle">TURNED BACK</text>
    </g>
    <g class="ship ${outcome ?? "arriving"}">
      <path d="M40 150h300l-30 44H70z" fill="#e5484d" stroke="#fff" stroke-width="3"/>
      <rect x="80" y="104" width="190" height="46" rx="4" fill="#f6b93b" stroke="#fff" stroke-width="3"/>
      <path d="M118 104v46M156 104v46M194 104v46M232 104v46" stroke="#b07a10" stroke-width="3"/>
      <rect x="282" y="112" width="40" height="38" rx="4" fill="#e8f0fb" stroke="#fff" stroke-width="3"/>
      <text x="175" y="137" text-anchor="middle" class="port">:${port}</text>
    </g>
  </svg>`;
}

function render(): void {
  if (index >= SHIPS.length) return results();
  const ship = SHIPS[index];
  const answer = answers[index];
  const done = answer.action !== null;
  const g = grade(ship, answer);
  const upgrade = upgradeLabel(ship);
  $("#status").innerHTML = `
    <div class="count"><strong>${index + 1}/${SHIPS.length}</strong><span>Ship</span></div>
    <div class="count"><strong>${roundOf(index) + 1}/${ROUNDS.length}</strong><span>Tide</span></div>`;
  $("#rules").innerHTML = `
    <div class="col-head"><h2>Harbour rules</h2></div>
    <div class="d-scroll">
      <ol class="policy">${POLICY.map((line) => `<li>${esc(line)}</li>`).join("")}</ol>
      <h4 class="sub-head">Ship log</h4>
      <ul class="shiplog">${SHIPS.slice(0, index + (done ? 1 : 0))
        .map((s, i) => {
          const r = grade(s, answers[i]);
          return `<li class="${r.action ? "ok" : "bad"}"><b>:${s.port}</b> ${esc(service(s.service).name)} · ${esc(s.from)} → ${esc(s.to)} <em>${answers[i].action}</em></li>`;
        })
        .join("")}</ul>
    </div>`;
  $("#dock-head").innerHTML = `<h2>Incoming connection</h2><span>${esc(ship.from)} → ${esc(ship.to)}</span>`;
  $("#dock-main").innerHTML = `
    <div class="d-scroll dockbody">
      ${shipSvg(ship.port, done ? ship.action : null)}
      <p class="route"><b>Port ${ship.port}</b> · from <b>${esc(ship.from)}</b> to the <b>${esc(ship.to)}</b></p>
      <section class="q"><h4 class="sub-head">1. Which service uses port ${ship.port}?</h4>
        <div class="opts svc-opts">${serviceOptions(ship, seed)
          .map((id) => {
            const cls = answer.service ? (id === ship.service ? "right" : id === answer.service ? "wrong" : "") : "";
            return `<button class="opt ${cls}" data-service="${id}" ${answer.service ? "disabled" : ""}>${esc(service(id).name)}</button>`;
          })
          .join("")}</div>
        ${answer.service ? `<p class="small muted">${esc(service(ship.service).name)}: ${esc(service(ship.service).note)}</p>` : ""}
      </section>
      <section class="q ${answer.service ? "" : "locked"}"><h4 class="sub-head">2. What does the harbour policy say?</h4>
        <div class="opts acts">
          ${(["allow", "block", "upgrade"] as Action[])
            .map((action) => {
              const cls = done ? (action === ship.action ? "right" : action === answer.action ? "wrong" : "") : "";
              const label = action === "allow" ? "Allow" : action === "block" ? "Block" : `Upgrade${upgrade ? ` to ${upgrade}` : ""}`;
              return `<button class="opt act-${action} ${cls}" data-action="${action}" ${!answer.service || done || (action === "upgrade" && !upgrade) ? "disabled" : ""}>${esc(label)}</button>`;
            })
            .join("")}
        </div>
      </section>
      ${done ? `<div class="verdict ${g.action ? "good" : "bad"}"><b>${g.action ? "Right call." : `Policy says ${ship.action}.`}</b> ${esc(ship.why)}</div><button class="btn primary" data-next>${index + 1 < SHIPS.length ? "Next ship" : "See the harbour report"}</button>` : ""}
    </div>`;
  renderNext();
}

// The live "Next" bar: one instruction for the current step, with a ring on what to click. It
// points at the method (the port, the route, the rules), never at the answer.
function renderNext(): void {
  const ship = SHIPS[index];
  const answer = answers[index];
  const route = `from <strong>${esc(ship.from)}</strong> to the <strong>${esc(ship.to)}</strong>`;
  let step: NextStep;
  if (!answer.service) {
    step = {
      text: `Ship ${index + 1} of ${SHIPS.length}: port <strong>${ship.port}</strong>, ${route}. Click the service that uses port ${ship.port}.`,
      hint: index === 0 ? "Your first click locks in, so read all four options first." : "Your first click locks in.",
      targets: [".svc-opts"],
    };
  } else if (!answer.action) {
    const wrong = answer.service !== ship.service;
    step = {
      text: `Now apply the harbour rules on the left to this ship ${route}: click <strong>Allow</strong>, <strong>Block</strong> or <strong>Upgrade</strong>.`,
      hint: wrong
        ? `The service you picked does not use port ${ship.port}: the right one is now marked green. Decide for that service.`
        : "Check where it comes from as well as what it is: the same service can be fine from one place and forbidden from another.",
      targets: [".opts.acts"],
    };
  } else {
    const last = index + 1 >= SHIPS.length;
    const newTide = !last && roundOf(index + 1) !== roundOf(index);
    step = {
      label: "Done",
      tone: "ready",
      text: `Ship handled. Read the verdict, then press <strong>${last ? "See the harbour report" : "Next ship"}</strong>.`,
      hint: newTide ? `The next ship starts tide ${roundOf(index + 1) + 1} of ${ROUNDS.length}.` : "",
      targets: ["[data-next]"],
    };
  }
  renderNextStep($("#next-step"), step);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const svc = target.closest<HTMLElement>("[data-service]");
  const act = target.closest<HTMLElement>("[data-action]");
  const ship = SHIPS[index];
  if (svc && !answers[index].service) {
    answers[index].service = svc.dataset.service!;
    play(answers[index].service === ship.service ? "deliver" : "setback");
    render();
    document.querySelector<HTMLElement>("[data-action]:not(:disabled)")?.focus();
  } else if (act && answers[index].service && !answers[index].action) {
    answers[index].action = act.dataset.action as Action;
    const ok = answers[index].action === ship.action;
    play(ok ? "success" : "setback");
    announce(`${ok ? "Right call." : `Policy says ${ship.action}.`} ${ship.why}`);
    render();
    document.querySelector<HTMLElement>("[data-next]")?.focus();
  } else if (target.closest("[data-next]")) {
    index += 1;
    render();
    document.querySelector<HTMLElement>("[data-service]")?.focus();
  } else if (target.closest("[data-retry]")) {
    index = 0;
    answers = SHIPS.map(() => ({ service: null, action: null }));
    $("#game").hidden = false;
    $("#debrief").hidden = true;
    render();
  }
});

function results(): void {
  const total = score(answers);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score: total, answers });
  const wrongActions = SHIPS.filter((s, i) => answers[i].action !== s.action);
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head"><p class="kicker">Harbour report · Port Authority</p><h2 id="debrief-title" tabindex="-1">Score ${total}<small>/100</small></h2>
      <p class="muted">${SHIPS.filter((s, i) => answers[i].service === s.service).length} of ${SHIPS.length} services named · ${SHIPS.length - wrongActions.length} of ${SHIPS.length} policy calls right.</p></header>
      <section class="panel"><h3>Calls to revisit</h3>${
        wrongActions.length
          ? `<ul class="habits">${wrongActions.map((s) => `<li><b>:${s.port} ${esc(service(s.service).name)}, ${esc(s.from)} → ${esc(s.to)}:</b> should ${s.action}. ${esc(s.why)}</li>`).join("")}</ul>`
          : "<p>None. Every ship was handled by the book.</p>"
      }</section>
      <section class="panel"><h3>Ports to remember</h3><ul class="objectives">
        <li>Cleartext and its secure replacement: Telnet 23 → SSH 22 · FTP 21 → SFTP 22 · HTTP 80 → HTTPS 443 · POP3 110 → POP3S 995 · LDAP 389 → LDAPS 636.</li>
        <li>Never on the internet edge: SMB 445, RDP 3389, databases (MySQL 3306), SNMP 161.</li>
        <li>The same port can be fine or forbidden depending on where it comes from: RDP from the VPN to a jump host, yes; from the internet, never.</li></ul></section>
      <div class="debrief-actions"><button class="btn primary" data-retry>Sail again</button></div>
      <p class="fineprint">A remix of Portflow by the Project Ares games team · new content and twist · pending SME review</p>
    </div>`;
  $("#debrief-title").focus();
}

// The first-time walkthrough: the job, what is on screen, the moves, a made-up example of the
// rules at work, and how it is scored. Reopenable from the header at any time.
const SHIP_ICON = `<svg viewBox="0 0 40 24" aria-hidden="true"><path d="M2 14h30l-4 7H6z" fill="#e5484d" stroke="#fff" stroke-width="1.5"/><rect x="7" y="7" width="18" height="7" fill="#f6b93b" stroke="#fff" stroke-width="1.5"/></svg>`;

function tutorialPages(): TutorialPage[] {
  const perTide = ROUNDS[0].length;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You run the harbour master's desk for <strong>Meridian Freight</strong>'s network. Every network connection arrives like a ship, flying a <strong>port number</strong>.</p>
        <p class="tut-lead">For each of ${SHIPS.length} ships (${ROUNDS.length} tides of ${perTide}) you do two things:</p>
        <ol class="tut-moves">
          <li><span><b>Name the service</b> that uses that port.<span class="how">Port 443 is HTTPS, for example.</span></span></li>
          <li><span><b>Apply the harbour rules</b> to it.<span class="how">Allow it, block it, or send it to the upgrade yard to swap a cleartext protocol for its secure version.</span></span></li>
        </ol>
        <p class="tut-note"><span>The same port can be fine from one place and forbidden from another. Always read <strong>where the ship comes from</strong> and <strong>where it is going</strong>.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${SHIP_ICON}</span><span><b>The ship</b>Its cargo shows the port number, such as <em>:443</em>. After your call it sails to a berth.</span></div>
          <div><span class="tut-ico box">→</span><span><b>The route</b>Under the picture, for example "Port 443 · from Internet to the web server".</span></div>
          <div><span class="tut-ico box">§</span><span><b>Harbour rules</b>Left panel: the ${POLICY.length} policy lines every call must follow. Below them, the ship log of your calls so far.</span></div>
          <div><span class="tut-ico box">3</span><span><b>Three berths</b>ALLOW BERTH, UPGRADE YARD and TURNED BACK: where the ship goes after your call.</span></div>
        </div>
        <p class="tut-muted">Top right: which ship you are on (of ${SHIPS.length}) and which tide (of ${ROUNDS.length}). The <strong>Next</strong> bar above the dock always says what to do now.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read the port and the route</b><span class="how">Port number on the ship, source and destination under it.</span></span></li>
          <li><span><b>Name the service</b><span class="how">Under "1. Which service uses port …?", click one of the four options. Your first click locks in: the right one turns green, a wrong pick turns red.</span></span></li>
          <li><span><b>Apply the rules</b><span class="how">Under "2. What does the harbour policy say?", click <span class="tut-pill">Allow</span>, <span class="tut-pill">Block</span> or <span class="tut-pill">Upgrade to …</span>. The upgrade button names the secure version, and is greyed out when the protocol has none.</span></span></li>
          <li><span><b>Read the verdict and move on</b><span class="how">A short explanation appears. Press <span class="tut-pill">Next ship</span> (after the last ship, <span class="tut-pill">See the harbour report</span>).</span></span></li>
        </ol>
        <p class="tut-muted">Keyboard: <kbd>Tab</kbd> moves between the options and <kbd>Enter</kbd> chooses one.</p>`,
    },
    {
      title: "The rules at work",
      body: `
        <p>Two made-up ships, on ports that are not in the game, to show how the rules apply.</p>
        <div class="tut-ex">
          <div class="row"><span class="tag">:143 from Office to the mail server</span><span class="arrow">→</span><span>IMAP: mail download in cleartext</span></div>
          <div class="row"><span class="then">Rule:</span><span>no cleartext protocols</span><span class="arrow">→</span><span class="tag ok">Upgrade to IMAPS (993)</span></div>
        </div>
        <div class="tut-ex">
          <div class="row"><span class="tag">:5900 from Internet to the file server</span><span class="arrow">→</span><span>VNC: remote control of a desktop</span></div>
          <div class="row"><span class="then">Rule:</span><span>admin access only arrives through the VPN</span><span class="arrow">→</span><span class="tag hot">Block</span></div>
        </div>
        <p class="tut-note"><span>Find the rule that covers the ship's service <strong>and</strong> its route. Allow only what a rule allows, upgrade cleartext the rules name, and block what the rules forbid.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Service <small>1 pt</small></b>Naming the right service for the port.</div>
          <div><b>Policy call <small>3 pts</small></b>Allow, block or upgrade, as the harbour rules say.</div>
          <div><b>Score <small>/100</small></b>Your points out of ${SHIPS.length * 4}, scaled to 100.</div>
        </div>
        <p>The policy call is worth three times the port number: the decision is what protects the network. There is no timer.</p>
        <p class="tut-muted">At the end, the harbour report lists every call to revisit and the ports to remember.</p>
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-large" ${settings.largeText ? "checked" : ""} /> Larger text</label>
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
  root.querySelector<HTMLInputElement>("#opt-large")!.addEventListener("change", (event) => {
    settings.largeText = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
  });
}

const KICKER = "Port Authority · How to play";

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

render();
showTutorial({
  kicker: KICKER,
  pages: tutorialPages(),
  startLabel: "Open the harbour",
  onStart: () => document.querySelector<HTMLElement>("[data-service]")?.focus(),
  onLastPage: bindSettings,
});
