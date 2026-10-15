import { esc, pct } from "../../ui/dom";
import type { Decision, Message, Quality, Rating, Summary } from "../sim/types";
import { VERDICT_LABEL } from "./drill";
import { icon } from "./icons";

const RATING: Record<Rating, { title: string; line: string }> = {
  guardian: { title: "Inbox Guardian", line: "Accurate decisions, backed by the evidence that matters." },
  analyst: { title: "Careful Analyst", line: "Mostly right. Tighten up the evidence behind each call." },
  trainee: { title: "Getting There", line: "Some good calls. Look at where the message leads before deciding." },
  novice: { title: "Keep Practicing", line: "Slow down and inspect the sender and link before choosing." },
};

const QUALITY_LABEL: Record<Quality, string> = { correct: "Correct", partial: "Safe, not best", wrong: "Missed" };

// MOCK mission text; the real wording comes from the selected Ares mission owner.
const MISSION_CONNECTION =
  "In the mission you'll be handed a suspicious message and asked to investigate it and explain your response. Use the same order: who sent it, where it leads, what it asks for, and whether it fits how the organization works.";

function habits(summary: Summary): string[] {
  const notes: string[] = [];
  if (summary.missedPhish > 0) notes.push(`${summary.missedPhish} malicious message${summary.missedPhish > 1 ? "s were" : " was"} marked safe. Check the domain at the end of the address and the real link destination.`);
  if (summary.falseAlarms > 0) notes.push(`${summary.falseAlarms} legitimate message${summary.falseAlarms > 1 ? "s were" : " was"} reported. Urgency, capitals, or poor grammar alone don't establish phishing.`);
  if (summary.skippedVerification > 0) notes.push(`${summary.skippedVerification} bank-detail request${summary.skippedVerification > 1 ? "s were" : " was"} decided without a phone check. When the inbox can't settle it, verify through a trusted channel.`);
  if (notes.length === 0) notes.push("No missed phishing, no false alarms, and every uncertain request was verified.");
  return notes;
}

function rowHtml(message: Message, decision: Decision): string {
  const missed = message.cues.filter((c) => decision.missedCues.includes(c.id));
  const weak = message.cues.filter((c) => decision.weakPicked.includes(c.id));
  const cue = (label: string, why: string, kind: string) => `<li class="${kind}"><b>${esc(label)}</b> ${esc(why)}</li>`;
  return `
    <li class="review ${decision.quality}">
      <div class="review-head">
        <span class="review-mark">${icon(decision.quality === "correct" ? "check" : decision.quality === "partial" ? "minus" : "cross")}</span>
        <div>
          <h3>${esc(message.subject)}</h3>
          <p class="muted">${esc(message.fromName)} &lt;${esc(message.fromAddress)}&gt;</p>
        </div>
        <span class="review-points">+${decision.points.total}</span>
      </div>
      <dl>
        <dt>You chose</dt><dd>${VERDICT_LABEL[decision.response]} <span class="q ${decision.quality}">${QUALITY_LABEL[decision.quality]}</span></dd>
        ${decision.quality !== "correct" ? `<dt>Best response</dt><dd>${VERDICT_LABEL[decision.best]}</dd>` : ""}
        <dt>Why</dt><dd>${esc(message.feedback[decision.response])}</dd>
        ${
          missed.length + weak.length > 0
            ? `<dt>Cues</dt><dd><ul class="review-cues">${missed.map((c) => cue(`Missed: ${c.label}.`, c.why, "missed")).join("")}${weak.map((c) => cue(`Weak evidence: ${c.label}.`, c.why, "weak")).join("")}</ul></dd>`
            : ""
        }
      </dl>
    </li>`;
}

export function renderDrillDebrief(
  root: HTMLElement,
  order: readonly Message[],
  decisions: readonly Decision[],
  summary: Summary,
  actions: { retry: () => void; home: () => void },
): void {
  const rating = RATING[summary.rating];
  root.innerHTML = `
    <div class="course-top"><div class="brand">PROJECT ARES<span> ·</span> PHISHING SPEED DRILL</div></div>
    <div class="debrief-body">
      <div class="crumbs">Debrief · The Payroll Request</div>
      <h1 id="drill-debrief-title" tabindex="-1">${esc(rating.title)}</h1>
      <p class="muted">${esc(rating.line)}</p>
      <div class="score-row">
        <div class="score-tile"><div class="k">Score</div><div class="v">${summary.total}</div><div class="s">${pct(Math.min(1, summary.ratio))} of a perfect run (${summary.parScore})</div></div>
        <div class="score-tile"><div class="k">Decisions</div><div class="v">${summary.correct} / ${order.length}</div><div class="s">${summary.accuracyPoints} points · ${summary.partial} safe but not best</div></div>
        <div class="score-tile"><div class="k">Evidence</div><div class="v">+${summary.evidencePoints + summary.streakPoints}</div><div class="s">Best streak ${summary.bestStreak}</div></div>
        <div class="score-tile"><div class="k">Speed</div><div class="v">+${summary.speedPoints}</div><div class="s">Small bonus, correct decisions only</div></div>
      </div>
      <h2>Your habits</h2>
      <ul class="objectives">${habits(summary).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      <h2>Message review</h2>
      <ol class="reviews">${order.map((m, i) => rowHtml(m, decisions[i])).join("")}</ol>
      <h2>Mission connection</h2>
      <p>${esc(MISSION_CONNECTION)}</p>
      <div class="final-actions">
        <button class="btn primary" id="drill-retry">Play again</button>
        <button class="btn" id="drill-home">Back to briefing</button>
      </div>
    </div>`;
  root.querySelector("#drill-retry")!.addEventListener("click", actions.retry);
  root.querySelector("#drill-home")!.addEventListener("click", actions.home);
}
