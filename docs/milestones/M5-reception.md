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

## Two rules that bound the whole milestone

**1. The modifiers are the handoff contract.** M5 *consumes* `releases.audience_modifiers` (and the
copy carried in the `release.published` payload). It must never re-read the release strategy and
independently derive another set. One source of truth, written where the decision was made, read
where the consequence happens — otherwise the recorded-not-applied discipline M4 held quietly
becomes two competing derivations.

**2. The simulator produces facts; the narrative layer explains them.** The simulation establishes
that 87 scene-head exposures produced 31 engaged listeners, 9 fan conversions and positive Respect
pressure. A later narrative system turns that into *"NO RECEPTION is getting passed around the
scene."* Never the reverse: generated prose must not decide a track is gaining traction and have
numbers manufactured to match it. Prose is a reading of the simulation, never an input to it.

This makes the full architecture:

```
creative decisions → track → release decisions → published release →
stored audience modifiers → simulation ticks → reception events →
audience/career projections → player-facing consequences
```

Reception is **eventful, not merely numerical**: exposure happened, engagement happened, conversion
happened, word-of-mouth happened. Every career number is a projection of that history, which is what
lets World Control reconstruct it and what stops Home asserting a figure it cannot justify.

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

## Sequence

M4 is frozen at tag `m4-final` (commit `40d2439`). The headless sequence, in order:

1. **Audience primitives** — cohort definitions, artist audience projection, listener/fan
   separation, release-performance state.
2. **Reception event vocabulary** — exposure, engagement, conversion, word-of-mouth, metric
   pressure. Named before anything emits them, so the log is designed rather than accumulated.
3. **Deterministic simulator** — consumes the published release and the already-recorded M4
   modifiers. No strategy re-derivation (see rule 1).
4. **Game-time ticks** — day 1, day 2, day 3 progression.
5. **Career projection updates** — fans, listeners, Fame, Respect, Heat. Legacy untouched.
6. **Explainability output** — World Control reconstructs every number from events.
7. **Golden test** — same seed and state produce the same three-day outcome, and a changed input
   produces an explainably *different* trajectory. Both halves matter: determinism alone would be
   satisfied by a simulator that ignores its inputs.

Then: **inspect the actual simulated three-day output** before designing anything. That output
decides what the reception surfaces need to communicate. Only after that, the M5 UI.

Inspecting first is not a formality. Designing a dashboard before seeing what the simulation
actually produces is how a game acquires screens nobody needed.

## The line to keep pinned

> **Facts first. Narrative second.**

If the simulator can explain why 43 people heard the track, why 17 engaged, why 6 became fans, and
why Respect moved while Fame barely did, the interface has something real to communicate.

## What the suite already assumes

The E2E collision that produced `LOW SIGNAL` established it in practice: **careers are isolated,
world activity is shared.** Two careers releasing into Johannesburg both appear in its feed. That is
the environment the simulator operates in, and cohorts belong to the world rather than to a career.

## Out of scope

Charts, playlists, press, streaming platforms, rival artists reacting, contracts. Cohorts and
reception only.
