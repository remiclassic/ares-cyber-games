# Ares: Rule Order: design doc

**Status:** playable prototype, v0.1 (2026-10-15).
- Page: `rules.html`
- Video: `public/videos/rule-order.mp4`
- Tests: `tests/rules.test.ts` (9)

**Origin:** two Party Plaza puzzles: the Fix-it bench (turn pipe pieces to join a path) and *Tangle Lines* (swap lanterns until no strings cross). Both mean rearranging pieces until everything connects correctly. Here the pieces are firewall rules.

## Pitch and fit
A change window on Meridian Freight's core firewall. There are four tickets, each with a short rule list and a set of test packets that should get a given verdict. The firewall reads its rules top to bottom and stops at the first match. You reorder rules, or switch them off, until every packet is right, then push.

Network Defense teaches *which* rules to write. Rule Order teaches *how a firewall reads them*, which is a separate and common cause of real outages and exposures.

**Objectives:**
1. Apply first-match logic.
2. Spot shadowed rules.
3. Put the cleanup rule last, and check the default action before deleting anything.
4. Remove over-broad legacy rules (least privilege).
5. Make the smallest change that meets the intent.

## Tickets
| Ticket | Problem | Fewest changes |
|---|---|---|
| The guest Wi-Fi | A broad staff allow shadows the guest deny | 1 move |
| The early cleanup rule | A deny-everything rule sits at position 2, and this firewall's default is **allow**, so deleting the rule opens up RDP and guest access | 2 moves |
| The legacy exception | "TEMP vendor support (2019)" allows RDP from anywhere; reordering alone cannot fix it | 1 switch-off |
| Rebuild the order | A migration shuffled six rules; the jump-host exception and the guest deny are out of place | 3 moves |

The "fewest changes" figures are found by search (`minimalFix`) and checked in the tests, so the content cannot drift out of step.

## Interaction
- **Trace** any packet to see the rule that catches it; the rules it passed over dim. Tracing is free and unlimited: it is the evidence step.
- **Run all tests** at any time, also free, to see pass or fail for each packet.
- **Push to firewall** ends the ticket.

## Scoring
| Part | Points | How it is worked out |
|---|---|---|
| Correct | 70 | Share of test packets that get the right verdict |
| Tidy | 30 | Fewest possible changes ÷ the changes you made |

Changes are measured as the distance from the original rule list, not as clicks, so experimenting costs nothing. Tidy only counts once every packet is right.

## For SME review
- Rule matching is simplified to one source CIDR, one destination group and one port, with no protocol or connection state.
- Is "this firewall's default is allow" a fair setup for ticket 2? Host firewalls and some ACLs behave this way, but most perimeter firewalls default to deny.
- Should guests be denied access to internal DNS (ticket 4)?
