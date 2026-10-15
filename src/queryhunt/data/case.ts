import type { CaseDef, Challenge, Tile, VariantId } from "../sim/types";
import { DATASETS, type Dataset } from "./dataset";

// Case 01, "Unusual Access": questions, guided blocks, reference queries,
// evidence cards and feedback. No UI code here.
// SCENARIO CONTENT PENDING SME REVIEW (see docs/SME_REVIEW_QUERYHUNT.md).

export const SME_NOTICE = "Gameplay concept • Scenario content pending SME review";

// Inventory slots, in collection order.
export const EVIDENCE_SLOTS: readonly Readonly<{ id: string; title: string; source: string }>[] = [
  { id: "E1", title: "Failed logins in the window", source: "logins" },
  { id: "E2", title: "Repeated failures on one account", source: "logins" },
  { id: "E3", title: "Success after the failures", source: "logins" },
  { id: "E4", title: "Unregistered device", source: "devices" },
  { id: "E5", title: "Unusual file access", source: "file_access" },
];

const time = (ts: string): string => ts.slice(11, 16);

function build(ds: Dataset): CaseDef {
  const f = ds.facts;
  const [from, to] = ds.window;
  const who = f.subject.username;
  const acct = f.subject.id;
  const inWindow = `ts >= '${from}' AND ts < '${to}'`;
  const serviceIsTop = f.serviceFailures > f.burstFailures;
  // Variant B asks about both stand-out accounts, so the service account can be ruled out with data.
  const timelineAccounts = serviceIsTop ? [f.serviceId, acct] : [acct];
  const accountFilter = timelineAccounts.length > 1 ? `account_id IN (${timelineAccounts.map((a) => `'${a}'`).join(", ")})` : `account_id = '${acct}'`;

  const logins: Tile = { id: "src-logins", kind: "source", label: "Login events", table: "logins", select: "*" };
  const fileAccess: Tile = { id: "src-files", kind: "source", label: "File activity", table: "file_access", select: "*" };
  const failed: Tile = { id: "f-failed", kind: "filter", label: "Failed attempts", sql: "result = 'failure'" };
  const succeeded: Tile = { id: "f-success", kind: "filter", label: "Successful only", sql: "result = 'success'" };
  const windowTile: Tile = { id: "f-window", kind: "filter", label: "In the alert window", sql: inWindow };
  const wholeDay: Tile = { id: "f-day", kind: "filter", label: "Whole day", sql: `ts >= '${from.slice(0, 10)} 00:00:00' AND ts <= '${from.slice(0, 10)} 23:59:59'` };
  const oldest: Tile = { id: "s-oldest", kind: "sort", label: "Oldest first", sql: "ts" };
  const newest: Tile = { id: "s-newest", kind: "sort", label: "Newest first", sql: "ts DESC" };

  const challenges: Challenge[] = [
    {
      kind: "query",
      id: "c1",
      node: "Authentication logs",
      title: "Find the failed logins",
      question: `An alert fired for the period ${ds.windowLabel}. List the failed logins in that period.`,
      mustInclude: "event_id, ts",
      ordering: "Required: ts ascending (oldest first).",
      expectedSql: `SELECT event_id, ts, account_id, source_ip, location FROM logins WHERE result = 'failure' AND ${inWindow} ORDER BY ts`,
      check: { columns: [{ name: "event_id" }, { name: "ts" }], orderBy: { column: "ts", dir: "asc" } },
      tiles: [logins, fileAccess, failed, succeeded, windowTile, wholeDay, oldest, newest],
      hints: [
        "Sign-in attempts are in the logins table. Its result column holds 'success' or 'failure'.",
        `Times are text such as '${from}', so they compare in order. The period starts at '${from}' and ends before '${to}'.`,
        "You need two conditions joined with AND (the result and the time range), then ORDER BY ts.",
      ],
      candidates: [
        {
          id: "E1",
          title: "Failed logins in the alert window",
          source: "logins",
          fields: [
            ["Period", ds.windowLabel],
            ["Failed attempts", String(f.failuresInWindow)],
            ["Accounts involved", String(f.accountsWithFailures)],
          ],
          note: `${f.failuresInWindow} failed logins fall inside the alert period, across ${f.accountsWithFailures} accounts.`,
          verdict: "relevant",
          feedback: "",
        },
        {
          id: "X1-late",
          title: `${f.forgetful.username}: ${f.forgetfulFailures} failed logins at ${time(f.forgetfulAt)}`,
          source: "logins",
          fields: [
            ["Account", f.forgetful.id],
            ["Time", f.forgetfulAt],
          ],
          note: "Several failures in a row on one account.",
          verdict: "wrong",
          feedback: `Those failures happened at ${time(f.forgetfulAt)}, outside the alert period, so they are not in your result. Evidence has to come from what the query returned.`,
        },
        {
          id: "X1-claim",
          title: "An account was taken over",
          source: "none",
          fields: [["Basis", "Failed logins"]],
          note: "Someone broke into an account during the alert period.",
          verdict: "wrong",
          feedback: "That is a conclusion, not an observation. A list of failed logins shows attempts that did not get in.",
        },
      ],
      explain: {
        prompt: "What does this result tell you?",
        options: [
          {
            id: "ok",
            text: `There were ${f.failuresInWindow} failed logins in the period, across ${f.accountsWithFailures} accounts. I don't know yet which of them, if any, matter.`,
            correct: true,
            feedback: "Right. It is a starting list. Counting by account will show where the failures concentrate.",
          },
          {
            id: "attack",
            text: "The company is under attack.",
            correct: false,
            feedback: "Failed logins have ordinary causes too: typos, expired passwords, scheduled jobs. This result shows attempts and nothing more.",
          },
          {
            id: "nothing",
            text: "Failed logins are normal, so there is nothing to investigate.",
            correct: false,
            feedback: "They are common, but the alert asks whether any of this is unusual, and a flat list cannot answer that. Count by account next.",
          },
        ],
      },
      concept: "Filtering: WHERE keeps the rows that meet every condition joined with AND. Text timestamps in YYYY-MM-DD HH:MM:SS form compare in time order.",
    },
    {
      kind: "query",
      id: "c2",
      node: "Account summary",
      title: "Count attempts by account",
      question: "Count the failed logins in the alert period for each account.",
      mustInclude: "account_id and the count (any column name)",
      ordering: "Required: the count descending (highest first). Rows with equal counts may come in any order.",
      expectedSql: `SELECT account_id, COUNT(*) AS attempts FROM logins WHERE result = 'failure' AND ${inWindow} GROUP BY account_id ORDER BY attempts DESC`,
      check: { columns: [{ name: "account_id" }, { name: "attempts", flexible: true }], orderBy: { column: "attempts", dir: "desc" } },
      tiles: [
        logins,
        failed,
        windowTile,
        wholeDay,
        { id: "g-account", kind: "group", label: "Group by account", by: "account_id", select: "account_id, COUNT(*) AS attempts" },
        { id: "g-location", kind: "group", label: "Group by location", by: "location", select: "location, COUNT(*) AS attempts" },
        { id: "s-count", kind: "sort", label: "Highest count first", sql: "attempts DESC" },
        { id: "s-account", kind: "sort", label: "By account id", sql: "account_id" },
      ],
      hints: [
        "Keep the two conditions from the first question. GROUP BY account_id makes one row per account.",
        "COUNT(*) counts the rows in each group. Give it a name with AS, for example COUNT(*) AS attempts.",
        "ORDER BY attempts DESC puts the highest count first.",
      ],
      candidates: [
        {
          id: "E2",
          title: `${who}: ${f.burstFailures} failed attempts`,
          source: "logins",
          fields: [
            ["Account", acct],
            ["Failed attempts", String(f.burstFailures)],
            ["Typical for other staff", "1"],
          ],
          note: `${f.burstFailures} failures on one staff account in the period. Staff accounts with a typo show 1.`,
          verdict: "relevant",
          feedback: "",
          highlight: { column: "account_id", value: acct },
        },
        {
          id: "O2-service",
          title: `${f.serviceName}: ${f.serviceFailures} failed attempts`,
          source: "logins",
          fields: [
            ["Account", f.serviceId],
            ["Failed attempts", String(f.serviceFailures)],
          ],
          note: "A service account that fails repeatedly in the period.",
          verdict: "optional",
          feedback: serviceIsTop
            ? `Kept as context. It has the highest count, but the count does not say which account matters. ${who} is far above an ordinary typo too, so pin that as well.`
            : "Kept as context. A service account failing repeatedly is worth a follow-up, though it is not the largest cluster here.",
          highlight: { column: "account_id", value: f.serviceId },
        },
        {
          id: "X2-single",
          title: "Two accounts with 1 failed attempt each",
          source: "logins",
          fields: [["Accounts", f.singleFailureAccounts.join(", ")]],
          note: "A single failed login on each account.",
          verdict: "wrong",
          feedback: "True, but one failure is what a typo looks like. It is not what makes this period unusual.",
        },
        {
          id: "X2-claim",
          title: `${who}'s password was guessed`,
          source: "none",
          fields: [["Basis", `${f.burstFailures} failed attempts`]],
          note: "The repeated attempts ended with the attacker getting in.",
          verdict: "wrong",
          feedback: "A count of failures contains no successful login. Nothing here shows that anyone got in.",
        },
      ],
      explain: {
        prompt: "What does the count support?",
        options: [
          {
            id: "ok",
            text: serviceIsTop
              ? `Two accounts stand out: ${f.serviceName} (${f.serviceFailures}) and ${who} (${f.burstFailures}). The count alone does not say which one matters, or whether anyone got in.`
              : `${who} has far more failures than anyone else (${f.burstFailures}). That is suspicious, but it does not show that anyone got in.`,
            correct: true,
            feedback: "Right. Repeated failures are a reason to look further. They are not a finding on their own.",
          },
          {
            id: "compromised",
            text: serviceIsTop ? `${f.serviceName} has the most failures, so it is the compromised account.` : `${who} is compromised: ${f.burstFailures} failures show the password was guessed.`,
            correct: false,
            feedback: "Each failure is an attempt that did not get in. Compromise would need at least a successful login, so check what happened next.",
          },
          {
            id: "forgot",
            text: "The user forgot their password. Close the alert.",
            correct: false,
            feedback: "Possible, but it is an assumption. A count cannot tell a forgetful user from someone guessing. Look at what followed.",
          },
        ],
      },
      concept: "Aggregating: GROUP BY makes one row per value and COUNT(*) counts the rows in each group. A high count tells you where to look, not what happened.",
    },
    {
      kind: "query",
      id: "c3",
      node: "Login timeline",
      title: "Did a login succeed afterwards?",
      question: serviceIsTop
        ? `List every login event, failed and successful, for the two accounts with the most failures (${f.serviceId} and ${acct}) in the alert period.`
        : `List every login event, failed and successful, for account ${acct} in the alert period.`,
      mustInclude: "event_id, ts",
      ordering: "Required: ts ascending (oldest first), so the sequence reads in time order.",
      expectedSql: `SELECT event_id, ts, account_id, source_ip, location, device_id, result FROM logins WHERE ${accountFilter} AND ${inWindow} ORDER BY ts`,
      check: { columns: [{ name: "event_id" }, { name: "ts" }], orderBy: { column: "ts", dir: "asc" } },
      tiles: [
        logins,
        { id: "f-account", kind: "filter", label: serviceIsTop ? `Accounts ${f.serviceId}, ${acct}` : `Account ${acct}`, sql: accountFilter },
        windowTile,
        failed,
        succeeded,
        oldest,
        newest,
      ],
      hints: [
        "This time keep both results: do not filter on result at all.",
        serviceIsTop ? `Match the accounts with account_id IN ('${f.serviceId}', '${acct}').` : `Match the account with account_id = '${acct}'.`,
        "Keep the time range, and ORDER BY ts so a success after the failures is easy to see.",
      ],
      candidates: [
        {
          id: "E3",
          title: `${who}: success after ${f.burstFailures} failures`,
          source: "logins",
          fields: [
            ["Failures", `${time(f.burstFirst)} to ${time(f.burstLast)}`],
            ["Then success", f.successAt],
            ["Source IP", `${f.attackerIp} (same for all)`],
            ["Location", f.attackerLocation],
          ],
          note: "A successful login follows the failed attempts, from the same source address.",
          verdict: "relevant",
          feedback: "",
          highlight: { column: "source_ip", value: f.attackerIp },
        },
        ...(serviceIsTop
          ? [
              {
                id: "O3-service",
                title: `${f.serviceName}: ${f.serviceFailures} failures, no success`,
                source: "logins",
                fields: [
                  ["Source IP", `${f.serviceIp} (internal)`],
                  ["Successful logins", "0"],
                ] as const,
                note: "Every attempt comes from one internal address and none succeeds.",
                verdict: "optional" as const,
                feedback: "Kept as context. It shows why the highest count is not the account to follow: nothing got in.",
                highlight: { column: "account_id", value: f.serviceId },
              },
            ]
          : []),
        {
          id: "X3-office",
          title: `${who} signed in from the office at ${time(f.officeLoginAt)}`,
          source: "logins",
          fields: [
            ["Device", f.usualDevice],
            ["Time", f.officeLoginAt],
          ],
          note: "A normal sign-in on the account's own laptop.",
          verdict: "wrong",
          feedback: "That login is outside the alert period, so it is not in your result. It is a good follow-up question for the account owner, not evidence for this step.",
        },
        {
          id: "X3-claim",
          title: "The attacker guessed the password",
          source: "none",
          fields: [["Basis", "Failures, then a success"]],
          note: "An outsider tried passwords until one worked.",
          verdict: "wrong",
          feedback: "The timeline shows the order of events. It does not show who was typing or how the correct password was obtained.",
        },
      ],
      explain: {
        prompt: "What does the timeline support?",
        options: [
          {
            id: "ok",
            text: `After ${f.burstFailures} failures, ${who} signed in successfully from the same address at ${time(f.successAt)}. That fits someone eventually entering the right password. It does not show who, or what they did next.`,
            correct: true,
            feedback: "Right. The account and the source address tie the failures to the success, and the time order tells you which came first.",
          },
          {
            id: "proof",
            text: "This proves the account was compromised.",
            correct: false,
            feedback: "It is stronger than failures alone, but a real user mistyping on a new device produces the same sequence. Look at what the session did.",
          },
          {
            id: "benign",
            text: "The login succeeded, so it was the real user. Nothing to see.",
            correct: false,
            feedback: "A success shows that the correct password was entered. It does not show who entered it.",
          },
        ],
      },
      concept: "Correlating: events belong together when they share an identifier (account, source address) and their order in time makes sense. Sorting by time turns rows into a sequence.",
    },
    {
      kind: "query",
      id: "c4",
      node: "Device and file activity",
      title: "What did that session do?",
      question: `The successful login came from device ${f.rogueDevice}. List the file activity from that device, together with whether the device is registered.`,
      mustInclude: "event_id, ts, registered (from the devices table)",
      ordering: "Required: ts ascending (oldest first).",
      expectedSql: `SELECT file_access.event_id, file_access.ts, file_access.file_path, file_access.action, file_access.sensitivity, devices.registered FROM file_access JOIN devices ON devices.device_id = file_access.device_id WHERE file_access.device_id = '${f.rogueDevice}' ORDER BY file_access.ts`,
      check: { columns: [{ name: "event_id" }, { name: "ts" }, { name: "registered" }], orderBy: { column: "ts", dir: "asc" } },
      tiles: [
        fileAccess,
        { id: "j-devices", kind: "join", label: "Add device details", sql: "JOIN devices ON devices.device_id = file_access.device_id", select: "devices.hostname, devices.registered" },
        { id: "f-device", kind: "filter", label: `Device ${f.rogueDevice}`, sql: `file_access.device_id = '${f.rogueDevice}'` },
        { id: "f-acct-files", kind: "filter", label: `Account ${acct}`, sql: `file_access.account_id = '${acct}'` },
        { id: "f-restricted", kind: "filter", label: "Restricted files only", sql: "file_access.sensitivity = 'restricted'" },
        { id: "s-oldest-f", kind: "sort", label: "Oldest first", sql: "file_access.ts" },
      ],
      hints: [
        "File activity is in file_access. Whether a device is registered is in devices.",
        "Both tables have device_id. JOIN devices ON devices.device_id = file_access.device_id puts the matching device next to each file event.",
        `Filter with file_access.device_id = '${f.rogueDevice}' and ORDER BY file_access.ts. After a join, prefix columns that exist in both tables.`,
      ],
      candidates: [
        {
          id: "E4",
          title: `${f.rogueDevice} is not a registered device`,
          source: "devices",
          fields: [
            ["Registered", "0 (no)"],
            ["Hostname", "none"],
            ["Signed in as", acct],
          ],
          note: "The device used for the successful login is not in the asset inventory.",
          verdict: "relevant",
          feedback: "",
          highlight: { column: "registered", value: "0" },
        },
        {
          id: "E5",
          title: `${f.fileEvents} accesses to ${f.sensitiveFolder}`,
          source: "file_access",
          fields: [
            ["Files", `${f.filesTouched} files, all restricted`],
            ["Downloads", String(f.downloads)],
            ["Time", `${time(f.filesFirst)} to ${time(f.filesLast)}`],
          ],
          note: "Restricted files were read and downloaded within minutes of the login.",
          verdict: "relevant",
          feedback: "",
          highlight: { column: "sensitivity", value: "restricted" },
        },
        {
          id: "X4-routine",
          title: `${who} read ${f.usualFolder} the day before`,
          source: "file_access",
          fields: [["Device", f.usualDevice]],
          note: "Files opened from the account's own laptop.",
          verdict: "wrong",
          feedback: "That is routine work on a registered laptop, the day before, and it is not in your result. It says nothing about this device.",
        },
        {
          id: "X4-claim",
          title: "The files were sent outside the company",
          source: "none",
          fields: [["Basis", `${f.downloads} downloads`]],
          note: "Data left the organization.",
          verdict: "wrong",
          feedback: "The log shows files read and downloaded to this device. It shows nothing about where the data went afterwards.",
        },
      ],
      explain: {
        prompt: "What does this activity support?",
        options: [
          {
            id: "ok",
            text: `An unregistered device signed in as ${who} and read and downloaded restricted files minutes later. This is unusual access that should be escalated. It is not yet proof of who did it or of data leaving.`,
            correct: true,
            feedback: "Right. You have described what the records show and stopped where they stop.",
          },
          {
            id: "breach",
            text: "A data breach is confirmed: the files were stolen.",
            correct: false,
            feedback: "Downloads to the device are recorded. Where the files went next, and who was using the device, are not in these tables.",
          },
          {
            id: "allowed",
            text: "The files opened without errors, so the access was authorized.",
            correct: false,
            feedback: "A successful read shows the account's permissions allowed it. It does not show that the person at the keyboard was meant to do it.",
          },
        ],
      },
      concept: "Joining: JOIN ... ON matches rows from two tables that share an identifier, so each event carries the details of its device.",
    },
    {
      kind: "conclusion",
      id: "c5",
      node: "Finding",
      title: "State what the evidence supports",
      question: "Choose the conclusion you can defend, and select the evidence that supports it.",
      hints: [
        "A conclusion should claim no more than the records show.",
        "Failed logins show attempts. Which evidence shows what happened after them?",
        "Cite the successful login and what the session did. The failed-login evidence can come along as context.",
      ],
      options: [
        {
          id: "likely",
          text: `Activity consistent with unauthorized use of ${who}'s account. Recommend escalation: reset the credentials, contact the account owner and preserve the logs.`,
          correct: true,
          feedback: "This matches the evidence and leaves the open questions open.",
        },
        {
          id: "confirmed",
          text: `Confirmed compromise: an attacker from ${f.attackerLocation} guessed the password and stole the files.`,
          correct: false,
          feedback: "The records do not show who was at the keyboard, how the password was obtained, or that data left the device. State what the evidence is consistent with and escalate.",
        },
        {
          id: "failed",
          text: "A password-guessing attempt that failed. No further action.",
          correct: false,
          feedback: "The timeline contains a successful login from the same source after the failures, followed by file access. The attempt did not simply fail.",
        },
        {
          id: "traveller",
          text: "The user forgot their password while travelling. Close as benign.",
          correct: false,
          feedback: "That cannot be ruled out without asking the account owner, but nothing in the evidence supports it, and it does not explain an unregistered device reading restricted files. Do not close on an assumption.",
        },
      ],
      requiredEvidence: ["E3", "E4", "E5"],
      attemptsOnly: ["E1", "E2"],
      evidenceFeedback: {
        none: "Select the evidence that supports the conclusion. A conclusion without evidence is a guess.",
        attemptsOnly: "Repeated failed logins alone do not establish compromise: they show attempts. Which evidence shows what happened after them?",
        missingSuccess: "Without the successful login, nothing ties the failed attempts to any access. Include the evidence that shows someone got in.",
        missingActivity: "The conclusion is about how the account was used. Include what the session did: the device it came from and the files it touched.",
      },
      supported: `The records show ${f.burstFailures} failed logins on ${who} from ${f.attackerIp} (${f.attackerLocation}), then a successful login from the same address at ${time(f.successAt)} on a device that is not registered, then ${f.fileEvents} accesses to restricted files in ${f.sensitiveFolder}. Together this is consistent with unauthorized use of the account and justifies escalation. It is not confirmed compromise.`,
      openQuestions: [
        "Who was using the device. The logs record an account, not a person.",
        "How the correct password was obtained.",
        "Whether the downloaded files left the device.",
        `Why ${who} also signed in from the office at ${time(f.officeLoginAt)} on the same day. Ask the account owner.`,
      ],
    },
  ];

  return {
    id: "unusual-access",
    title: "Unusual Access",
    variant: ds.id,
    variantLabel: ds.label,
    brief: `An alert reports unusual login activity during ${ds.windowLabel}. Query the records, pin what the results show, and say only what the evidence supports.`,
    challenges,
  };
}

