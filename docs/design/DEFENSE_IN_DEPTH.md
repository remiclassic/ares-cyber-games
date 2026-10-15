# Ares: Defense in Depth: design doc

**Status:** playable prototype, v0.1 (2026-10-15). The control → technique effects are simplified and need SME review (see the last section).
**Page:** `defense.html` (dev: preview config `ares-defense`, port 5190; `?seed=` pins a run).
**Origin:** reworked from *Picnic Patrol*, a Party Plaza (Sloth Jam) arcade cabinet. There, snails crawl a path toward a cake and you place sprinklers, fans and drums beside it. Kept: a path, waves, a budget, and helpers that each affect only certain walkers. Dropped: real-time placement and anything that rewards reflexes. The Ares bar applies here. GridWatch's turret mechanics were rejected as "not validated cybersecurity models", so every effect here is authored, named and reviewable.

## 1. Pitch

Three attack crews, one week, a limited budget, and a business that will only put up with so much disruption. Deploy controls along the attack chain, run each wave, and watch campaigns move from initial access to impact. Then answer the question every defender should ask: *if that control failed, what would stop them next?*

**Tagline:** *Layer it. They will adapt.*

## 2. Audience and fit

- **Who:** adults building a security mental model: IT and infrastructure staff, junior security engineers, risk and audit people, technical managers who approve security budgets.
- **Length:** 5–7 minutes for three waves, plus the debrief.
- **Where it sits in Ares:** Network Defense teaches one control (access rules) in depth. Defense in Depth teaches how controls *combine* across the attack chain. Blast Radius and SOC cover response, and this covers prevention planning. Technique names follow MITRE ATT&CK, a useful bridge to later threat-informed defence modules.

### Learning objectives

1. Map controls to the attack stages they actually affect.
2. Build layers so that no single control failing lets an attack through.
3. Expect attackers to adapt to visible controls, and plan for their next option.
4. Know that detection only helps with someone to respond, and that recovery limits damage but does not prevent it.
5. Weigh security against the friction each control puts on the business.

### How it meets the Ares rules

| Ares rule | How Defense in Depth meets it |
|---|---|
| Evidence before decisions | Threat intel and the board show each actor's options at every stage, in preference order, before you spend anything. |
| Decision quality, not speed | No timer and no aiming. Every outcome follows from which controls are in service. |
| Explicit, reviewable rules | Three effects (block, detect, recover), one response rule, one adaptation rule. All in `data/scenario.ts` and `sim/engine.ts`. |
| Every mistake explained | Each campaign verdict says where it stopped, which controls it depended on, and which single failure would let it through. |
| Seeded and replayable | Fully deterministic. The seed only picks one of two authored preference orders, and Retry swaps it. Waves rebuild from the command log (tested). |
| Blanket play cannot win | Doing nothing scores 25. Perimeter-only planning scores 74, interior-only 88 (every foothold costs), and "EDR + SOC first" 80. "Buy everything" is impossible: the week's budget covers well under two-thirds of the catalogue (tested). |

## 3. Theme and narrative

- **Org:** *Meridian Freight* again, the same fictional logistics company as Blast Radius, so the new practices share one world.
- **Story, "The Long Week":**
  - **Monday:** two opportunist crews with fixed playbooks.
  - **Wednesday:** they have seen your controls and switch to fallbacks. A third crew exploits a fresh VPN vulnerability.
  - **Friday:** a skilled operator tries every option, in order, at every step.
- **Crown jewels:** customer records and file servers.
- **Tone:** a security planning meeting, not a battle. No enemies to shoot. Campaigns are rows on a board; controls are chips on stage columns.
- **Look:** the shared Project Ares shell (`src/ui/practice.css`). The board is a five-column attack chain (Initial access → Execution → Credential access → Lateral movement → Impact), plus a crown-jewels column with an amber outline. Effect chips are always icon plus colour plus word:
  - cyan shield = **Blocks**
  - amber eye = **Detects**
  - green arrow = **Recovers**
  - violet person = **Responds**
  - During a run, each column reveals left to right with a result badge (Ran, Blocked, Detected, Contained, Recovered). Reduced motion shows the result at once.

## 4. Core loop (one wave)

1. **Read the intel.** Campaign cards plus the board. Each cell lists the actor's options at that stage in preference order. Options your current controls block are struck through, with the control named.
2. **Deploy controls** from the catalogue, grouped by the stage they act on. Each card shows cost, friction (with the business reason) and exactly which techniques it blocks, detects or recovers from. You can remove this wave's additions for a refund; controls from earlier waves stay in service.
3. **Run the wave.** Each campaign moves through the stages, column by column.
4. **Wave report:** outcome, depth and friction tiles; a verdict per campaign; one reasoning check.
5. Credits carry over; the next wave adds more budget and accepts a little more friction.

## 5. Rules that teach (the model)

- **Stages in order.** A campaign must pass all five. At each stage the actor uses its first option that no deployed control *blocks*, skipping blocked ones. If every option is blocked, the campaign stops. On Monday each actor has one option per stage; later waves have fallbacks.
- **Execution follows access.** The execution technique depends on how they got in (macro → PowerShell; ISO → shortcut script; anything else → hands-on-keyboard session).
- **Detection needs response.** A detection is acted on only if *24×7 monitoring and response* is in service. Responders contain the campaign after **one more stage runs**, so detecting late can be too late. Without responders, the alert is logged and nothing happens ("Alert raised, nobody responded").
- **Recovery is not prevention.** Offline backups cut ransomware damage from 3 to 1, but the encryption still happens.
- **Footholds cost.** Successful initial access costs 1 damage (investigation, rebuild, session revocation), even if the campaign is stopped later. Impact adds 3. This stops "defend only the interior" from scoring perfectly.
- **Resilience** is concrete: a stop is resilient when, for every control it depended on, re-running the campaign without that control still stops it. This is the core defence-in-depth idea, made testable.
- **Friction is a budget too.** Each control's friction has a business reason (re-signing finance templates, contractors via VPN, admins through a jump host, an allowlisting exception backlog). Going over the accepted friction loses points: strong controls with high friction get worked around.

