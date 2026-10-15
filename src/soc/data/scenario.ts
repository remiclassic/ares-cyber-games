import type { ActionId, CaseState, EvidenceDef, ReasonId, Signal, Source, Strength, Points, Variant } from "../sim/types";

// Scenario: "A Strange Login". All content is authored for the prototype and
// still needs SME review. The address is from a documentation range.

export const at = (hour: number, minute: number): number => hour * 60 + minute;

export const CASE = {
  title: "Suspicious Account Activity",
  summary: "Unusual activity detected for a finance user with possible data exfiltration.",
  user: "t.nguyen",
  host: "FIN-LAP-028",
  location: "New York, US",
  destination: "203.0.113.42",
  firstSeen: at(10, 14),
  start: at(10, 33),
} as const;

// ---------- transfer model ----------
export const TRANSFER_START = at(10, 26);
export const Q3_END = at(10, 41);
export const PAYROLL_START = at(10, 43);
export const PAYROLL_END = at(11, 8);
export const GB_PER_MINUTE = 0.08;
export const Q3_GB = 1.2;
export const TOTAL_GB = 3.2;

// ---------- opening signals (the same in both variants) ----------
export const SIGNALS: Readonly<Record<Source, Signal>> = {
  login: {
    source: "login",
    title: "Login activity",
    summary: "Multiple logins from unusual locations.",
    rows: [
      { time: at(10, 14), what: "Successful login", detail: "New York, US", alert: false },
      { time: at(10, 27), what: "Successful login", detail: "London, UK", alert: true },
      { time: at(10, 31), what: "MFA challenged", detail: "London, UK", alert: true },
      { time: at(10, 32), what: "Successful login", detail: "London, UK", alert: true },
    ],
  },
  endpoint: {
    source: "endpoint",
    title: "Endpoint event",
    summary: `Process and file activity on ${CASE.host}.`,
    rows: [
      { time: at(10, 22), what: "Uncommon process", detail: "powershell.exe", alert: true },
      { time: at(10, 24), what: "Archive created", detail: "finance_q3.zip", alert: true },
      { time: at(10, 25), what: "Large file access", detail: "1.2 GB (243 files)", alert: true },
      { time: at(10, 26), what: "Process network connection", detail: `to ${CASE.destination}`, alert: true },
    ],
  },
  network: {
    source: "network",
    title: "Outbound traffic",
    summary: "Data transfer to an uncommon external IP.",
    rows: [],
  },
};

