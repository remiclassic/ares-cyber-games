# Ares: Vendor Vetting: design doc

**Status:** playable prototype, v0.1 (2026-11-16).
- Page: `vendor.html`
- Code: `src/vendor/engine.ts` (pure rules, no DOM), `src/vendor/data.ts` (content), `src/vendor/main.ts` (UI), `src/vendor/style.css`
- Tests: `tests/vendor.test.ts` (24)
- Activity id: `ares-vendor-vetting/three-purchases/v0.1`

All content is fictional (Wrenfield Mutual; nine invented suppliers on `.example` domains). Audits and certificates are generic ("independent audit report", "security certificate"); no real scheme, certification body or logo is named or shown. **Content to be reviewed with SMEs.**

## Problem
Supplier reviews tend to collapse into one of four reflexes: take the cheapest bid, trust whoever shows a certificate badge, refuse anyone who has ever had a breach, or block the purchase altogether. Each fails in a different way. A certificate that excludes the product being bought, or lapsed years ago, assures nothing. A spotless record nobody can verify is weaker evidence than a disclosed breach that was fixed and re-tested. Blocking leaves the business need unmet, and it gets met some other way with no vetting. And a FAQ bot reading public pages does not deserve the scrutiny a payroll service does.

## Learning objective
After one run (about 8 minutes) the learner can:
1. Size third-party risk from the **data and access** the supplier would get, not from the product category or the price.
2. Read assurance critically: an audit report's **scope** and **date**, what a questionnaire answer can be checked against, and how a past breach was **handled**.
3. Choose a proportionate verdict: approve, approve with the one condition that closes the gap, or reject; and keep heavyweight conditions for purchases that warrant them.

