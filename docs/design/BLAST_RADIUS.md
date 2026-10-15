# Ares: Blast Radius: design doc

**Status:** playable prototype, v0.1 (2026-10-15). Scenario content is draft and needs SME review (see the last section).
**Page:** `blastradius.html` (dev: preview config `ares-blastradius`, port 5189; `?seed=` pins a run).
**Origin:** reworked from *Honey Hive*, a Party Plaza (Sloth Jam) tap-board puzzle. There, cells with dots want that many filled neighbours. Only the deduction mechanic carried over. All content, rules and art are new.

## 1. Pitch

A stolen service account. A command-and-control domain. A network you cannot image host by host. You get aggregate telemetry that says *how many* hosts beacon, not *which ones*, plus a small budget for host triage. You have to work out the blast radius, isolate what is compromised, and keep the business running.

**Tagline:** *Scope before you contain.*

## 2. Audience and fit

- **Who:** adult learners new to incident response: SOC tier 1, IT generalists moving into security, and security-aware managers.
- **Length:** 4–6 minutes for three cases, plus the debrief.
- **Where it sits in Ares:** after Incident Triage Race (which alert matters) and SOC Dashboard (what one incident is). Blast Radius covers the next question: *how far has it spread?* It does not overlap with Query Hunt (writing queries) or Network Defense (access rules).

### Learning objectives

1. Scope an incident from aggregate telemetry before acting on it.
2. Spend expensive host-level evidence where it settles the most.
3. Weigh containment against business continuity, especially for critical services.
4. Tell proof from a hunch, and say "unknown" when the evidence cannot decide.

### How it meets the Ares rules

| Ares rule | How Blast Radius meets it |
|---|---|
| Evidence before decisions | Sensors and triage are the only way to learn anything. Decisions are graded on what the gathered evidence proved. |
| Decision quality, not speed | Case time is a budget of *case minutes* spent by actions, not a real-time clock. Real time is shown in the debrief and never scored. |
| Explicit, reviewable rules | One rule: a read sensor reports the exact count of indicator hosts behind it. Each sensor says why it can only count (`why` in the data). |
| Every mistake explained | Each host's verdict says what was true, what the evidence proved and how (deduction text from `sim/logic.ts`). |
| Seeded and replayable | The seed picks one of two truths per case; Retry swaps to the other. A case rebuilds from seed, attempt and command log (tested). |
| Blanket play cannot win | Isolate all, keep all or watch all score under 60 (tested). |

## 3. Theme and narrative

- **Org:** *Meridian Freight*, a fictional logistics company with a harbour branch, two depots and a head office. Hostnames follow a site-department-number pattern (`N-FIN-02`, `PAY-DB`).
- **Incident, "The Backup Account":** `svc-backup` was used overnight from an unknown address. Threat intel ties `cdn-update.example` (reserved TLD) to the same actor. Any host that beacons there every 60 seconds is compromised.
- **Tone:** a professional incident bridge. No hacker clichés and no countdown sirens. The pressure is the trade-off, not a timer.
- **Look:** the shared Project Ares visual language: night-navy panels, cyan accents, Exo 2 display type, a grid backdrop. Sensors are **hexagons** (a nod to the Honey Hive origin), hosts are **discs**, and critical services are **rounded squares** with an amber `!`. Colour is always backed by shape and icon:
  - unread sensor: striped hexagon with `?`
  - indicator found: red; clean: green
  - Isolate: red square ✕; Keep online: cyan circle ✓; Watch: amber eye
  - truth after closing a case: red ring = really compromised

## 4. Core loop (one case)

1. **Read the sensors** (5 min each). DNS forwarders, proxy NAT pools, segment IDS and the VPN concentrator each report *N of M hosts behind me show the indicator*.
2. **Triage where it counts** (20 min each). Confirms one host. The budget never allows triaging every host (tested).
3. **Decide every host:** Isolate, Keep online or Watch. Each read sensor shows a live counter: hosts you marked to isolate behind it / its count (✓ match, ▲ too many, ▼ too few). This is the "counter smiles green, goes coral when too many" feedback from the source game.
4. **Close the case.** The map reveals the truth, each host shows its verdict, and the score tiles appear.
5. **Reasoning check:** one generated question about a host the sensors (not a triage) settled: "Why can HB-LT-01 safely stay online?" The right option is the actual deduction. The wrong ones are common slips: *absence of an alert is not evidence*, *role-based hunches*, *a count above zero condemns everyone behind it*.

Case 1 is guided. Coach text describes the method, never the answer.

## 5. Rules that teach

- **Counts, not names.** Each sensor explains its limit (forwarder hides client IPs, NAT hides the source, packet store rolled over, VPN mapping expired). These are real reasons aggregate telemetry is coarse.
- **The overlap is the clue.** A host seen by two sensors is where one triage settles the most. Case 1 is built around this. In variant 2 the best triage is a host that turns out *clean*, which teaches that a negative result is evidence too.
- **Watch is honest only after looking.** Watch is credited only when the host is truly undecidable *and* every sensor in front of it was read. Watching everything without looking earns nothing.
- **Critical services weigh ×3.** Isolating a clean domain controller or payroll database costs three times a workstation.
- **Efficiency never beats containment.** Triage savings are scaled by the share of compromised hosts actually isolated.

