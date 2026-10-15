# Party Plaza (Sloth Jam) games worth reusing for adult cyber security learning

Source: `Documents/Strategic Sloth Casual Games/41 Party Plaza`. I went through the game docs (v2 to v12, Project Status), `apps/client/src/games`, `packages/party-rules/src` (the party, table and arcade rules) and the toys. That covers about 90 playable things: about 60 party games, 11 table and card games, 5 arcade cabinets (the Fix-it bench holds 8 puzzles), plus toys, hunts and adventure courses.

How games were picked: the core mechanic has to *be* the security skill once it is reskinned, not a theme painted over an unrelated mechanic. Every rules module is seeded, replayable and bot-tested, and levels and content are data, which fits Ares (seed-based retries, deterministic replays).

Already covered in Ares, so not repeated here: network defense board, phishing, privilege, query hunt, triage, SOC, dispatch, cloud.

---

## Tier 1: strong fit, reskin plus new content

| # | Party Plaza game (kind, code) | What it is now | Cyber reuse for adults | Concept taught |
|---|---|---|---|---|
| 1 | **Picnic Patrol** (cabinet, `arcade/picnicPatrol.ts`) | Tower defense: snails crawl toward a cake; place sprinkler/fan/drum helpers for acorns | Attacks travel a kill chain toward crown-jewel data; place controls (MFA, EDR, WAF, egress filter) on a budget. Each attack type is stopped only by certain controls | Defense in depth, control selection, budget trade-offs |
| 2 | **Honey Hive** (tap board, `honeyHive`) | Minesweeper-like: cells with dots want that many filled neighbours | Hosts on a network map show "N compromised neighbours". Deduce which hosts are infected | Blast-radius reasoning, deduction from partial telemetry |
| 3 | **Bolt Buddies** (cabinet, `arcade/boltBuddies.ts`) | Drop 1/2/5-dot gears until the dot count matches | Change the gears to 1, 2, 4, 8, 16, 32, 64, 128 and the target to an octet or host count. Covers binary, subnet masks and CIDR | Binary and subnetting fluency |
| 4 | **Fix-it bench: Pipes** (cabinet, `arcade/fixItPuzzles.ts`) | Rotate pipe pieces to join a path | Rotate firewall/router tiles so only allowed flows connect, and no path reaches a restricted zone | Segmentation, allow-listing traffic |
| 5 | **Fix-it bench: Wires / Shadows** | Match wire ends by shape; drag things onto their shadows | Match port to protocol, hash to file, IOC to malware family, log source to event | Recall drills with right/wrong feedback |
| 6 | **Odd Sloth Out / Odd Crab Out** (tap board) | Crowd of look-alikes; first to tap the odd one scores most | Lookalike domains (`paypa1`), the one anomalous log line, a rogue device in an asset list, a tampered cert | Anomaly spotting under time pressure |
| 7 | **Shadow Match** (tap board) | A shadow appears; tap which animal casts it (turned, hatted, harder later) | A packet capture, process tree or signature appears; pick the attack or tool that produced it, with obfuscation as difficulty rises | Signature and TTP recognition |
| 8 | **Mystery trails** (hunt, `hunts`) | Follow 3 picture clues, then pick who did it out of 3 | Incident investigation: 3 evidence artefacts (log, email header, endpoint alert), then pick the root cause or actor out of 3 | Evidence-based investigation, attribution |
| 9 | **Picture hunts** (hunt, `hunts`) | A card of 8 hidden things to find around the island | "Spot the 8 risks" in an office or home-office scene: password sticky note, unlocked screen, tailgater, USB drop, open window to the printer room | Physical and social-engineering awareness |
| 10 | **Leaf Stone Wave** (table, `table`) + **Triple Toss / Stone Skip** (tap board) | Rock-paper-scissors card duel with pips; quick-fire counter picks | Red vs blue card duel: attack technique cards vs control cards (phishing → MFA, ransomware → offline backup, SQLi → parameterised queries). Stone Skip is the quick drill: pick the counter to each threat | Mapping threats to mitigations (MITRE ATT&CK → D3FEND style) |
| 11 | **Snack Shack / Juice Jam** (tap board) | Order card shows 1 to 3 items; tap the right bins before the plate leaves | An alert card shows; tap the right playbook steps (isolate host, reset creds, preserve evidence) before the SLA timer runs out | Incident response playbooks. Pairs with Ares triage |
| 12 | **Sand Dig** (arena, `sandDig`) | Dig tiles; tiles next to a find sparkle | Threat hunting: weak signals (sparkle) near true positives, limited dig time. Big Bones twist = a multi-host campaign shared by everyone who found a piece | Hypothesis-driven hunting, cost of searching |

