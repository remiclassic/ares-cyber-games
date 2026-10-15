# Ares Cyber Games

Twenty-two short, browser-based cyber security practices for adult learners, each with a how-to-play video.

**Live site:** https://remiclassic.github.io/ares-cyber-games/ (the front page is the playtest hub).

All content is fictional and draft, pending subject-matter-expert review. Each game is a static page built with Vite and TypeScript; there is no server.

```bash
npm install
npm run dev        # http://127.0.0.1:5180 (the hub)
npm test           # all game rules and scoring (vitest)
npm run build      # static site in dist/
```

`npm run deploy` tests, builds and publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves.

---

# Ares: Network Defense — prototype

Page: `network-defense.html`.

A short strategy practice for beginner cybersecurity learners. You protect the network **and** keep services available. Every action produces a visible consequence and a short explanation.

First scenario: **Keep Finance Online** (3 rounds, about 5 minutes including the debrief).

## Also here: Phishing Speed Drill

A second practice lives at `phishing.html` (dev: http://127.0.0.1:5180/phishing.html). It is a 3–5 minute inbox game. First scenario: **The Payroll Request**.

- **Loop:** inspect cues → pick up to two as evidence → Report phishing / Mark safe / Verify first → feedback on every cue.
- **Content:** eight fictional messages in three batches (`src/phishing/data/messages.ts`): 3 phishing, 3 legitimate, 2 that need verification. The first is guided and untimed. All addresses use `.example`. Content is draft and needs SME review.
- **Scoring** (`src/phishing/sim/drill.ts`, tested in `tests/phishing.test.ts`): 100 for the best response, +20 per relevant cue, a streak bonus for evidenced correct decisions, and up to +20 for speed after a correct decision only. Reporting, allowing, or verifying everything stays below 60% of a perfect run.
- **Debrief:** score breakdown, habits (false alarms, missed phishing, skipped verification), and per-message missed cues.
- **Integration:** same `ares:practice:*` messages as below, with `activityId` `ares-phishing-speed-drill/the-payroll-request/v0.1` (`src/phishing/host.ts`).
- **From [Krillinator/Spot-The-Phish](https://github.com/Krillinator/Spot-The-Phish):** the classify-then-walk-through-the-clues feedback pattern. Its messages and brand imagery were not reused; the inbox, evidence selection, verification response, scoring, and progression are new.

## What's in the prototype

| Brief item | Where |
|---|---|
| One board, isometric, zones, editable links | `src/render/renderer.ts`, board in `src/data/scenario.ts` |
| Three rounds (establish → review → recover) | `buildRounds()` in `src/data/scenario.ts` |
| Three actions + Revise | Inspect 20 · Apply access rule 40 · Add (backup) route 60 · Revise 10 |
| Guided introduction | Intro dialog + 4-step coach marks in round 1 (`src/ui/game.ts`) |
| Two reasoning checkpoints | `CHECKPOINTS` after rounds 2 and 3 |
| Final no-hint challenge | `FINAL_CHALLENGE` |
| Decision replay + debrief | `src/ui/debrief.ts`: up to 3 decisions, each replayed deterministically from the command log |
| Retry variation | A new seed changes traffic order, the attacker's address/service, and which link fails |
| Mock course entry, study material, mission | `src/main.ts`, `src/integration/course.ts` (flagged **MOCK**) |
| Integration hooks | `src/integration/host.ts`, see [docs/INTEGRATION.md](docs/INTEGRATION.md) |

### Rules that teach

- Traffic starts **amber** (needs review). Inspecting reveals evidence but never classifies. The learner's own judgment turns it **cyan** (permitted) or **red** (violation). Shape and icon back up the color (diamond `?`, circle `✓`, square `✕`).
- The gateway checks **DENY rules → ALLOW rules → otherwise deny**. A legacy allow-all rule is the starting problem.
- Services depend on the Core server over **internal** links. A shortcut from the Gateway reaches Finance, but it fails the dependency.
- Every route starts at the Gateway, so backup routes carry the same policy. The ACL shield on backup links shows this.
- Planning pauses the simulation, and the simulation also pauses itself when a decision is needed (unknown traffic arrives, or a link fails).

### Scoring vs. learning evidence

The game score is 40% service delivered, 40% prohibited activity denied, and 20% AP efficiency. All three components are always shown. Learning evidence (checkpoint answers and the final challenge) is recorded separately and never mixed into the score.

## Visual direction

The game screen follows the *Project Ares — Network Defense Loop* concept mockup:

- An extruded isometric slab sits over a procedurally drawn night city.
- Routes are recessed conduits that turn at right angles. Moving chevrons show the flow direction. Inbound traffic is orange, internal links are blue, and backup routes are violet with an ACL shield.
- Buildings stand on lit pedestals. The Core sits under a hologram dome, and the Gateway has a holographic wall that gets denser as you add rules. The Inspection Point emits scan rings.
- HUD tiles float across the top (Round, Action points, Service/Security/Efficiency). A decision card sits on the right. Illustrated action cards with coin costs run along the bottom, above the tagline *Observe • Inspect • Decide • Adapt*.

All of this is still Canvas 2D with pre-rendered sprites; WebGPU wasn't needed. Under 960px wide, the layout stacks for phones.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Both legitimate and prohibited activity affect the outcome | ✅ tested (`tests/sim.test.ts`) |
| Blanket blocking cannot earn the best result | ✅ tested on 8 seeds |
| Backup routes preserve access policy | ✅ tested on 8 seeds; approved traffic really uses the backup relay |
| Every important mistake produces a specific explanation | ✅ dependency shortcut, no rule, ALLOW-only fix, over-broad/blanket deny, removing allow-all, no/wrong/late backup |
| Keyboard, readable text, reduced motion | ✅ full keyboard play, focus-trapped dialogs, live-region announcements, Larger text and Reduced motion settings (reduced motion follows the OS by default) |
| New learner understands the first action without coaching | ⏳ needs learner playtesting |
| SME confirms objectives are taught | ⏳ see [docs/SME_REVIEW.md](docs/SME_REVIEW.md) |
| Learners find decisions understandable and enjoyable | ⏳ needs playtesting |

## Architecture

```
src/sim/        pure, deterministic simulation (no DOM): engine, policy, network, scoring, explanations
src/data/       the scenario: board, traffic, evidence, policy, rounds, checkpoints
src/render/     Canvas 2D isometric renderer (sprites, links, tokens, effects)
src/ui/         DOM: HUD, action dock, side panel, dialogs, coach marks, debrief, audio
src/integration course context (mock) + host contract (postMessage)
```

The simulation runs at a fixed 30 ticks per second. Learner commands are logged against the step count, so any round attempt can be rebuilt exactly from its start snapshot and the log. The debrief replays use this, and it would also allow server-side verification later.

## Reused from GridWatch: Signal Breach

From [remeadows/gridwatch-signal-breach](https://github.com/remeadows/gridwatch-signal-breach), with the owner's go-ahead:

- **Blender-rendered sprites** in `public/assets/`: `source` (Internet), `firewall` (Gateway), `latency-trap` (Inspection Point), `core`, `scrubber` (HR), `overclock` (Finance), and `relay` (Backup Link). They are used on the board, the action cards, and the decision card.
- **Seeded RNG**, adapted from `src/sim/rng.ts` (FNV-1a seed hash + mulberry32-style mix).
- **Patterns**: simulation/render separation, deterministic waves, build-phase pause, replay from a command log, and retry/results flow.

GridWatch's arcade units (turrets, enemies, corruption) were **not** reused. They aren't validated cybersecurity models. All educational rules here were written fresh and still need SME review.

## Not done yet / deferred

- Segmentation action (planned for the next scenario). Multiplayer, leaderboards, accounts, and a campaign are out of scope.
- The Ares integration contract is a proposal and still needs to be agreed.
- Course and mission text is placeholder. It must reference the real selected module.
- WebGPU evaluation is deferred, as the brief says.

## Incident Triage Race

A second practice in this repo: a 4–5 minute analyst game about alert triage. First scenario: **The Busy Morning** (six alerts, three lanes, two updates, debrief replay).

- Page: `triage.html` (dev: `npx vite --port 5184`, then open `/triage.html`; preview config `ares-triage`).
- Code: `src/triage/` — `sim/` (pure rules and scoring), `data/scenario.ts` (authored content, **not yet SME-reviewed**), `ui/` (board, details, debrief), `host.ts` (same `ares:practice:*` contract, activity id `ares-incident-triage-race/the-busy-morning/v0.1`).
- Tests: `tests/triage.test.ts`.
- Scoring: decision quality only (lane, justification, revisions, links; penalties for missed criticals and unnecessary escalation). Time and evidence-first decisions are reported separately.

## Privilege Path Puzzle

A 3–5 minute access-control puzzle built on React Flow (`@xyflow/react`, MIT). Three puzzles: **Who Can Read Payroll?**, **The Nested Contractor**, **Two Routes to the Ledger**.

- Page: `privilege.html` (dev: `npx vite --port 5183`, then open `/privilege.html`; preview config `ares-privilege`).
- Code: `src/privilege/` — `sim/access.ts` (the permission model, changes, verification), `sim/scoring.ts`, `data/puzzles.ts` (authored content, **not yet SME-reviewed**), `ui/` (React: map, inspector, access test, report), `host.ts` (same `ares:practice:*` contract, activity id `ares-privilege-path-puzzle/who-can-read-payroll/v0.1`).
- Tests: `tests/privilege.test.ts`.
- Model: a user acts as every group they belong to (nested groups included); a grant gives a group Read/Write on a resource and on what it contains; anything else is denied. "Not a permission" lines (for example *Reports to*) never authorize anything.
- Loop: inspect → predict → test (the route lights up) → change (remove a membership, remove a grant, drop an action, or re-assign a grant to another group) → verify with a before/after table → explain.
- Scoring per puzzle: 100 solved, +60 minimal fix (+20 otherwise), +10 per correct prediction, +40 explanation right first time, −15 per failed verification.

## SOC Dashboard Challenge

A decision game that follows one incident in depth. First case: **A Strange Login** (up to 3 decisions, 4 to 6 minutes with the debrief). Open `/soc.html` on any dev server, or run the `ares-soc` launch config (port 5185).

- **Loop**: review three evidence panels (login, endpoint, network) → request evidence → choose a response and a reason, citing evidence → see what changed.
- **Two truths, one opening**: the seed decides whether the case is a compromise or approved audit work. The opening signals are identical; only requested evidence and later events separate them. Add `?variant=compromise|approved&seed=…` to pin a case.
- **Time is the budget**: each evidence request costs case minutes and one request. The transfer keeps running (80 MB per minute), so over-investigating a real compromise loses payroll data, and blind containment of approved work interrupts the audit.
- **Responses**: Monitor, Investigate (+2 requests), Contain (laptop, account or both), Escalate (responders are slower on a thin handoff), Stand down (also lifts containment).
- **Scoring** (`src/soc/sim/case.ts`): business outcome 40, decisions 36, evidence and reasoning 24. Decisions are graded on what the player knew at the time, never on the hidden truth, and several responses are accepted as defensible.
- **Modes**: Practice is untimed with coach notes and rewind to any decision. Challenge gives 75 seconds per decision; hesitating advances the case clock.
- **Code**: `src/soc/sim` (pure, deterministic, replayable from seed + command log), `src/soc/data/scenario.ts` (all authored content), `src/soc/main.ts` (UI), `tests/soc.test.ts`.
- **Still needed**: SME review of the evidence, grading rules and consequence timings; learner playtesting. No code was taken from SENTINEL SOC / SOC-Simulator; this build is fresh in the repo's existing vanilla TypeScript style.

## Ares: Cyber Dispatch

A five-minute narrative dispatch game. Three colleagues report something odd; the learner asks questions, records evidence, sets a priority, gives an approved next step and hands off to one of two analysts.

- Page: `dispatch.html` (dev: `npx vite --port 5187`, then open `/dispatch.html`; preview config `ares-dispatch`).
- **Loop:** receive report → ask → record evidence → prioritise → guide → hand off → debrief. The shift clock is in shift minutes and moves only by the authored cost of each action (question 2, guidance 1, handoff 1), so there is no real-time pressure and every outcome follows from the recorded choices.
- **Content** (`src/dispatch/data/scenarios.ts`, **draft, pending SME review**): two shifts of three reports. Shift 1: MFA prompt (high), files will not open (benign), suspicious invoice (medium). Shift 2, the replay variant, changes the order and details and moves the false alarm: bank-details request (medium), MFA prompt (benign), files will not open (high). Report cards all carry the same marker; nothing shows the answer before investigation.
- **Rules** (`src/dispatch/sim/engine.ts`): useful questions record a fact, irrelevant or repeated ones only cost time, some questions unlock after a fact. Urgent reports have an authored deadline for a safe next step; missing it, or giving harmful guidance, causes visible harm that can still be recovered. Analyst assignments have authored durations and can be recalled.
- **Scoring** (`src/dispatch/sim/scoring.ts`, tested in `tests/dispatch.test.ts`): four parts of 25 per report: evidence quality, justified priority, guidance, handoff (right owner, and each handoff point marked confirmed only when the evidence is held). Response time is reported separately. Cases closed is not scored; escalating everything scores under 35 and closing everything under 60.
- **Debrief:** one replayed choice per report (action → consequence → why → course mission), badges (Evidence first, Safe step in time, Right-sized, Clean handoff, Recovery), retry, and the variant shift.
- **Accessibility:** full keyboard play (1–3 open reports), live-region announcements, Motion / Larger text / Sound / Hints toggles; reduced motion follows the OS by default.
- **Integration:** same `ares:practice:*` messages, activity id `ares-cyber-dispatch/first-shift/v0.1` (`src/dispatch/host.ts`). The course mission text is a placeholder.
- **From [1989-12-13/BuddyGame](https://github.com/1989-12-13/BuddyGame) (120 Dispatch Desk), with the owner's go-ahead:** the pattern only: one typed action union and a pure world reducer, timed unit assignments, a handoff built from selected facts, and oscillator cue sounds (already present here in `src/ui/audio.ts`). No code or assets were copied: the reference is a real-time medical game in Chinese built around MPDS protocols, a TTS proxy server and Leaflet, and its only asset is a siren sound. Portraits, map and mascot are inline SVG drawn for this prototype (`src/dispatch/ui/art.tsx`), not the 3D art of the concept mockup.

## Ares: Query Hunt

A 10-minute SQL investigation practice. First case: **Unusual Access** (five challenges, two dataset variants, debrief).

- Page: `queryhunt.html` (dev: `npx vite --port 5186`, then open `/queryhunt.html`; preview config `ares-queryhunt`).
- **Loop:** read the question → build a query → run it locally → inspect rows → pin the evidence the result shows → explain the finding → next challenge. Running a query never grants evidence; a map node lights only after a checked result, a correct evidence selection and a supported interpretation.
- **Modes:** *Guided blocks* (tiles that produce visible SQL) and *Write SQL* (editor with schema help). A practice sandbox is always available and is never scored.
- **Code:** `src/queryhunt/`
  - `data/dataset.ts`: synthetic accounts, devices, logins and file access for datasets A and B (**not yet SME-reviewed**).
  - `data/case.ts`: questions, tiles, reference queries, evidence cards, feedback, conclusion (**not yet SME-reviewed**, see [docs/SME_REVIEW_QUERYHUNT.md](docs/SME_REVIEW_QUERYHUNT.md)).
  - `sim/sql.ts`: read-only guard, local execution (sql.js, in memory), result-set checking. `sim/blocks.ts`: tiles → SQL. `sim/game.ts`: progression and scoring. No DOM in `sim/` or `data/`.
  - `ui/scene.ts`: the isometric incident map (plain SVG). `main.ts`: screens and events. `host.ts`: same `ares:practice:*` contract, activity id `ares-query-hunt/unusual-access/v0.1`.
- **Validation:** the learner's result set is compared with the reference query's result, so any equivalent query passes. Only the columns each question names are checked; extra columns and any alias for a count are fine. Ordering is checked only on the stated sort column. SQL errors ("the statement did not run") are reported separately from investigation errors ("valid SQL, wrong answer").
- **Scoring** (max 1000): 100 per correct result, 50 per relevant evidence card (25 after a wrong selection), 50 per interpretation (25, then 10), 150 for the conclusion (75, then 30). A correct conclusion without its supporting evidence earns nothing. Hints are counted and shown separately and never cost points.
- **Transfer variant:** *Retry* switches dataset. In dataset B a service account has more failed logins than the account that matters.
- **Tests:** `tests/queryhunt.test.ts` runs real SQLite: guard, error wording, equivalent queries, off-target results, the full flow on both datasets, conclusion feedback and scoring.
- **From [raishaldhawan23/SQL-Boss-Battle-Game-](https://github.com/raishaldhawan23/SQL-Boss-Battle-Game-)** (single HTML file, no licence file in the repository; reused with the owner's go-ahead): the sql.js in-browser database and the compare-the-result-set-with-a-reference-query approach (`runSQL` / `sameResult`), extended here with named-column matching, sort-key ordering and specific mismatch messages. Its e-commerce puzzles, boss-fight framing, audio and leaderboard were not reused. Runtime dependency: `sql.js` (MIT).
- **Not done:** the map nodes are not clickable; real-time 3D was not needed; only one case; learner playtesting and SME review are outstanding.

## Ares: Cloud Command

A short space-themed cloud-operations practice. One mission, **First Orbit**: three checkpoints (traffic surge, quiet period, access review), about five minutes including the debrief.

- Page: `cloud.html` (dev: `npx vite --port 5188`, then open `/cloud.html`; preview config `ares-cloud`).
- **Loop:** travel to a checkpoint → inspect service evidence → compare changes → choose and justify → simulate the consequence → continue. Navigation pauses at every checkpoint and whenever a dialog is open.
- **Flight:** a spacecraft follows a short route between three orbital stations and picks up diagnostic chips (evidence). There is nothing to dodge and no way to fail a leg. Missed chips can be pulled from the station log. **Autopilot** (`T`, the HUD button, or the briefing option) flies the leg and collects every chip.
- **Code:** `src/cloud/`
  - `sim/rules.ts`: the explicit rules. Capacity = instances × rated load; demand flows through declared dependencies; headroom is judged against the expected peak; cost is instance-hours against a ceiling; a task needs a fixed permission set. `efficientPlan()` finds the leanest plan by search.
  - `sim/mission.ts`: commands, estimates, attempts, revision, scoring. `sim/explain.ts`: every outcome sentence, built from simulation numbers. No DOM in `sim/` or `data/`.
  - `data/mission.ts`: the scenario and all decision content (**draft, pending SME review**, see [docs/SME_REVIEW_CLOUD.md](docs/SME_REVIEW_CLOUD.md)). Fictional data only; no cloud account.
  - `render/scene.ts`: Canvas 2D scene, drawn procedurally (no image assets). `render/route.ts`: route geometry. `ui/game.ts`, `ui/debrief.ts`: DOM. `host.ts`: same `ares:practice:*` contract, activity id `ares-cloud-command/first-orbit/v0.1`.
- **Rules that teach:**
  - Adding capacity helps only where capacity is the constraint. Checkout calls Payments API; more Checkout instances alone stop at Payments API's limit, and more Payments API instances alone change nothing.
  - Right-sizing uses the expected peak plus the stated headroom, not the quietest reading. Too few instances loses requests at the peak; keeping everything running breaks the cost ceiling.
  - Narrowing access must keep the stated task working. The ticket omits a permission the job needs; the access log and the dependency inspection both show it.
  - **Estimates** use the same rules limited to what the learner has found, and list their assumptions ("dependencies have spare capacity, not inspected"). The outcome panel explains any difference from the estimate.
- **Revision:** a poor change can be revised for 10 credits, up to three attempts per checkpoint. A checkpoint that fails first and ends meeting every objective is marked *Recovered*.
- **Scoring** (`sim/mission.ts`, tested in `tests/cloud.test.ts`): learning decisions only: service continuity 35%, policy requirements 30%, resource use 15%, justified choices 20%. Navigation (chips in flight, autopilot legs, flight time) is reported in its own card and never enters the score. A failed access-review objective sets the mission rating to **Security objective not met** whatever the score.
- **Debrief:** for each checkpoint: evidence → chosen change → observed consequence → better alternative, if any → course connection, then the provider/customer split for the stated service model (IaaS).
- **Accessibility:** arrow keys or WASD to steer, `T` autopilot, `P` pause, `M` mute; everything at a checkpoint is native buttons, checkboxes and radios; focus moves to the panel heading on each stage; live-region announcements; reduced motion (follows the OS by default) stops particles, twinkle and bobbing and speeds up autopilot legs.
- **Checks:** `tests/cloud.test.ts` covers the rules, a supported strategy (100), a recoverable failure (checkout-only → revise → recovered), poor decisions with their explanations, the security gate, and that the learning score is the same whether chips were flown or pulled. The same two paths were played through in the browser.
- **From [chfinops/finops-odyssey](https://github.com/chfinops/finops-odyssey)** (one HTML file with a Canvas 2D loop; no licence file in the repository; reused with the owner's go-ahead): the arcade foundation as a pattern: a ship on a starfield, collectible tokens that feed a decision, a budget HUD, floating labels and burst particles. It was rewritten in TypeScript rather than copied. **Not reused:** shooting asteroids to pick quiz answers (it ties the answer to dexterity), the CloudHealth branding and rocket art, prize odds, the Supabase leaderboard and callsign filter, the booth display and staff pages, and Vercel analytics. The FinOps question pool was not reused; all scenario content here is new.
- **Not done:** one mission only; no touch steering (autopilot covers it); the course-connection text is a placeholder; WebGPU was not needed; learner playtesting and SME review are outstanding.

## Ares: Blast Radius

A 4–6 minute incident-scoping puzzle. Scenario **The Backup Account**: three cases (Harbour Branch, Two Depots, Head Office), a debrief and a retry that swaps every case to its other truth. Full design: [docs/design/BLAST_RADIUS.md](docs/design/BLAST_RADIUS.md).

- Page: `blastradius.html` (preview config `ares-blastradius`, port 5189; `?seed=` pins a run).
- **Loop:** read aggregate sensors (they count indicator hosts behind them, never name them) → triage single hosts on a case-time budget → Isolate / Keep online / Watch every host → close the case → reasoning check.
- **Rules that teach:** the overlap between sensors is where a triage settles most; a clean triage result is evidence too; Watch is credited only when the host is undecidable *after* reading its sensors; a clean critical service taken offline costs ×3.
- **Scoring** (`src/blastradius/sim/engine.ts`): containment 40, continuity 30, evidence support 20, triage efficiency 10. "Known" is exact: `sim/logic.ts` checks every arrangement of compromised hosts that fits the evidence. A right guess scores 70; evidence-led play scores 100; isolate-all, keep-all and watch-all stay under 60 (`tests/blastradius.test.ts`). Real time and reasoning-check answers are reported separately.
- **Integration:** same `ares:practice:*` messages, activity id `ares-blast-radius/the-backup-account/v0.1`.
- **From Party Plaza (Sloth Jam) *Honey Hive*:** the count-the-neighbours deduction and the live "matches / too many" counter only. All content and code are new.
- **Not done:** SME review of the sensor model and wording; learner playtest.

## Ares: Defense in Depth

A 5–7 minute control-planning practice. Scenario **The Long Week**: three waves (Monday's opportunists, Wednesday's adapting crews, Friday's operator) against Meridian Freight's customer records and file servers. Full design: [docs/design/DEFENSE_IN_DEPTH.md](docs/design/DEFENSE_IN_DEPTH.md).

- Page: `defense.html` (preview config `ares-defense`, port 5190; `?seed=` pins a run).
- **Loop:** read the intel (each actor's options per attack stage, in preference order) → deploy controls on a budget → run the wave across a five-stage attack-chain board → wave report → "if that control failed, what would stop them?" check.
- **Model** (`src/defense/sim/engine.ts`): actors take the first unblocked option at each stage; detections only count when 24×7 response is in service, and contain one stage later; backups recover, they do not prevent; a foothold always costs 1. 16 ATT&CK-referenced techniques and 15 controls are authored in `data/scenario.ts` (**draft, SME review**).
- **Scoring:** outcome 50 (damage), depth 25 (stops that survive any single control failing, checked by re-running without it), friction 25 (within what the business accepts). Each wave's authored reference plan scores 100 in both variants; nothing 25, perimeter-only 74, interior-only 88 (`tests/defense.test.ts`).
- **Integration:** same `ares:practice:*` messages, activity id `ares-defense-in-depth/the-long-week/v0.1`.
- **From Party Plaza (Sloth Jam) *Picnic Patrol*:** a path, waves, a budget and helpers that each affect only certain walkers. Real-time placement was dropped; every effect is an authored, reviewable rule.
- Shares the Ares shell stylesheet `src/ui/practice.css` with Blast Radius.

## Ares: Counterplay

A 5–7 minute telemetry-to-response card duel. Scenario **Three Incidents**: a mailbox takeover, the run-up to ransomware, and a leaked cloud key. Full design: [docs/design/COUNTERPLAY.md](docs/design/COUNTERPLAY.md).

- Page: `counterplay.html` (preview config `ares-counterplay`, port 5191; `?seed=` pins a run).
- **Loop, each hand:** the actor's technique card arrives face down as a log line → name the technique (the real one plus two look-alikes) → play a response card from a single-use toolkit → reveal: countered (you score), partial (nobody scores) or missed (the actor scores). First to 3 wins the incident. The actor branches when you counter.
- **Content** (`src/counterplay/data/scenario.ts`, **draft, SME review**): 22 response cards, 16 ATT&CK-referenced techniques with telemetry templates, look-alikes, counters, partials and per-card notes.
- **Scoring** (`src/counterplay/sim/engine.ts`): named it 30, response 40 (graded against the best card *still in the toolkit*), outcome 30. Best play scores 100; naive strategies stay under 60; naming and responding are scored independently (`tests/counterplay.test.ts`).
- **Integration:** same `ares:practice:*` messages, activity id `ares-counterplay/three-incidents/v0.1`; every technique named is reported as learning evidence.
- **From Party Plaza (Sloth Jam) *Leaf Stone Wave*:** a hand of cards, a hidden commit and reveal, first to 3. The rock-paper-scissors cycle was replaced with authored technique → response fits.

## More Party Plaza ports: Bit by Bit, Rule Order, Spot the Risks

Three shorter practices (about 5 minutes each), each with a design doc in `docs/design/`, tests and a how-to-play video:

| Practice | Page | From | Teaches | Tests |
|---|---|---|---|---|
| **Bit by Bit** | `bits.html` | Bolt Buddies | binary, masks, subnet sizing, network address by AND | `tests/bits.test.ts` |
| **Rule Order** | `rules.html` | Fix-it bench / Tangle Lines | firewall first-match order, shadowing, cleanup rule and default action, least privilege | `tests/rules.test.ts` |
| **Spot the Risks** | `risks.html` | Picture hunts | physical and social-engineering awareness in an office and a home office, with decoys | `tests/risks.test.ts` |

## Remixes: Pattern Patrol, Port Authority, Confidence Board, Chain Breaker, Tactic Orbit, Blind Spots

New takes on the six games in the Project Ares Games Hub, built by the Ares games team (RegExile, Portflow, Trivialoot, Cylitaire: Kill Chain, Astro-Defense, Threat Modeler). Each has the same skill, a new name and twist, and all-new content, code and art, and each page and hub card credits its original. Pages: `patterns.html`, `ports.html`, `board.html`, `chain.html`, `orbit.html`, `blindspots.html`. Design: [docs/design/REMIXES.md](docs/design/REMIXES.md). Tests: `tests/patterns|ports|board|chain|orbit|blindspots.test.ts`.

## Trailer

`public/videos/ares-trailer.mp4` (70 s, 1080p) opens the hub. It is fully generated by `tools/make_trailer.py`: title cards and name tags are rendered from HTML, the soundtrack is synthesised in code (120 BPM, original, no licensed audio), and every cut lands on the beat. Re-make it after re-recording clean b-roll:

```bash
CLEAN=1 OUT_DIR=trailer-work/broll python tools/record_videos.py http://localhost:5191 <games...>
python tools/make_trailer.py
```

## Playtest hub and videos

The site's front page, `index.html`, is the playtest hub. It lists all twenty-two practices in three sections: the new games (Secure Stack, the Party Plaza ports and *Spot the Phish*, hosted on the Ares Cyber Game site and opened in a new tab) the six remixes, and the eight original Ares practices. Each has an embedded how-to-play video; the eight core practices use the real-play clips and the three-minute gameplay reel in `public/videos/core/` (`public/videos/*.mp4`, about 1–1.5 minutes). To re-record after changing a game, run `python tools/record_videos.py http://localhost:<port> [game ...]`. It needs Python Playwright, the installed Chrome and ffmpeg.

## Secure Stack

A casual, touch-first sticker game in a bright island style (a deliberate change from the dark Ares look, for broad audiences). Threat stickers (gremlin blobs) and defence stickers (badges) fall into a physics pile; drag a defence onto the threat it really stops. Wrong drops wobble and explain why; every match shows a one-line reason; a tide of new threats arrives from island 2; the level is lost if the pile settles above the rope. Five islands, unidentified alerts to investigate, streaks, hints, and field notes at the end of each level. Stars measure understanding (mix-ups), not speed.

- Page: `stack.html` (`?level=N` jumps to an island; `?debug` exposes sticker positions for automated tests and videos).
- Code: `src/stack/` (`data.ts` threats, defences and reasons · `engine.ts` pile planning and scoring · `physics.ts` the pile · `art.ts` all the SVG art · `main.ts` canvas and UI). Tests: `tests/stack.test.ts`.
- Design: [docs/design/SECURE_STACK.md](docs/design/SECURE_STACK.md). Video: `public/videos/secure-stack.mp4`.