## 6. Content

| Case | Hosts | Sensors | Budget | Best triages (variant A / B) | Teaching beat |
|---|---|---|---|---|---|
| Harbour Branch (guided) | 5 | 2 | 60 min | 1 / 1 | Triage the overlap; a clean result settles hosts too |
| Two Depots | 8 | 5 (2 DNS, 2 proxy, VPN) | 90 min | 1 / 1 | Combine site, department and VPN views; one well-chosen triage cracks it |
| Head Office | 12 (2 critical) | 6 (2 DNS, 2 proxy, 2 IDS) | 120 min | 3 / 2 | Server-side sensors, critical weighting, a zero-count sensor clears four hosts at once |

All boards live in `src/blastradius/data/scenario.ts`. Counts are derived from the truth, never typed by hand, so they cannot disagree.

## 7. Scoring (per case, then averaged)

| Part | Points | Rule |
|---|---|---|
| Containment | 40 | Share of compromised hosts isolated |
| Continuity | 30 | Clean hosts left running, critical ones weighted ×3 |
| Evidence | 20 | Share of decisions the gathered evidence supports (Isolate ⇐ proven compromised, Keep ⇐ proven clean, Watch ⇐ undecidable after reading its sensors) |
| Efficiency | 10 | `min(1, (best+1)/(used+1))` triages × share contained × share supported |

The evidence-led best play scores 100 on every case (tested over four seeds). A right guess scores 70: full containment and continuity, but zero evidence and zero efficiency (tested).

**Kept out of the score:** real time, and reasoning-check answers (reported as `learningEvidence`).

## 8. Debrief

Score and the four tiles; **habits** (compromised hosts left running, clean hosts isolated, unsupported calls); a **case-by-case table** of host → truth → your call → supported? → why; reasoning checks; the objectives; **Retry with the other truth**.

## 9. Accessibility

Every map node is a native button with a full spoken label (name, role, triage result, decision, truth). Full keyboard play: Tab to a node, then `R` read, `T` triage, `1`/`2`/`3` decide, `0` clear, `Esc` deselect. Live-region announcements for every reading and result. Colour is always paired with shape and icon. Settings for larger text, reduced motion (follows the OS) and sound. On phones (under 640px) the map stacks first and sensor labels hide; names stay in the details panel and the accessible labels.

## 10. Integration

Same `ares:practice:*` contract as the other practices (`src/blastradius/host.ts`), activity id `ares-blast-radius/the-backup-account/v0.1`. Statement verbs: started, inspected (sensor), triaged, assessed, submitted, answered, retried, completed. The result includes seed, attempt, summary, learning evidence and every case record with its command log. Standalone runs keep the last result in `localStorage` (`ares-br:lastResult`).

## 11. Architecture

```
src/blastradius/
  data/scenario.ts   authored cases (draft, SME review)
  sim/types.ts       types
  sim/logic.ts       deduction: consistent arrangements, knowledge, step-by-step reasons, best triage count
  sim/engine.ts      commands, budget, scoring, reasoning-check generation, summary
  ui/game.ts         map, case file, details, footer (DOM, no framework)
  ui/debrief.ts      debrief screen
  host.ts, main.ts, style.css
tests/blastradius.test.ts   20 tests: content solvability, deduction ⇔ brute force, rules, replay, scoring bounds
```

`logic.ts` checks every arrangement of compromised hosts (boards are kept under 16 hosts), so "known" is exact rather than heuristic. The human-readable reasons come from a separate analyst-style pass (single sensor, then pairs), and a test checks they always agree with the exact result.

## 12. For SME review

Please mark each item ✅ / ✏️ / ❌.

- **The core simplification:** a sensor reports an exact count of indicator hosts behind it, with no false positives or negatives. Acceptable for a beginner practice, or should one case add an unreliable sensor?
- **The four "why only a count" explanations** (DNS forwarder cache stats, proxy NAT, rolled-over packet store, expired VPN mapping). Are they realistic?
- **Triage = 20 minutes,** sensor = 5. Reasonable ratio?
- **Isolate / Keep / Watch** as the three containment options. Is "Watch" (keep running under extra monitoring) the right name for the defensible "unknown" call?
- **Critical-service weighting ×3** for a clean DC or payroll database taken offline.
- **Reasoning-check distractors:** absence of alert = clean; low-value role = safe; non-zero count condemns all; likely-target role = compromised.
- **Scenario framing:** `svc-backup` theft and the C2 beacon story. Is a backup service account touching every server a fair motivation for Head Office?
- **Missing nuance to consider:** containing a host destroys volatile evidence; isolating a DC has knock-on authentication effects; real scoping also uses time windows.

## 13. Next steps

- Learner playtest: does case 1 teach "triage the overlap" without coaching?
- An optional fourth case with one noisy sensor (±1), to teach corroboration.
- Course-context hook (`ares:practice:init`) once the platform team agrees the contract.
