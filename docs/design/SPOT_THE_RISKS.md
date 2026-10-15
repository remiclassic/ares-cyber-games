# Ares: Spot the Risks: design doc

**Status:** playable prototype, v0.1 (2026-10-15).
- Page: `risks.html`
- Video: `public/videos/spot-the-risks.mp4`
- Tests: `tests/risks.test.ts` (6)

**Origin:** Party Plaza picture hunts, where a card shows things hidden around the island. Here the hidden things are security risks, mixed with decoys that only look risky.

## Pitch and fit
An awareness walk-round for all staff, in two illustrated scenes:
- the office at 5:40 pm on a Friday;
- a home office five minutes before a client call.

Click anything that looks wrong, name the issue, then pick the fix. Decoys (a locked screen, a confidential-waste bin, a webcam cover, a connected VPN) show what good looks like, and flagging them costs points.

The other Ares practices target technical roles; this one works for everyone in the organisation.

**Objectives:**
1. Recognise physical and social-engineering risks in context.
2. Name the actual risk rather than a cosmetic one.
3. Choose the right fix, not a workaround.
4. Avoid false alarms.

## Content

**Head office, Friday 5:40 pm**
- 7 risks: an unlocked, unattended session; a password on a sticky note; a "PAYROLL" USB stick on the floor; an admin password and network map on a whiteboard; a confidential printout left in the printer tray; a badge-only door propped open; a person without a badge after hours.
- 2 decoys: a locked screen; a locked confidential-waste bin.

**Working from home, Monday 8:55 am**
- 6 risks: deal terms on a board that will be visible on camera; a router on its default password and old firmware; a smishing text; a smart speaker next to confidential calls; a security update postponed 14 times; a contract in the household recycling.
- 2 decoys: a webcam cover; the VPN connected.

**Options for each item**
- Each risk has three issue options (one right, two plausible but wrong) and three fix options (one right, two tempting workarounds).
- Each decoy offers "Nothing wrong here" plus two plausible worries.
- Option order is shuffled, but stays the same for each item.
- Item labels are neutral ("Small object on the floor"), so they give no clues, including to screen-reader users.

## Scoring (per scene)
| Action | Points |
|---|---|
| Finding a risk | 4 |
| Naming its issue correctly | 3 |
| Choosing the right fix | 3 |
| Each false alarm | −5 |

The total is scaled to 100. Flagging everything scores at most 90, not 100, and finding every risk but naming the wrong issue scores 40 (both tested).

## Accessibility
- Every item in the scene is a focusable SVG group with the `button` role: Tab to it, then press Enter to inspect it.
- The inspector uses native buttons.
- Review mode marks items with symbols (✓, !, ✕), not colour alone.

## For SME review
- Are the fixes worded the way company policy would word them (secure print release, confidential waste, securing the router at home)?
- Is "mute it or move it out of the room during confidential calls" the right guidance for smart speakers?
- Possible extra scenes: reception desk, warehouse, travel and café.
