# Need to Know (from Fix-it bench Water Jars)

**Skill:** data classification. Every record goes into one of four jars (Public, Internal, Confidential, Restricted), and the jar decides who may open it.

**Scenario:** Meridian Freight is moving its old shared drive to a new file store; nothing moves without a label. 12 records in 3 rounds:

1. **The obvious ones**: published press release, canteen menu, payroll export, a password in a text file.
2. **People and partners**: customer rate card, staff health notes, phone list, complaints log.
3. **The tricky ones**: one sensitive slide in a harmless deck (highest item sets the label), two Internal files joined (aggregation), results after publication (labels change), "anonymised" data that still re-identifies.

**Loop:** read the record, pick one jar (one pick, keys 1–4), read the authored explanation. Hints are free and counted.

**Scoring** (`src/jars/engine.ts`): right jar 10; one jar too high 4, two too high 2, three 0; any jar too low 0. Under-labelling is the leak; over-labelling is safe but blocks work and teaches people to ignore labels. Labelling everything Restricted scores at most half; everything Internal scores less. Speed is never scored. The debrief names the learner's lean (too high or too low) and explains every miss.

**SME review needed:** level names and definitions against the learner organisation's policy; whether the joined roster/route file is Confidential or Restricted; the re-identification example.