export const CASES: Record<VariantId, CaseDef> = { a: build(DATASETS.a), b: build(DATASETS.b) };

// Shown by "Review material". MOCK: the real study material comes from the course owner.
export const REVIEW_MATERIAL: readonly Readonly<{ title: string; body: string; example: string }>[] = [
  { title: "Filter", body: "WHERE keeps rows that meet every condition joined with AND.", example: "SELECT * FROM logins\nWHERE result = 'failure'\n  AND ts >= '2024-01-01 00:00:00'" },
  { title: "Aggregate", body: "GROUP BY makes one row per value. COUNT(*) counts the rows in each group.", example: "SELECT account_id, COUNT(*) AS attempts\nFROM logins\nGROUP BY account_id" },
  { title: "Order", body: "ORDER BY sorts the result. Add DESC for largest or newest first.", example: "ORDER BY attempts DESC" },
  { title: "Correlate", body: "Events belong together when they share an identifier and their time order makes sense.", example: "WHERE account_id = 'A-0001'\nORDER BY ts" },
  { title: "Join", body: "JOIN ... ON matches rows of two tables on a shared identifier.", example: "FROM file_access\nJOIN devices\n  ON devices.device_id = file_access.device_id" },
  { title: "Interpret", body: "Say what the rows show. Suspicious is not the same as confirmed: name what is still unknown.", example: "-- 12 failed logins = 12 attempts,\n-- not a compromise" },
];
