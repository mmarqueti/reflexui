# Writing good questions

System One models read your words literally. These rules come from TypeSafe's guidance and
from the jaggedness reported by early users.

## Do

- **Describe situations in rubric levels.** "Broken feature with a workaround" works;
  "moderately severe" does not.
- **One dimension per score.** Split "relevant and urgent" into two questions, or pick one.
- **Compute first.** Send "cancellations: 6.1%, 2.3x the 28-day average", not raw orders.
- **Pre-compute relative dates.** "2 days ago", not a timestamp.
- **Filter context.** Only the signals that the questions in this call need.
- **Keep a catch-all.** In `choice`, add an option with `null` description (e.g. `none`).

## Avoid

- Arithmetic, counting, comparing numbers or colors inside the model.
- Double negatives and multi-hop references ("the opposite of the area that was not...").
- Dumping full histories into `state`.
- Treating confidence as accuracy. Calibrate thresholds with replay on labeled data.

## Limits to keep in mind (Jev)

| Limit | Value |
| --- | --- |
| Choice options | up to 255 |
| Score levels | 2 to 10 |
| Input | text only |
| Output | typed answers, no prose |