## 6. Content

**Techniques (16)**, each with an ATT&CK id:

| Stage | Techniques |
|---|---|
| Initial access | macro invoice, ISO + shortcut, adversary-in-the-middle sign-in, RDP spraying, VPN exploit, bought credentials |
| Execution | macro → PowerShell, shortcut script, hands-on-keyboard |
| Credential access | LSASS dump, Kerberoasting, passwords in files |
| Lateral movement | SMB remote services, RDP to servers |
| Impact | ransomware, exfiltration to cloud storage |

**Controls (15):** MFA, phishing-resistant MFA, block internet macros, attachment filtering, edge patching, no public RDP, EDR, application allowlisting, Credential Guard, managed service accounts, secrets vault, admin-port segmentation, egress DLP, offline backups, 24×7 SOC.

**Waves**, each with an authored strong plan that scores 100 in both variants (tested):

| Wave | Credits | Friction accepted | Campaigns | Reference additions | Teaching beat |
|---|---|---|---|---|---|
| Monday | 10 | 2 | 2 fixed | macros, no public RDP, Credential Guard, gMSA | Front layer plus a credential layer on every path |
| Wednesday | +8 | 4 | 3, with fallbacks | attachment filter, edge patching, security keys | Attackers route around the front door; standard MFA does not stop a relay page |
| Friday | +6 | 5 | 2 operators trying every option | secrets vault, segmentation | When every door is tried, depth behind the door decides it |

Many other plans also score well. The reference exists to prove 100 is reachable and to give SMEs something concrete to review.

## 7. Scoring (per wave, then averaged)

| Part | Points | Rule |
|---|---|---|
| Outcome | 50 | `1 − damage / (4 × campaigns)`, with foothold 1 and impact 3 (or 1 if recovered) |
| Depth | 25 | Share of campaigns whose stop survives any single decisive control failing |
| Friction | 25 | Full within the accepted friction; loses a share per point over |

Reasoning-check answers are learning evidence and are kept out of the score.

**Reasoning check:** "If *Block macros* failed, what would stop *Invoice lure*?" The answer comes from actually re-running the campaign without that control. The options are the true answer, "Nothing would: it reaches the crown jewels" (when that is not the answer), and a control you deployed that is not on that path.

## 8. Debrief

Score and the three tiles. **Habits:**
- stops that hung on a single control, named
- alerts nobody acted on
- campaigns that reached the crown jewels
- waves over the friction limit

**Wave by wave:** each campaign's actual path, with the stage it stopped at, "all blocked" stages and a resilience verdict. Then the reasoning checks, the objectives, and **Retry** (the actors change preferences).

## 9. Accessibility

Everything is native buttons and a semantic table (`role="table"`, row and column headers) with plain-text cells. There is no drag and drop, so it works fully by keyboard. Live-region announcements on deploy, remove and wave results. Reduced motion (follows the OS; also a briefing option) shows wave results at once. Effect chips always pair icon, colour and word. Under 1180px the columns stack, and the board scrolls sideways inside its panel.

## 10. Integration

Same `ares:practice:*` contract (`src/defense/host.ts`), activity id `ares-defense-in-depth/the-long-week/v0.1`. Verbs: started, configured (deploy/remove), launched, answered, retried, completed. The result includes seed, attempt, summary, learning evidence and each wave record (deployed controls, runs, resilience, command log). Standalone runs keep the last result in `localStorage` (`ares-did:lastResult`).

## 11. Architecture

```
src/defense/
  data/scenario.ts   stages, techniques, controls, waves (draft, SME review)
  sim/types.ts       types
  sim/engine.ts      campaign runner, resilience, scoring, reasoning check, commands
  ui/game.ts         intel, attack-chain board, catalogue, footer
  ui/debrief.ts      debrief
  host.ts, main.ts, style.css
src/ui/practice.css  shell shared with Blast Radius
tests/defense.test.ts   21 tests: content integrity, attack model, response timing, recovery, reference plans in both variants, weak strategies, budget rules, reasoning check, replay
```

## 12. For SME review

Please mark each item ✅ / ✏️ / ❌.

- **Effect table:** every `effects` entry in `data/scenario.ts`. Key judgement calls:
  - Standard MFA does not stop adversary-in-the-middle; security keys do.
  - EDR *blocks* LSASS dumping but only *detects* PowerShell cradles and SMB service creation.
  - Allowlisting blocks SMB service execution.
  - Segmentation blocks both lateral techniques.
  - The SOC detects interactive sessions and RDP to servers.
- **Response timing:** containment one stage after detection. Too generous, or too harsh?
- **Damage model:** foothold 1, impact 3, recovered ransomware 1. Should exfiltration and ransomware differ?
- **Friction values and reasons**, especially allowlisting at 3 and security keys at 1.
- **Cost values:** relative cost only. Should EDR and the SOC cost more relative to configuration changes?
- **Adaptation model:** "first unblocked option in preference order" assumes the actor knows which options are blocked. A simplification of reconnaissance plus trial and error. Acceptable?
- **Missing controls to consider:** privileged access workstations, LAPS, email authentication (DMARC), user awareness training (deliberately left out: hard to model as a deterministic block).

## 13. Next steps

- Learner playtest: do people discover the "what if it failed" habit from Monday's reasoning check?
- An optional "budget cut" variant where one control must be retired mid-week.
- Link to the course's ATT&CK / D3FEND material once the course context hook exists.
