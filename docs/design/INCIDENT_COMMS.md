# Incident Comms

Page: `comms.html`. Code: `src/comms/` (`engine.ts` pure rules; `corran.ts`, `wrenfield.ts`, `shared.ts` content, exported from `data.ts`; `main.ts` UI; `style.css`). Tests: `tests/comms.test.ts`. Fictional; content to be reviewed with SMEs.

## Problem

When a breach is confirmed, the technical response is usually rehearsed and the communication is not. The damage that follows is often self-inflicted: a confident "no data was affected" that is contradicted two days later, customers notified before the facts are known and then sent a retraction, staff who learn about it from the press, a regulator who reads it in the paper, a containment plan emailed over the mail system the attacker is reading, an employee blamed for what turns out to be a system gap. The people making these calls (comms leads, managers, IT leads, executives) rarely get to practise them, because the consequences arrive hours or days after the message.

## Learning objective

Learners can run outward and upward communication during a confirmed incident:

- say only what is confirmed, say what is not yet known, and say when the next update comes;
- sequence audiences: responders and leadership first, counsel before outward statements, staff before the press, affected people before the newspaper;
- meet notification obligations on time, using a staged notification instead of waiting for the full picture;
- keep the response plan off a channel the attacker may be reading;
- keep one consistent story across every audience, including what leadership says;
- recognise that silence, reassurance, blame and "everything to everyone" are each a way of losing.

## Core loop

Each incident runs from hour 0 to a 72-hour deadline in 5 or 6 turns (not real time). Each turn:

1. **Read the situation** (left column): the hour track, the regulator's clock, three trust meters (customers, staff, regulator), the facts at this hour marked Confirmed / Suspected / Not known (new ones flagged), which channel is safe, and what has been sent so far.
2. **Read the inbox** (right column): 4 to 7 people waiting. Each has 3 or 4 drafts plus **Hold** (say nothing to them this turn).
3. **Choose up to 3 messages** and press **Send** (`N`). The clock jumps to the next turn.
4. **See what happened**: the in-fiction reply to each message (never a verdict), then any consequence that earlier messages or silences have now caused, with the trust change.

At hour 72 the incident closes with an outcome list. After both incidents the debrief replays every message with what it caused later.

Incident 1 is coached for its opening turn only (the Next bar names the three people to brief and rings the draft). Incident 2 has no coaching. Keys: `1` to `9` jump to an inbox item, arrow keys change the draft, `N` sends or continues. How to play walkthrough, help button and Next bar are the shared `src/ui/tutorial.ts`.

## Why the mechanic is the skill

- **Limited messages per turn** force the real decision: who hears now and who waits. Everyone in the inbox has a reasonable claim.
- **Facts carry a status that changes.** The data-theft question is "not known" at hour 0, "suspected" at hour 4 and "confirmed" at hour 30. A draft that was merely hopeful at hour 4 becomes false at hour 30, and the game quotes it back.
- **Consequences are delayed and traceable.** Messages set flags; authored consequences read those flags at later hours. An over-confident line even raises customer trust at the time. The debrief links each consequence back to the message (or the silence) that caused it.
- **Replies are in the fiction, not graded.** "Priya: Good, I will tell the board no data was affected" is the only immediate feedback on a bad brief, as it would be at work.
- **Order is a rule, not advice.** A notice or public statement is only "reviewed" if counsel was engaged in an earlier turn; the draft shows "Counsel has not seen this" as a plain status. Giving the press numbers is fine after affected people have been told and harmful before.
- **Hold is sometimes right.** One inbox item in incident 2 (the office manager wants Dana reported to the police) has no good draft at all.
- **The second incident checks transfer, not recall.** There is no attacker, so email is safe; the urgent first message is to IT (disable the link) and to the 2,300 recipients (please delete), and that one should *not* wait for counsel. The trap is different: describing the folder's contents to the recipients, or claiming nobody opened it before the access record is in.

## How each shortcut loses

Each incident is worth 100 points; 200 in total. Pass = 70% of the points (140), at least 60 in each incident, and no missed regulator deadline. All figures below are asserted or printed by `tests/comms.test.ts`.

