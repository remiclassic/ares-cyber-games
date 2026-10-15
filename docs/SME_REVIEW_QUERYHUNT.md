# SME review sheet — Ares: Query Hunt, Case 01 "Unusual Access"

**Status: scenario content pending SME review.** The game shows this notice on the intro, the map and the debrief.

Content lives in `src/queryhunt/data/dataset.ts` (records) and `src/queryhunt/data/case.ts` (questions, evidence cards, feedback). Please mark each item ✅ / ✏️ (edit) / ❌.

## Proposed learning objectives

1. Filter and aggregate records. *(Challenges 1 and 2)*
2. Correlate events using identifiers and time. *(Challenges 3 and 4)*
3. Interpret results accurately. *(The "explain the finding" step of every challenge)*
4. Distinguish suspicious observations from confirmed conclusions. *(Evidence cards that are conclusions are rejected; challenge 5)*
5. Support a finding with evidence. *(Challenge 5: conclusion plus cited evidence)*

The queries are SQL (SQLite dialect). Nothing in the game calls them KQL.

## The scenario

| | Dataset A | Dataset B (retry) |
|---|---|---|
| Alert period | 3 April 2024, 00:00–06:00 | 14 May 2024, 20:00–midnight |
| Account of interest | alex.chen (Engineering) | dana.okafor (Marketing) |
| Failed logins, then success | 12, then success at 02:21 | 9, then success at 22:44 |
| Source | 203.0.113.77, Singapore | 198.51.100.24, Sao Paulo |
| Device | DEV-9001, not registered | DEV-7300, not registered |
| File activity | 6 accesses, 2 downloads, `/finance/payroll` | 6 accesses, 2 downloads, `/hr/compensation` |
| Service account | svc-backup, 5 failures, never succeeds | svc-reports, 15 failures (the highest count), never succeeds |

Benign distractors in both: a forgetful user (4 failures then success, own laptop, outside the period); a traveller signing in from abroad on a registered laptop with no failures; two single typos inside the period, each followed by success on a registered device; the folder's usual reader opening the same restricted files in working hours; the account of interest signing in normally from the office the same day.

External addresses are from documentation ranges (RFC 5737). All names are invented.

## Points to confirm

- **Supported conclusion:** "Activity consistent with unauthorized use of the account. Recommend escalation: reset the credentials, contact the account owner and preserve the logs." Is this the wording and the action you want a beginner to reach?
- **Rejected conclusions:** confirmed compromise and theft (overreach); failed attempt, no action (contradicted by the success); forgotten password while travelling (assumption). Are the feedback texts accurate?
- **Evidence rule:** the conclusion needs the successful login, the unregistered device and the file access. Failed-login evidence alone returns "Repeated failed logins alone do not establish compromise." Is requiring all three right, or is the success plus one of the others enough?
- **"Not registered" device:** modelled as `devices.registered = 0`. Is an asset-inventory flag a fair stand-in for "unrecognized device" at this level?
- **Open questions listed in the debrief:** who was using the device; how the password was obtained; whether files left the device; why the owner also signed in from the office. Anything missing?
- **Simplifications:** one location string per login; no MFA, lockout or session records; timestamps without time zones; file "download" as a logged action.
- **Evidence card wording** and the "what does this result support" options for challenges 1–4.

## Mock content

"Review material" and "Continue to mission" are placeholders and must be replaced with the selected module's study material and mission.