// ---------- evidence the player can request ----------
export const EVIDENCE: readonly EvidenceDef[] = [
  {
    id: "L1",
    source: "login",
    label: "Device and session detail",
    minutes: 2,
    finding: {
      compromise: {
        strength: "strong",
        points: "compromise",
        lines: () => [
          "The London sign-ins came from a Windows device that is not enrolled in device management. This browser has never been seen for t.nguyen.",
          "The 10:14 New York session on FIN-LAP-028 is still active. Two sessions are open at once, on two continents.",
          "The London address belongs to a home internet provider, not a company office or VPN.",
        ],
        why: "One person cannot hold live sessions on two devices in two countries. This separates stolen credentials from travel.",
      },
      approved: {
        strength: "strong",
        points: "approved",
        lines: () => [
          "The London sign-ins came from FIN-LAP-028 itself. The device ID matches and the laptop is compliant.",
          "The 10:14 \"New York\" sign-in went through the corporate VPN, which exits in New York. The VPN tunnel dropped at 10:25.",
          "The London address belongs to a hotel network near the London office.",
        ],
        why: "The same managed laptop and a VPN exit explain the two cities without a second person.",
      },
    },
  },
  {
    id: "L2",
    source: "login",
    label: "MFA record",
    minutes: 2,
    finding: {
      compromise: {
        strength: "weak",
        points: "neutral",
        lines: () => [
          "10:31: a push prompt was sent to the registered phone.",
          "10:32: the prompt was approved. No denied or repeated prompts are logged.",
        ],
        why: "A passed prompt shows that someone tapped Approve. Intruders get prompts approved too, so this fits both explanations.",
      },
      approved: {
        strength: "weak",
        points: "neutral",
        lines: () => [
          "10:31: a push prompt was sent to the registered phone.",
          "10:32: the prompt was approved. No denied or repeated prompts are logged.",
        ],
        why: "A passed prompt shows that someone tapped Approve. Intruders get prompts approved too, so this fits both explanations.",
      },
    },
  },
  {
    id: "L3",
    source: "login",
    label: "Travel record and manager check",
    minutes: 4,
    finding: {
      compromise: {
        strength: "strong",
        points: "compromise",
        lines: () => [
          "No travel request is on file for t.nguyen this month.",
          "Manager R. Okafor, by chat: \"Nguyen is at their desk, two rows from me.\"",
        ],
        why: "The user is physically in New York, so the London sign-ins are someone else.",
      },
      approved: {
        strength: "strong",
        points: "approved",
        lines: () => [
          "Travel request TR-2291: London office, 1 to 5 October, for the Q3 external audit. Approved.",
          "Manager R. Okafor, by chat: \"Yes, Nguyen is in London with the auditors this week.\"",
        ],
        why: "An approved trip and a manager's confirmation place the user in London.",
      },
    },
  },
  {
    id: "E1",
    source: "endpoint",
    label: "Process tree",
    minutes: 2,
    finding: {
      compromise: {
        strength: "strong",
        points: "compromise",
        lines: () => [
          "OUTLOOK.EXE → WINWORD.EXE (Invoice_Q3_revised.docm) → powershell.exe -WindowStyle Hidden -EncodedCommand …",
          "The document arrived by email at 10:19 from an outside sender.",
          "The script is unsigned and has never run on this host before.",
        ],
        why: "A hidden, encoded script started by an emailed document is not how approved jobs run.",
      },
      approved: {
        strength: "strong",
        points: "approved",
        lines: () => [
          "Task Scheduler → powershell.exe -File QuarterClose-Export.ps1",
          "The script is signed with the IT code-signing certificate. IT created the task in April.",
          "The same task ran on this host on 3 July, at the Q2 close.",
        ],
        why: "A signed, scheduled IT task with a history on this host is expected work.",
      },
    },
  },
  {
    id: "E2",
    source: "endpoint",
    label: "File access detail",
    minutes: 2,
    finding: {
      compromise: {
        strength: "weak",
        points: "neutral",
        lines: () => [
          "243 files were read from \\\\FIN-SRV-02\\Finance\\Q3-Close in 70 seconds.",
          "t.nguyen has standing read access to every file in that folder.",
          "All 243 files were written into finance_q3.zip.",
        ],
        why: "Access rights show what the account may read. They do not show who was driving it or why.",
      },
      approved: {
        strength: "weak",
        points: "neutral",
        lines: () => [
          "243 files were read from \\\\FIN-SRV-02\\Finance\\Q3-Close in 70 seconds.",
          "t.nguyen has standing read access to every file in that folder.",
          "All 243 files were written into finance_q3.zip.",
        ],
        why: "Access rights show what the account may read. They do not show who was driving it or why.",
      },
    },
  },
  {
    id: "E3",
    source: "endpoint",
    label: "Change ticket lookup",
    minutes: 2,
    finding: {
      compromise: {
        strength: "weak",
        points: "compromise",
        lines: () => [
          "No open change ticket mentions FIN-LAP-028 or a file export today.",
          "The search covers the change system only. Approvals given by email or chat would not appear.",
        ],
        why: "A missing ticket raises suspicion, but work also happens without tickets. Absence is not confirmation.",
      },
      approved: {
        strength: "strong",
        points: "approved",
        lines: () => [
          "CHG-4471 \"Q3 audit package export to Hale & Marlow\": approved by Finance and IT, window 3 October 10:00 to 12:00.",
          "The ticket names FIN-LAP-028 as the source host.",
        ],
        why: "An approved change that names this host, this time window and this export accounts for the endpoint activity.",
      },
    },
  },
  {
    id: "N1",
    source: "network",
    label: "Destination ownership and history",
    minutes: 2,
    finding: {
      compromise: {
        strength: "strong",
        points: "compromise",
        lines: () => [
          "203.0.113.42 is a rented virtual server at a hosting provider. The registration names no company.",
          "The first contact from anywhere in the company was at 10:26 today.",
          "The address is not on the approved file-transfer list.",
        ],
        why: "An anonymous server with no history and no approval is not a business partner.",
      },
      approved: {
        strength: "strong",
        points: "approved",
        lines: () => [
          "203.0.113.42 is registered to Hale & Marlow LLP, the company's external auditor.",
          "The address has been on the approved file-transfer list since March.",
          "FIN-SRV-02 sent the Q2 audit package to the same address on 3 July.",
        ],
        why: "A known partner on the approved list, used the same way last quarter, is an expected destination.",
      },
    },
  },
  {
    id: "N2",
    source: "network",
    label: "Live transfer status",
    minutes: 2,
    finding: {
      compromise: {
        strength: "weak",
        points: "neutral",
        lines: ({ transferredGb }) => [
          `${transferredGb.toFixed(2)} GB sent so far, at about 80 MB per minute.`,
          "One encrypted connection from FIN-LAP-028, opened at 10:26.",
          "Encryption hides the content. The volume is consistent with finance_q3.zip (1.2 GB).",
        ],
        why: "This tells you how fast data is leaving, which matters for timing. It does not tell you whether the transfer is wanted.",
      },
      approved: {
        strength: "weak",
        points: "neutral",
        lines: ({ transferredGb }) => [
          `${transferredGb.toFixed(2)} GB sent so far, at about 80 MB per minute.`,
          "One encrypted connection from FIN-LAP-028, opened at 10:26.",
          "Encryption hides the content. The volume is consistent with finance_q3.zip (1.2 GB).",
        ],
        why: "This tells you how fast data is leaving, which matters for timing. It does not tell you whether the transfer is wanted.",
      },
    },
  },
  {
    id: "N3",
    source: "network",
    label: "Other hosts using this destination",
    minutes: 2,
    finding: {
      compromise: {
        strength: "weak",
        points: "neutral",
        lines: () => [
          "No other company device has contacted 203.0.113.42 today.",
          "FIN-LAP-028 has made no other unusual outbound connections.",
        ],
        why: "This narrows the scope to one laptop. It says nothing about whether that laptop's transfer is legitimate.",
      },
      approved: {
        strength: "weak",
        points: "neutral",
        lines: () => [
          "No other company device has contacted 203.0.113.42 today.",
          "FIN-LAP-028 has made no other unusual outbound connections.",
        ],
        why: "This narrows the scope to one laptop. It says nothing about whether that laptop's transfer is legitimate.",
      },
    },
  },
];

