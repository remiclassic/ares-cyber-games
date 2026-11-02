# Phishing Speed Drill: pitch

Draft for presenting to the team, following Eric's notes from the Oct 22 1:1. Written to be said out loud. Speaker notes are at the end.

---

## The story

Most breaches don't start with someone breaking in. They start with someone being let in. An email shows up on a busy morning: payroll needs you to confirm your account, a supplier has new bank details, benefits enrolment closes today. Someone clicks, because it looked normal and they were in a hurry.

We already teach the theory. A learner can tell you what phishing is and list the warning signs. What they don't get much of is practice making the call, with a full inbox, a bit of time pressure, and messages that aren't obviously fake.

That's the gap Phishing Speed Drill fills. It's three to five minutes. You're covering the Ares operations inbox. Messages come in, you look at the sender, the link and the request, pick the clues that matter, and decide: **report it, mark it safe, or check another way first.**

## Why people need it

- **The skill decays.** Annual awareness training fades within weeks. A short drill between modules keeps the habit fresh.
- **Real phishing isn't obvious.** Half the drill is legitimate mail, and some messages can't be judged from the inbox at all. People learn that "report everything" is also a failure, because it buries the security team and teaches nothing.
- **It builds a habit, not a quiz score.** Every decision gets feedback tied to the exact clue: the look-alike domain, the reply-to that doesn't match, the pressure in the wording. The debrief names habits too, like "you skipped verification twice."

## Where it fits in the course

Ares already has the core learning: the lessons and the range missions. This drill is the reinforcement layer around them.

1. **Before the mission.** The lesson covers social engineering and email indicators.
2. **Between modules.** The drill turns that knowledge into a decision, in a few minutes with no range needed. This is the reinforcement step: retrieval and practice spaced out from the lesson, which is what makes learning stick.
3. **After the mission.** The debrief connects back: "On the range you investigated a phishing foothold. This is the moment that started it."

It also works on its own as a warm-up, a refresher, or a sales demo that runs in any browser.

## What we're training

- Read the sender and the reply-to, not just the display name.
- Hover before you click: where does the link actually go?
- Notice the request (money, credentials, urgency) and the pressure around it.
- Know when the right answer is "verify through another channel," for example calling the colleague or using the intranet.

## What changes for the Ares version (to do)

- Replace "Acme" with Ares. The inbox becomes the Ares operations inbox, and the fictional company becomes an Ares-world organisation.
- Change the email addresses to match. Staff mail, the intranet and the helpdesk are listed in the in-game "addresses" panel and used across all 8 messages. Keep the reserved `.example` domains so no real company is imitated.
- Look-alike domains (for example `acme-payrol1`) need Ares equivalents that are just as subtle.

## Reference check

- **Content:** 8 fictional messages in 3 batches: 3 phishing, 3 legitimate, 2 that need verification. The first is guided and untimed. All addresses use `.example`.
- **Scoring:** best response 100, plus 20 per relevant clue, a streak bonus, and up to 20 for speed, but only after a correct decision. Reporting, allowing or verifying everything stays below 60% of a perfect run.
- **Outside reference:** the "classify, then walk through the clues" feedback pattern comes from the open-source Spot-The-Phish project. Its messages and brand images were not used; the inbox, evidence picking, verify option, scoring and progression are ours.
- **Status:** the content is a draft and needs SME review before anything goes to learners.

## Open questions for the team

- Which course and module would host it first?
- Should results feed anything in the platform, or stay as practice only?
- Who signs off on the scenario content?

---

## Speaker notes (2 minutes)

> "Quick one. Most breaches start with someone being let in, not someone breaking in. We teach people what phishing is, but we don't give them many reps at actually making the call.
>
> This is Phishing Speed Drill. Three to five minutes. You're covering the Ares ops inbox. Each message, you look at the sender, the link, the ask, and you decide: report, safe, or check another way. Half of it is real mail, so reporting everything doesn't win.
>
> Where it fits: lesson first, then this between modules to lock the habit in, then the range mission. It's the reinforcement piece. No range, runs in a browser.
>
> What I need from you: which course should it go in first, and who can review the content. I'll swap Acme for Ares and update the addresses next.
>
> Happy to let you play it right now: it's three minutes."

Live link: https://remiclassic.github.io/ares-cyber-games/phishing.html
