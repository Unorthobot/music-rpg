# Milestone 6 — Crew & Relationships

**Baseline:** tag `m5-final` (commit `1a7ee3b`). M0–M5 accepted and frozen.

M5 answered *what happens when your music meets the world*. M6 answers the other
half of the same question, and it is the one that turns a career simulator into
a world of people.

## The question

**What do the people around me think of what I'm doing, and how does that change
what becomes possible?**

Not a friendship meter. LEX already exists, the player chose him over two other
producers, paid him, gave him a direction, heard him push back, took or refused
his ideas, asked for revisions, mastered a track with him, and put it out. Every
one of those is already a row. Until now they were *creative* facts. M6 makes
them *relationship* facts.

## What is already recorded

This milestone is unusual in that almost none of its inputs need inventing. The
following exist today and are append-only:

| Already persisted | What it gives M6 |
|---|---|
| `creative_decisions` — sequenced, per session | Every choice the player made in the room |
| `CREATIVE_DIRECTION_SET` | What they asked for |
| `PRODUCER_PROPOSAL_ACCEPTED` / `_REJECTED` / `PRODUCER_PROPOSALS_COMBINED` | Whether they took the producer's read, refused it, or met them halfway |
| `REVISION_REQUESTED`, `MASTER_REQUESTED`, `TRACK_SAVED` | Whether the work was seen through |
| `ProducerStance` in decision payloads | How the producer felt at the time — enthusiastic, cautious, pushing back |
| `creative_session_participants` | Who was actually in the room, and in what role |
| `characters.personality / motives / preferences / currentGoal / currentMood` | Who they are, structurally — the schema comment already promises "goals, moods, grudges and prices" |
| `npc_conversations` / `npc_messages` | A channel that already exists |
| M5 reception | What the record they made together actually did |

**What does not exist:** there is no career↔character relationship state of any
kind. `character_id` appears in exactly one place outside the characters table,
and that is the conversation. Nothing anywhere stores trust, tension or loyalty.

The one relationship model that *does* exist is group membership — `influence`,
`satisfaction`, `commitment`, `soloAmbition`, and a `chemistry` column whose own
comment admits it is a formation snapshot awaiting real simulation. That is kept
and given a shared foundation beneath it rather than duplicated; see **The
model** below.

## Three rules that bound the milestone

**1. Relationship state is *derived from history*, never awarded.** The same
discipline reception held: the decisions are the facts, the state is a reading of
them. Nothing may hand out +5 trust for completing an action. If a relationship
is strong, it must be possible to point at the sessions that made it strong —
and, because `creative_decisions` is append-only and complete, a relationship
must be reconstructible for a career that existed before M6 shipped. No
backfilled fiction.

**2. The player sees a state, not a stat.** The simulation may know
`tension = 61`. The player sees:

> **LEX** — Creative partner
> Exceptional chemistry. Growing tension.

This is the M5 boundary again, and it is not a formatting preference. A number
invites optimisation; a state invites a decision about a person. The precedent
is already in the codebase: `StatDescriptor` exists precisely to show what a
hidden number means without showing it, and Sound DNA has never been an editable
slider.

**3. Derive once, then move incrementally.** A career that predates M6 has its
relationships reconstructed from the canonical history that already exists — that
is what makes rule 1 true rather than aspirational. But reconstruction is a
*migration*, not a read path. Once a relationship exists, actions update it and
emit relationship events; nothing re-scans a career's whole history to answer
"what does LEX think of me". Reconstructibility without a runtime that gets
slower every session the player plays.

## The model

One relationship framework, with role-specific projections on top. Not a
producer model and a separate band model: the dimensions below are person-to-
person and mean the same thing about anybody. What differs by role is which of
them matter and what they unlock.

```
RELATIONSHIP                 GROUP MEMBERSHIP
├── familiarity              ├── influence
├── respect                  ├── satisfaction
├── trust                    ├── commitment
├── loyalty                  └── solo_ambition
├── creative_chemistry
├── tension
└── rivalry
```

