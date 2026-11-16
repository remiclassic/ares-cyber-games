# Least Privilege

Page: `access.html`. Code: `src/access/` (`engine.ts` pure rules, `data.ts` content, `main.ts` UI). Tests: `tests/access.test.ts`. Fictional; content to be reviewed with SMEs.

## Problem

Access is almost always granted by someone in a hurry, to someone who asked for more than they need: "copy what I have", "make me admin so I don't have to ask twice", "anything, I'll hand it back Monday". Saying yes to all of it works on the day, and the cost only shows up weeks later when the account is phished, someone slips, or a contractor's login is still live after they have gone. Saying no to all of it looks safe and simply moves the work (and the access) somewhere nobody controls. Staff who handle requests know the phrase "least privilege" but have rarely practised finding the smallest grant that still lets a specific job happen.

## Objective

Given a person, a job and a concrete task list, learners can choose the minimal sufficient access:

- grant enough for every task to work, and nothing beyond the tasks (right system, right level: View / Change / Admin);
- use the role that fits the job instead of a pile of one-off rights;
- time-limit access for temporary work (a contract, a cover period, an emergency) and make standing duties permanent;
- remove the old job's access when someone changes role;
- answer the task, not the job title or the urgency, including in a break-glass emergency.

## How this differs from Privilege Path Puzzle

`privilege.html` (`src/privilege/`) is an investigation: the access already exists, and the learner traces nested group membership on a graph to find why someone can reach something, then makes the smallest fix. Least Privilege is the decision before that: nothing is traced and there is no graph. The learner is the access desk, deciding what to GRANT for a job from a small catalogue, and then watching that decision meet a week of real events. One is "why can they?", the other is "what should they get?".

## Core loop

Six requests at Northmere Freight (`northmere.example`). For each one:

1. **Read the request** (left): who is asking and in what words, what you know from the joiner/mover/supplier record, and the list of tasks the person will actually do.
2. **Set the catalogue** (right): five to eight items, each a **role** (a bundle for a job) or a single **right** (one system at View / Change / Admin). Each row is set to *No*, *time-limited* (the window depends on the request: 30 days, 6 weeks, 4 hours, 2 weeks) or *Permanent*. Rows marked "Has it now" are access the person already holds: *Remove*, time-limit or *Keep*. Keys `1`-`8` step a row, `H` hint, `C` commit.
3. **The week plays out**: each task is ticked or blocked (with what the block cost), and each grant is tested. A grant that was needed and no more says so. A grant beyond the work meets an event (phished account, honest mistake, leaver not offboarded) with its authored blast radius. `N` for the next request.

The first request is guided: the task needs are shown as chips, a coach box explains roles, rights and levels, and the Next bar names the row to set (and tells you to back out of an over-grant). On later requests the task needs are not spelled out until after the commit: reading "look up" as View and "approve" as Change is part of the skill. Hints are free and counted until the final request, which has none. How to play walkthrough, help button and Next bar are the shared `src/ui/tutorial.ts`.

The debrief shows the score, a tile per request, the learner's dominant habit, the learning evidence, and a replay of every request: each grant, what the learner set, what it led to (the event text), and the minimum where it differed. "Start again" restarts with a fresh score.

## Why the mechanic is the skill

