# Wi-Fi or Why Not

Page: `wifi.html`. Code: `src/wifi/` (`engine.ts` pure rules, `data.ts` content, `main.ts` UI, `style.css`). Tests: `tests/wifi.test.ts`. Fictional; content to be reviewed with SMEs.

## Problem

Staff who travel get two pieces of advice that both fail in practice. "Never use public Wi-Fi" is ignored, because the work still has to be sent, and it is out of date: most traffic is encrypted and most venue Wi-Fi is fine for everyday tasks. "Just use the VPN" is believed too much: a VPN protects the route across an untrusted network, and does nothing about a fake sign-in page, a link behind a pasted QR code, a file from a stranger, a USB port or a person reading the screen. What people need is the judgement in between: read the evidence in front of them, and match the route to how sensitive the task is.

## Learning objective

On a work trip, the learner can:

- pick the network the venue vouches for (sign, badge, receipt, staff) over a look-alike with a stronger signal;
- use venue Wi-Fi for low-risk tasks, and add the VPN or their own mobile data for sensitive ones;
- refuse to give a Wi-Fi page a work password or to install a certificate or profile from it;
- stop at a browser certificate warning and change the path instead of clicking through;
- say what a VPN does and does not fix;
- handle the non-network exposures of travel: charging ports, nearby-share files, onlookers;
- still deliver the work on time, with limited battery and mobile data.

## Core loop

The learner plays Noor Haddad (account manager, Brightwater Logistics) through nine stops over two days. Each stop shows:

- **Where you are**: place, time, the situation, the task with a *Low risk* or *Sensitive* tag and minutes until it is due, and "Around you" evidence (a sign, a badge, a receipt, a sticker, a neighbour).
- **Your screens** (phone mock): a Wi-Fi list, a captive portal, a system prompt, a browser warning, a document or a QR preview.
- **Three to six actions**, each showing its cost in minutes, MB and battery. Actions the resources cannot pay for are disabled with the reason.

The learner picks one action (click or `1`–`6`), reads what happened and why, and moves on (`N`). The left panel shows the trip so far, the phone battery and the mobile data left. Stop 1 is guided (coach text and the Next bar name the evidence and the action). Hints (`H`) are free in the first two stages. The last two stops have no hints.

Resources carry across stops:

- **Battery** starts at 40%, drops 7% every stop, plus 10% per hotspot use (20% for the video call) and 2% per VPN use. One chance to charge (+45%). At 0% only actions that need no phone remain.
- **Mobile data** is 80 MB for the trip, with no top-up. The hotspot costs 15, 60, 10, 10, 250 and 20 MB at the six network stops.
- **Time** is per stop: an action that takes longer than the task's "due in" arrives late.

## Why the mechanic is the skill

The same action has a different value at different stops, and only the evidence says which. "VPN on" is the best answer to the certificate warning and the conference call, a small waste in the lounge, and useless at the hotel portal, the café sticker, the taxi certificate, the charging post, the nearby-share file and the plane seat. "Hotspot" is always safe and cannot be afforded every time. "Ask staff" is right at the hotel (nothing printed says which network is real, and the desk is one call away) and wrong at the conference (the badge already answers, and the queue costs the call). To score well the learner has to do what the objective asks: read the sign and the list, notice what a page is asking for, and weigh the task.

Risk outcomes are deliberately not alarmist. Joining a look-alike network for a boarding pass, tapping Allow on a USB post or opening a stranger's file is "Exposed" (3 points, with feedback that most likely nothing happened), not a compromise. Compromises are reserved for actions that hand something over: a work password typed into a portal, a click through a certificate warning on a payments site, an installed certificate.

## How each shortcut loses

Maximum 90 (nine stops, 10 each). Pass: no compromise, at least 70% (63), and at most one task missed. Tests require every shortcut to stay under 60% (54).

| Strategy | Score | Result |
|---|---|---|
| Best play | 90/90 | 8/8 tasks, no compromise, 6% battery and 60 MB left |
| Refuse everything | 10/90 | 0/8 tasks; phone dead from the café onwards (never charged) |
| Never connect (own hotspot or nothing; own charger) | 50/90 | 4/8 tasks; data is 5 MB after the hotel contract, so the payment, agenda, call and taxi email are all missed |
| Connect to anything (most convenient option) | 15/90 | 4 compromises: credentials at the hotel and café, session at the certificate warning, device in the taxi |
| VPN fixes everything | 36/90 | 3 compromises (hotel portal, café QR, taxi certificate) and exposed at the port, seat and file; full marks at the certificate warning and the call |

Other consequences the tests pin down: one compromise fails the trip even at 80/90; spending the hotspot on the lounge, the hotel contract and the payment leaves no data for the taxi; queueing to verify at the conference makes the call late (3 points).

## Scoring vs learning evidence

**Score** (`summarize`): per stop, 10 for the task delivered on time with no avoidable risk, 7 with a small avoidable risk, 3 if exposed or late, 0 if not delivered or compromised. The file-from-a-stranger stop has no task and pays by risk alone. Speed of play and hints are not scored.

**Learning evidence** (`evidenceOf`), reported separately in the debrief and in the `ares:practice:completed` payload, never added to the score:

- uses the venue's own Wi-Fi for low-risk tasks (lounge, café);
- picks the vouched-for network, not the look-alike (every stop with a Wi-Fi list);
- gives a Wi-Fi page no work password and installs nothing from it (hotel, café, taxi);
- knows what a VPN does not fix (the six stops where the VPN option is a trap);
- stops at a certificate warning;
- handles ports, files and onlookers;
- gets the work delivered on time;
- final (two no-hint stops) and unaided (decisions made without a hint).

