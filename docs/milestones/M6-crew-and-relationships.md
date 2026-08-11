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
comment admits it is a formation snapshot awaiting real simulation. M6 has to
decide deliberately whether character relationships and member relationships are
one model or two. They are not obviously the same thing: a bandmate can leave, a
producer can decline the next session, and those are different consequences.

## Two rules that bound the milestone

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

## The model

Persistent, per career and character:

| Dimension | What it answers |
|---|---|
| **Trust** | Do they believe you'll follow through? |
| **Respect** | Do they rate what you actually make? |
| **Creative chemistry** | Does the work get better when you're both in the room? |
| **Tension** | What is unresolved between you? |
| **Loyalty** | Would they choose you over a better offer? |
| **Familiarity** | How much history is there at all? |

Six dimensions that move for six different reasons, and that must never collapse
into one score — the same rule Fame, Respect, Heat and Legacy hold on the career.
Tension in particular is not the inverse of trust: the most productive creative
relationships carry both.

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

⚠️ **The M5 golden career accepted the first proposal immediately.** It has no
rejections, no revisions, no combinations. M6's golden path needs a richer
creative history than the one the M3/M4/M5 helpers currently build, or the
milestone will demonstrate its central claim on a career that never exercised
it.

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

LEX, end to end, through the real commands:

```
choose LEX over two other producers
→ give a direction he is cautious about
→ reject his first read
→ reject the second
→ take the third, and ask for a revision
→ master it, release it, simulate three days
→ it finds the scene
→ what does LEX think of you now?
```

And the control: the same career, accepting immediately, must end somewhere
visibly different — with the difference explainable from the decisions, not
asserted.

## Out of scope

Rival artists, labels, contracts, battles, romance, crew wages, scheduling
crew availability, group churn driven by relationships, and anything that
generates dialogue with a model. Relationships and crew only.

## The line to keep pinned

> **The simulation knows the number. The player knows the person.**
