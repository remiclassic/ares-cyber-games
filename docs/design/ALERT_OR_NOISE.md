# Alert or Noise

**Skill:** triage under alert fatigue: telling a real threat from routine noise, one line of evidence at a time, without either burying the analysts or letting an attack through.

**Files:** `alerts.html`, `src/alerts/engine.ts` (pure rules, tested), `src/alerts/data.ts` (content), `src/alerts/main.ts` (UI), `src/alerts/style.css`, `tests/alerts.test.ts`.

## Problem

New SOC staff and non-specialists who see alerts make two mistakes: they escalate anything that looks scary ("impossible travel", "PowerShell", "admin added"), or after an hour of noise they start dismissing everything. Both are expensive. Real teams drown in false positives, and the one real alert is lost among them. Learners need practice judging the **evidence in the line**, not the alert's name, while under time pressure.

## Objective

In 60 seconds, escalate the real threats and dismiss the noise. Score well by being right, not by being cautious.

## Loop

1. A new alert arrives every 3 s (a one-line log/alert from a named source: identity provider, endpoint, mail, proxy, directory...).
2. The player always works the **oldest** alert. Others stack below it. An alert left waiting 8 s **ages out** unhandled.
3. **Escalate** (→ or E) sends it to the analyst queue; **Dismiss** (← or D) closes it as noise.
4. A one-line result shows points straight away (no reasons yet, to keep the pace).
5. After 60 s the **debrief** lists every missed threat and every wasted escalation, each with its log line, the deciding evidence highlighted, and a one-line reason tied to that evidence.

**Guided start (full mode):** the walkthrough (How to play: 3 pages) is followed by 3 guided alerts with the clock paused and the deciding detail highlighted: one threat (password spraying), one routine noise (scheduled backup), and one look-alike (impossible travel explained by the corporate VPN exit). Each call is explained before the next. Guided alerts are not scored and not counted as evidence. The "How to play" button reopens the walkthrough mid-game and pauses the clock. The Next bar always says what to do.

**Wait mode (`alerts.html?mode=wait`):** a single 30-second round for the range waiting screen (see `RANGE_WAIT_MINIGAMES.md`, option C). No walkthrough, no dialogs, no guided items: one in-page Start button with a one-line rule. It ends itself with a compact result (accuracy tiles, habit line, top 3 debrief lines, "Another round"). A host can stop it at any moment by posting `{ type: "ares:practice:stop" }` to the frame: play stops at once, with no prompt and nothing to save. The page never uses `beforeunload`. Hidden pages pause the clock.

## Why the mechanic is the skill

- Every alert type appears both as a threat and as noise (impossible travel: residential ISP vs corporate VPN exit; new admin: no ticket at 03:12 vs approved change; failed sign-ins: 58 accounts from one IP vs 4 typos after a password change; MFA: 23 denied pushes vs 2; inbox rule: forward invoices outside vs file newsletters; PowerShell: encoded from Word vs signed scheduled script; bulk files: leaver vs new laptop sync). The category never answers the question: the evidence does.
- The fixed arrival rate and the 8 s age-out create real fatigue pressure: slow readers get a backlog, and backlogs make people take shortcuts. That is the behaviour under practice.
- The analyst queue makes the cost of a false positive visible: a meter fills with every escalation and drains slowly (one case per 6 s). Past 4 open cases the analysts are "swamped".

## How dominant strategies lose

| Strategy | Why it loses | Typical full-round score (best 96) |
|---|---|---|
| Escalate everything | Each wasted escalation is −4 and adds a case. The queue passes capacity after about 8 alerts; from then on threats are worth +5 instead of +10 and wasted escalations −7. | about −30 |
| Dismiss everything | Each missed threat is −12; noise dismissed is only +2. | about −58 |
| Do nothing | Threats that age out count as missed (−12); noise that ages out scores 0. | very negative |
| Perfect calls | About 1 threat every 9 s never fills the queue. | 96 |

Tests (`tests/alerts.test.ts`) check, over 8 seeds and both modes, that escalate-all and dismiss-all each score below a quarter of perfect play, and that a miss costs more than a wasted escalation. The stream always opens with noise and never runs three threats back to back, so neither strategy gets a lucky streak.

## Scoring vs learning evidence

- **Score (points)** is the game: +10 threat escalated (+5 if swamped), +2 noise dismissed, −4 noise escalated (−7 if swamped), −12 threat dismissed or aged out, 0 noise aged out. The debrief shows the score against the best possible on the same alerts.
- **Learning evidence (accuracy)** is reported separately and is free of the queue and speed effects: accuracy (correct calls / calls made), threats caught out of threats seen, noise filtered out of noise seen, and how many of each aged out. It also names the learner's lean (towards escalating or dismissing). Guided items are excluded from both.
- The host message `ares:practice:completed` carries `score` and `evidence` as separate objects, plus every call record.

## Content (fictional, Meridian Freight SOC)

**Guided:** password spraying ending in a success (threat); nightly backup completed (noise); impossible travel via the corporate VPN exit in Dublin (noise).

**Threats (10):** impossible travel to a residential ISP abroad; Domain Admins added at 03:12 with no change ticket; `vssadmin delete shadows /all /quiet` on a file server; Defender real-time protection disabled via PowerShell by a normal user; 23 MFA pushes denied then 1 approved; inbox rule forwarding "invoice" mail to an outside address; 60-second identical beaconing for 9 hours; leaver downloading 4,180 HR files in 11 minutes; Word spawning encoded PowerShell; Security log cleared on a domain controller.

**Noise (18):** 4 failed sign-ins after a password change; AV signature update; admin added with an approved change; patch reboots in the maintenance window; the company's weekly vulnerability scan; one lockout resolved by helpdesk; certificate expiry reminder; approved encrypted USB; new country with travel request on file; 2 MFA denials then approval; inbox rule filing newsletters; approved app checking for updates; new-laptop sync of 6,200 files; signed PowerShell from a scheduled task; Monday 09:00 DNS spike; blocked inbound RDP; log rotation under policy; printer SNMP "toner low".

A 60 s round uses 20 alerts (7 threats); a 30 s round uses 10 (4 threats). Rounds are seeded (`?seed=`) so a session can be replayed.

## SME review items

- **All content is fictional and marked "Content to be reviewed with SMEs".** Hosts, users, tickets and IPs are invented (documentation IP ranges only).
- Are the threat/noise labels right for a typical SOC, especially the borderline ones: blocked inbound RDP (noise), vulnerability scanner sweep (noise), 4 failed sign-ins after a password change (noise), Security log cleared (always escalate?)?
- Is the threat share (about 35%) right? Real queues are far noisier; we raised it so a 60 s round has enough threats to learn from. Consider stating that in the walkthrough.
- Point values and the queue model (drain every 6 s, capacity 4): do they reflect how an SOC lead thinks about the cost of a false positive versus a miss?
- Are the one-line reasons accurate and phrased the way an analyst would explain them? Each must point to the highlighted evidence.
- Should "Escalate" be split later into "Escalate" and "Investigate / enrich" for more advanced learners?
- Terminology: "Escalate/Dismiss" vs the platform's own verbs (e.g. "Promote to incident", "Close as benign").
- Wait mode: is 30 s right for typical range start-up times, and is the stop message (`ares:practice:stop`) compatible with the waiting screen?
