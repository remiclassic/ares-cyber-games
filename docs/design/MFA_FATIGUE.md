# MFA Fatigue

Page: `mfa.html`. Code: `src/mfa/` (`engine.ts` pure rules, `data.ts` content, `main.ts` UI). Tests: `tests/mfa.test.ts`. Fictional; content to be reviewed with SMEs.

## Problem

Push-based MFA stops a stolen password from being enough, unless the account owner taps Approve. In MFA fatigue (push bombing) attacks, the attacker sends prompt after prompt, often late at night, sometimes with a call or text from "IT" asking the victim to approve one so the prompts stop. Staff know MFA is "good" but are rarely taught that **a prompt they didn't start means their password is already compromised**, or that approving to make it stop is the attack itself.

## Objective

Learners can tell their own prompts from an attacker's using context, not the look of the prompt:

- approve only a sign-in they started a moment ago (same app, plausible place, matching number);
- report, not just deny, any prompt they didn't start, so the password can be reset;
- treat repeated unexpected prompts as push bombing, and ignore requests to approve them;
- use number matching: a number proves something only if it matches the screen in front of you.

## Loop

The learner plays Jo Rivera (payroll officer, Kestrel Housing Trust) through a compressed day:

- **Morning at the desk:** 08:55 arrive. 09:00 sign in to Mail (guided, number match). 09:20 Expenses. 10:05 VPN push from Rotterdam during a meeting.
- **Lunch and the push storm:** 12:30 lunch, laptop locked. 12:41 and 12:42 Mail pushes from Bucharest. 12:44 a text from "IT Helpdesk" asking for an approval to make them stop, then a push that now shows Harbourside. 13:30 HR portal (matching number). 13:32 two Chat pushes at once while Jo is signing in: 64 (attacker) and 19 (Jo's screen). 16:45 Timesheets.
- **After hours, no hints (final):** 17:30 leave. 19:10 Payroll from home (matching number). 22:10 Learning portal. 23:40 asleep. 23:41 push with a local-looking location. 23:42 push with a number but no screen. 23:44 "IT Security" threat to lock the account, then another push.

Each step: the left panel shows the timeline (only beats and prompts so far: future prompts stay hidden), the "Right now" card says what Jo is doing and shows the laptop screen's number if Jo is signing in, and the phone shows a push (app, location, time, optional number) and sometimes a text. The learner picks **Approve** (A), **Deny** (D) or **Report** (R), then reads the outcome and the authored explanation, then **Next** (N). The first prompt is coached; hints are free and counted, up to the final round. How to play walkthrough, help button and Next bar are the shared `src/ui/tutorial.ts`.

## Why the mechanic is the skill

The push card is deliberately identical for both origins; only the context separates them. To answer well the learner has to do what they should do at work: ask "did I just start this?", compare the number to their own screen, and notice timing, repetition and pressure. Location is shown but is deliberately unreliable: one attacker push shows the home city, and one burst switches to a local location after the text, so "the location looks right" is not enough on its own.

## How dominant strategies lose

| Response | Own prompt | Attacker prompt |
|---|---|---|
| Approve | 10 (signed in) | 0, **breach**: the day fails |
| Deny | 2 (blocked yourself, ~10 min lost) | 6 (blocked, but password still out and security unaware) |
| Report | 0 (false alarm, account locked, ~30 min lost) | 10 (blocked and reported) |

7 own and 8 attacker prompts, maximum 150. Pass = no breach, at least 60% of the points, **and** at least 80% of Jo's own sign-ins completed (security that stops the work is not a pass).

- **Approve everything** ("make it stop"): 70/150 (47%), 8 breaches.
- **Deny everything**: 62/150 (41%), none of Jo's work gets done, 70 minutes lost.
- **Report everything**: 80/150 (53%), every sign-in reported as fraud.
- Approving own and denying (not reporting) attackers passes at 118/150: safe, but the debrief explains why reporting matters.
- **Trust the number alone** (approve matching numbers, report everything else): 120/150, but only 4 of 7 own sign-ins: fails the productivity bar.
- One approved attacker prompt fails the day even at 140/150.

All of these are asserted in `tests/mfa.test.ts`.

## Scoring vs learning evidence

**Score** (`summarize`): points per the table, per-round subtotals, own sign-ins completed, minutes lost, breaches, and pass/fail. Hints are counted but cost nothing; speed is never scored.

**Learning evidence** (`evidenceOf`), reported separately and never mixed into the score:

- per skill: approves own sign-ins; never approves an unexpected prompt; reports unexpected prompts; ignores pressure to approve; checks the number against their screen (shown / partly / not yet, with counts);
- the final after-hours scenario, unaided (no hints exist there);
- best calls on decisions made without a hint.

Both go to the host in the `ares:practice:completed` message (`activityId` `ares-mfa-fatigue/the-long-day/v0.1`).

## Debrief

Headline score and verdict (Day secured / Account breached / Below the bar), round tiles, a habit line (breach, blocked own work, or denied without reporting), the learning evidence panel, and a replay of every prompt: time, app, location, phone number vs screen number, Yours/Attacker, clue chips ("You weren't signing in", "Number doesn't match any screen of yours", "Odd time", "Repeated unexpected prompts", "Pressure to approve", ...), the learner's call vs the best call, the outcome and the explanation.

## Content list

15 prompts in `src/mfa/data.ts`: `mail-0900` (guided), `expenses-0920`, `vpn-1005`, `mail-1241`, `mail-1242`, `mail-1244` (IT Helpdesk text), `hr-1330`, `chat-1332a` (number 64 vs screen 19), `chat-1332b` (19), `timesheet-1645`, and final `payroll-1910`, `learning-2210`, `mail-2341` (local location, asleep), `mail-2342` (number, no screen), `mail-2344` (IT Security threat). Organisation, people and apps are fictional; phone numbers use the 07700 900xxx drama range.

## SME review items

- Report vs Deny: does the learner organisation's authenticator offer "Report fraud / It's not me", and what happens after a report (automatic password reset, account lock, service desk call)? Adjust `OUTCOME_TEXT` and `LOST_MINUTES`.
- Number matching UI: real apps usually ask you to **type** the number from the screen; the game shows both numbers for comparison. Confirm this simplification is acceptable, or switch to an entry pad.
- Two simultaneous pushes (`chat-1332a/b`): realistic for the learner's platform, or replace with a single mismatched push?
- Location display: how precise is the IP location in the real prompt, and can a legitimate sign-in show a neighbouring city? (Currently all own prompts show the true city.)
- Whether denying an attacker prompt should earn partial credit (6) or less.
- Scripted helpdesk wording, and the advice to call the real service desk on a known number.
- Whether to include a number-less legacy app at all, if the organisation enforces number matching everywhere.
