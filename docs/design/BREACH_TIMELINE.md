# Breach Timeline

**Page:** `timeline.html` (full game) and `timeline.html?mode=quick` (one incident, about 60 seconds, for while a range starts).
**Code:** `src/timeline/engine.ts` (pure rules, no DOM), `src/timeline/data.ts` (content), `src/timeline/main.ts` (UI), tested in `tests/timeline.test.ts`.
**Status:** prototype. All incidents are fictionalised. Content to be reviewed with SMEs.

## Problem

Learners can usually recite the kill chain, but they struggle to apply it to a real incident record. Real logs arrive out of order and have gaps. Analysts have to rebuild the sequence by asking what each step *needed*, and then judge where a control would actually have bitten. Defenders often name the most powerful-sounding control ("EDR", "MFA") instead of the one that would have stopped *this* attack first, and they don't check whether it would have worked at all.

## Objective

The learner can:

1. Put attack events in order when timestamps are partial or missing, by reasoning from dependencies ("you can't sign in before the password is stolen").
2. Pick the control that stops a given attack **earliest**, and reject controls that wouldn't have worked against it.
3. Name the step that control actually stops.

## Core loop (per incident)

1. **Read** the brief. Eight (full) or five (quick) event cards arrive shuffled. Each card shows a stamp that is exact (`Mon 08:52`), hour-only (`Mon 23:··`), day-only (`Tue ··:··`) or `Time not logged`.
2. **Order** the cards, earliest at the top. Drag them (mouse anywhere on a card; touch or pen on the ⠿ grip), use the ▲▼ buttons, or focus a card and press Alt+↑/↓ (Shift+↑/↓ also works). ↑/↓ alone moves focus.
3. **Check order** (C). If anything is wrong the game explains **one** broken clue, starting from the beginning of the story, and rings both cards: either a dependency ("“Sign-in from abroad” can't come before “Password entered”. The attacker can't sign in with a password they haven't stolen yet.") or a stamp ("“Mailbox rule” is stamped Mon 23:·· and “File server reached” Tue ··:··."). You get 3 checks; after the third miss the true order is laid out for 0 order points. **Hint** (H) is free: it shows what one card needs.
4. **Stop it.** Choose one of the same five controls every time: Mail filtering, MFA, Geo-blocking, EDR, Egress monitoring (keys 1–5). Then click **✂ Stops here** on the first step that would never happen with that control in place. Steps from there on dim. Then **Lock in** (L).
5. **Feedback.** Your control's verdict (earliest / N steps late / wouldn't work) with its reason, whether your stop point was right, why each of the five would or wouldn't work, and a short **What happened** card (fictionalised case summary and takeaway).

The full game has three incidents. The first is **guided**: every card shows what it needs, the incident file has a coach box, and the per-control explanations open automatically. A debrief follows.

## Why the mechanic is the skill

- **Ordering = sequence reasoning.** Every incident is authored so that the stamps alone admit several orders, and the stamps plus the dependencies admit exactly one. A test enforces this for each incident (`uniqueOrder(incident, ["time"]) === null` and `uniqueOrder(incident) === trueOrder`). The learner cannot finish by reading clocks; at least one card can only be placed by asking what it needs.
- **The stamps teach log reading.** A day-only stamp still orders cards on different days. An hour-only stamp doesn't settle two cards in the same hour. The learner has to work out what a partial time does and doesn't prove.
- **Stopping = where controls go.** Each control is judged against *this* incident's steps: whether it would act at all, and if so, which step it prevents. "Earliest" is a position on the timeline the learner has just built, so the two halves reinforce each other.

## How shortcuts lose

| Shortcut | What happens | Tested |
|---|---|---|
| Sort by visible time, untimed cards last | Never valid for any incident | `sorting by visible time … is not a valid order` |
| Reshuffle and spam Check | −15 per failed check; the third miss reveals the order for 0/50 | `guessing the order by brute force …` |
| Always pick the "biggest" control (EDR) | Wouldn't work or is late in most incidents (e.g. the invoice ZIP: mail filter is one step earlier) | `the 'biggest' control (EDR) …` |
| Always pick the same control, any of the five | Total over the full set is below the optimum for every choice | `always picking the same control …` |
| Always pick MFA | Beaten by push fatigue in *The push storm* and *The midnight approval*; scores 0 there | content plus control tests |
| Pick the last line of defence (egress) | Always late or ineffective | same test |
| Right control, vague stop point | The 20-point mark only counts on the exact step the control prevents | `the stop mark only scores …` |

No single control is the earliest in every incident (tested). Speed is never scored.

## How it differs from Chain Breaker (`chain.html`)

Chain Breaker is patience-style: one card at a time goes onto one of the **seven named kill-chain stages**, a wrong stage is rejected instantly with "earlier/later", and the learner then picks a break from four incident-specific controls whose stage is the answer.

