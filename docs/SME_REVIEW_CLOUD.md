# SME review sheet — Ares: Cloud Command, "First Orbit"

**Status: every item below is a draft and is pending SME review.** The game labels its scenario content as pending review on the briefing, the situation panel, the outcome panel and the debrief.

Content lives in `src/cloud/data/mission.ts`. The rules that compute consequences live in `src/cloud/sim/rules.ts`. Please mark each item ✅ / ✏️ (edit) / ❌.

## Proposed learning objectives

1. Interpret service demand and capacity. *(Checkpoints 1 and 2)*
2. Balance availability and cost. *(Checkpoints 1 and 2)*
3. Apply least privilege. *(Checkpoint 3)*
4. Explain provider and customer responsibilities using a stated cloud service model. *(Briefing, one justification option per checkpoint, debrief)*

## Stated service model

Infrastructure as a Service. A fictional shop, Meridian Outfitters, rents virtual machines and runs its own services on them.

- Provider: data centres, power and physical security; physical servers, storage and network; the virtualisation layer.
- Customer: how many instances run and when; operating systems and applications; accounts and their permissions; the data, including backups.

Question for review: checkpoint 3 says identity and access configuration is the customer's in *every* service model. Is that wording acceptable for this course?

## Model simplifications to confirm

- **Capacity** = instances × a fixed rated load per instance (requests per second). No warm-up time, no autoscaling.
- **Dependencies**: a request passed by a service makes a fixed number of calls to each dependency. A saturated dependency fails the same share of its caller's requests. Availability = served ÷ offered at the peak.
- **Headroom**: policy asks for capacity ≥ expected peak × (1 + headroom) on every service in the request path. 10% in the surge, 25% overnight. Are those sensible teaching values?
- **Cost**: instances are billed per hour while running, busy or idle. Each window has a stated cost ceiling.
- **Access**: a task needs a fixed set of permissions. Missing any one fails the task. Anything beyond the set counts against least privilege.
- **Estimates** use the same rules, limited to what the learner has found out, and list their assumptions (for example "dependencies have spare capacity, not inspected").

## Scenario numbers (all fictional)

| Checkpoint | Start | Demand | Requirement | Leanest plan that meets everything |
|---|---|---|---|---|
| 1 Traffic surge (EU-CENTRAL) | Checkout 4 × 250 rps, Payments API 3 × 400 rps | 1,100 rps now, 1,300 rps peak | ≥ 99% served, 10% headroom, ≤ 120 credits for 2 h | Checkout 6, Payments API 4 (96 credits) |
| 2 Quiet period (US-WEST) | Storefront 8 × 300 rps | 600 rps now, 750 rps peak | ≥ 99% served, 25% headroom, ≥ 2 instances, ≤ 80 credits for 4 h | Storefront 4 (64 credits); 5 is also within every requirement |
| 3 Access review (AP-SOUTHEAST) | `svc-backup-runner` holds 7 permissions | — | Task still works; nothing beyond the task | Keep `snapshots:read`, `archive:write`, `keys:use` |

The leanest plan is found by search in `efficientPlan()`, not authored.

## Hidden facts and how learners can find them

- Checkpoint 1: Checkout calls Payments API once per request. Found with **Inspect dependency**, or revealed by the consequence of adding Checkout capacity alone.
- Checkpoint 2: the expected peak is on the "Morning forecast" chip. Without it, the estimate assumes demand stays at 600 rps.
- Checkpoint 3: the ticket omits `keys:use`. The access-log chip and **Inspect dependency** both show it.

Is it fair that the ticket is incomplete? The intent is "a ticket states the goal, not every call".

## Justification options

Each checkpoint offers true and false statements. A choice counts as justified when the statement is true **and** fits the change made (`fits` tags in the data). Please check every `text` and `feedback` string, in particular the three shared-responsibility distractors:

- "On IaaS the provider adds instances during a surge, so the safest change is none."
- "Idle instances cost nothing until traffic arrives, so there is nothing to save."
- "The provider secures accounts on its platform, so these permissions are acceptable."

## Scoring

- Learning score per checkpoint: continuity 35%, policy 30%, resource use 15%, justification 20% (`WEIGHTS` in `src/cloud/sim/mission.ts`).
- A failed access-review policy sets the mission rating to "Security objective not met" whatever the score.
- Navigation (chips collected in flight, autopilot legs, flight time) is reported separately and never enters the learning score.

## Course connection text

`connection` and `responsibility` on each checkpoint are placeholders. They must be rewritten against the real module's objectives.
