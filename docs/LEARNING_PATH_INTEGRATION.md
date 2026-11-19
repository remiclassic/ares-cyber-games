# Games in Ares learning paths: integration plan (draft for Eric)

**Status:** draft for discussion with Eric and the platform team. Nothing here is agreed yet.
**Scope:** how the 36 practices plug into the nine full-release Ares learning paths, and what the platform needs from each game (Brad's three asks).

---

## Part 1 — What the platform needs from a game (Brad's asks)

Brad asked for three things. Every game already embeds as a static page in an iframe and talks to its host over `postMessage` (see `docs/INTEGRATION.md`). The plan is to move that into **one shared host module** (`src/ui/host.ts`) so all 36 games behave the same way. Today each game has its own copy, and only a few listen for `stop`.

### Ask 1 — Report attempts like other content

> An attempt runs from when the learner starts playing to when they stop.

| Message (game → platform) | When | Payload |
|---|---|---|
| `ares:game:ready` | Page loaded; waiting for `init` | `{ activityId, version, levels: LevelInfo[], milestones: string[] }` |
| `ares:game:attempt-started` | Learner presses Start, or retries | `{ attemptId, startedAt, level, seed }` |
| `ares:game:progress` | A level, round or wave ends | `{ attemptId, milestone, score, elapsedSeconds }` |
| `ares:game:statement` | A meaningful learner action (existing verbs) | `{ attemptId, at, verb, object, result }` |
| `ares:game:attempt-ended` | Every way an attempt can end | `{ attemptId, endedAt, durationSeconds, reason, completed, score, learningEvidence }` |

`reason` is one of:
- `completed`: reached the debrief.
- `milestone`: the platform's stop condition was met.
- `stopped`: the platform sent `stop`.
- `quit`: the learner left.
- `timeout`.

`quit` is sent from `pagehide`/`visibilitychange`, so closing the tab still ends the attempt. Each retry is a **new attempt** with a new `attemptId`, which answers open question 4 in `INTEGRATION.md`.

The score stays separate from `learningEvidence` (checkpoint answers, final challenge). The path decides which one gates progress.

### Ask 2 — Let the platform start the player at a particular level

| Message (platform → game) | Payload |
|---|---|
| `ares:host:init` | `{ activityId, learnerRef?, startAt?: levelId, levels?: levelId[], seed?, mode?: "practice" \| "assessed", skipTutorial?: boolean, context?: { courseTitle, moduleTitle, objectives[], missionConnection } }` |

- `startAt` jumps straight to a level. `levels` limits the run to a subset, for example only the Insider case types a module covers.
- Every game publishes its level IDs in `ready`, so Studio authors can pick from a list instead of typing.
- `context` replaces the hard-coded mock in `src/integration/course.ts`. The debrief's "mission connection" line then comes from the course.

### Ask 3 — Let the platform interrupt or stop at a milestone

| Message (platform → game) | Payload |
|---|---|
| `ares:host:init` (same message) | `stopWhen?: { milestone?: string, scoreAtLeast?: number, minutes?: number }` |
| `ares:host:stop` | `{ reason?: string }`: stop now, for example because the range is ready |

- When `stopWhen` is met, the game finishes the current step, shows a short debrief and sends `attempt-ended` with `reason: "milestone"`.
- `ares:host:stop` ends immediately and still reports the attempt. Alert or Noise and Breach Timeline already do this; the shared module gives it to every game.

### Engineering estimate (rough)

| Step | Work |
|---|---|
| 1 | Shared `src/ui/host.ts` with the contract above, plus tests | 
| 2 | Each game declares its `levels` and `milestones` and calls the shared host (about 36 small adapters) |
| 3 | A small "host simulator" page that sends `init`/`stop` and logs every message, so the platform team can test without Studio |
| 4 | Pin the `postMessage` target origin to the Ares domain |

---

## Part 2 — Where the games sit in the full-release learning paths

### What this is built on

Ares has no written curriculum. The structure is **learning paths → catalog items** (videos, PDFs, knowledge checks, missions, exams). Studio lists 71 paths. **Nine are marked Full release**, which means every customer with an "All Full-Release Paths" licence gets them. This map covers those nine, read from Studio on Nov 19, 2026.

Two patterns repeat across the paths:
- **Concept paths** are *video → PDF or knowledge check* pairs, then an exam. A game fits **after each pair**, so the learner uses the idea before being tested on it.
- **Mission paths** are a run of range missions. A game fits **before each mission**, to rehearse the decision the mission asks for. A short mode also fits **while the range spins up**.

### Finding: Studio already has a "Minigame" item type, but it is a placeholder

- Studio has an item type called *Minigame*.
- The new-item form asks only for a title and a description.
- No field exists for the game's URL, its settings or attempt tracking.
- One draft exists ("Mini-game 1", March 2026). It is not in any path.

So the integration work is to **define what a Minigame item carries**. The contract in Part 1 covers it: launch URL, activity ID, `startAt`, `levels`, `stopWhen`, mode, and the attempt record that comes back.

### The map (★ = main pick)

#### 1. Cybersecurity Basics · Beginner · 15 items · 18–20 h
CIA triad, then security fundamentals, secure design principles, subnet masks, splitting networks, Linux and netcat, and a final exam.

| After this item | Game | Why |
|---|---|---|
| CIA Triad (video + PDF) | ★ **Secure Stack** | Match each defence to the threat it stops. CIA becomes a decision rather than a definition |
| Security Fundamentals: asset → vulnerability → threat → risk → countermeasure | ★ **Patch Tuesday** · Defense in Depth | Patch Tuesday ranks risk by exposure and exploitation, not by severity score: the path's whole chain in one choice |
| Secure Design Principles | ★ **Least Privilege** · Privilege Path Puzzle | Least privilege and minimal fixes, with consequences shown |
| Subnet Masks | ★ **Bit by Bit** | Binary, masks, sizing a subnet, finding the network: an exact match |
| Divide and Conquer (segmentation) | ★ **Network Defense** · Rule Order | Segment and write access rules without breaking the business |
| Netcat | Port Authority | Ports and services, and cleartext vs secure |
| Before the Final Exam | Confidence Board | Review with confidence wagers. The debrief shows what the learner over- and under-rates |

#### 2. Understanding Network Protocols · Beginner · 18 items · 12–14 h
ARP, DHCP, Ethernet, VLANs, IP, UDP, TCP, DNS, HTTP (video + PDF each).

| After | Game | Why |
|---|---|---|
| IP | ★ **Bit by Bit** | Addressing and masks |
| VLANs | Network Defense | Logical segmentation and routes |
| UDP + TCP | ★ **Port Authority** | Service by port, and which protocols to upgrade |
| HTTP | Rule Order | Firewall verdicts on real service traffic |
| **Gap** | — | No game covers ARP, DHCP or DNS behaviour. See "new game" below |

#### 3. Networking Hands-on Labs · Beginner · 9 Wireshark missions · 10–11 h
ARP, DHCP, Ethernet, VLAN, IP, DNS, UDP, TCP and HTTP labs.

| Where | Game | Why |
|---|---|---|
| Before the first lab | Port Authority | Warm-up on services and ports |
| While each lab's range loads | Alert or Noise (30 s) | Range-wait mode, stopped by `ares:host:stop` |
| **Gap** | ★ *new:* **"Read the Packet"** | Every lab is "find the detail in the capture". No game rehearses that yet. This is the single best new game for the catalog |

#### 4. Advanced Networking Protocols · Beginner · 20 items
STP, ICMP, NAT, OSPF, IS-IS, BGP, TLS, SNMP, IPv6 and OSPFv3 (video + knowledge check each).

| After | Game | Why |
|---|---|---|
| TLS · SNMP | Port Authority | Upgrading SNMPv1/v2 and cleartext management to secure versions |
| IPv6 | Bit by Bit (would need an IPv6 level) | — |
| **Weak fit** | — | Routing protocols are a network-engineering topic. **Leave this path alone** for the pilot |

#### 5. Understanding Encryption · Beginner · 15 items · 12–14 h
Basics, symmetric, asymmetric, hashing, PKI, cryptanalysis, quantum, final exam.

| After | Game | Why |
|---|---|---|
| Hash Algorithms | ★ **Password Forge** | Live cracker panel: why salted hashes, length and uniqueness matter |
| PKI | ★ **Wi-Fi or Why Not** | Certificates, TLS and VPNs on untrusted networks: when encryption protects you and when it doesn't |
| Cryptography (attacks) | Port Authority | Cleartext → secure protocol upgrades |
| Before the Final Exam | Confidence Board | Calibrated review |

#### 6. Real World Exploits · Beginner · 25 items · 28–32 h
Heartbleed, OPM, DNC 2016, Shadow Brokers, EternalBlue, WannaCry, NotPetya, Equifax, SolarWinds, Log4Shell and the CrowdStrike outage, with three missions.

| After | Game | Why |
|---|---|---|
| Heartbleed (before the mission) | ★ **Patch Tuesday** | Which of five vulnerabilities do you patch this month? |
| OPM Breach | Least Privilege | Over-broad access and forgotten accounts |
| DNC 2016 Hack | ★ **MFA Fatigue** · Phishing Speed Drill | The intrusion started with a credential phish |
| EternalBlue → WannaCry | ★ **Chain Breaker** | Lay the incident on the kill chain; break it earliest |
| NotPetya | ★ **Backup or Bust** | Destructive malware: did the backups survive, and were restores tested? |
| Equifax | ★ **Incident Comms** · Patch Tuesday | Unpatched Struts plus the disclosure that went wrong |
| SolarWinds | ★ **Vendor Vetting** | Supply-chain trust and proportional vendor controls |
| Log4Shell (before the mission) | Breach Timeline | Rebuild the exploitation sequence |
| CrowdStrike Outage | Vendor Vetting (update and change terms) · Backup or Bust | Trusted update channel, recovery |

This path is the **richest fit**: nearly every case study has a game that makes the learner take the decision the real organisation got wrong.

#### 7. Defensive Cybersecurity Introduction · Intermediate · 5 missions · 5–6 h
Lab Report (SMB exfil in PCAP) → Network Scan (detect a scan, block the subnet in pfSense) → Network Vaccine (web compromise, command injection, bind shell) → Elite Hackers (C2, write a Suricata rule) → From Russia with Hate (Zenmap, Hydra, attribution).

| Before mission | Game | Why |
|---|---|---|
| 1.0 Lab Report | ★ **Need to Know** · Insider or Accident | Was the file sensitive, and who moved it? |
| 2.0 Network Scan | ★ **Rule Order** · Bit by Bit | Write the block rule, sized to the right subnet |
| 3.0 Network Vaccine | ★ **Counterplay** | Raw log line → technique → the response that removes it |
| 4.0 Elite Hackers | ★ **Pattern Patrol** · Blind Spots | Write the detection that catches the attack and none of the look-alikes, which is the Suricata skill |
| 5.0 From Russia with Hate | Password Forge (Hydra) · Tactic Orbit | Why password spraying works; naming the tactic |
| Between missions | Alert or Noise (30 s) | Range-wait |

#### 8. Digital Forensics Introduction · Intermediate · 5 missions · 10–12 h
Phish & Chips → Image Is Everything → KAPE Escape → Mining for Clues → APTly Investigated.

| Before mission | Game | Why |
|---|---|---|
| 1.0 Phish & Chips | ★ **Phishing Speed Drill** · Spot the Phish | Read headers and cues before the forensics |
| 2.0 Image Is Everything | ★ **Breach Timeline** | Order the artefacts: what had to happen first |
| 3.0 KAPE Escape (insider staging and exfil) | ★ **Insider or Accident** | Spend limited checks to tell theft from mistake. A near-exact match |
| 4.0 Mining for Clues (cron privesc, C2, coinminer) | Counterplay · Tactic Orbit | Persistence and privilege-escalation techniques |
| 5.0 APTly Investigated (lateral movement to the DC) | ★ **Blast Radius** · Privilege Path Puzzle | Scope the compromise; trace the path to the domain controller |

#### 9. Glass House: Team Cyber Range · Expert · 1 mission · 90–120 min
Live red vs blue.

| Where | Game | Why |
|---|---|---|
| Lobby, while teams form and the range spins up | ★ **SOC Dashboard Challenge** · Alert or Noise | Blue-team tempo warm-up, stopped by `ares:host:stop` |
| Red-team warm-up | Tactic Orbit · Chain Breaker | Plan the chain before running it |
| Debrief | Blast Radius | Scope what the red team actually reached |

### Games with no full-release home yet

Six games have no place in the nine full-release paths:
- Clean Desk
- Shadow IT
- Cloud Command
- Cyber Dispatch
- Incident Triage Race
- Query Hunt

Paths that are **in development or on limited release** in Studio, judging by their titles, would take them:

| Path in Studio (not full release) | Likely games |
|---|---|
| Incident Response Introduction (limited) · Incident Handling (dev) | Incident Triage Race · Cyber Dispatch · Incident Comms · Blast Radius · SOC Dashboard |
| Risk Management (dev) | Patch Tuesday · Vendor Vetting · Shadow IT · Backup or Bust · Spot the Risks |
| Access Control (staging) | Least Privilege · Privilege Path Puzzle · MFA Fatigue |
| Insider Threat Analytics (dev) | Insider or Accident · Need to Know |
| Network Traffic Analysis, DCWF 511 (limited) | Pattern Patrol · Alert or Noise · Query Hunt |

Clean Desk, Spot the Risks and Wi-Fi or Why Not also suit a **workforce awareness** path, if Circadence ever sells to non-technical staff.

### Three things to settle with Eric

1. **Pilot paths.** Suggestion:
   - **Digital Forensics Introduction** and **Defensive Cybersecurity Introduction.** They are five missions each, the matches are close, and missions already report attempts, so the game data can sit beside them.
   - **Cybersecurity Basics.** It is the beginner path with the most learners, and Bit by Bit and Secure Stack fit it exactly.
2. **Team playtest.** Five to eight people play the pilot games embedded in a test copy of those paths (Studio supports Dev and Staging versions). Collect attempt data and a two-question survey.
3. **The Minigame item definition.** Agree with the platform team which fields a Minigame item needs. Part 1 is the proposal.

### Placement patterns

- **Warm-up (before a module):** a 3–5 min game that surfaces what the learner already believes. Wrong answers are cheap and explained. Played in `practice` mode.
- **Practice (after the reading or video, before the range):** the game rehearses the decision the mission will ask for. `startAt`/`levels` pick the cases that match the module.
- **Range-wait filler:** while a range spins up, a short mode (Alert or Noise 30 s, Breach Timeline 60 s) runs and is stopped with `ares:host:stop` when the range is ready.
- **Check (end of module):** played in `assessed` mode. `learningEvidence`, not the score, feeds completion.
