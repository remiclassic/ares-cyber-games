import { TRUST_PASS, type Ask, type Draft, type Objective } from "./engine";

// Content shared by both incidents: the fictional regulator's asks and the three trust objectives.
// The "Data Protection Office" and its 72-hour rule are invented for the game and stated in-game.

export const trustObjectives: Objective[] = [
  { id: "trust-customers", label: `Customer trust at ${TRUST_PASS} or more at hour 72`, points: 5, trust: { meter: "customers", min: TRUST_PASS }, missed: "Customer trust ended below the bar." },
  { id: "trust-staff", label: `Staff trust at ${TRUST_PASS} or more at hour 72`, points: 5, trust: { meter: "staff", min: TRUST_PASS }, missed: "Staff trust ended below the bar." },
  { id: "trust-regulator", label: `Regulator trust at ${TRUST_PASS} or more at hour 72`, points: 5, trust: { meter: "regulator", min: TRUST_PASS }, missed: "Regulator trust ended below the bar." },
];

// The regulator's drafts are the same at any hour: a staged notification is always "what is
// confirmed now, what is not, what we are doing, when we update".
const regulatorDrafts: Draft[] = [
  {
    id: "none-needed",
    label: "Report that no notification is needed",
    text: "Tell the Office this was a technical problem with no personal data involved, so no notification is required.",
    style: "reassure",
    sets: ["reg-misled"],
    reaction: "The Office logs your statement and closes the enquiry for now.",
    why: "You told the regulator something nobody had confirmed. When the facts arrived, the first thing on file was wrong.",
  },
  {
    id: "staged",
    label: "Staged notification",
    text: "Notify the Office: what happened and when, what is confirmed at this hour, what is still unknown, what we are doing, and when we will update.",
    style: "measured",
    sets: ["reg-notified"],
    trust: { regulator: 12 },
    reaction: "The Office acknowledges the notification and assigns a case officer.",
    why: "A staged notification meets the deadline without guessing: confirmed facts now, the rest when it is known.",
  },
  {
    id: "worst-case",
    label: "Send every log and the worst case",
    text: "Send the Office the raw logs and state as fact the worst case you can imagine: everyone's data, including financial details, has been taken.",
    style: "dump",
    sets: ["reg-notified", "reg-speculated"],
    trust: { regulator: 2 },
    reaction: "The case officer writes back: “Which of this is confirmed?”",
    why: "It was on time, but it stated guesses as facts. You later had to withdraw figures you had given the regulator.",
  },
];

export function regulatorAsk(ask: string): Ask {
  return { id: "regulator", audience: "regulator", from: "Data Protection Office", ask, showIf: { none: ["reg-notified", "reg-misled"] }, drafts: regulatorDrafts };
}

export function regulatorUpdateAsk(scope: string): Ask {
  return {
    id: "regulator-update",
    audience: "regulator",
    from: "Data Protection Office, case officer",
    ask: "“Thank you for the initial notification. Please confirm how many people are affected and which kinds of data.”",
    showIf: { all: ["reg-notified"], none: ["reg-updated", "reg-brushoff"] },
    drafts: [
      {
        id: "blame",
        label: "Point at the employee",
        text: "“The root cause was an individual employee's failure to follow our policy. We are dealing with them.”",
        style: "blame",
        sets: ["blamed"],
        trust: { regulator: -4 },
        reaction: "Case officer: “That is not what I asked. What controls were in place?”",
        why: "The regulator asked about scope and controls. Blaming one person answered neither, and the blame did not survive the investigation.",
      },
      {
        id: "update",
        label: "Update with the confirmed scope",
        text: scope,
        style: "measured",
        sets: ["reg-updated"],
        trust: { regulator: 8 },
        reaction: "Case officer: “Clear. Thank you. Send the final report when the investigation is complete.”",
        why: "The second stage of a staged notification: the same story, with the numbers now confirmed.",
      },
      {
        id: "closed",
        label: "Say the matter is closed",
        text: "“Everything is back to normal and we consider the incident closed. No further update is planned.”",
        style: "reassure",
        sets: ["reg-brushoff"],
        trust: { regulator: -8 },
        reaction: "The case officer opens a formal enquiry.",
        why: "Closing the conversation before the regulator's questions were answered turned a routine follow-up into an enquiry.",
      },
    ],
  };
}
