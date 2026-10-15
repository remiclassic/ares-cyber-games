# Ares: Counterplay: design doc

**Status:** playable prototype, v0.1 (2026-10-15). Telemetry, technique mappings and response fits are draft and need SME review (see the last section).
**Page:** `counterplay.html` (dev: preview config `ares-counterplay`, port 5191; `?seed=` pins a run).
**Origin:** reworked from *Leaf Stone Wave*, a Party Plaza (Sloth Jam) table card game. There, both players hold cards from a fixed deck, pick one at the same moment, Leaf wraps Stone, Stone stops Wave, Wave carries Leaf, and the first to win 3 hands wins. Kept: a hand of cards, a hidden commit and reveal, and first to 3. **Dropped: the rock-paper-scissors cycle.** It is not a real security relationship, and teaching an arbitrary triangle would mislead adults. Every "beats" relationship here is an authored technique → response fit with an explanation.

## 1. Pitch

You are on call. The actor plays technique cards face down, and all you see is the telemetry each one leaves: a mail gateway line, an identity sign-in, an EDR alert, a cloud audit event. Name what is happening, then play the response card that actually removes it. Your toolkit is limited, and every card can be used only once per incident.

**Tagline:** *Read it. Name it. Counter it.*

## 2. Audience and fit

- **Who:** adults heading into SOC and incident response roles, IT admins who get paged, and cloud and identity engineers.
- **Length:** 5–7 minutes for three incidents (3–5 hands each), plus the debrief.
- **Where it sits in Ares:**

  | Practice | Question it answers |
  |---|---|
  | Incident Triage Race | Which alert first? |
  | SOC Dashboard | How should this one incident unfold? |
  | Blast Radius | How far has it spread? |
  | Defense in Depth | What should be in place beforehand? |
  | **Counterplay** | **What exactly is this, and what response removes it?** |

  It is the only one of these built around reading raw log lines.

### Learning objectives

1. Read raw telemetry and recognise the attacker technique behind it.
2. Tell a technique from the benign activity that looks like it.
3. Choose the response that actually removes the actor's capability, not just one that sounds related.
4. Know which responses only partly help: blocking a sender after delivery, resetting a password while an app grant or session survives, rotating a key while a back-door user stays.
5. Spend limited response capacity where it matters most.

### How it meets the Ares rules

| Ares rule | How Counterplay meets it |
|---|---|
| Evidence before decisions | You must name the technique from the telemetry before any response card can be played. Naming is graded separately. |
| Decision quality, not speed | No timer. A response is graded against the best card *still in your toolkit*. |
| Explicit, reviewable rules | Each technique lists its counters, partials and a per-card note. Everything else is a miss. All in `data/scenario.ts`. |
| Every mistake explained | The reveal gives the "tell" (which field gives it away), the note for the card you played, and the better card if one was available. |
| Seeded and replayable | The seed fills hosts, users, addresses and option order. The actor's branching depends only on your plays. Incidents rebuild from the command log (tested). |
| Blanket play cannot win | "First option, first card" and "last option, last card" both stay under 60 (tested; about 21 in the browser). |

## 3. Theme and narrative

- **Org:** *Meridian Freight*, the same fictional company as Blast Radius and Defense in Depth. Incident 2's beacon is the same `cdn-update.example` indicator scoped in Blast Radius.
- **"Three Incidents"**, one on-call week:

  | Incident | When | What happens | Toolkit |
  |---|---|---|---|
  | Mailbox takeover | Monday morning | Phishing → stolen session → hidden inbox rule or rogue OAuth app → payment-change fraud | 7 cards (mail, identity, process) |
  | Before the ransomware | Wednesday night | Beacon → LSASS dump → PsExec to the file server → backup deletion → encryption | 8 cards (endpoint, network, backup) |
  | The leaked key | Friday afternoon | CI key from a public repo → audit trail off / back-door admin → crypto-mining / public bucket → production secrets read | 7 cards (cloud identity, logging, storage, compute) |

- **Look:** the shared Project Ares shell. The table has a **face-down actor card** (red hatching, flips on reveal to the technique and its ATT&CK id) next to a **telemetry console** (dark terminal, monospace, green text, labelled with its source). Your toolkit is a row of cyan holo-cards; used cards grey out.
- **Score tracks:** your pips are circles, the actor's are diamonds. Shape backs up colour, as in every Ares practice.
- **Tone:** an on-call shift. The log lines are realistic and specific; there are no hacker clichés.

## 4. Core loop (one hand)

1. **Telemetry arrives.** The actor's card is face down. You see one log line, and its source.
2. **Name the technique** from three options: the real one and two authored look-alikes. These are benign activity ("Backup retention clean-up", "Scheduled CI pipeline run") or a neighbouring technique ("Session token replay" vs "MFA fatigue"). Keys `1`–`3`.
3. **Play a response card** from your toolkit.
4. **Reveal:** the actor's card flips. **Countered** (you score), **Partial** (nobody scores) or **Missed** (the actor scores). You also see whether you named it right, why the telemetry points to it, what your card did, and the better card if one was available.
5. First to 3 wins the incident. When the actor's playbook runs out, the higher score wins.

