# Milestone 8 — Battles

**Baseline:** tag `m7-final` (commit `b25585c`). The world now has identity,
creation, releases, an audience that reacts, relationships, crew, opportunities,
scheduling, second sessions and careers that visibly diverge. M8 adds
competition to a world that already has stakes.

This is the headless brief. **No battle interface is built in this milestone.**

## The question

> Can two artists meet, be judged, and have the result mean something — where
> the meaning comes from what each of them actually did, and can be explained
> afterwards without anybody having decided who should win?

## The framing

> **Battles are competitive career events, not mandatory combat.**

A battle is not a minigame bolted to the side of the career. It is a thing that
happens *in* the career: somebody challenges you, on a date, in a room, in front
of a crowd, for reasons that already exist in the world — and afterwards the
scene knows about it.

Two consequences of that framing bind the whole milestone.

**M8 consumes the world rather than sitting beside it.** A challenge arrives
through the Opportunity Director, because that is what the world already uses to
put something in front of a player. It lands on the Calendar, because that is
where commitments live. It moves relationships through M6's derivation and
standing through M5's pressure model, because those already price consequences.
Nothing here gets a private economy.

**Nothing is compulsory.** A career that never battles is a career that chose
not to, and the interface must never imply otherwise. Declining is a decision
with a consequence — a rival who was refused is a rival who remembers — not a
blocked path.

## The chain

```
challenge          ← the director, on a day advance. Never a render.
  ↓
accept / decline   ← a player decision, with a real cost either way
  ↓
scout              ← what is knowable about them, from what the world recorded
  ↓
strategy           ← the angle. Declared before preparation, not after
  ↓
prepare            ← spend something scarce: time, money, or both
  ↓
submit             ← the performance becomes a fact
  ↓
judging            ← three judges, deterministic, independently reasoned
  ↓
result             ← 2–1 is a real result, not a rounding of one number
  ↓
public world fact  ← the scene saw it
  ↓
consequences       ← relationships, standing, and history
```

Two properties of that chain are acceptance criteria rather than implementation
detail, both inherited:

- **Time creates, screens reveal.** A challenge exists because a day passed. No
  render may create, schedule, judge or resolve a battle.
- **Facts before prose.** The judges establish what happened. Narrative reads
  it back afterwards and may never be the thing that decides. A battle result
  produced by a sentence is not a result.

## What already exists

More than is obvious, and most of it was built for this without saying so.

| Primitive | State |
|---|---|
| `battles` table | **A stub from M1 hardening.** `challenger_id` / `opponent_id` are bare `text` with no foreign keys; there is no scene, no stakes, no rounds, no judging, no game time, no idempotency. It exists so `counters.battles` could honestly read zero. |
| `battleIQ` skill | Real, on every artist, and already biased by archetype, traits and discovery answers. |
| `BATTLE_BORN` trait | Real, and inferred from `competitiveness >= 70`. |
| `rivalry` dimension | **Declared and never moved.** A column on `relationships`, a described state in `describe.ts` — and no interaction in `derive.ts` touches it. |
| `RIVAL` relationship kind | **Declared and never assigned.** `syncCareerRelationships` hardcodes `CREATIVE_PARTNER`. |
| `CREATIVE_SESSION_PURPOSES` | Already contains `BATTLE` and `FREESTYLE`. Never used. |
| Opportunity Director | Complete, proven, and extensible by adding a candidate type. |
| Relationship derivation | Complete. Reads canonical history; never invents an interaction. |
| Metric pressure (M5) | Complete. Fame is breadth, Respect is engagement weighted by whose, Heat is movement. |
| Audience cohorts | Three populations with real preferences, tolerances and scene concentrations. The audience judge should read these. |
| Calendar, events, World | Complete. `LOCAL_PUBLIC` visibility already drives the World feed. |
| Player/internal boundary | Established in M7 and non-negotiable here. |

## What is missing

Named honestly, because three of these are content gaps that will masquerade as
engine gaps if they are not called out first.

1. **There is nobody to battle.** `characterSeeds` are a connector, three
   producers and four promoters. `candidateSeeds` are group-member candidates.
   The world contains no rival artist, and `CHARACTER_ROLES` includes `ARTIST`
   only nominally. **M8's first content task is seeding real opponents** — with
   skills, psychology, a scene, a reputation and a reason to care.
2. **Rivalry is inert.** The dimension and the kind both exist and nothing
   produces either. A battle is the interaction that should.
3. **The `battles` table cannot hold a battle.** It is an M1 spine, and M8 must
   do to it what M7's migration did to `opportunities`: keep the row, add the
   lifetime, the reasoning and the identity.
4. **No performance representation.** A track has versions, briefs and
   decisions. A verse has nothing.
5. **No `BATTLE` opportunity type and no `BATTLE` calendar type.**

## Answering M7's test for a new opportunity type

M7 closed by setting the bar for anything that arrives later:

> The test for any future opportunity type is not "where does this go in the
> mission list", but **"who would tell the player, and where would the
> consequence live"**.

- **Who tells them.** The challenger, by name, in their own thread — a rival
  artist, not a system. Or a promoter, when the battle is a night on a bill.
- **Where the consequence lives.** The Calendar until it happens, the World
  afterwards, the Career story permanently, and the relationship with the person
  on the other side of it.

Both have answers, so the type is ready.

## Judging

The most important design decision in the milestone, and the one most likely to
be quietly ruined by convenience.

**There is no quality score.** A single number that decides who won would make
every battle the same battle with different inputs, and it would make the three
judges decorative. Each judge answers a different question, from different
inputs, and is capable of reaching a different answer.