| Dimension | What it answers |
|---|---|
| **Familiarity** | How much history is there at all? |
| **Respect** | Do they rate what you actually make? |
| **Trust** | Do they believe you'll follow through? |
| **Loyalty** | Would they choose you over a better offer? |
| **Creative chemistry** | Does the work get better when you're both in the room? |
| **Tension** | What is unresolved between you? |
| **Rivalry** | Are they measuring themselves against you? |

Group membership keeps its own four because they describe a member's standing
with the group *as an institution* rather than sentiment toward a person. A
bandmate can be personally loyal and still have low commitment to the band, and
that difference is the whole substance of a line-up falling apart.

**Tension is independent, and stays independent.** It is not the inverse of
trust and not a penalty meter. A relationship can be high-trust, high-respect,
high-chemistry *and* high-tension at once — that is where the most interesting
creative partnerships live, and a model that cannot express it has nothing to
say about real collaborators.

Seven dimensions that move for seven different reasons, and that must never
collapse into one score — the same rule Fame, Respect, Heat and Legacy hold on
the career.

## Decisions have to cost or earn something

The example that has to work:

> A player who rejected two of LEX's ideas, pushed a third into a revision, and
> came out with a record that is finding its people should stand somewhere
> different from a player who accepted everything immediately — and different
> again from one who abandoned the session.

Note what that requires: **rejection is not simply damage.** Refusing a
proposal from a producer who was pushing back, and then being proved right by
reception, is a different fact from refusing a proposal they were enthusiastic
about and making something nobody heard. The stance was recorded at the time,
and M5 now knows how the record did. Both are available.

**The M5 golden career accepted the first proposal immediately.** It has no
rejections, no revisions, no combinations — so it is the wrong career to prove
this on, and the first piece of M6 work is a Studio helper that builds one with
real friction in it. Testing a relationship engine on a path where nobody
disagreed would be testing nothing.

## Crew is not collaboration

Working with someone is an event. Crew is a standing arrangement — the people
who are *around* you rather than the people you booked once. M6 introduces the
distinction; it does not need to introduce hiring, wages, or management.

## Characters want things

`currentGoal` and `currentMood` are columns waiting for a writer. A producer
with a goal is a producer who can be disappointed, courted, or outgrown, and
that is what makes the relationship two-sided rather than a resource the player
accumulates.

## Relationship moments

The first real branching. A moment is offered because the relationship state
made it possible, the player answers, and the answer is recorded like every
other decision. No moment may be generated by prose — the same rule as
reception. Facts first.

## The golden path

LEX, end to end, through the real commands — friction included, because that is
the point:

```
choose LEX over two other producers
→ give him a direction
→ he comes back with three reads
→ reject the whole set
→ he pushes back and comes again
→ take a second-pass idea
→ ask for a revision
→ master it
→ release it, simulate three days
→ it finds a small but meaningful audience
→ what does LEX think of you now?
```

That has to be able to derive something with shape to it:

> **LEX** — Creative partner
> High creative chemistry. Strong respect. Some tension. Growing trust.

rather than *"you worked together once."*

## The golden proof

The relationship equivalent of M5's sensitivity test, and the same two halves:

> **Same two people, different shared history → meaningfully different
> relationship state, explainable from the recorded events.**

The control is the clean M5 path: chose LEX, accepted immediately, shipped. It
must land somewhere visibly different from the friction path, and the difference
must be attributable to specific decisions rather than asserted. Determinism
alone would be satisfied by an engine that ignored its history.

## Out of scope

Rival artists, labels, contracts, battles, romance, crew wages, scheduling
crew availability, group churn driven by relationships, and anything that
generates dialogue with a model. Relationships and crew only.

## The line to keep pinned

> **The simulation knows the number. The player knows the person.**
