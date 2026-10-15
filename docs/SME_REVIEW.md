# SME review sheet — "Keep Finance Online"

All content lives in `src/data/scenario.ts`. Please mark each item ✅ / ✏️ (edit) / ❌.

## Proposed learning objectives

By the end, learners should be able to:

1. Explain how routes and dependencies affect service availability. *(Round 1)*
2. Use evidence to tell permitted activity from suspicious activity. *(Round 2)*
3. Choose a scoped access restriction instead of blocking an entire service. *(Round 2, checkpoint 1, final challenge)*
4. Explain the purpose of segmentation. *(**Not covered yet.** Planned for the next scenario.)*
5. Recognize that backup connectivity improves availability but does not establish trust. *(Round 3, checkpoint 2)*

## Model simplifications to confirm

- **Rule evaluation:** DENY rules → ALLOW rules → default deny. Real firewalls usually use ordered first-match. We picked this for beginners. Is it acceptable, or should we teach ordering?
- **Single enforcement point:** every path enters through one gateway, so backup routes inherit the policy automatically. Is that framing right for "backup routes preserve policy"?
- **Dependency:** Finance needs the Core database over *internal* links. A path back out through the gateway doesn't count.
- **Inspection:** reveals evidence only. The learner judges permitted or violation. Traffic that bypasses the Inspection Point has no evidence.
- **Legacy allow-all rule** at the start of round 2 is the realistic misconfiguration being fixed.

## Organization policy shown to learners

1. Approved suppliers may use the Finance invoice portal.
2. Staff connected through the company VPN may use the HR portal.
3. Administrative consoles may only be used from inside the internal network.
4. Any other external access is not permitted.

## Evidence text

- **Northwind Supply (203.0.113.10):** registered supplier, on the approved list, Finance invoice portal HTTPS 443, steady business-hours pattern.
- **Remote HR staff (VPN):** company VPN user j.ortiz in the HR department, HR portal HTTPS 443, signed in with MFA.
- **Unrecognized host (198.51.100.x):** on no list and outside the network. Targets the Finance admin console (SSH 22 or RDP 3389 depending on the variation). Repeated sign-ins with different usernames.

Addresses are from documentation ranges (RFC 5737).

## Mistakes and their explanations

| Mistake | Explanation shown (abridged) |
|---|---|
| Gateway → Finance shortcut | Invoices reached Finance, but Finance couldn't reach its database on Core. Services depend on other services. |
| No rule in round 2 | The unknown host reached Finance's admin console N times. Policy only permits admin consoles from inside. |
| ALLOW rule only | An ALLOW rule doesn't stop anything while allow-all is in place. |
| DENY Any → Any | You blocked all external access… a scoped rule would preserve the required service. |
| DENY Any → Finance | Also blocked Northwind Supply, which the policy approves. Narrow the rule. |
| Removed allow-all without replacing it | Approved work hit the default deny. |
| No / wrong / late backup | Finance stayed offline / the route didn't bypass the failed link / invoices were lost while unreachable. |

## Checkpoints and final challenge

See `CHECKPOINTS` and `FINAL_CHALLENGE` in `src/data/scenario.ts`. Each option has feedback text, and the options are shuffled per run.

## Mission connection

Placeholder text in `src/integration/course.ts` → `missionConnections`. **Must be rewritten against the actual selected module's mission objectives.**

---

# SME review sheet — "Ares: Cyber Dispatch"

All content lives in `src/dispatch/data/scenarios.ts` and is marked pending SME review in the game. Please mark each item ✅ / ✏️ / ❌.

## Classifications to confirm

| Shift | Report | Authored truth | Priority | Analyst needed |
|---|---|---|---|---|
| 1 | Unexpected MFA prompt | Password phished the day before; live sign-in attempt | High | Yes |
| 1 | Files will not open | Shared drive moved; announced by IT | Low | No |
| 1 | Suspicious invoice | Lookalike domain, bank change, nothing paid | Medium | Yes |
| 2 | Bank details change request | Hijacked thread, vendor record already changed, payment run Friday | Medium | Yes |
| 2 | Unexpected MFA prompt | Own tablet retrying an old password | Low | No |
| 2 | Files will not open | Ransomware on laptop and shared drive | High | Yes |

## Approved next steps to confirm against the real playbook

- MFA, unexpected prompt: deny; never approve a prompt you did not start. (Benign variant: deny, then update the stored password on the device.)
- Suspected ransomware: disconnect Wi-Fi and cable, leave the device powered on.
- Payment or bank-detail change: do not pay or reply; verify by phone using the number already on file; revert any record change.
- Relocated drive: point to the new location from the IT notice.

## Simplifications to confirm

- Only a correct next step given before the authored deadline (8 or 16 shift minutes) prevents harm; assigning an analyst alone does not.
- Is "record changed, payment not yet run" medium rather than high?
- A location shown on an MFA prompt is treated as evidence. Should the game say it is approximate?
- Handoff points with no possible evidence (account accessed, data left the company, vendor mailbox compromised) must always be marked unresolved.
