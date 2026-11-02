# Patch Tuesday

**Skill:** risk-based vulnerability prioritisation. Page: `patch.html`. Rules: `src/patch/sim.ts`. Content: `src/patch/data.ts`. Tests: `tests/patch.test.ts`.

All organisations, products, advisory ids and scores are fictional. **Content to be reviewed with SMEs.**

## Problem

New defenders, and plenty of experienced ones, sort the patch queue by severity score and work down. Severity (CVSS base score) says how bad a bug *could* be in theory. It says nothing about whether attackers can reach it, whether they are already using it, or what sits behind it. Teams that patch by score spend scarce change windows on internal, unexploited criticals while an exploited "medium" on the VPN is the thing that gets them breached.

## Learning objective

Given a set of vulnerabilities and a fixed patch budget, the learner chooses the ones with the highest *risk* by weighing four signals together: severity, exposure (internet-facing or internal), exploit status (exploited in the wild, public proof of concept, none) and asset criticality. They can say, for any item, why it was patched or deferred, in terms of that evidence.

## Core loop (about 5 minutes)

Fernhill Community Health, three monthly patch windows. Each round:

1. **Read** five vulnerability cards. Each shows the four signals as chips with symbols as well as colour (◉/○ exposure, ▲/△/– exploit, ◆ asset).
2. **Pick three** to patch (click or keys 1–5; click again to swap). The budget is hard: a fourth pick is refused.
3. **Commit.** Every card then shows what happened this month (Patched / Breached / Attempted / Quiet), whether the best plan would patch or defer it, and a one-line explanation tied to its evidence. A banner compares the learner's plan with "patch the three highest scores".

| Round | Mode | Teaches |
| --- | --- | --- |
| 1 · Read past the headline | **Guided**: coach note, Likelihood and Impact bars on every card | Exploited + internet-facing beats a big number. Trap: internal, unexploited 9.8. |
| 2 · Inside the walls | **Hints**: a free, counted hint reveals the bars | Internal still matters once attackers are in (domain controller), and the asset matters: an exploit on a canteen app ranks below public exploit code against patient records. Trap: internet-facing 9.8 with no exploit on a brochure site. |
| 3 · No hints | **Final**: no bars, no hints, no coach | Transfer: all four signals at once. Traps: a perfect 10 on an internal backup server, and an exploited bug on a low-value kiosk. |

Then the **debrief**: game score per round, learning evidence (separate panel), a one-line habit ("you chased the severity score", etc.), and a **replay** of every round: each item's evidence, what you did, what the best plan did, the outcome and why.

## Why the mechanic is the skill

The only action is the one the job requires: choose which few things to fix when you cannot fix everything. The budget forces a trade-off on every card, and the consequence view shows the cost of each deferral in the same terms a real incident would (an exploited VPN that was left open is how the clinic got breached). Nothing is scored on speed, recall of CVSS vectors or trivia.

## The risk model

`risk = likelihood × impact`, where

- likelihood = exploit weight (in the wild 5, PoC 2.5, none 1) × exposure weight (internet 2, internal 1)
- impact = severity / 10 × asset criticality (low 1, important 2, crown jewel 3)

Unpatched outcomes are deterministic so the lesson is stable: risk ≥ 8 is breached, ≥ 3.2 is attempted, below that is quiet. The best plan is the three highest-risk items; content is authored so the 3rd and 4th items differ by at least 1 (tested), so the "right answer" is not a coin toss.

The model is a teaching simplification (close in spirit to "KEV first, then exposure and asset value", as in SSVC/EPSS-style triage); it is not a production scoring formula.

## How dominant strategies lose

| Strategy | Score /300 | Notes |
| --- | --- | --- |
| Best plan (risk) | 300 | 0 breaches |
| **Highest severity first** | **131** (30 / 44 / 57) | 2 of 9 picks right, every trap taken, 5 breaches. Tested: below 50% overall and below 60 in every round. |
| Exploited first, then severity | ~251 | Loses round 2 (canteen app) and round 3 (kiosk). Tested below 90%. |
| Internet-facing first | ~264 | Loses round 2 (domain controller, patient DB are internal). |
| Crown jewels first | ~273 | Loses round 1 (VPN is the only crown jewel; it then reaches for a 9.8 internal decoy). |

Every single-signal shortcut is beaten in at least one round and still outscores severity-chasing (tested). Patching everything is impossible (hard budget), and hints are free, so there is nothing to farm.

## Scoring vs learning evidence

- **Game score** (shown during play): per round, the share of that month's removable risk the learner's three patches removed, 0–100; total out of 300; breaches counted. This rewards *near* misses fairly: picking the 4th-highest risk costs little, picking a decoy costs a lot.
- **Learning evidence** (debrief panel and `ares:practice:completed` payload, never mixed into the score): first-attempt accuracy (committed picks that match the best plan, out of 9), final no-hint round accuracy (out of 3), severity traps avoided (out of 3), hints used. On "Start again" the evidence shown and posted stays from the first run; the retry is tagged with its attempt number.

## Content list

Round 1: HR records server (9.8, internal, none, important, *trap*); staff VPN portal (6.5, internet, in the wild, crown jewel); staff webmail (8.8, internet, PoC, important); clinic printers (9.1, internal, none, low); public booking site plugin (5.4, internet, in the wild, important).

Round 2: domain controller (7.0, internal, in the wild, crown jewel); marketing microsite (9.8, internet, none, low, *trap*); remote support tool (7.2, internet, PoC, crown jewel); patient records database (7.4, internal, PoC, crown jewel); staff canteen ordering app (8.6, internal, in the wild, low).

Round 3: lobby check-in kiosk (6.8, internal, in the wild, low); card payments gateway (8.1, internet, PoC, crown jewel); patient portal sign-in (5.9, internet, in the wild, crown jewel); backup server (10.0, internal, none, crown jewel, *trap*); developer test server (9.0, internet, PoC, low).

## SME review items

1. **Weights.** Is "in the wild ×5, PoC ×2.5" and "internet ×2" a fair teaching ratio? Should a CISA-KEV-style "exploited" item ever lose to a non-exploited one (it does in rounds 2 and 3)?
2. **Backup server deferral.** Deferring an unexploited 10.0 on a backup server is defensible by the model, but backups are a prime ransomware target. Is "next in line; watch it" the right message, or should a compensating-control option exist?
3. **Developer test server over backup server** (round 3, risk 4.5 vs 3.0): agree, or swap?
4. **Patient records database over canteen app** (round 2): confirm the asset-value lesson reads correctly to learners.
5. **Outcome thresholds** (breach ≥ 8, attempted ≥ 3.2): plausibility of "breached within a month" for internet-facing exploited items.
6. **Vocabulary**: "Crown jewel", "Important", "Low" for asset criticality; "CVSS-like" severity labels; whether to mention EPSS/SSVC/KEV by name for the target audience.
7. **Missing real-world options** deliberately left out for a 5-minute loop: mitigations/virtual patching, taking a system offline, emergency out-of-band patching, vendor patch quality. Decide whether a later variant should add them.