Breach Timeline has **no stage labels and no instant per-card feedback**. The learner builds a free order of concrete log events and has to infer it from **dependencies between events plus partial timestamps**, the way an analyst rebuilds an incident. The controls are a **fixed set of five** in every incident, so the learner has to judge each one's effect on *this* attack (including "wouldn't work at all", for example MFA already beaten). They also mark **the exact step** it stops on their own timeline. Chain Breaker teaches the taxonomy; Breach Timeline teaches sequence reasoning and control placement.

## Scoring (per incident, out of 100)

| Part | Points |
|---|---|
| Order | 50, −15 per failed check; 0 if revealed after 3 misses |
| Control | 30 for any control at the earliest stop (ties allowed, e.g. MFA and geo-blocking at the same sign-in); −6 per step later (minimum 4); 0 if it wouldn't stop the attack |
| Stop point | 20 if the marked step is the one the chosen control prevents (only when it works) |

The full game is out of 300. Hints are free.

## Learning evidence (separate from the score)

`evidenceFor(round)` records per incident: right on the first check, unaided (no hints), failed checks, revealed, hints used, how many broken clues were dependency slips and how many were timestamp slips, control verdict and steps late, and whether the stop point was right. It contains no points. `objectives(evidence)` rates three objectives as **shown / partly / not yet**, judged on unguided incidents:

1. Infers attack order from dependencies when timestamps are missing (unaided first-check successes).
2. Chooses the control that stops the attack earliest.
3. Knows which step a control actually stops (only counted when the chosen control works).

The debrief shows the score table, then a separate "Learning evidence (not part of the score)" panel, habits (wouldn't-work picks, late stops, dependency or timestamp slips), and every What happened card. Host messages keep them apart: `ares:practice:completed` carries `score` and `evidence` as separate fields; `statement` messages are posted per check and per lock-in.

## 60-second mode (`?mode=quick`)

- One short incident (5 cards) from a pool of three, rotated per browser (`localStorage`, optional). `&incident=<id>` pins one.
- No walkthrough, no dialogs. The Next bar gives the instructions. **How to play** remains available on request.
- Single column, no side panel, works at phone width.
- **Stops cleanly:** nothing to save and no "are you sure?" anywhere. The host can post `{ type: "ares:practice:stop" }` (or `ares:host:stop`) to freeze the page with a one-line "Your range is ready" message; the game posts `ares:practice:stopped` with partial evidence. Closing the iframe also loses nothing. (This inbound message is a proposal; no other game listens for host messages yet.)
- "Another incident" chains the next one if the range is still starting.

`activityId`: `ares-breach-timeline/v0.1` (full) and `ares-breach-timeline/quick/v0.1`.

## Content

All organisations, people, domains (`.example`) and incidents are fictional composites of common patterns, labelled "Fictionalised" on every board and summary.

| Incident | Mode | Earliest control | What it teaches |
|---|---|---|---|
| The payroll portal (Larkspur Supplies) | Full, guided | MFA or geo-blocking at the sign-in | Mail filter can't catch a hijacked supplier mailbox; EDR and egress are 3–4 steps late |
| The push storm (Corvid Engineering) | Full | EDR at the credential dump | MFA (push approved) and geo-blocking (in-country server) were beaten; no email at all |
| The invoice ZIP (Fenwick Joinery) | Full | Mail filtering at delivery | EDR works but one step later; egress misses the tiny beacon |
| The shared document (Alder & Rowe) | Quick | Mail filtering (day-old domain) | MFA works but later |
| The contractor laptop (Brightwater Studios) | Quick | EDR on the file server | No email or sign-in, so identity controls don't apply |
| The midnight approval (Tamsin Bay Council) | Quick | Geo-blocking | MFA beaten by prompt fatigue; cloud-to-cloud export bypasses egress |

## SME review items

1. **Control verdicts** are the most judgement-heavy content. Please confirm each `stops` and `why` in `src/timeline/data.ts`, especially:
   - Mail filtering vs a hijacked real supplier mailbox (payroll portal): would link rewriting or click-time checks have caught it?
   - Push MFA counted as "doesn't stop it" when the user approved. Should number matching or phishing-resistant MFA be a separate control?
   - Geo-blocking as an equal tie with MFA at foreign sign-ins, given proxy evasion.
   - EDR stopping at the *staging* step (payroll) rather than the file-server connection; EDR on an unmanaged contractor laptop (none) vs the file server.
   - Egress monitoring not seeing cloud-to-cloud export or low-volume beacons.
2. **Dependencies:** check each `after[].why` is a hard dependency rather than just a likely order (e.g. the forwarding rule set "from the infected laptop" in the invoice ZIP).
3. **Control names and descriptions:** align with the learner organisation's terms (e.g. "conditional access" vs "geo-blocking").
4. **Scoring weights:** 50/30/20, −15 per check, −6 per late step.
5. **What happened** cards: keep them clearly fictional, and consider whether a real public case should be referenced alongside (it would need sourcing).
6. **Timestamps:** realistic dwell times between steps.

## Integration (not done here)

- `vite.config.ts` → `build.rollupOptions.input`: add `timeline: "timeline.html"`.
- Hub card (`index.html`): "Breach Timeline: rebuild a shuffled incident log with missing timestamps, then pick the control that would have stopped it first."