## Tier 2: good fit, more design work or narrower use

| Game | Cyber reuse | Concept |
|---|---|---|
| **Pebble Path** (table, Hex) | Attacker tries to connect the internet edge to the data edge; defender places blocks. It can never end in a draw | Attack paths vs choke points (red/blue) |
| **Garden Fences** (table, dots and boxes) | Fencing a zone closes it off and the mover goes again | Network segmentation, micro-segmentation |
| **Flip Flowers** (table, Reversi) | Infection flips lines of hosts; defender reclaims | Worm propagation and containment |
| **Lily Steps / Stepping Stones** (each pad stepped on once) | Lateral movement: each stolen credential works once; plan a path to the domain controller | Attack-path planning, why credential hygiene matters |
| **Pair Up** (memory pairs) | Pairs of term and definition, CVE and vuln class, attack and mitigation | Vocabulary warm-up |
| **Pop the Moles / Pop Pop / Hungry Chicks / Splash Stall** (tap boards with decoys) | Rapid allow/deny drills: tap only malicious events and leave decoys (benign look-alikes) alone. In Splash Stall the target IOC changes every 10 s | False positives vs false negatives, alert fatigue |
| **Story Stamps** (picture branching story) | Choose-your-response vishing or pretexting scenes; each choice plays out | Social engineering responses (overlaps phishing a little) |
| **Hide the Acorn** (hider/seeker, warmer-colder) | One person hides persistence (scheduled task, registry run key); the other hunts with hints | Persistence and detection, good for pairs or workshops |
| **Lantern Parade** (co-op pattern) | Team incident response: everyone must fire their step in the right order before time runs out; shared star rating | Coordination, runbook sequencing |
| **Bunny Roundup** (arena herding) | Herd infected hosts into a quarantine VLAN while they "flee" | Containment (light, icebreaker) |
| **Market Day / Snack Stash** (bank now or risk one more) | Patch now vs one more feature; exfil-before-detection from the red side | Risk appetite, push-your-luck |
| **Sleepy Giant** (red light, green light) | Red team moves only while the SOC "naps"; caught moving during a look = detected | Stealth, detection windows (icebreaker) |
| **Fix-it bench: Scales / Water Jars** | Balance risk vs cost; sort mixed data into the right classification jars | Risk balancing, data classification |
| **Party Wheel** (toy) | Picks the next scenario or drill in a live workshop | Facilitation tool, not a lesson |

## Not recommended

Slide, ski, sled and snowboard runs (Volcano Slide, Crystal Cart, Wave Slide, Leaf Flight, Parcel Drop, Powder Run, Ski Slalom/Jump), Sloth Tag, Pond Hockey, Coconut Kick/Dodge, Hammock Hop, Tide's Out, Up Up Up, Vine Tug, Bandstand Boogie/Mixer, Bell Bonk, Bounce Up, Fruit Fall, Musical Lily Pads, Paint Pots / Paint the Plaza, Snap Safari, More Berries, Firefly Conga, Hat Whack, Snowball Splat, Star Skate, Slippery Stones, Lantern Lift, Mirror Garden, Tangle Lines, Crate Push, Shell Shuffle, Coconut Drop, Seed Pots, Hop Over, Berry Best, Go Fish, Rainbow Run, Bubble Blower, Tumble, and the adventure courses and plaza toys.

These are reflex or physics games, or abstract puzzles where any security theme would only be paint. They could still serve as breaks or icebreakers, but they teach nothing.

## Reusable tech (more valuable than any single game)

- **Seeded rules plus same-seed replay tests**: fits Ares's deterministic decision replay and retry variation directly.
- **Bots at 3 levels**: opponents for red vs blue table games (Leaf Stone Wave, Pebble Path) and adaptive difficulty.
- **Table engine** (`packages/party-rules/src/table`: init / moves / play / winner / bot, legal moves glow, hold to preview): a ready base for any turn-based red/blue game.
- **Tap board helper** (shared seeded schedule, own board per player): every Tier 1 drill (6, 7, 11) is content on this one helper.
- **Levels as data** (cabinets, Fix-it bench): SMEs can author levels without touching code.
- **Match / lobby / results flow**: multiplayer team competitions for corporate training.