| Strategy | Score | What goes wrong |
|---|---|---|
| Best play (the authored plan) | **200/200** | Every outcome met, only positive consequences, "One story, start to finish" in both |
| Tell everyone everything immediately (first three in the inbox, fullest draft) | **70/200** (15 + 55) | Plan emailed over compromised mail tips off the attacker; premature notice to all 40,000 is retracted; off-record speculation becomes a headline; folder contents advertised to 2,300 recipients |
| Say nothing until the investigation is finished (silence, then the best drafts on the last turn) | **40/200** (15 + 25) | Staff answer the journalist; chief executive fills the silence; insurer window missed; supplier and client find out elsewhere; link stays live; regulator reads it in the paper |
| Say nothing at all | **0/200** | All of the above, plus the regulator's deadline is missed (automatic fail) |
| Reassure everyone (first three in the inbox) | **10/200** | "No data affected", "nothing sensitive", "no risk" are each contradicted at a later hour |
| Reassure, but aimed at exactly the right people at the right time | **10/200** | Same: the wording loses even with perfect sequencing |
| Blame the employee wherever a blame draft exists (otherwise best play) | **120/200**, fail | Cause later confirmed as a system gap; staff trust collapses; "Trust blamed worker for IT gap" |
| Stall and deflect | **0/200** | Nothing is said, slowly |
| Best drafts, but answering whoever is first in the inbox | **160/200** (80 + 80) | Passes, but drops the sequencing outcomes: a public statement goes out before counsel is engaged and has to be clarified; the link stays live for three hours |
| Best play except never notifying the regulator | 160/200, **fail** | Missed deadline fails the game whatever the points |
| Best play with one "no data affected" at hour 4 | 200 minus 15 or more | Recoverable; costs the "nothing contradicted" outcome and customer trust |
| One perfect incident and one reassured one | fail | The 60-per-incident floor |

The three shortcuts named in the brief all end below 100/200, far under the 140 pass bar.

## How it differs from Cyber Dispatch and Counterplay

| | Cyber Dispatch (`dispatch.html`) | Counterplay (`counterplay.html`) | Incident Comms |
|---|---|---|---|
| Role | Service desk dispatcher | On-call responder | Incident communications lead |
| Direction of communication | Inward: taking reports from colleagues, handing off to an analyst | None: reading telemetry | Outward and upward: leadership, counsel, regulator, customers, press, insurer, supplier, law enforcement |
| State of the incident | Unknown: is this report real? | Unknown: which technique is this? | Confirmed breach; the unknowns are scope and cause |
| Core decision | Which questions to ask, what priority, who gets the handoff | Which response removes the technique | Who to tell now, and what to say given what is confirmed |
| Time | One shift, three separate reports | Hands of cards | One incident over 72 hours; a message is judged by later facts |
| What goes wrong | Missing evidence, wrong priority, harmful guidance | Wrong or partial response | Contradiction, retraction, missed deadline, leak, tip-off, misplaced blame |

Nothing in Incident Comms asks the learner to triage a report, read a log or pick a technical response.

## Scoring vs learning evidence

**Score** (`scoreRun`, `summarize`): a list of outcomes per incident, each all-or-nothing, evaluated from the flags at hour 72.

- Incident 1: response plan kept off compromised mail (10); regulator notified in time with confirmed facts (15); affected members told once, accurately, after counsel's review (15); spoke publicly and nothing was contradicted (15); staff heard it from you first and nobody was blamed (10); insurer inside its window (5); law enforcement (5); supplier (5); leadership on one voice (5); each trust meter at 65 or more (5 each).
- Incident 2: link disabled in the first hour with logs kept (10); recipients asked to delete at once without advertising the contents (10); regulator (15); affected applicants (15); nothing contradicted (10); staff told and the reporter not blamed (10); insurer (5); largest client (5); leadership (5); trust (5 each).

Trust meters start at 50 and move with each message and consequence. Speed is never scored and there are no hints to count.

**Learning evidence** (`evidenceOf`), reported separately in the debrief and in the host message, never added to the score:

- per skill (says only what is confirmed; right people in the right order; obligations on time; safe channel; one story): outcomes shown out of those that exercise the skill, as shown / partly / not yet;
- the unaided incident: skill outcomes reached with no coaching;
- wording: how many messages stated confirmed facts and a next step, and how many reassured, blamed, over-shared or stalled;
- turns on which someone was deliberately left waiting.

Both go to the host in `ares:practice:completed` (`activityId` `ares-incident-comms/two-incidents/v0.1`), with every message sent and every consequence fired. Each turn posts an `ares:practice:statement`.

## Debrief

Headline score and verdict (One consistent story / Passed, with corrections / Below the bar / Regulatory failure), a tile per incident and the trust values at hour 72, a habit line, the learning evidence panel, then per incident the outcome list and a replay by hour: each message with who it went to, the draft text, a wording chip, why it was or was not sound, and **what it caused later** (hour, title, text). Consequences that no message caused are listed under "What silence caused". "Start again" restarts both incidents.

## Content list

**Incident 1: Lights Out at Corran** (Corran Leisure Trust, ransomware with data theft; turns at hours 0, 4, 12, 30, 48, 60; 3 messages per turn; opening turn guided). Facts move from "whether member data was copied: not known" to "38 GB transfer, suspected" to "11,200 members' names, contact details and dates of birth, confirmed", then a leak-site sample, then the confirmed cause (an MFA rollout that exempted duty managers). Inbox: IT lead, chief executive (hour 0 brief; hour 48 radio interview), outside counsel, insurer (24-hour in-game window), centre managers and staff (first alert, update, close-out), journalist (first statement, update), members (service notice, then the direct notice to those affected), Regional Cyber Crime Unit, PayLoop (supplier), Data Protection Office (notification and update). 28 authored consequences.

**Incident 2: The Open Folder** (Wrenfield Lettings, a link to a folder of 640 rental applicants' ID scans and payslips emailed to a 2,300-address newsletter list; turns at hours 0, 3, 10, 30, 54; no coaching). Inbox: outsourced IT, the 2,300 recipients, managing director (hour 0, and hour 54 "announce the dismissal"), Dana and the office (hour 0 and a later reassurance), counsel, Brightstone Estates (largest client), applicants (early heads-up, full notice), office manager suggesting the police (no good draft), insurer, journalist, Data Protection Office. 24 authored consequences.

Draft styles: measured (confirmed facts and a next step), over-reassuring, blame, too much too soon, stall. The measured draft is not in a fixed position. All organisations, people, the newspaper names, the supplier, the insurers and the regulator are fictional; the one email address uses `.example`.

## SME review items

- **Legal accuracy.** The game deliberately asserts no real law. The "Data Protection Office", its 72-hour initial notification rule, the idea of a staged notification, and the insurers' 24-hour notice condition are in-game rules, labelled as such on screen. An SME should confirm that this framing is acceptable for the learner's jurisdiction and sector, and whether any wording could be read as legal advice. Thresholds for when notification is required are not modelled at all: in both incidents notification is simply required.
- Whether "counsel reviews every outward statement" is the right model for the learner organisation, and whether a holding statement realistically needs that review (the game requires counsel to be engaged a turn earlier for public statements and notices, but not for the "please delete" request in incident 2).
- Law enforcement reporting: when it is expected, who makes the call, and whether police would ask for anything to be withheld from publication.
- Insurer notification: typical notice conditions and whether a breach response panel is a fair simplification.
- What a notice to affected people should contain, and whether offering specific protective steps needs approval.
- The out-of-band channel: phone bridge and personal mobiles are used as the example; confirm against the organisation's actual plan.
- Whether telling the regulator the worst case as fact should lose the outcome (it currently does) or only cost trust.
- Tone toward the employee in incident 2: a no-blame line is treated as correct in every case. Confirm this matches HR policy, and whether a case with genuine misconduct should be added.
- Trust values, the 65 bar and the point weights are design estimates, not measured.
- Journalist behaviour ("off the record" printed as fact) and the timing of leak-site publication are plausible but stylised.
- Reading load: the drafts are short but there are many. Check that 8 to 10 minutes is realistic for the target audience.
