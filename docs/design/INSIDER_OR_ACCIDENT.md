# Insider or Accident

Page: `insider.html` · Code: `src/insider/` · Tests: `tests/insider.test.ts` · Activity id: `ares-insider-or-accident/the-data-loss-queue/v0.1`

Status: playable prototype. **Content is not SME-reviewed.** Fictional organisation (Northquay Logistics) and people.

## Problem

A data-loss alert names an account, and people read it as naming a culprit. Two failures follow. Analysts who assume malice suspend colleagues who made a mistake, followed a broken process or were themselves the victim: that damages trust, stops people reporting their own slips, and creates grievance and legal exposure. Analysts who assume accident close the one case that was a real exfiltration. Both are shortcuts that avoid the actual work: reading the behaviour against its context.

## Learning objective

Given a data-loss alert, the learner can:

1. choose the few pieces of context that separate the possible explanations, instead of reading everything or nothing;
2. classify the case (honest mistake, process or policy gap, negligent shortcut, malicious insider, compromised account, or authorised work) from that evidence;
3. say which facts support the classification;
4. choose a response proportionate to what happened and fair to the person.

## Core loop

Six short cases, about six minutes. For each:

1. **Open the case file.** The alert, the person's name and job title. Nothing else.
2. **Spend checks.** Eight evidence sources, one check each: audit log, role and project, HR context, manager's account, ticket system, data destination, timing and device, policy and tooling. Each reveals one fact. The pool is 20 checks for the whole shift (48 would be needed to read everything).
3. **Make the call**, in three parts: what it was (6 options), which revealed facts support that (up to 2), what should happen (coach the person, fix the process, restrict and investigate with HR/legal, reset credentials and treat as external, close as no issue).
4. **The outcome plays out**: what happened next, what it really was, the deciding evidence (including any the player skipped), and the movement of two meters, Staff trust and Data exposure.

Case 1 is guided (a coach line that says what to look at, never the answer). Cases 2 to 4 carry a one-line hint. Cases 5 and 6 have none. The debrief shows each case's deciding evidence, what the player skipped, their habits, and learning evidence.

## Why the mechanic is the skill

- **The check budget forces the real question**: "what would tell these explanations apart?" A player cannot read everything, so they must predict which source is diagnostic. That prediction is the analyst skill.
- **Look-alikes make the log insufficient.** Three cases share one audit-log pattern (a large bulk download in a single session at about 23:00 with a valid sign-in). One is an approved migration, one a leaver's deliberate copy, one a stolen session. The log is never supporting evidence for them; the ticket system, destination and device are.
- **Citing evidence separates knowing from guessing.** A classification only scores when at least one cited fact supports it.
- **The response is a separate decision.** Two cases with similar intent (honest mistake, negligent shortcut) and two with similar logs (leaver, stolen session) need different responses, and each wrong response has a specific, shown consequence.
- **Who the person is never decides a case.** HR context is never supporting evidence. Being on notice appears on an innocent case (the migration) and on the guilty one. A recent career setback appears on the victim of the account compromise.

## How each shortcut loses

Pass needs score 70+, Staff trust 45 or more, Data exposure 60 or less. Scores from `tests/insider.test.ts` (the tests assert the thresholds; exact values measured from the same strategies):

| Strategy | Score | Trust | Exposure | Why it loses |
| --- | --- | --- | --- | --- |
| Best play (2 deciding checks a case, 12 of 20) | 100 | 91 | 0 | Passes. |
| Careful first-timer (log + 2 deciding checks, 18 of 20) | 100 | 91 | 0 | Passes. |
| Always "malicious", always investigate, with good evidence | 40 | 7 | 0 | Five colleagues wrongly suspended. Each outcome shows the cost: a late pay run, a new starter suspended, a grievance, legal advice taken. Trust gate fails. |
| Always "malicious", no checks | 7 | 7 | 0 | As above, and unsupported. |
| Always "honest mistake", always close, with good evidence | 33 | 73 | 91 | The leaver's copy and the live intruder are both closed. Exposure gate fails. |
| Always "honest mistake", always coach | 43 | 63 | 47 | A friendly word does not get the USB drive back. |
| Every answer right, no checks | 20 | 91 | 0 | Unsupported calls: no classification points, half response points. |
| Every answer right, check every source | 60 | 91 | 0 | The pool is gone after case 3 (8, 8, 4, 0, 0, 0); the last three calls are blind. |
| Any single classification + any single response (30 pairs) | under 60 | | | Asserted in the tests. |

## How it differs from SOC Dashboard Challenge (and Incident Triage)