// ---------- events that happen as the clock runs ----------
export type WorldEvent = Readonly<{
  id: string;
  variant: Variant;
  source: Source;
  // Minute the event happens, or null if its trigger has not occurred.
  when: (state: CaseState) => number | null;
  title: string;
  detail: string;
  strength: Strength;
  points: Points;
}>;

const hostOpenAt = (state: CaseState, time: number) => state.hostContainedAt === null || state.hostContainedAt > time;
const accountOpenAt = (state: CaseState, time: number) => state.accountContainedAt === null || state.accountContainedAt > time;
const fixed = (time: number, open: (state: CaseState, time: number) => boolean) => (state: CaseState) => (open(state, time) ? time : null);

export const EVENTS: readonly WorldEvent[] = [
  {
    id: "c-mfa",
    variant: "compromise",
    source: "login",
    when: fixed(at(10, 36), accountOpenAt),
    title: "New MFA method registered",
    detail: "An authenticator app was added to t.nguyen from the London session.",
    strength: "strong",
    points: "compromise",
  },
  {
    id: "c-q3done",
    variant: "compromise",
    source: "network",
    when: fixed(Q3_END, hostOpenAt),
    title: "Upload finished: finance_q3.zip",
    detail: `1.2 GB delivered to ${CASE.destination}.`,
    strength: "weak",
    points: "neutral",
  },
  {
    id: "c-payroll",
    variant: "compromise",
    source: "endpoint",
    when: fixed(at(10, 42), hostOpenAt),
    title: "Second archive created: payroll_fy.zip",
    detail: `2.0 GB from the Payroll share. Upload to ${CASE.destination} starts at 10:43.`,
    strength: "strong",
    points: "compromise",
  },
  {
    id: "c-rule",
    variant: "compromise",
    source: "login",
    when: fixed(at(10, 44), accountOpenAt),
    title: "Inbox rule created",
    detail: "Mail containing \"invoice\" or \"payment\" is now forwarded to an outside address and deleted.",
    strength: "strong",
    points: "compromise",
  },
  {
    id: "c-fraud",
    variant: "compromise",
    source: "login",
    when: fixed(at(10, 52), accountOpenAt),
    title: "Payment change request sent",
    detail: "From t.nguyen's mailbox to Accounts Payable: new bank details for a supplier.",
    strength: "strong",
    points: "compromise",
  },
  {
    id: "c-usercall",
    variant: "compromise",
    source: "login",
    when: (state) => (state.accountContainedAt === null ? null : state.accountContainedAt + 2),
    title: "t.nguyen calls the service desk from New York",
    detail: "\"I was just signed out of everything. I'm at my desk. I haven't travelled anywhere.\"",
    strength: "strong",
    points: "compromise",
  },
  {
    id: "a-done",
    variant: "approved",
    source: "network",
    when: fixed(Q3_END, hostOpenAt),
    title: "Transfer finished",
    detail: "1.2 GB delivered. The connection closed normally.",
    strength: "weak",
    points: "neutral",
  },
  {
    id: "a-ticket",
    variant: "approved",
    source: "login",
    when: fixed(at(10, 46), accountOpenAt),
    title: "Service desk ticket from t.nguyen",
    detail: "\"Hotel Wi-Fi keeps dropping the VPN. I'll work from the London office this afternoon.\" Sent from FIN-LAP-028.",
    strength: "strong",
    points: "approved",
  },
  {
    id: "a-exportcall",
    variant: "approved",
    source: "endpoint",
    when: (state) => (state.hostContainedAt !== null && state.hostContainedAt < Q3_END ? state.hostContainedAt + 2 : null),
    title: "Call from Finance lead R. Okafor",
    detail: "\"The auditor export on Nguyen's laptop just died mid-transfer. Hale & Marlow need the Q3 package by noon.\"",
    strength: "strong",
    points: "approved",
  },
  {
    id: "a-offlinecall",
    variant: "approved",
    source: "endpoint",
    when: (state) => (state.hostContainedAt !== null && state.hostContainedAt >= Q3_END ? state.hostContainedAt + 2 : null),
    title: "Call from Finance lead R. Okafor",
    detail: "\"Nguyen's laptop dropped off the network in the middle of the audit walkthrough. It had just finished the scheduled Q3 export.\"",
    strength: "strong",
    points: "approved",
  },
  {
    id: "a-usercall",
    variant: "approved",
    source: "login",
    when: (state) => (state.accountContainedAt === null ? null : state.accountContainedAt + 3),
    title: "t.nguyen calls the service desk from London",
    detail: "\"I'm locked out in the middle of the audit walkthrough. My travel is approved under TR-2291.\"",
    strength: "strong",
    points: "approved",
  },
];

