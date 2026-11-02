# Ares: Shadow IT: design doc

**Status:** playable prototype, v0.1 (2026-11-02).
- Page: `shadowit.html`
- Code: `src/shadowit/engine.ts` (pure rules, no DOM), `src/shadowit/data.ts` (content and inline SVG), `src/shadowit/main.ts` (UI), `src/shadowit/style.css`
- Tests: `tests/shadowit.test.ts` (14)
- Activity id: `ares-shadow-it/the-floor-walk/v0.1`

All content is fictional (Meridian Freight, `.example` addresses). **Content to be reviewed with SMEs.**

## Problem
Staff adopt tools IT has not sanctioned because those tools solve real problems: big files, slow restores, a manual report every morning. Security training usually teaches one reflex, "block it". In practice blanket blocking pushes people to the next workaround and destroys trust in IT. The opposite reflex, "it's fine, approve it", leaves customer data in places the company cannot see or control. Learners need to practise **finding** unsanctioned assets and **choosing a proportionate response**.

## Objective
By the end of a 5-minute run the learner can:
1. Spot unsanctioned tools and devices in a workplace, and tell them apart from sanctioned tools that look similar (asset awareness).
2. Reason from evidence: who owns it, what data is in it, why the team uses it, and whether a sanctioned equivalent exists.
3. Choose Block, Approve with conditions, Migrate, or Leave as is, balancing security with productivity.

## Loop
1. **Inspect.** Click an item on the office floor (SVG plan, eight teams). Evidence appears: data, owner, why the team uses it, controls/terms, and the sanctioned option. Inspected items are added to the **asset register**.
2. **Pick the deciding fact.** Click the one evidence row that matters most. Not scored; recorded as learning evidence.
3. **Decide.** Block / Approve (the button shows the concrete conditions for that item) / Migrate (shows the sanctioned target, or that none exists) / Leave as is. Keys `B` `A` `M` `L`.
4. **Consequence.** Two meters move at once: **Risk** and **Team productivity**. An explanation tied to the evidence says why; if the call was not the best, the best call and the lesson are shown. Decisions are final (otherwise learners could try every option until one turns green).
5. **Finish** whenever ready; anything undecided is left as it is.

The **first finding is guided**: only the Sales laptop (personal cloud drive) is clickable, and a coach box points at what to weigh (owner, data, existing sanctioned tool) without naming the button. The floor unlocks after that decision. The standard How to play walkthrough, header help button and live Next-step bar are used as in the other practices.

## Why the mechanic is the skill
The decision is never "is this bad?" but "what response keeps work moving and data controlled?". Every item carries a real need in its evidence ("why they use it"), so the learner must weigh the cost of removing it. The sanctioned-option row is the hinge: Migrate is only good when an equivalent exists; Approve is only good when conditions (SSO, owner, register) fix the actual problem. Decoys train asset awareness: a sanctioned file share, a licensed AI assistant and a managed video bar sit next to their shadow twins, and the evidence (owner, terms, network) is what separates them.

## How dominant strategies lose
Meters start at Risk 55 (unmanaged shadow IT exists) and Productivity 70. Pass = score ≥ 70 **and** risk ≤ 60 **and** productivity ≥ 40.

| Strategy | Score | Risk | Productivity | Result |
|---|---|---|---|---|
| Best call every time | ~97 | 0 | 83 | Pass |
| **Block everything** | 36 | 21 | 0 | Fail: productivity collapses (sanctioned tools blocked too; needed tools removed with no alternative) |
| **Approve everything** | 33 | 100 | 79 | Fail: risk past the limit (personal accounts, free AI terms, external email sends cannot be fixed by conditions) |
| Migrate everything | 56 | 12 | 40 | Fail: no equivalent for the SaaS board; disrupts sanctioned tools |
| Do nothing (leave all) | 35 | 93 | 70 | Fail: risk |

Mechanisms: blocking a needed tool costs 8–18 productivity; blocking or migrating a sanctioned tool costs 8–18 and adds risk (people return to personal tools); approving a tool whose problem is ownership, terms or destination adds 10–14 risk. Each single-action strategy is asserted to fail in `tests/shadowit.test.ts`.

## Scoring vs learning evidence
**Score** (shown during and after play): 60% decision quality (best 10 / partly right 5 / poor 0, scaled to 100) + 20% risk control (100 − final risk) + 20% final productivity. The debrief shows all components and the pass reasons.

**Learning evidence** (reported separately, never added to the score; posted in the `completed` payload as `learning`):
- items inspected of total (asset awareness);
- deciding fact matched the authored key fact (reasoning from evidence);
- sanctioned tools left alone (telling sanctioned from shadow);
- habits: blocked where a better path existed, approved what conditions cannot fix, shadow IT left in place, sanctioned tools disrupted.

A test checks that two runs with different deciding facts get identical scores but different learning evidence.

## Content
| Item | Team | Key fact | Best | Why |
|---|---|---|---|---|
| Personal cloud drive with customer contacts and contracts | Sales | Owner: personal account, shared login | Migrate | Company share already meets the need |
| Free AI chatbot with pasted source code and a connection string | Engineering | Terms: may train on inputs | Migrate | Licensed assistant gives the same help |
| Team-bought project board, no SSO, ex-contractor still has access | Marketing | No sanctioned equivalent; vendor offers SSO | Approve (SSO, owner, register) | Low-sensitivity data, real need, conditions fix the gap |
| Smart speaker on corporate Wi-Fi in the boardroom | Facilities | Always-on mic where deals are discussed | Block | No business need |
| USB NAS under a desk with unencrypted payroll copies | Finance | Data | Migrate (managed backup), wipe the box | Fix the real worry (slow restores) |
| Spreadsheet macro emailing customer data to an ex-partner | Operations | Destination | Migrate (scheduled BI report) | Keep the automation, change the destination |
| Company file share (decoy) | HR | Owner: IT, on register | Leave as is | Sensitive data ≠ shadow IT |
| Licensed AI assistant (decoy) | Support | Enterprise terms | Leave as is | Terms are the difference |
| Managed video-conference bar (decoy) | Boardroom | Owner: IT, isolated network | Leave as is | Ownership and control are the difference |

## SME review items
- Whether "Approve" for the project board should require more (DPA, vendor security questionnaire) before it counts as best.
- Smart speaker: is Block right for all organisations, or is "move to an isolated IoT network and out of the boardroom" acceptable?
- USB NAS: should Block (unplug and seize) rank equal to Migrate if the managed backup is genuinely slow?
- AI tool: confirm the remediation steps (rotate the exposed connection string, notify security) and whether the exposure should trigger an incident report rather than just a migration.
- Macro: whether sending customer data to an ex-partner should be treated as a reportable incident in the explanation.
- Meter values and the pass thresholds (risk ≤ 60, productivity ≥ 40, score ≥ 70).
- Undecided decoys currently count as correctly left alone; decide whether uninspected items should cost anything beyond the learning-evidence count.
- Wording of the four actions against the learner organisation's policy (e.g. "exception" vs "approve").