**The actor adapts:** some playbook steps branch on whether you countered the last move. Revoke the stolen session and they switch to an OAuth app grant (persistence that survives a password reset). Remove the back-door user and they go for the public bucket instead of mining.

## 5. Rules that teach

- **Naming comes first.** The response buttons stay locked until you name the technique, so you commit to a hypothesis and then act on it.
- **Look-alikes are the lesson.** Each distractor is a real confusion: benign activity with the same shape, or a related technique that needs a different response.
- **Partials are deliberately tempting.** Each one is an action that is related but leaves the capability in place: blocking the sender after delivery, MFA re-enrolment against a live session, killing a process with persistence, disabling one account when the dump held many, rotating a key while a new admin user exists.
- **Single-use toolkit** stands for limited response capacity. Grading is fair: the response is graded only against cards *you still had*, so spending a card earlier is never double-penalised. It only costs you on outcome.
- **No card counters two techniques in the same incident** (tested), so the right answer is always still in the toolkit if you have not spent it on something else.

## 6. Scoring (per incident, then averaged)

| Part | Points | Rule |
|---|---|---|
| Named it | 30 | Share of hands where you named the technique correctly |
| Response | 40 | Mean per hand: 1 if your card's fit equals the best fit still available; 0.5 for a partial when a counter was available; 0 otherwise |
| Outcome | 30 | Won 30, stalemate 15, lost 0 |

Naming the technique and choosing the response are scored independently, and a test proves it. Naming everything wrong but responding perfectly scores 0 + 40 + 30.

## 7. Debrief

Score and the three tiles. **Habits:**
- look-alikes that caught you, with the confusion spelled out
- partial fixes played while a counter was in hand
- incidents lost

**Incident by incident:** each hand's true technique (with ATT&CK id), what you named, what you played, the result and the counter. Then the objectives, and **Retry** (new hosts, users, addresses and option order).

## 8. Accessibility

Native buttons throughout. `1`–`3` name the technique. Focus moves to the toolkit after naming and to **Next** after a reveal. The telemetry console is focusable and labelled with its source. Live-region announcements report the reveal result and the score. Fits always pair colour with a word (Countered / Partial / Missed), and the pips use shape as well as colour. Larger text is available. Under 1180px the table stacks above the incident panel; on phones the identify options go to one column.

## 9. Integration

Same `ares:practice:*` contract (`src/counterplay/host.ts`), activity id `ares-counterplay/three-incidents/v0.1`. Verbs: started, assessed (technique named), responded (card played, fit), retried, completed. `learningEvidence` lists every technique with what the learner named and whether it was right, kept apart from the score. Standalone runs keep the last result in `localStorage` (`ares-cp:lastResult`).

## 10. Architecture

```
src/counterplay/
  data/scenario.ts   response cards, three incidents: techniques, telemetry templates, fits, playbooks, seeded values
  sim/types.ts       types
  sim/engine.ts      dealing, naming, playing, branching, grading, scoring
  ui/game.ts         incident panel, card table, reveal, incident summary
  ui/debrief.ts      debrief
  host.ts, main.ts, style.css
src/ui/practice.css  shell shared with Blast Radius and Defense in Depth
tests/counterplay.test.ts   15 tests: content integrity, placeholders, naming-before-response, single-use cards, branching, first to 3, retry values, replay, best play = 100, toolkit-relative grading, naive strategies < 60, naming and response scored independently
```

## 11. For SME review

Please mark each item ✅ / ✏️ / ❌.

- **Telemetry lines** (16, in `data/scenario.ts`). Are they realistic enough without being vendor-specific? Is "mfa=satisfied by claim in token" a fair stand-in for a token-replay sign-in?
- **Look-alikes:** two per technique. Are they confusions real analysts make?
- **Fits:** the counters and partials per technique. Key judgement calls:
  - The beacon is countered by isolating the workstation; blocking the domain is partial (fallback C2).
  - Credential dumping is countered by resetting *every* cached account; disabling one admin is partial.
  - PsExec is countered by an emergency SMB rule rather than isolating the source.
  - Payment-change fraud is countered by a phone callback; revoking the mailbox is partial.
  - The leaked key is countered by deactivating and rotating it; revoking sessions is partial.
- **Playbook branches:** countering the session leads to an OAuth grant; countering the leaked key leads to the back-door user. Plausible adversary behaviour?
- **Single-use toolkit** as a model of limited response capacity: helpful, or misleading?
- **Not modelled:** evidence preservation before containment, communication and legal steps, and time-to-respond. Candidates for a later "incident commander" layer.

## 12. Next steps

- Learner playtest: are the look-alikes too easy once people learn the source labels?
- A harder mode that hides the telemetry source label.
- More incidents as data: OT/ICS, insider data theft, supply-chain update.