// ---------- responses and reasons ----------
export const ACTIONS: readonly Readonly<{ id: ActionId; label: string; hint: string; minutes: number }>[] = [
  { id: "monitor", label: "Monitor", hint: "Watch for changes", minutes: 8 },
  { id: "investigate", label: "Investigate", hint: "Continue analysis", minutes: 4 },
  { id: "contain", label: "Contain", hint: "Limit potential impact", minutes: 4 },
  { id: "escalate", label: "Escalate", hint: "Hand to incident response", minutes: 3 },
  { id: "standdown", label: "Stand down", hint: "Close as expected activity", minutes: 1 },
];

export const REASONS: readonly Readonly<{ id: ReasonId; text: string }>[] = [
  { id: "partial", text: "Signals are partial, so confirm before acting" },
  { id: "correlated", text: "Independent sources confirm a compromise" },
  { id: "impact", text: "Finance data is leaving now, too costly to wait" },
  { id: "approved", text: "Evidence matches approved, expected activity" },
  { id: "handover", text: "Contained, so hand over for scoping and notification" },
  { id: "reversal", text: "New evidence overturns my earlier call" },
  { id: "location", text: "A login from another country is proof enough" },
];

export const TRUTH: Readonly<Record<Variant, Readonly<{ headline: string; story: string }>>> = {
  compromise: {
    headline: "This was a compromise.",
    story:
      "At 10:19 t.nguyen opened an emailed invoice in New York. Its macro started a hidden script that zipped the Q3 finance folder and began uploading it to a rented server. The same email had already captured the account's password, and an intruder signed in from London and talked the user's phone into approving the prompt. Left alone, the intruder moves on to the Payroll share and to payment fraud from the mailbox.",
  },
  approved: {
    headline: "This was approved activity.",
    story:
      "t.nguyen is in London for the Q3 external audit. The 10:14 sign-in looked like New York because the corporate VPN exits there; when the hotel Wi-Fi dropped the VPN, later sign-ins showed London. The script is IT's scheduled quarter-close export, sending the audit package to the auditor's approved server. Nothing was wrong, and every interruption cost the audit team time.",
  },
};

export const INITIAL_BUDGET = 1;
export const BUDGET_PER_DECISION = 1;
export const INVESTIGATE_BUDGET = 2;
export const MAX_DECISIONS = 3;
export const CONTAIN_EFFECT_MINUTES = 1;
export const STALL_MINUTES = 3;
export const HANDOVER_MINUTES = 15;
// Responders re-check whatever the handoff does not already show.
export const IR_BASE_MINUTES = 3;
export const IR_MINUTES_PER_MISSING_SOURCE = 3;
// Unattended disruption lasts until the service desk works the ticket.
export const UNRESTORED_MINUTES = 180;
export const EXPORT_RESTART_DEADLINE = at(11, 15);
export const RULE_AT = at(10, 44);
export const FRAUD_AT = at(10, 52);