The learner does the real job of an access approver: translate tasks into (system, level, how long), compare that with what is on offer, and pick the smallest set that covers it. The tempting options are the ones people really ask for (the manager's role, admin "in case", a copy of a long-serving colleague), and every one of them makes all the tasks work. The game therefore cannot be won by checking that the work happens; the learner has to look at what else each grant opens. The consequence is delayed and shown as an event, the way it arrives in real life, rather than as a "wrong answer" mark.

## The rules (`engine.ts`)

- A task works if any granted item reaches its system at its level or higher.
- **Excess**: an item with any capability above what the tasks need on that system (including systems no task touches). It is tested against its authored event. A time limit does not rescue it: the phish lands in week one.
- **Linger**: an item needed only for temporary tasks but granted permanently. Tested against its own authored event (contract ended, cover ended, outage fixed).
- **Renewal**: an item needed for a standing task but time-limited. The work stops again when it expires.
- **Clutter**: a single right where a fitting role exists, a duplicate of another grant, or a grant too small to do its task.
- Held access that is no longer needed is simply excess if kept; held access that is still needed blocks a task if removed.

## Scoring, and how each shortcut loses

Each request is worth 20. Work points are 20 x (tasks working / tasks). Problem grants then subtract: excess View -3, Change -5, Admin -8; linger -5; renewal -2; clutter -2. The request score is never below 0. Because safety is scored on top of working tasks, a request where nothing works scores 0: there is no credit for "secure" access that stops the job.

Maximum 120. **Pass** = at least 80% (96), no unneeded admin granted anywhere (an "incident"), and at least 80% of all tasks working.

| Strategy | Score | Why |
|---|---|---|
| Minimal sufficient set every time | **120/120**, pass | The authored best set; the tests brute-force every possible selection and confirm it is the unique maximum for each request. |
| Grant everything, permanent | **3/120**, 6 incidents | All 16 tasks work; every request has several excess grants, including admin. |
| Grant everything, time-limited | **0/120**, 6 incidents | A time limit does not shrink an over-broad grant. |
| Grant only the admin items | **4/120**, 6 incidents | Admin covers some tasks and is punished everywhere. |
| Grant what the requester asked for | **38/120**, 5 incidents | "Copy what I have", "developer access", "admin on the finance system", "domain admin". |
| Deny everything (strip all access) | **0/120** | 0 of 16 tasks work. |
| Grant nothing new (commit untouched) | **31/120** | 6 of 16 tasks work, only through access already held; the movers keep their old roles. |
| Right scope, never time-limit, never remove | **90/120**, fail | Everything works and nothing is over-scoped, but four temporary needs linger and two old roles stay. Below the 96 pass mark. |

## Scoring vs learning evidence

The score is what the week cost. Learning evidence is reported separately in the debrief and in the `ares:practice:completed` payload (`evidence`), and never changes the score:

- five skills, each as shown / partly / not yet over the requests where it applies: grants enough for every task; grants nothing beyond the tasks; uses the fitting role instead of one-off rights; time-limits temporary work; removes old access on a role change;
- **Final**: the minimal sufficient set on the final, no-hint request;
- **Unaided**: minimal sufficient sets on requests decided without a hint. Hints are free in points and are counted here.

Speed is not scored. Host messages: `ares:practice:started`, `ares:practice:statement` (one per committed request, with the selection), `ares:practice:completed`; activity id `ares-least-privilege/the-access-desk/v0.1`.

## Content

| # | Request | The ask | Minimal sufficient set | Main traps and their events |
|---|---|---|---|---|
| 1 | **Joiner** (guided): Amara Osei, Accounts Payable Clerk | "Copy what I have" (from the Finance Manager) | Accounts Payable Clerk role, permanent | Finance Manager role (phish: self-approved payment); Payroll view (phish: salary data); Ledger admin (mistake: wrong period closed); the two single rights (clutter) |
| 2 | **Mover**: Jonas Weber, Warehouse Supervisor to Customer Service Agent | "He already has plenty of access" | Keep All staff; **remove** Warehouse Supervisor; add Customer Service Agent | Keeping the old role (mistake: reroutes a pallet from a job he has left); Helpdesk admin (mistake: deletes the queue); removing All staff blocks his timesheet |
| 3 | **Contractor**: Priya Nair, Brightloop Studio, 6 weeks | "Developer access, and live server admin in case" | Web Contractor role, **6 weeks** | Permanent (leaver: account live after the contract, reused password); Staff Developer (phish: every repository copied); Live servers admin (mistake: outage); Customer database view (leaver: data leaves with her) |
| 4 | **Manager**: Dana Kowalski, Head of Sales | "Make me admin on the CRM and the finance system. I'm a director." | Keep Sales Manager; Finance reports view, **30 days** | CRM admin, Finance Manager role, HR admin, "Executive: all systems" (phish, each with its own reach); reports view left permanent (leaver: reads unpublished figures during her notice) |
| 5 | **Break-glass**: Ravi Menon, on call, 02:10 | "Give me domain admin, anything" | Keep On-call Engineer; Order database admin, **4 hours** | Deny (300 late deliveries); Domain Administrator (phish: whole domain); Cloud owner (mistake: backup deleted); DB admin left permanent (mistake: live data wiped three weeks later); DB change (too little) |
| 6 | **Final, no hints**: Lucía Ortega, Customer Service to Billing, plus two weeks of refund cover | "Copy Tom's access, plus billing admin" | Keep All staff; **remove** Customer Service Agent; Billing Specialist, permanent; Refund approvals, **2 weeks** | Copy of Tom's access (phish: eleven years of collected access); Billing admin (mistake: shared template); old role kept (phish: fake replies to tickets); refund right left permanent (phish: refunds to attacker) |

All three event types (phished account, honest mistake, leaver not offboarded) appear. Every request has an admin option on the table. People, organisation, addresses (`.example`) and figures are invented.

## SME review items

1. **Excess is penalised equally whether time-limited or permanent.** Deliberate ("a time limit is not a substitute for scope"), but in practice time-boxing an over-broad grant does reduce exposure. Should a time-limited excess grant cost less?
2. **Time-limiting a standing duty costs 2** ("it expires and the request comes back"). Some organisations want all access to expire and be recertified. Is the penalty right, or should periodic recertification be shown as neutral or good?
3. **Roles over single rights** is scored as tidiness (-2), not as risk. Is that the right weight, and is "one-off rights are forgotten at the next move" the right explanation for the audience?
4. **Break-glass**: the model answer is admin on one system for 4 hours, logged, granted by the desk at 02:10. Real procedures vary (pre-staged sealed accounts, PAM check-out, second approver, post-incident review). Does this need a second-approver or review step, and is 4 hours a sensible window?
5. **Level vocabulary** (View / Change / Admin) and the task-to-level reading ("approve a discount" = Change; "fail over a database" = Admin). Do these match the systems the audience uses?
6. **Baseline access** is reduced to one "All staff" role with timesheets. Enough, or misleading?
7. **Penalty sizes and the pass mark** (View -3, Change -5, Admin -8, linger -5; pass 80%, no unneeded admin). In particular "right scope, never time-limited, never removed" scores 90/120 and fails: is that the intended severity?
8. **Realism of the events**: self-approved supplier payment, contractor account reused after a third-party breach, skimmer in a web page, domain admin sign-in on an infected server, deleted cloud backup, refund fraud. Check plausibility, tone and the invented figures.
9. **Separation of duties** is implied (the Finance Manager role lets one account create and approve a payment) but not taught by name. Should it be?
10. **Who may approve**: the game treats the desk as the sole decision-maker. Many organisations require the data or system owner to approve. Worth a line in the walkthrough?
