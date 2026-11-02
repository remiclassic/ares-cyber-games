# Something to do while the range spins up

Eric's question (Oct 29): is there a really small, unobtrusive thing people could do while waiting for a range? It doesn't need graphics; a short quiz or some history of real attacks would do. Keep it light, since it may not fit the platform.

## Constraints

- **Interruptible.** The range is ready whenever it's ready, so play has to stop cleanly at any moment with nothing lost and no "are you sure?"
- **Short.** Each round takes 15–60 seconds. Range start-up varies, so the content has to loop or chain.
- **Never in the way.** It lives inside the existing waiting screen. When the range is ready, the "Enter mission" button wins.
- **Cheap to build.** Text and a little layout, no new art pipeline. Content is just data.
- **Related to what's coming.** Where possible, it primes the mission the learner is about to start.

## Options

| Option | What it is | Effort | Notes |
|---|---|---|---|
| **A. This day in cyber history** | One card per wait: a real incident in 3 sentences (what happened, how it got in, what would have stopped it). Tap for the next card. | Very low | Zero interaction cost, and good for "unobtrusive." Facts need sourcing and SME review. |
| **B. 60-second quiz** | 3 quick questions tagged to the upcoming mission's topic, with the answer explained in one line. | Low | Primes the mission. Reuses existing module content and knowledge checks. |
| **C. One-screen sort** | A single round of Need to Know (sort a record into Public, Internal, Confidential or Restricted) or of Phishing Speed Drill (one message: report, safe or verify). | Low–medium | Uses games we already have, trimmed to one decision. The most "game" of the options while still tiny. |
| **D. Spot the flaw** | One log line, email header or firewall rule with one thing wrong. Tap it. | Medium | Very close to analyst work, but needs authored content per topic. |

## Recommendation

Start with **A + C behind one tile**: "While you wait: a 30-second drill or a story from cyber history."

- **A** costs almost nothing and suits anyone who just wants to watch the progress bar.
- **C** reuses Need to Know and Phishing Speed Drill, so no new game design is needed: just a "single round" mode that stops cleanly.
- Both are static content, so they can ship as a small embed even if deeper platform integration isn't possible yet.

**B** can come next if content teams can tag questions to missions.

## Smallest test

Mock the waiting screen with the tile. Run it with 3–5 people during real range start-ups, and note whether they used it, whether it annoyed them, and whether they remembered the card or the question. Then decide whether it's worth building.

## Questions for Eric

- How long is the typical range start-up today? That sets the content length.
- Is there an existing waiting screen we could embed into, or would this need platform work?
- Does history content need SME sign-off, or is a light editorial review enough?