| Judge | The question it answers | Reads |
|---|---|---|
| **Technical** | Was this well made? | Writing, flow, structure, originality, rebuttal. Skills, and what the performance actually contained. |
| **Strategic** | Did they do what they set out to do? | The declared angle against the performance. Executing a weak plan well is a real thing, and so is abandoning a good one. |
| **Audience** | Did this work, for *this* crowd, in *this* room? | Cohort preferences, scene concentration, the artist's standing there, the strategy's legibility to that crowd. |

**The judges must be able to disagree, and a 2–1 must be a genuine 2–1.** A
technically superior performance that the room did not enjoy is a believable
outcome and should be reachable. So is winning a crowd with something the
technical judge marks down. If a golden run cannot produce a split decision,
the judges are not independent and the model has failed.

Each judge records its own decomposition — named contributions, in the shape
`RankingResult` already uses — so "why did the audience disagree with the
technical judge" is answerable from the row months later. None of it is
player-facing outside World Control.

### Strategy must change what is rewarded

The concrete requirement, and the golden test's spine:

- **`OUTWRITE`** — the technical judge weighs writing and originality most; the
  audience judge is harder to move, because density is not the same as impact.
- **`WIN_THE_CROWD`** — the audience judge weighs immediacy and room-reading;
  the technical judge is unimpressed by a performance that traded structure for
  a reaction.

Same two artists, same night, different declared angle → different result, and
the judges' own reasoning explains the difference. That is the proof.

## Preparation must cost something

A battle with no preparation is a dice roll with a name. Preparing spends
something scarce — in-world days, money, or the studio time a record would
otherwise have had — so entering a battle is a decision about the career and not
only about the battle. Preparation raises the ceiling; it does not guarantee
the floor.

## Consequences

Priced through the systems that already own them. M8 introduces no reward
currency of its own.

- **Relationships.** A battle is an interaction between two people, so it goes
  through M6's derivation: new `InteractionKind`s, `rivalry` finally moving, and
  the `RIVAL` kind finally being assigned. Losing to somebody and refusing them
  are different histories.
- **Standing.** Through M5's pressure model, and honestly: a battle is a *room*,
  not a release. It should move Respect and Heat where it earns them and barely
  touch Fame, for the same reason a hundred-person room does not make you widely
  known.
- **Public record.** A completed battle is a `LOCAL_PUBLIC` event; a challenge
  nobody accepted is not. The scene learns what happened, not what was proposed.
- **No prose consequences.** Nothing is written into history that the judges did
  not establish.

## The golden proof

The M5/M6/M7 shape, and the same two halves: determinism proves nothing on its
own, so what is asserted is *divergence for explainable reasons*.

One opponent, one night, one career — run twice, differing only in the declared
strategy.

1. **The same battle produces different results from different angles.** KXMO
   choosing `OUTWRITE` and KXMO choosing `WIN_THE_CROWD` do not get the same
   scorecard, and the difference is attributable to the strategy rather than to
   a seed.
2. **The judges disagree at least once.** A split decision is reachable and
   recorded as 2–1, with each judge's own reasoning intact.
3. **Each judge's decomposition explains its own verdict** — named
   contributions, no bare numbers, readable months later under a newer engine.
4. **Preparation matters and does not decide.** A prepared performance beats an
   identical unprepared one on the same angle; preparation alone does not beat
   a better-matched strategy.
5. **Consequences are proportionate and traceable.** Respect and Heat move
   through the existing pressure model; Fame barely moves; rivalry moves; the
   relationship becomes `RIVAL`; nothing is written that the judges did not
   establish.
6. **Declining is a real path.** A refused challenge leaves a different
   relationship from a lost battle, and neither is silent.
7. **Replay is exact.** Same inputs, same verdicts, same decomposition. No
   clock, no network, no unseeded randomness.

## Out of scope

Explicitly, and to be resisted:

- **Any battle interface.** No screens, no route, no cards. The player-facing
  milestone comes after this one, as it did for M7.
- **Model-generated bars.** The performance is represented structurally. No LLM
  writes a verse in M8, and the judges must never read prose.
- **Crowds as a new simulation.** The audience judge reads M5's existing
  cohorts. It does not get its own population model.
- **Tournaments, leagues, rankings, belts.** One battle, properly modelled,
  before any structure is built on top of it.
- **Player-versus-player.** Opponents are world NPCs. PvP is a different product
  with different fairness, timing and moderation problems.
- **Rewriting the Opportunity Director.** A new candidate type is an extension.
  Ranking, eligibility, the cap and scene standing stay as they are.

## Sequence

Each step is the precondition for the next.

1. **Seed opponents.** Rival artists with skills, psychology, a home scene and a
   reason to challenge. Nothing else can be tested until somebody exists.
2. **Give the battle a shape.** Migrate the M1 stub into a row that can hold a
   lifetime, a scene, a night, stakes, a strategy, a performance and a verdict —
   with identity and game time, following `0011`'s precedent.
3. **Represent a performance structurally.** What a verse *is*, in fields a judge
   can read.
4. **Build the three judges as pure functions.** No database, no clock, no
   randomness. Each with its own inputs, its own decomposition and its own
   verdict.
5. **Wire the lifecycle.** Challenge through the director; accept, prepare,
   submit and resolve as commands, in transactions, with canonical events.
6. **Price the consequences** through M6 and M5. No new currency.
7. **The golden proof**, then stop for review.

## The line to keep pinned

> **A battle is decided by what each artist did, judged three different ways by
> judges who are allowed to disagree — and never by a single number that already
> knew the answer.**
