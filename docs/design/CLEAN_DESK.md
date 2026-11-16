# Ares: Clean Desk: design doc

**Status:** playable prototype, v0.1 (2026-11-16).
- Page: `cleandesk.html`
- Code: `src/cleandesk/engine.ts` (pure rules, no DOM), `src/cleandesk/data.ts` (content and inline SVG rooms), `src/cleandesk/main.ts` (UI), `src/cleandesk/style.css`
- Tests: `tests/cleandesk.test.ts` (15)
- Activity id: `ares-clean-desk/last-one-out/v0.1`

All content is fictional (Meridian Freight). **Content to be reviewed with SMEs.**

## Problem
Clean desk rules are usually taught as a list ("lock your screen, shred paper, nothing on the desk"). At 17:25 on a real day nobody has time to apply a list to everything in sight, and two wrong reflexes appear. One is to walk out ("the cleaners are trusted"). The other is to over-handle: shred or lock away anything that looks like paper, which wastes the minutes the real exposures needed and sometimes destroys things the business must keep. Learners need to practise deciding, quickly, what is actually exposed and what the right-sized response is.

## Learning objective
After a 5 to 7 minute run the learner can:
1. Recognise physical information exposure in a workplace: unlocked screens, written passwords, uncollected printing, live badges, whiteboards, unknown media, keys in locks.
2. Tell it apart from things that only look like a problem (public material, personal items, an already locked screen, a safety notice).
3. Choose the proportionate action for each: lock, shred, lock away, hand in, wipe, collect for the owner, remove and report, or leave. In particular: shred copies, keep originals and records; never plug in unknown media; hiding is not the same as fixing.
4. Prioritise under a time limit: the highest-harm exposures first, in the lightest way that works.

## Core loop
1. **Walk into a room** (inline SVG scene). A clock shows the time and the minutes left in this room.
2. **Look** at an object: click it, or Tab + Enter. Looking is free. The inspector shows what it really is and who will come past it (cleaning crew 18:10, client tour 09:05).
3. **Choose what to do.** Each object offers only the actions that make sense for it, always in the same button order, each with its cost in minutes (1 to 3). "Leave it" costs nothing. A choice is final and the clock moves forward by the cost. Actions the clock cannot pay for are disabled.
4. **Leave the room** when done or out of time. Anything not dealt with stays as it is.
5. **The night plays out:** one line per object saying who came past and what they saw, worst first, with a verdict (Right call / Safe, with a loose end / Wasted minutes / Made it worse / Still exposed).
6. After three rooms, the **debrief** replays every object with what you did, the best action and the reason.

The clock is **action-based, not real-time**: reading and thinking cost nothing, so the game is fair to slow readers, keyboard and screen-reader users, and fully deterministic for tests.

Progression:
| Room | Clock | Slack over best play | Support |
|---|---|---|---|
| 1. The desk row (17:25) | 7 min | 2 min | Guided first object (the unlocked screen); a hint on every object; each action explained at once |
| 2. The meeting room (17:33) | 10 min | 1 min | No hints; each action explained at once |
| 3. Print area and reception (17:44) | 11 min | 0 min | No hints, no feedback until the night plays out |

## Why the mechanic is the skill
The real-world skill is not "find the risks" but "with five minutes left, what do I do about which of these?". The time budget makes every action a trade: two minutes spent shredding a canteen menu are two minutes the payroll report stays on the printer. The action menu makes proportion the question: for most sensitive objects two or three actions remove the exposure, but only one fits (the others are slower, leave a loose end, or destroy something). Decoys cost nothing if recognised and minutes if not, so recognition pays off directly in time. Three specific misconceptions are built in as tempting options: switching a monitor off (costs a minute, fixes nothing), shredding something that must be kept, and plugging in a found USB stick to find its owner.

## How each shortcut loses
Score = 60% Secured + 25% Proportion + 15% Care (see below). A clean exit (pass) needs score ≥ 75 **and** no critical exposure left **and** nothing made worse. Scores from the engine (`playAll` in `engine.ts`), asserted in the tests:

| Strategy | Score | Secured | Proportion | Care | Result |
|---|---|---|---|---|---|
| Best play (24 of 28 minutes) | 100 | 100 | 100 | 100 | Clean exit |
| **Action everything**, in room order | 63 | 63 | 40 | 100 | Fail: runs out of time in every room; reception PC still unlocked; 14 minutes wasted |
| Action everything, reverse order | 73 | 70 | 65 | 100 | Fail: 3 critical exposures left (password note, whiteboard, payroll) |
| Action everything, cheapest first | 68 | 70 | 45 | 100 | Fail: USB stick and keys never reached |
| **Shred everything** | 21 | 23 | 30 | 0 | Fail: contract, notebook and sign-in book destroyed; screens, whiteboard, badge, USB, keys untouched |
| Shred what can be shredded, best action elsewhere | 55 | 69 | 55 | 0 | Fail: same destruction, and the minutes run out |
| **Leave at once** | 25 | 0 | 40 | 100 | Fail: everything exposed |
| Guided object only, then leave each room | 32 | 10 | 45 | 100 | Fail |
| Best play, but **plug in the USB** | 78 | 90 | 95 | 0 | Fail: the single worst action (double harm); fails on its own |
| Lock everything in a drawer | 43 | 37 | 25 | 100 | Fail |
| Hand everything to reception | 40 | 21 | 50 | 100 | Fail |

Why "action everything" cannot work: in every room the cost of handling every object is larger than the budget (10 vs 7, 13 vs 10, 17 vs 11 minutes), so something sensitive is always left; the test runs it in three different orders. The only order in which it would succeed is "sensitive objects first", which is simply best play.

## How it differs from Spot the Risks
`risks.html` (Spot the Risks) is a picture hunt: find the risks in a scene, name the issue, pick the fix, with no cost for looking or acting and a penalty for false alarms. Clean Desk shares the illustrated-scene format and nothing else:

| | Spot the Risks | Clean Desk |
|---|---|---|
| Question | Where is the risk and what is it? | What do I do about this, and is it worth my minutes? |
| Constraint | None (untimed, unlimited flags) | A minute budget per room; every action spends it |
| Decision per object | Flag or not, then issue + fix from a list | One final action from lock / off / drawer / shred / wipe / collect / hand in / report / plug in / leave |
| Wrong answers | Wrong label | Real consequences: wasted minutes, a loose end, or something destroyed |
| Decoys | Cost points if flagged | Cost time if handled, so a real exposure goes unhandled |
| Feedback | Per scene review | "The night plays out": who saw what, per object |
| Skill | Recognition | Prioritisation and proportionate response |

## Scoring vs learning evidence
**Score** (shown in the debrief, posted as `score`):
- **Secured, 60%:** severity-weighted share of sensitive objects no longer exposed (severity 3 = critical, 2 = serious). The best action counts in full, a safe-but-heavy action 60%, anything else 0.
- **Proportion, 25%:** share of all 20 objects that got the right-sized choice, including harmless ones left alone.
- **Care, 15%:** 100 minus 50 per harmful action (plugging in the USB counts double).
- Pass: total ≥ 75, no critical exposure left, no harmful action.

**Learning evidence** (shown in its own debrief panel, posted as `learning`, never added to the score):
- objects looked at, of 20;
- critical exposures dealt with, of 6;
- harmless objects left alone, of 8, and minutes wasted;
- sensitive objects that got the proportionate action, of those acted on;
- sensitive objects secured in the final, unaided room;
- habit lists: left exposed, destroyed, over-handled, "fixes that fix nothing", and whether unknown media was plugged in.

A test checks that two runs with identical actions but different amounts of looking get the same score and different learning evidence. Each look, action and room exit is also posted as an `ares:practice:statement`.

## Content
Severity in brackets (0 = harmless decoy). Cost in minutes.

