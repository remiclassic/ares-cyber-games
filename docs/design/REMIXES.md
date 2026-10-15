# Remixes: design doc

**Status:** six playable prototypes, v0.1 (2026-10-15). All content is draft and pending SME review.

## What a remix is here

The Project Ares Games Hub has six games built by the Ares games team: Astro-Defense, Cylitaire: Kill Chain, Trivialoot, RegExile, Portflow and Threat Modeler. Each remix below:
- teaches the same skill as its original;
- has a new name and a new twist;
- has entirely new content, code and art.

Only each original's topic and genre were used: its one-line description and its key-art thumbnail. No code, levels, text or art were copied. Every remix page and hub card credits the original.

All six share the Project Ares shell (`src/ui/practice.css`) and the fictional company Meridian Freight. Each is a static page with pure, tested rules and a how-to-play video.

| Remix | Page | Original | Skill | Twist | Tests |
|---|---|---|---|---|---|
| **Pattern Patrol** | `patterns.html` | RegExile | Regular expressions | Detection engineering: catch the attack lines *and none* of the benign look-alikes (precision and recall) | `tests/patterns.test.ts` |
| **Port Authority** | `ports.html` | Portflow | Ports and protocols | Apply a harbour policy to each connection: allow, block, or upgrade cleartext to the secure version | `tests/ports.test.ts` |
| **Confidence Board** | `board.html` | Trivialoot | Six-category knowledge | Wager your confidence; scoring rewards calibration | `tests/board.test.ts` |
| **Chain Breaker** | `chain.html` | Cylitaire: Kill Chain | Kill chain order | Rebuild a real incident patience-style, then choose where to break the chain (earlier is better) | `tests/chain.test.ts` |
| **Tactic Orbit** | `orbit.html` | Astro-Defense | ATT&CK tactics | Tag each incoming technique with its tactic to raise the right shield; multi-tactic techniques accept any; calm mode | `tests/orbit.test.ts` |
| **Blind Spots** | `blindspots.html` | Threat Modeler | Attack paths and detection coverage | A sensor budget, then a red team run scored on how early, and how often, each path was seen | `tests/blindspots.test.ts` |

## Pattern Patrol
- **Loop:** a goal and a log excerpt → type a regex → each line lights up live as caught, missed, false alarm or ignored → solved when every attack line is caught and nothing else.
- **Content:** eight levels, each built around one regex idea and one trap:
  1. plain text;
  2. alternation (the `administrator-training` trap);
  3. escaped dots (the `203a0b113c44` trap);
  4. `(?i)` and `.*` for encoded PowerShell;
  5. character ranges anchored to the timestamp (the `session=T03:00` trap);
  6. quantifiers for upload size;
  7. card-number DLP (12-digit order IDs stay out);
  8. exact-account matching (`svc-backup2`, `svc-backupreader` stay out).
- **Scoring:** 10 points per detection, −3 per hint, 0 if the reference pattern is shown.
- **Tested:** every reference pattern solves its level, `.` never does, and the unescaped address falls for the trap.

## Port Authority
- **Loop:** a ship arrives showing its port, source and destination → name the service (four options; port 22's SSH/SFTP pair is never offered together) → apply the policy.
- **Policy:**
  - from the internet, only HTTPS to the web server and SMTP to the mail gateway;
  - admin protocols only through the VPN;
  - no cleartext;
  - specific internal flows only.
- **Content:** 15 ships across three tides, covering allow, block and upgrade. Telnet→SSH, FTP→SFTP, HTTP→HTTPS, POP3→POP3S, LDAP→LDAPS.
- **Scoring:** service 1, decision 3, scaled to 100. Knowing every port but allowing everything stays under 60 (tested).

## Confidence Board

| Confidence | Win | Lose |
|---|---|---|
| Unsure | +½ | 0 |
| Likely | +1 | −½ |
| Sure | +1½ | −1½ |
| Certain | +2 | −6 |

- **Why those numbers:** they make each level the best bet only in its own accuracy band (under ~50%, ~50–67%, ~67–90%, over 90%). This is tested, so the score genuinely rewards calibration.
- **Content:** six categories (phishing and people, passwords and MFA, networks, malware and ransomware, cloud and data, incident response) × four questions, each with an explanation.
- **Debrief:** accuracy per confidence level, with the target marked, plus over- and under-confidence notes.

## Chain Breaker
- **Loop:** a shuffled deck of seven incident cards → turn one over → lay it on its kill-chain link. A wrong link wobbles and says "earlier" or "later"; you can also put a card back under the deck. Once all seven are placed, choose one of four controls to break the chain.
- **Content:** three incidents (invoice lure, exposed VPN, poisoned update). Each has three valid breaks at different stages and one that breaks nothing: backups, awareness training or MFA, each with the reason it doesn't apply.
- **Scoring:** 70 for placement (−3 per mistake), 30 for the earliest break, 15 for a later valid break, 0 for one that breaks nothing.

## Tactic Orbit
- **Loop:** ships carrying ATT&CK techniques fly toward a station ringed by eight tactic sectors → select a ship (its intel shows the technique, id and description) → raise a shield by clicking the sector or pressing 1–8.
- **Calm mode** (on by default) stops ships outside the ring. Ships that arrive untagged cost a shield.
- **Content:** 18 techniques across three waves, each wave in rough intrusion order. Scheduled tasks and registry run keys accept every tactic ATT&CK lists for them.
- **Scoring:** 100 for a first-try tag, 50 for a second, 0 after that.

## Blind Spots
- **Loop:** nine budget points → choose from nine sensors, each on a map node and each seeing specific steps → run the red team. Three paths animate step by step as seen or blind.
- **Scoring per path:** 70 for the earliest detection (falling to 10 at the last step) plus 30 if two or more sensors saw it, averaged over the three paths.
- **Debrief:** the best plan possible on this budget, found by checking all 512 combinations. It scores between 70 and 100 (tested), so it's a real trade-off. Watching only the exits loses to it (tested).

## For SME review
- **Pattern Patrol:** are the log formats realistic enough? Is `(?i)` worth teaching, given that most SIEM regex flavours support it?
- **Port Authority:** is the harbour policy a fair simplification? Is LDAP→LDAPS the right message, rather than LDAP signing?
- **Confidence Board:** the 24 questions and their explanations.
- **Chain Breaker:** stage assignments, especially Weaponization versus Delivery, and Installation for web shells.
- **Tactic Orbit:** tactic assignments, and the decision to list secondary tactics (Defense Evasion) only in the explanations.
- **Blind Spots:** which sensors see which steps; the 70/30 early-versus-depth split.
