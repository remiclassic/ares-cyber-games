# Backup or Bust

**Skill:** backup planning: matching protection to each system under a budget. Page: `backup.html`. Rules: `src/backup/sim.ts`. Content: `src/backup/data.ts`. Tests: `tests/backup.test.ts`.

The organisation, its systems, costs and incidents are fictional. **Content to be reviewed with SMEs.**

## Problem

Small organisations usually have "a backup", and find out what that means on the day they need it. The common failures are not exotic: the copy sat on the same machine or on a share the ransomware could reach; it ran weekly on data that changes every minute; it lived in the same cloud account that got locked; or it had never once been restored and would not load. People new to the topic treat backup as a yes/no switch, and when given money they spread it evenly or buy the biggest option for whatever feels important.

## Learning objective

Given a set of systems, a fixed budget and the year's known risks, the learner chooses for each system a backup frequency, a place for the copy and whether to test a restore, so that:

- the copy is somewhere the likely incident cannot reach (the "1" in 3-2-1);
- the frequency fits how fast the data changes (data lost, RPO);
- the restore is fast enough for how critical the system is (time down, RTO);
- test restores go where an unproven copy would be fatal (live databases, critical systems);
- nothing is spent on systems with nothing to lose.

They can say for any system why its copy survived or did not, in those terms.

## Core loop (about 5 minutes)

Larkmoor Veterinary Practice, three years. Each year:

1. **Read** the risk register (what is likely this year) and the system cards. Each card has four chips with symbols as well as colour: criticality (◆), how fast it changes (↻), on site or hosted in the cloud account, live database or plain files.
2. **Plan.** Per system: how often (none / weekly / daily / hourly), where the copy lives (same server / network share / cloud / offline-immutable), test restore (yes / no). A budget meter updates on every click. Going over budget is allowed while rearranging; locking the plan is not.
3. **Lock the plan.** The incident is revealed and every system plays out: was the backup usable, data lost against what it can stand, time down against its deadline, a plain-language reason, and the reference choice with its reasoning.

| Year | Mode | Incident | Teaches |
| --- | --- | --- | --- |
| 1 · The warning (4 systems, budget 19) | **Guided**: coach note, a "Needs" line on every card, the risk named outright | Ransomware | An attached copy (same server, network share) is not a backup. Frequency follows the data. Test the live databases. |
| 2 · Three small disasters (6 systems, budget 18) | **Hints**: one free, counted hint reveals the "Needs" lines and what each risk reaches | Failed disk; accidental delete found three weeks later; cloud account lockout | Different failures reach different copies. The share is fine for a dead disk, useless for a late-found delete (7 days of history). A cloud copy of a hosted system dies with the account. One system needs no backup at all. |
| 3 · The bad week (7 systems, budget 35) | **Final**: no coach, no "Needs" lines, no hint | Ransomware with a stolen admin login that also locks the cloud account | Transfer: only the offline / immutable copy is out of reach, it is the dearest and slowest, so frequency and tests must be rationed precisely. A critical system on a slow copy only makes its deadline if the restore has been practised. |

Then the **debrief**: game score per year, learning evidence in its own panel, a one-line habit, a **replay** table per year (system, needs, what you chose, result, what the incident did to that choice, reference plan), the 3-2-1 rule in one sentence, and "Start again".

## Why the mechanic is the skill

The learner's only actions are the three decisions a real backup plan consists of, made per system, against a budget that cannot cover everything. There is no quiz and no recall: the incident is the feedback, and it speaks in the terms the job uses (usable or not, data lost, time down). The risk register stands in for a threat assessment, so the right location is reasoned ("what could reach this copy?"), not guessed. Speed is never scored.

## The model

Costs (budget units): weekly 1, daily 2, hourly 4; same server +0, network share +1, cloud +2, offline / immutable +3; test restore +1. No backup costs 0.

| Copy lives | Restore takes (tested) | Reached by |
| --- | --- | --- |
| Same server | 1 h | every incident |
| Network share | 2 h | ransomware, late-found delete (7 days of history), takeover |
| Cloud | 4 h | cloud lockout, takeover |
| Offline / immutable | 6 h | nothing |

- **Usable?** No backup, or a copy the incident reaches: lost. An **untested copy of a live database**: lost (it would not load). 
- **Data lost** = the gap between backups (1 h / 1 day / 1 week), against what the system can stand: changes all day 1 h, changes daily 1 day, changes rarely 1 week.
- **Time down** = the location's restore time, **doubled if the restore was never tested**, against a deadline by criticality: critical 6 h, important 12 h, low 3 days.
- A **rebuildable** system (the waiting room display PC) is reinstalled from an image whatever the plan; money spent on it is reported as wasted.

Per system: 0 if nothing came back; otherwise 40 for a usable copy, +30 for data loss within tolerance (15 if one step too coarse), +30 for downtime within the deadline (15 if within twice the deadline). The year's score is the criticality-weighted average, 0-100.

The **reference plan** is, per system, the cheapest choice that scores 100 against what actually hits it. Content is authored so that choice is unique (tested), the year-2 and year-3 budgets equal the reference plan's cost exactly and year 1 allows one spare unit (tested), and no affordable plan beats it (tested by exhaustive search).

This is a teaching simplification. Real restore times, retention and costs vary widely; see the SME items.

## How each shortcut loses

Scores are per year / total out of 300, from `tests/backup.test.ts`.