## Core loop
Three purchases, three bids each.
1. **Read the brief.** What the business needs, the data the supplier gets, the access the supplier gets.
2. **Read each supplier file** (tabs, or keys `1` `2` `3`): data and access, security questionnaire, audit report, breach history, subcontractors, contract terms (breach notification, right to audit, data return).
3. **Ask.** A small pool of follow-up questions per purchase (3, 2, 3) shared across six available questions. An answer joins the file as evidence.
4. **Flag** up to 3 pieces of evidence per bid. At least one flag is needed before a verdict: the flags are the learner's stated reasons.
5. **Verdict** per supplier: Approve (`A`), Approve with a condition (`C`, then pick one of five), Reject (`R`). Verdicts can change until sign-off, because no consequence has been shown yet.
6. **Name the preferred supplier** (`P`) and **sign off**.
7. **The year plays out.** A short timeline of what happened with the signed supplier, then a card per supplier tying the verdict to the evidence (and showing the best verdict where the learner's was not).

Purchase 1 (payroll) is **guided**: the stakes are labelled and each file has a coach line pointing at what to weigh, never at a button. Purchase 2 (chatbot) has **one hint** (size the data and access first). Purchase 3 (heating and cooling contractor) has **no hints**: the stakes label is hidden and the Next bar gives procedure only. The How to play walkthrough, header help button and live Next-step bar are the shared ones from `src/ui/tutorial.ts`.

The five conditions: multi-factor sign-in (light), limit the access (light), stronger contract terms (light), current in-scope audit first (heavyweight), our own audit and penetration test (heavyweight).

## Why the mechanic is the skill
The learner never answers "is this supplier secure?". They answer "given what this supplier would hold and reach, is the evidence in this file enough, and if not, what one thing closes the gap?". Every verdict is graded per supplier against that question, and the year's outcome follows from the preferred supplier *and* the verdict it was given, so the right supplier with its gap left open still produces a worse year than the right supplier with the right condition.

The purchases are built so that the surface reading and the risk reading disagree:
- **Payroll** (high: sensitive data). The cheapest bid is all "Yes" with nothing attached. The badge holder's certificate names a different product. The best bid admits a breach, reported in 48 hours, with the fix independently tested; its one gap is closed by a light condition.
- **Chatbot** (low: public pages only). The cheapest bid has no audit at all and is a best approval. The badge holder has a sound, in-scope audit but adds a CRM connection the purchase never needed. Any heavyweight condition is a poor verdict here.
- **Heating and cooling** (high: no personal data, but standing remote access into the server-room network). The cheapest bid shares one login. One badge is three years old and lapsed; the other is current, and its holder disclosed a stolen laptop handled within a day. The best verdict limits access to approved sessions.

## How each shortcut loses
Each purchase is worth 100: 15 per supplier verdict (best 15, partly right 7, poor 0) and 55 for the year (good 55, workable 25, bad or nobody signed 0). The score is the mean of the three. **Pass = 70 or more and every business need met.** Scores below are asserted in `tests/vendor.test.ts` (inline snapshot plus a ceiling of 50 for the named shortcuts).

| Strategy | Score | Result | Why it loses |
|---|---|---|---|
| Best verdict for every supplier | **100** | Pass | Maximum; a test brute-forces every plan to confirm nothing scores higher |
| **Reject everyone** | **30** | Fail | No year points at all; three needs unmet (also fails the needs rule outright) |
| **Pick the cheapest** (reject the rest) | **41** | Fail | Bad year on payroll and on heating; only the low-risk chatbot is right |
| Approve all, sign the cheapest | 33 | Fail | Same, plus poor verdicts on the badge holders |
| **Pick whoever has a badge** (reject the rest) | **15** | Fail | Bad year in all three: out-of-scope certificate, unneeded member-data access, lapsed certificate |
| Approve all, sign the badge holder | 15 | Fail | Same |
| Never sign a supplier that admitted a breach | 41 | Fail | Lands on the unverifiable bids for payroll and heating |
| Heaviest condition on everyone, sign the dearest | 31 | Fail | Supplier walks on the low-risk purchase; delays and an open gap on the others |
| Always sign the dearest bid | 46 | Fail | Right supplier twice but gaps left open; wrong supplier on the chatbot |

The cheapest bid is deliberately the right answer on the low-risk purchase, so "never the cheapest" is not a winning rule either; and one badge holder (Fennick) is the right supplier in the final purchase, so "never the badge" fails too. A single need left unmet fails the run whatever the score (for example best play on two purchases and reject-all on the third scores 77 and does not pass).

## Scoring vs learning evidence
**Score** (shown after each sign-off and in the debrief): verdict points and year points only. The debrief shows both components, needs met, and the reasons for a fail.

**Learning evidence** (reported in its own debrief panel and in the `completed` host payload as `learning`; never added to the score):
- flags placed on deciding evidence, and suppliers for which at least one deciding fact was flagged;
- follow-up questions used, and how many surfaced a deciding clarification;
- habits: badges taken on trust, unverifiable stories accepted, well-handled breaches held against a supplier, cheapest bid signed where it went badly, known gaps left open, heavyweight conditions on the low-risk purchase, needs left unmet;
- the outcome of the final, no-hint purchase.

A test plays the same verdicts with different flags and with or without follow-up questions and checks the scores are identical while the learning evidence differs.

Host messages: `ares:practice:started`, `ares:practice:statement` (`asked`, `signed`), `ares:practice:completed`.

## Content
| Purchase | Supplier | Price / yr | Badge | Deciding evidence | Best verdict |
|---|---|---|---|---|---|
| Payroll (guided) | PayNimbus | $14,000 | none | All "Yes", nothing attached; no audit; support can open any record; shared login (follow-up) | Reject |
| | Quillmark Ledger | $22,000 | "Security certified" | Certificate scope names the accounting product; payroll module bought in, on legacy hosting | Reject |
| | Harrowgate Pay | $27,000 | none | In-scope audit 4 months old; breach 2 years ago told in 48 h, fix audited; multi-factor for customer admins off by default | Approve with condition: multi-factor sign-in |
| Chatbot (one hint) | ChatPerch | $1,200 | none | Public pages only, sandboxed, no integrations; no audit | Approve |
| | Lumenly Assist | $3,500 | none | Public pages only; in-scope audit | Approve |
| | Orbisdesk AI | $9,000 | "Enterprise certified" | Sound audit, but copies member records and tickets via a CRM link the purchase does not need | Reject (limit the access: partly right) |
| Heating and cooling (no hints) | CoolCurrent Services | $18,000 | none | Always-on link; one shared login; no notification clause | Reject |
| | Northvane Climate | $24,000 | "Certified secure since 2019" | Certificate 3 years old and lapsed; tooling changed; unaudited monitoring partner shares the link | Reject |
| | Fennick Building Systems | $29,000 | "Independently audited 2026" | In-scope audit 5 months old; stolen laptop told in 24 h, fix audited; always-on link by default, per-session on request | Approve with condition: limit the access |

Every supplier has six file sections, two follow-up questions, a graded outcome for all seven verdicts and a year timeline for the verdicts most likely to be signed.

## SME review items
- **Verdict grading for flawed suppliers under a heavyweight condition.** "Current in-scope audit first" or "our own audit" on PayNimbus, Quillmark, CoolCurrent and Northvane is graded partly right (safe, slow). Should conditional acceptance of a supplier with nothing verifiable be poor instead?
- **Harrowgate and Fennick approved outright** are partly right (a contained incident, a penetration-test finding). Confirm that severity, and whether optional multi-factor for customer admins should be a harder stop for payroll.
- **Orbisdesk.** Rejecting a well-audited supplier for over-collection is graded best and "limit the access" partly right on price grounds alone. Some organisations would accept the second as equal.
- **Northvane with limited access** is graded partly right (compensating control over an unverified supplier). Check this is a message you want.
- **Breach timings** used as "handled well" (customers told in 24–48 hours, published review, fix independently tested) and contract terms used as good practice (72-hour notification, annual right to audit, data return in 30 days with deletion confirmation) against the learner organisation's policy and applicable law.
- **Low-risk treatment.** ChatPerch (no audit, six staff) is a best approval. Confirm no minimum due diligence step is expected even for public-content services (for example a script-integrity check on the website widget).
- **Condition list.** One condition per supplier keeps the choice sharp; real approvals often carry several. Confirm the five are the right vocabulary and that "heavyweight" is a fair label for the last two.
- **Pattern risk across only three purchases:** the dearest bid is the right supplier twice, and every supplier that admits a breach is a good one. A fourth purchase with a badly handled breach and a mid-priced best bid would close both.
- **Year timelines** (months, 240 staff, 310 payslips, server-room shutdown, encrypted file servers): plausibility and tone.
- Point values, the pass mark of 70 and the rule that one unmet need fails the run.