A learner can score moderately and still show "Not yet" on VPN limits; that is the point of keeping them apart.

**Debrief**: score and pass state, points per stage and tasks on time, one "habit" paragraph, the evidence list, then a replay of every stop: the decisive evidence as chips (✓ supports trust, ! warns), the learner's action and its outcome, the best action if different, the explanation, and battery and data after the stop. "Start again" restarts with fresh resources.

Host messages: `ares:practice:started`, `ares:practice:statement` (per stop), `ares:practice:completed`, with `activityId` `ares-wifi-or-why-not/the-tallis-trip/v0.1`.

## Content

All venues, networks and people are fictional; domains use `.example`.

| # | Stop | Task (sensitivity) | Evidence | Best | Traps |
|---|---|---|---|---|---|
| 1 | Halcyon Lounge (guided) | Boarding pass (low) | Desk sign names "Halcyon Lounge"; list has "Halcyon_Lounge_FREE", open and stronger | Join the sign's network | Look-alike (exposed); look-alike + VPN (small risk); hotspot is safe but spends data |
| 2 | Gate 12 | Charge the phone (low) | Unbranded USB post; data-access prompt; own charger; free mains socket | Own charger in the wall socket | USB + Allow, VPN + USB + Allow (exposed); "Charge only" is a small risk; not charging kills the phone later |
| 3 | Plane seat | Review contract (sensitive, offline) | Neighbour from a competitor watching; privacy filter in the sleeve | Privacy filter, dim the screen | Carry on; buy plane Wi-Fi + VPN (both exposed) |
| 4 | Plane seat | None | "Phone (37)" shares a voucher PDF; receiving set to Everyone | Decline, set Contacts only | Accept; VPN + accept (exposed) |
| 5 | Hotel Marlowe | Send contract (sensitive, 40 min) | Two hotel-named open networks; key-card sleeve says "ask at the front desk"; portal asks for work email and password | Ring the desk, join their network, VPN, send (hotspot also full marks, 60 MB) | Sign in to the portal; VPN then sign in (credentials stolen) |
| 6 | Hotel Marlowe | Approve payments (sensitive) | Certificate warning for `pay.brightwater.example`, issued by a hotel gateway | Go back, VPN on, reload, continue only if clean (hotspot also full marks) | Proceed anyway (session hijacked) |
| 7 | Juniper Café | Conference agenda (low) | Sticker pasted over the printed QR; page asks for email and password; chalkboard and receipt give the real network | Join "Juniper Cafe" with the receipt password | Scan and sign in; VPN + scan and sign in (credentials stolen) |
| 8 | Summit Hall (no hints) | Client video call (sensitive, 5 min) | Badge prints network and password; open look-alike; 15-minute desk queue; call needs 250 MB | Badge network + VPN | Look-alike (exposed); badge without VPN (small risk); queue to verify (late); hotspot unaffordable |
| 9 | RideLink taxi (no hints) | Countersigned contract (sensitive, 20 min) | Portal asks to install a "security certificate"; airport 35 minutes away | Own hotspot (20 MB) | Install; install + VPN (device trust compromised); wait (missed) |

## SME review items

1. **Public USB charging ("juice jacking").** The game treats it as a low, mostly theoretical risk: current phones ask before allowing data, confirmed incidents are rare, and "Charge only" scores 7/10. Confirm the level, the prompt wording across platforms, and whether house policy wants a stricter line.
2. **Venue Wi-Fi without a VPN for sensitive work.** The conference call on the badge network without the VPN scores 7/10 ("small avoidable risk"), on the basis that the call app and mail already use TLS. Align with the organisation's actual VPN policy (always-on, split tunnel, per-app).
3. **VPN on an evil twin.** Stop 1 scores "look-alike + VPN" 7/10: the tunnel protects traffic, but the device joined and will remember an unvouched network. Check against how the corporate VPN behaves before a captive portal clears (leak window, kill switch).
4. **Certificate warning causes.** Feedback says the usual cause on hotel Wi-Fi is the captive portal re-intercepting, sometimes interception. Confirm that framing, and that "VPN on, reload, continue only if the warning is gone" is the advice wanted (versus "stop and call the service desk"). HSTS would block the click-through on many sites; the scenario assumes a site where the browser offers it.
5. **Installed certificate plus VPN.** The game says a VPN does not undo a certificate or profile install. Strictly, a full-tunnel VPN would stop the taxi's network from intercepting during that session; the lasting issue is the trust change on the device and what else a profile can set (proxy, VPN, management). Confirm the wording, and whether managed devices block such installs anyway.
6. **Nearby-share file.** Scored "Exposed", with feedback that it is usually a nuisance and occasionally an attack. Confirm the risk level and the recommended setting name per platform ("Contacts only").
7. **Work credentials on a captive portal.** Stated as an absolute ("no hotel needs those"). Check for exceptions such as corporate guest networks or Passpoint/eduroam-style federated sign-in that staff may legitimately meet.
8. **QR codes.** The tell used is physical (a sticker over the printed code) plus the page asking for a password. Confirm that is the behaviour to teach, and whether to add "check the link preview".
9. **Shoulder surfing.** Privacy filters are assumed to be issued. Confirm, and whether policy restricts client documents in public at all.
10. **Auto-join.** Feedback says the phone "will rejoin" the look-alike network on its own. True by default on most platforms; confirm for managed devices.
11. **Numbers.** Data sizes (250 MB for a 30-minute video call, 60 MB contract), battery costs and the 80 MB roaming pass are game tuning, not measurements.
12. **Reporting.** The game does not include a "report it" action (for the sticker, the fake portal, the stolen password). Decide whether a follow-up step should be added.