## Ares fit check (2026-10-15)

Every Ares practice follows the same rules (see README): evidence before decisions, scoring on decision quality (speed reported separately, never tied to dexterity), explicit authored rules an SME can review, a specific explanation for every important mistake, a deterministic seed with a retry variant, a 3–6 minute loop with a replayable debrief, full keyboard play, and adult professional tone. GridWatch's turret mechanics were rejected for Ares because they were "not validated cybersecurity models", so the same bar applies here.

Measured against that:

| Game | Fit | What changes to fit Ares |
|---|---|---|
| Honey Hive → **Blast Radius** | ✅ strong | The neighbour counts become *aggregate telemetry* (DNS forwarders, proxy NAT pools, segment IDS) that report how many hosts behind them show the indicator, but not which. Host triage confirms one host and costs case time. Each host is decided as Isolate / Keep online / Watch. Score = containment, continuity, evidence support; guessing right without evidence earns less. |
| Picnic Patrol → **Defense in Depth** | ✅ with redesign | No real-time turrets. A planning phase places controls on attack-chain stages; the campaign then runs step by step, deterministically. Each control has an authored, SME-reviewable effect (prevent / detect) on specific techniques. The second wave adapts to your controls. Business friction is part of the cost. |
| Leaf Stone Wave → **Counterplay** | ⚠️ only with redesign | A rock-paper-scissors cycle is not a real security relationship, so it is dropped. Kept: the hand of cards, simultaneous commit, first to 3. The attacker's next technique arrives as *telemetry* (an observable, not a name); the defender reads it and plays the control card that actually mitigates it. Every match is authored (ATT&CK-style technique → mitigation) with an explanation. |
| Odd one out / Shadow Match / tap-board drills | ⚠️ weaker | These are speed games. Ares never ties the answer to dexterity, so they only fit as untimed "spot it, then explain why" drills. Deprioritised. |
| Bolt Buddies → subnetting | ✅ | Pure skill with exact answers; good later candidate. |
| Mystery trails | ⚠️ overlaps | Overlaps SOC Dashboard and Query Hunt; skip for now. |
| Picture hunts → "spot the risks" | ✅ | Good all-staff awareness piece; needs illustrated scenes. Later. |

Build order: Blast Radius, then Defense in Depth, then Counterplay. Each one gets its own page, design doc in `docs/design/`, tests and README section.

**Status (2026-10-15): six built as playable prototypes, each with a how-to-play video on the playtest hub (`index.html`).**

| Game | Page | Design doc | Tests |
|---|---|---|---|
| Blast Radius | `blastradius.html` | [docs/design/BLAST_RADIUS.md](design/BLAST_RADIUS.md) | `tests/blastradius.test.ts` (20) |
| Defense in Depth | `defense.html` | [docs/design/DEFENSE_IN_DEPTH.md](design/DEFENSE_IN_DEPTH.md) | `tests/defense.test.ts` (21) |
| Counterplay | `counterplay.html` | [docs/design/COUNTERPLAY.md](design/COUNTERPLAY.md) | `tests/counterplay.test.ts` (15) |

| Bit by Bit | `bits.html` | [docs/design/BIT_BY_BIT.md](design/BIT_BY_BIT.md) | `tests/bits.test.ts` (8) |
| Rule Order | `rules.html` | [docs/design/RULE_ORDER.md](design/RULE_ORDER.md) | `tests/rules.test.ts` (9) |
| Spot the Risks | `risks.html` | [docs/design/SPOT_THE_RISKS.md](design/SPOT_THE_RISKS.md) | `tests/risks.test.ts` (6) |

All six share Meridian Freight as the fictional org and the Ares shell stylesheet `src/ui/practice.css`. Content in all six still needs SME review and learner playtests.

## Suggested first three to port

1. **Honey Hive → "Blast Radius"**: smallest port, pure logic, strong deduction lesson.
2. **Picnic Patrol → "Defense in Depth"**: the most "game-like" for adults; extends the Ares network board idea.
3. **Leaf Stone Wave → red vs blue card duel**: reuses the table engine and bots, and teaches threat-to-control mapping.

Caveats: Picnic Patrol and the Fix-it bench started from Club Penguin's System Defender and EPF genre lines (clean-room, genre only). Keep that same rule for any Ares version. All kid-safety rules (no fighting, nothing lost) can be relaxed for adults, but keep the "every action explained" feedback Ares already uses.
