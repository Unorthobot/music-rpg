# Milestone 5 — Reception & Audience Simulation

**Baseline:** tag `m4-baseline` (commit `431268d`). M0–M4 accepted and frozen.

**Queued first, before any M5 work:** `test: cover mobile release and persistent playback` — the
mobile pass over the release screens and the mini-player's navigation behaviour, which needs its own
selectors rather than sharing the desktop spec's. No M4.1 milestone; one commit, then M4 is
permanently closed.

The chain today is Identity → Career → Connection → Collaboration → Creation → Release, and it stops
on purpose at *nobody has reacted yet*. M5 is where the world wakes up.

## The question

**What happens when your music meets the world?** Not fan counts, not engagement metrics — a system
that can explain *why* NO RECEPTION succeeded, failed, polarised people, travelled slowly, caught in
one scene, or found the wrong audience.

The causal inputs already exist and are already persisted: the artist's Sound DNA, the track's
characteristics, the release format, the release strategy and its `audienceModifiers` (written in M4
precisely for this), the producer's decisions, the career's act and scene, and the world.

## The model

Not one audience. Cohorts that hear the same record differently:

```
WORLD → AUDIENCE COHORTS → RECEPTION → FANS · REPUTATION · MOMENTUM
```

| Cohort | Weighs |
|---|---|
| Scene heads | fit, authenticity, originality |
| Casual listeners | accessibility, immediacy, memorability |
| Tastemakers | novelty, credibility, scene relevance |

A strange LEX record should be able to land as *scene heads: very positive · tastemakers: intrigued ·
casual listeners: indifferent*. That is the outcome worth simulating; "74/100, +384 fans" is not.

The strategy this creates is the point: broadly accessible is not automatically better. Reach and
Respect are different currencies, and something difficult may travel slowly while building real
credibility.

## Listeners are not fans

- **Listeners** — people consuming the music.
- **Fans** — people who have developed persistent affinity for the artist.

`4,830 listeners / 187 fans` and `740 listeners / 311 fans` are different careers, and the model must
be able to say so. Cohort tiers (casual → active → core → superfan) come later without a rewrite.

## The metrics finally move

- **Fame** — how widely known you are.
- **Respect** — how seriously relevant communities regard you.
- **Heat** — how much current attention surrounds you right now.
- **Legacy stays 0.** One Underground single does not create legacy, and the restraint is what makes
  it mean something later.

## Reception unfolds over game time

Nothing is calculated at the moment of publication. M4 established the clock; M5 uses it. Advancing
the career runs simulation ticks:

```
6 Jan  Your first track is out. Nobody knows what happens next.
7 Jan  A few people in the Johannesburg scene are passing NO RECEPTION around.   43 listeners · +6 fans
9 Jan  NO RECEPTION is finding the right people.
       — or — People listened. Most didn't come back.
       — or — The track is dividing people.
       — or — Someone with influence noticed it.
```

Trajectory, not a score.

## Deterministic first

Same world state, artist state, track, Sound DNA, release strategy, cohorts, career context and
simulation seed → same outcome, every time. Controlled uncertainty can come later; it cannot come
first, because the question we must be able to answer is *why did this record perform differently?*
rather than *what did the RNG decide?*

## World Control

The inspector must reconstruct the whole chain:

```
NO RECEPTION → track characteristics → release strategy → cohort evaluation →
initial exposure → engagement → conversion → word of mouth → career consequences
```

If a number on Home cannot be traced back through those steps, the simulation is not finished.

## The golden headless test

Built headlessly first, exactly like M4 — no reception UI until this passes:

```
KXMO: 0 fans, 0 fame, 0 respect, 0 heat
releases NO RECEPTION
→ immediately after publication: still 0 / 0 / 0 / 0
→ simulate day 1: exposure, listeners appear, cohorts react
→ simulate day 2: repeat listening, sharing, conversion
→ simulate day 3: fans may emerge; Respect / Fame / Heat may move
→ every change traceable to simulation events
```

Then Home is built around that living state, and the line on the World page —
*"How any of it is received is a later milestone"* — comes out, because the world is finally
listening.

## Out of scope

Charts, playlists, press, streaming platforms, rival artists reacting, contracts. Cohorts and
reception only.
