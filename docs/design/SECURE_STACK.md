# Secure Stack: design doc

**Status:** playable prototype, v0.1 (2026-10-15).
- Page: `stack.html`
- Video: `public/videos/secure-stack.mp4`
- Tests: `tests/stack.test.ts` (9)

**Style reference:** Remi's sticker-merge pile game (a physics pile of glossy die-cut stickers, merged by dragging one onto another, with goals in a tray at the bottom, a rising tide and a bright island look). Only the genre and feel are reused. All art is new SVG, drawn for this game.

## Pitch
Threats and defences tumble into a pile on a beach. Drag a **defence** onto the **threat it really stops**:
- MFA onto phishing;
- an offline backup onto ransomware;
- a patch onto an unpatched app;
- and so on.

A right match pops with a one-line reason. A wrong drop wobbles, and Shelby the security crab says why. New threats keep washing in, and if the pile settles above the rope, it's a breach.

**Tagline:** *Match every threat with the defence that stops it.*

## Why it is educational and not just a match game
- **The match rule is the lesson.** Tropic-style games merge twins. Here, the "twin" is a real threat → defence relationship, authored in `data.ts` with a reason for every pairing.
- **Many-to-many, like reality.** One defence stops several threats (MFA covers phishing, weak passwords and brute force), and one threat can have several defences (ransomware: backups or EDR). Island 3 says so explicitly.
- **Mistakes teach.** Every wrong drop is explained from the same table: "Password manager stops weak passwords, not phishing. Phishing needs a Report button or MFA." The messages can never disagree with the rules.
- **Stars measure understanding, not speed:**

  | Mix-ups | Stars |
  |---|---|
  | 0–1 | 3 |
  | 2–4 | 2 |
  | 5 or more | 1 |

  Speed only feeds the score and streaks.
- **Field notes** after each island list every pairing you made, with its reason, and up to four mix-ups to remember.
- **Unidentified alerts** (island 4 on) are iced grey stickers. They can't be acted on until you secure a threat next to them, which teaches "investigate before you respond". When revealed, a matching defence is added to the pile.

## Field guide
A panel beside the game on desktop, and a slide-up drawer from the 📖 button on phones (the game pauses while the drawer is open). It has three parts:
- **How to play**, with the shape key (blobs with eyes are threats, badges are defences) and why matching matters.
- **What every sticker on this island is**, with its name and one line on what it is or does. Tapping a sticker in the pile lights up its entry.
- **A match book** listing every valid pairing on the island. Each pairing starts as "? → threat" and fills in with its reason when the player makes that match.

Discoveries are saved on the device across islands. The guide explains, but leaves the pairings for the player to find.

## Islands
| # | Island | New | Goals |
|---|---|---|---|
| 1 | Inbox Inlet | phishing, weak passwords; no tide (tutorial) | 3 phishing, 3 weak passwords |
| 2 | Backup Bay | ransomware, backups, EDR; the **tide** starts (every 4.5 s) | 3 ransomware, 3 phishing, 2 weak passwords |
| 3 | Patch Point | malware, unpatched apps, patches | 3 unpatched apps, 3 malware, 2 ransomware |
| 4 | Fog Reef | rogue USB, brute force, USB control, lockout; **unidentified alerts** | 3 brute force, 3 rogue USB, 2 malware |
| 5 | Volcano Vault | data leak, encryption & DLP; faster tide (3.2 s) | 3 data leaks, 3 ransomware, 2 brute force, 2 phishing |

The pile is planned so it can always be solved: every threat in the starting pile has a defence that stops it, and the tide drops a defence for any threat left without one (tested on 29 seeds per level).

## Game feel
- A soft custom physics pile (`physics.ts`).
- Stickers lift and grow when picked up.
- Drops are forgiving: among the stickers near the drop point, a valid match wins.
- Confetti bursts, "+points" floats and a star that flies to its goal in the tray.
- "Streak!" call-outs, a wavy rope with buoys, and a red alarm border while the pile is over the line.
- Hints: three per island; each one highlights a valid pair.
- Sounds come from the shared Ares cue synthesiser.

## Art (all hand-written SVG, `art.ts`)
- **Threats** are wobbly blobs in warm colours with mischievous eyes and angry brows.
- **Defences** are rounded badges in cool colours with a sparkle.
- Both get a thick white die-cut border, a soft shadow, a radial gradient, a gloss highlight and a chunky outlined icon (hook, padlocked file, bug, "1234" key, cracked window, USB, hammer, leaking folder; phone with a tick, flag, vault, cloud backup, shield, plaster, plug lock, stopwatch, locked document).
- Shape tells threats from defences as well as colour.
- Also drawn: the beach backdrop (sea, sun, island lighthouse with a shield), Shelby the crab holding a shield, and the reward star.

## Accessibility
- Pointer and touch first.
- Keyboard play on the pile: arrow keys move a cursor, Space picks a sticker up, Space again drops it on the target.
- Tapping a sticker reads out its name and what it is; all messages also go to a live region.
- Reduced motion turns off particles and animations.
- The look is deliberately bright and casual, unlike the dark Ares shell, for broad all-staff audiences.

## Integration
Same `ares:practice:*` messages, with activity id `ares-secure-stack/islands/v0.1`. Each finished island posts its stars, score, matches and mix-ups.

## For SME review
- **The pairing table** in `data.ts`. The judgement calls:
  - MFA counters phishing (it does for credential phishing, but not for adversary-in-the-middle; see Defense in Depth).
  - EDR counters rogue USB.
  - A patch counters malware.
- **The one-line reasons**: accurate, but simple enough for all staff?
- **Should a defence be "used up"** by a match? Today both stickers vanish, which is a game convention: in reality one control covers many threats.
