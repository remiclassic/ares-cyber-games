import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
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
  $("#dock").innerHTML = `
    <div class="col-head"><h2>Incoming connection</h2><span>${esc(ship.from)} → ${esc(ship.to)}</span></div>
    <div class="d-scroll dockbody">
      ${shipSvg(ship.port, done ? ship.action : null)}
      <p class="route"><b>Port ${ship.port}</b> · from <b>${esc(ship.from)}</b> to the <b>${esc(ship.to)}</b></p>
      <section class="q"><h4 class="sub-head">1. Which service uses port ${ship.port}?</h4>
        <div class="opts">${serviceOptions(ship, seed)
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

render();
showModal({
  kicker: "Remix · Ports and protocols",
  title: "Port Authority",
  body: `<p>You run the harbour master's desk for Meridian Freight's network. Connections arrive like ships, each flying a <strong>port number</strong>.</p>
    <ol class="brief-steps"><li><span><strong>Name the service</strong> from its port.</span></li><li><span><strong>Apply the harbour rules</strong>: allow it, block it, or send it to the <strong>upgrade yard</strong> to switch a cleartext protocol to its secure version.</span></li></ol>
    <p class="note"><span>The same port can be fine from one place and forbidden from another. Read where each ship comes from.</span></p>`,
  actions: [{ label: "Open the harbour", primary: true, onClick: () => document.querySelector<HTMLElement>("[data-service]")?.focus() }],
});