| Room | Object | Best action | Tempting wrong action |
|---|---|---|---|
| Desk row | Unlocked screen with a customer record (3), guided | Lock the screen (1) | Switch the monitor off: still exposed |
| | Sticky note with a password (3) | Shred it (2), owner changes the password | Drawer: a written password still exists |
| | Signed customer contract, original (2) | Lock in a drawer (2) | Shred: destroys the only original (harm) |
| | Canteen menu (0) | Leave | Shred / drawer: wasted |
| | Colleague's family photo (0) | Leave | Drawer: wasted, not yours |
| | Locked screen (0) | Leave | Lock / off: wasted |
| Meeting room | Whiteboard with network details and a password, "DO NOT WIPE" (3) | Wipe (2), tell the owner | Leave because of the note |
| | Colleague's notebook with customer notes (2) | Lock in the cabinet (2), tell the owner | Shred: destroys their records (harm) |
| | Visitor badge, still active (2) | Hand to reception (3) | Drawer: still live |
| | Attendee list with client contacts, spare copy (2) | Shred (2) | Drawer: kept for no reason |
| | Public brochures (0) | Leave | Shred / drawer: wasted |
| | Flipchart with icebreaker doodles (0) | Leave | Shred: wasted |
| Print area and reception | Payroll report on the printer tray (3) | Collect for the owner (2) | Shred: safe, but hides it from HR |
| | Unknown USB stick labelled "Bonus list Q4" (3) | Remove and report (3) | Plug in to check: worst choice (double harm) |
| | Unlocked reception PC with gate codes (3) | Lock the screen (1) | Switch the monitor off |
| | Keys in the HR filing cabinet (2) | Lock, hand keys to security (3) | Keep the keys in your drawer |
| | Visitor sign-in book, open (2) | Lock in the reception drawer (2) | Shred: destroys a required record (harm) |
| | Printer test page (0) | Leave | Shred / collect: wasted |
| | Sealed outbound parcel (0) | Leave | Lock away: courier misses it |
| | Fire evacuation plan (0) | Leave | Take down: it must be displayed |

## Accessibility and conventions
Shared shell (`src/ui/practice.css`), How to play walkthrough, header help button and live Next-step bar (`src/ui/tutorial.ts`), unchanged. Every object is a focusable `role="button"` in the scene (Tab, Enter/Space) and also a button in the "In this room" list; actions have number keys. Interactive elements carry `data-act` (`inspect`, `do`, `leave-room`, `next`, `retry`) and `data-id` / `data-value`. Verdicts use text labels and badge glyphs, not colour alone. Single column under 1180px with no horizontal scroll at 375px; animation off under `prefers-reduced-motion`. Host messages: `ares:practice:started`, `:statement`, `:completed`.

## SME review items
- Payroll printout: is "collect and return securely to the owner" the organisation's rule, or should uncollected confidential printing be shredded and reported? (Currently: collect = best, shred = safe with a loose end.)
- Sticky-note password: confirm "destroy and have the owner change it" and whether it should also be reported as an incident.
- Whiteboard marked "DO NOT WIPE": wipe and tell the owner (current), or photograph to an approved location first? Is a personal phone photo ever acceptable?
- Visitor badge: confirm reception/security can deactivate it, and the wording for the learner organisation.
- Keys: hand to security vs return to the HR owner; who is the accountable key holder.
- Unknown USB: confirm the reporting route (IT security / service desk) and whether "lock it away without reporting" deserves partial credit at all.
- Visitor sign-in book: retention and privacy expectations (paper book vs electronic sign-in) and whether shredding today's page is correctly a "harm".
- Signed contract and colleague's notebook: confirm "lock away and tell the owner" over "hand to security".
- Attendee list: confirm that a spare copy of contact details should be shredded rather than returned.
- Evacuation plan, parcel and family photo as decoys: any local rule (for example floor plans not on display in visitor areas) that would change them.
- Severity ratings (which six are critical), action costs in minutes, room budgets, and the pass rule (75, no critical exposure, no harm).
- Whether plugging in the USB should score lower in total: it fails the run on its own, but the total can still read 78.
- Tone of the "night plays out" consequences, and whether naming a cleaning crew as an observer is appropriate for the learner organisation.