| Strategy | Year 1 | Year 2 | Year 3 | Total | Why |
| --- | --- | --- | --- | --- | --- |
| Reference plan | 100 | 100 | 100 | **300** | Spends 18/19, 18/18, 35/35. Nothing lost. |
| **Back up everything at maximum** (hourly, offline, tested) | n/a | n/a | n/a | **cannot be played** | Costs 32, 48 and 56 against budgets of 19, 18 and 35. "Lock the plan" is disabled while over budget. |
| **Cheapest everywhere** (weekly to the same server, or nothing) | 0 | 9 | 7 | **16** | Every incident reaches the same server. The only points are the rebuildable display PC. 15 systems lost. |
| **Every copy on the network share** (right frequency, right tests) | 0 | 82 | 7 | **89** | Ransomware encrypts the share in years 1 and 3. In year 2 the share survives the disk and the lockout but not the late-found delete. 11 systems lost. |
| **Skip every test restore** (right place, right frequency) | 38 | 55 | 61 | **154** | Both live databases fail to load every year (6 systems lost), and in year 3 the critical booking system misses its deadline. Loses in every year, not just once. |
| Cloud for everything | 100 | 73 (and over budget) | 7 | n/a | Right in year 1 only: the lockout and the takeover both reach the cloud account. |
| Same daily cloud backup for everything, critical first | 38 | 27 | 7 | 72 | No tests, wrong frequency at both ends, wrong place twice. |

Hints are free and counted, so there is nothing to farm, and nothing is timed.

## Scoring vs learning evidence

- **Game score** (shown during play and in the debrief's first panel): recovery per year, 0-100, total out of 300, plus systems lost for good.
- **Learning evidence** (its own debrief panel and the `ares:practice:completed` payload; never mixed into the score), counted over the 15 systems that need a backup:
  - copies out of reach of the incident (x/15);
  - frequency that fits the data (x/15);
  - test restores bought where the reference plan needs one (x/7);
  - systems fully recovered in the final, no-hint year (x/7);
  - budget wasted on systems with nothing to lose;
  - hints used.
  
  Evidence is taken from the first run. "Start again" resets the score; the evidence shown and posted stays from the first run and the retry is tagged with its attempt number.

Host messages: `ares:practice:started`, `ares:practice:statement` (one per locked plan, with the full plan), `ares:practice:completed`. Activity id `ares-backup-or-bust/three-years-at-larkmoor/v0.1`.

## Content list

Systems (criticality · change rate · where it lives · kind):

- Patient records database: critical · changes all day · on site · live database.
- Online booking (year 3): critical · changes all day · hosted · plain files (exports).
- Shared drive: important · changes daily · on site · plain files.
- Accounts system: important · changes rarely (weekly batch) · on site · live database.
- Staff email (years 2, 3): important · changes daily · hosted · plain files.
- Website (year 2): low · changes rarely · hosted · plain files.
- Lab PC (years 1, 3): low · changes rarely · on site · plain files.
- Waiting room display PC (years 2, 3): low · rebuilt from an image; needs nothing.

Reference plans:

- Year 1 (ransomware): patients hourly/cloud/tested (7); shared drive daily/cloud (4); accounts weekly/cloud/tested (4); lab PC weekly/cloud (3). Total 18 of 19.
- Year 2: patients (disk) hourly/share/tested (6); accounts (disk) weekly/share/tested (3); shared drive (late delete) daily/cloud (4); email (lockout) daily/share (3); website (lockout) weekly/share (2); display PC none. Total 18 of 18.
- Year 3 (takeover): patients hourly/offline/tested (8); booking hourly/offline/tested (8); shared drive daily/offline (5); accounts weekly/offline/tested (5); email daily/offline (5); lab PC weekly/offline (4); display PC none. Total 35 of 35.

## SME review items

1. **One copy per system.** The game models a single backup copy per system and teaches 3-2-1 as "one copy the disaster cannot reach", stating the full rule in the debrief. Is that an acceptable simplification, or should a second copy be a purchasable option?
2. **Untested live database = unusable.** Deterministic for a stable lesson. Real failure rates are lower than 100%; is the message ("an untested backup is not a backup") worth the overstatement? Is "live database" versus "plain files" the right plain-language split (application-consistent versus crash-consistent)?
3. **Untested restores take twice as long.** Plausible as a rule of thumb?
4. **Restore times and deadlines** (1/2/4/6 h; 6 h/12 h/3 days). In particular that offline / immutable is the slowest; modern immutable object storage can restore as fast as any cloud copy.
5. **"Offline / immutable" as one option.** Tape or rotated disks and immutable cloud storage are different things with different costs and failure modes. Split them?
6. **Network share keeps 7 days; cloud keeps 90.** Retention is fixed by location here. Real retention is a separate setting; should it be a fourth choice in a later variant?
7. **Cloud lockout takes every cloud copy.** Assumes one cloud account for hosted apps and backups. A separate backup provider would survive; is the "one account, one point of failure" lesson stated fairly? Is exporting hosted email to an on-site share a realistic small-practice answer in year 2?
8. **Takeover scenario.** Attackers with an admin login locking or deleting cloud backups: confirm it is a fair final scenario and that the risk register gives enough to infer it.
9. **Rebuildable PC needs no backup.** Confirm the framing (the image itself must exist somewhere).
10. **Cost ratios** (hourly 4 versus daily 2; offline +3) and the vocabulary: "budget units", "Critical / Important / Low", "can stand losing" for RPO and "back within" for RTO. Should RPO and RTO be named for this audience?
11. **Veterinary practice setting.** Any regulated-data implications the fiction should avoid or mention.
