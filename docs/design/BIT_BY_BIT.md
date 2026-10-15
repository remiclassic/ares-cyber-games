# Ares: Bit by Bit: design doc

**Status:** playable prototype, v0.1 (2026-10-15).
- Page: `bits.html`
- Video: `public/videos/bit-by-bit.mp4`
- Tests: `tests/bits.test.ts` (8)

**Origin:** Party Plaza *Bolt Buddies*: a robot needs a part with N dots, and you drop 1-, 2- and 5-dot gears until the dots match. Here the gears are the eight bits of an octet (128 … 1).

## Pitch and fit
Network maths is where many adult learners stall. Bit by Bit makes it hands-on: every answer is built by switching eight gears on and off. A live readout shows the binary, the decimal, and, for masks, the prefix and the number of usable hosts. It is untimed, every wrong check explains what is off, and hints are free. The game gives Ares a foundation module that Network Defense, Blast Radius and Rule Order all build on.

**Objectives:**
1. Read and build binary octets.
2. Build a subnet mask from a prefix.
3. Size the smallest subnet that fits a requirement.
4. Find the network address of a host named in an alert, using AND.

## Content: "The New Depot" (10.20.4.0/24, Meridian Freight)
| Stage | Tasks |
|---|---|
| Binary | Build 192, 37 and 172 |
| Masks | Build the last octet of /26 and /28 |
| Sizing | 50 scanners → /26 · harbour link (2 devices) → /30 · office VLAN (100 devices) → /25 |
| Which network? | 10.20.4.77/26 → .64 · 10.20.4.200/27 → .192 |

Every answer is computed from the task rather than typed in by hand (`src/bits/engine.ts`), so the content cannot disagree with itself.

## Rules and feedback
- **Masks** must be ones on the left with no gaps. A mask with a gap is called out as "not a valid mask".
- **Sizing** is right only for the *smallest* subnet that fits:
  - Too small: the feedback says how many usable hosts it gives.
  - Too big: "fits, but wastes addresses".
  - The security angle: smaller segments limit what a compromised device can reach.
- **Network tasks** show the address row above the mask row, and the learner builds the AND result below them.

## Scoring
| Result on a task | Points |
|---|---|
| Right on the first check | 10 |
| Right on the second check | 6 |
| Right after that | 3 |
| Answer shown | 0 |

The total is out of 100. Hints are counted and reported, but never deducted.

## Accessibility
- The gears are native toggle buttons (`aria-pressed`).
- Keys: `1`–`8` toggle a gear, Enter checks, `H` gives a hint, `N` moves on.
- The readout is plain text, and feedback is announced in a live region.

## For SME review
- Is "usable hosts = 2^h − 2" the right default to teach? /31 point-to-point links (RFC 3021) are deliberately left out.
- Should sizing include room for growth (for example, 50 devices → /25)?
- Do the depot segment names and sizes feel realistic?