| | SOC Dashboard Challenge (`soc.html`) | Incident Triage (`triage.html`) | Insider or Accident |
| --- | --- | --- | --- |
| Shape | One login incident, followed in depth over up to three timed decisions | A queue of alerts sorted into lanes against the clock | Six short, untimed cases about one named colleague each |
| Question | Is this an attack, and how do I contain it without breaking the business? | What do I look at first? | What did this person actually do, and why? |
| Decision | Technical containment actions on accounts and hosts | Priority | Classification of intent, then an HR / process / security response |
| Cost of error | Business outcome, attacker progress | Missed or late alerts | Trust and legal cost of a wrongful accusation; exposure from a missed theft |
| Evidence | Panels requested under a time budget | Alert details | A shared check pool across cases; look-alike cases with the same log |

The overlap is deliberate only at one point: case 6 is a compromised account. Here the lesson is not containment technique but recognising that the named employee is a victim, and routing it away from HR.

## Scoring versus learning evidence

**Game score** (`score()` in `src/insider/engine.ts`), 10 points a case, 60 scaled to 100:

- Classification 4: correct and supported by at least one cited fact that genuinely supports the true reading.
- Evidence 2: 1 per cited supporting fact (max 2 cites).
- Response 4 (best), 2 (partly right), 0 (wrong). Halved when the call is unsupported.
- Staff trust and Data exposure are pass gates and are not points.

**Learning evidence** (`learning()`), shown in the debrief and sent in the `ares:practice:completed` payload, never added to the score:

- cases read correctly, and calls resting on a supporting fact;
- deciding facts found, against checks spent per case (targeting);
- proportionate responses;
- colleagues treated as suspects without cause (called malicious, or sent to HR/legal, when it was not);
- real thefts or intrusions under-reacted to;
- calls made blind.

Host messages: `ares:practice:started`, `ares:practice:statement` (verbs `checked`, `decided`), `ares:practice:completed`.

## Content list

| # | Case | Person and role | Truth | Proportionate response | Deciding evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Pay-run sheet sent outside | Priya Raman, payroll coordinator | Honest mistake | Coach the person | Ticket (self-report), destination (look-alike contact) | Guided |
| 2 | Drawings on a personal drive | Tomasz Zielinski, site planner (new starter) | Process or policy gap | Fix the process | Ticket (unanswered request), policy and tooling (250 MB limit) | Hint |
| 3 | 23:04 · Contracts archive | Amara Nwosu, records systems administrator (on notice) | Authorised work | Close as no issue | Ticket (approved change), destination (company system) | Hint |
| 4 | Price list to personal email | Marcus Hale, pricing manager | Negligent shortcut | Coach the person | Ticket (earlier reminder), policy and tooling (working approved route) | Hint |
| 5 | 23:07 · Customer accounts | Daniel Achterberg, key account manager (on notice) | Malicious insider | Restrict and investigate | Ticket (no request; misleading USB exception), destination (personal USB) | No hint |
| 6 | 23:02 · Finance share | Ruth Abara, finance analyst | Compromised account | Reset and treat as external | Ticket (her own unanswered report), timing and device (unregistered device abroad) | No hint |

Each case has 8 facts and 5 authored outcomes (30 outcomes in total).

**A sixth classification.** The brief listed five. "Authorised work" was added because "close as no issue" needs a case where it is right, and the approved-migration look-alike is not any kind of fault. Without it the migration would have to be forced into "process gap".

## SME review items

Security / insider-risk:

- Are the six classifications the ones your programme uses? Is "negligent shortcut" distinct enough from "honest mistake" in practice?
- Is the deciding evidence for each case realistic, and available to an analyst at this stage (for example device registration, USB exception requests, change records)?
- Case 5: is a same-day USB exception with a misleading reason a fair indicator of intent? Should the case include a cloud upload instead?
- Case 6: is "reset and treat as external" the right label for the response, and is the phished-prompt story current?
- Is 20 checks for 6 cases the right pressure?

HR:

- Is "coach the person" the right response to a repeated negligent shortcut after one documented reminder (case 4), or would your policy require a formal step? "Restrict and investigate" is currently graded partly right there.
- Is it appropriate for an analyst to see HR context (on notice, new starter, promotion outcome) at all, and at what stage? The game treats it as context that never supports a classification; confirm that framing.
- Wording of the trust consequences (late pay run, suspended new starter, exit-interview comment).
- The fairness rules: no case turns on who the person is. Check names, roles and seniority for any unintended pattern.

Legal / employment law / privacy:

- The legal consequences shown for wrongful suspension (grievance risk, legal advice taken) are illustrative and jurisdiction-neutral. Confirm or correct for the target jurisdictions.
- Case 5: evidence preservation, the employee's right to be accompanied, and return or destruction of data before joining a competitor.
- Case 1: whether a mis-sent email with 412 staff records, deleted unopened, is a recordable or notifiable disclosure. "Close as no issue" is currently graded wrong because nothing is recorded.
- Case 6: regulator notification wording.
- Monitoring: whether the evidence sources shown are ones the organisation may lawfully consult for this purpose.

## Not done

- One fixed scenario; no randomised case order or second case set.
- No hub card, vite input or playtest entry (integration is left to the parent change).
