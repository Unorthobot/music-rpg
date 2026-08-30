# M9 — The player experience

**Baseline:** tag `m9-headless` (commit `c7a2c87`). The three recognition domains,
the qualification rule, the transition, its consequences and the whole causal
record exist and are proven — 400 unit/domain/integration tests, typecheck, lint
and build clean. Nothing here requires a new progression capability. Where the
build needs something that exists but has never been rendered, or a string that
was written for an inspector and would reach a player, it says so explicitly and
first.

This is the UX acceptance specification. It is not a wishlist.

## The principle

> **The Come Up is not something a player earns. It is something they notice.**

A career changes act because the world started relating to it differently — a
record landed *and* somebody came back, or a record landed *and* the scene saw
this artist in more than one way. The player did those things for their own
reasons. The transition is the game acknowledging what already happened, not
paying out for it.

Three constraints follow, and all three are inherited rather than invented.

**The world creates, the screens reveal.** No interface in this specification may
evaluate a domain, cause a transition, or bring one forward. Opening every screen
ten times changes nothing.

**Facts before prose.** The transition is a row and an event. Every word on every
screen is a reading of those. No sentence may claim a consequence the data does
not carry.

**Absence is a design decision, not an omission.** A career that has not come up
is shown nothing about coming up. Not a meter, not a hint, not a locked chapter.

## The player question

The design question is not *how do we show the player their progression system*.
It is:

> **What does it feel like when the music world has started treating you
> differently?**

It should feel like: people know the name. A collaborator behaves differently.
The catalogue can carry something bigger. There is a page about you that is not
only yours. It should not feel like a tier, a rank, or a receipt.

## The player/internal boundary

Everything in the left column exists in the data and **must never reach a
player**. World Control may expose all of it and already does.

| Internal | Player-facing |
|---|---|
| `RECEPTION`, `PEER`, `PUBLIC_RECORD` | *nothing* — never named, never counted, never ticked |
| "recognition domain", "evidence descriptor" | *nothing* |
| `WORK_LANDED_ONCE`, `WORK_THAT_LANDED`, `AUDIENCE_THAT_STAYED`, `A_SCENE_THAT_KNOWS_YOU`, `COHORT_BREADTH`, `PEOPLE_WHO_CAME_BACK`, `THINGS_THE_SCENE_SAW` | *nothing* |
| `satisfiedDomains`, `breadth`, `beyondReception`, `qualifying` | *nothing* |
| `blockedBy`, `RECEPTION_ONLY`, `NOT_ENOUGH_DOMAINS`, `ALREADY_TRANSITIONED` | *nothing* — a career is never told why it has not come up |
| `domainFirstReached`, first-reached timestamps | *nothing* |
| `evaluatorVersion`, `PROGRESSION_EVALUATOR_VERSION` | *nothing* |
| `engaged >= 60`, `repeat >= 20`, `conversions >= 10` | *nothing* — never as a requirement, target or near-miss |
| two-of-three, domain count, "1 of 2" | *nothing*; there is no count to show |
| `SCENE_WITNESSED_EVENT_TYPES` and its membership | *nothing* |
| `ACT_REACH.COME_UP = 1.6` | *nothing* — see *Reach* below |
| `careers.career_act = "COME_UP"` | **shown**, as a named chapter: "The Come Up" |
| `career.entered_come_up`.`occurredAt` | **shown**, as the in-world date the chapter began |
| `artists.is_public` / `groups.is_public` | **shown**, as a profile that is now reachable |
| `availableFormats(...).available` / `.lockedReason` | **shown** — already is, and already honest |

**The single hardest rule, stated plainly:** there is no number, bar, count,
percentage or checklist anywhere on a player surface that relates to becoming
consequential. The moment a player can see "1 of 2", the game stops being about a
career and becomes about satisfying an evaluator — and every subsequent decision
becomes optimisation against a rule the fiction was supposed to hide.

## Surface architecture — no new route

**There is no `/come-up` screen, no transition takeover and no progression
dashboard.** The Come Up is not a place; it is a change in how existing places
read. Every surface below already exists.

| Surface | The question it answers after the transition |
|---|---|
| **Home** | What is different now? (once) |
| **Career** | What stage am I at, and when did it start? |
| **World** | What did the scene see? |
| **Catalogue → Projects** | What can I make now? |
| **Public profile** | Is there a page about me? |
| **Notifications** | What happened while I was not looking? |

Adding a dedicated screen would be the clearest possible statement that this is a
game mechanic rather than a career changing. It is refused on those grounds.

## The transition model

### When it happens

On the **day advance** that first produces a second recognition domain — step 6
of `advanceCareerDay`, after the day is fully written. The player is not present
for a decision; they advance a day and the world has moved.

### How the player learns

In this order, and no other:

1. **A notification**, in world-fact register. One, ever.
2. **Home**, while the transition is still today in world terms, carrying a
   one-time chapter line.
3. **Career**, permanently, as the current chapter with the date it began.
4. **World**, as a public fact the scene registered.

**No modal. No takeover. No animation gate. No confetti.** A reduced-motion
player and a player who refreshes mid-transition both get the same information.

### The one-time treatment, without new state

**The Home line is shown while the transition is *today* in world terms** — that
is, while `career.entered_come_up`.`occurredAt` falls on the career's current
in-world date. Once the clock moves, Home settles permanently.

This needs no `seen_at` column, no dismissal endpoint and no read flag. That
matters, because **notifications in this codebase have no read state**: they are
derived from `game_events` on demand and carry no `readAt`. A "dismiss on first
view" treatment would have required inventing per-player UI state, and worse, it
would have meant *a screen changing because somebody looked at it* — which is the
one thing every surface in this game is forbidden to do.

Deriving from the world clock instead keeps the constitutional rule intact: a
player who opens Home ten times on the day their career came up sees the same
Home ten times, because nothing has changed. The news is simply news today and
not tomorrow.

### What it must not be

`LEVEL UP` · `ACT II UNLOCKED` · `NEW TIER` · `CAREER RANK UP` · `+60% REACH` ·
`EP UNLOCKED` · `2 of 3 complete` · a progress ring completing · a badge.

## Acts as chapters

M9 establishes the grammar every later act will inherit. A career act is a
**chapter**: a named stretch of a career, with a beginning, describing how the
world relates to the artist.

`ACT_LABELS` already exist and are right: *The Underground*, *The Come Up*.
`ACT_LINES` exist and are **wrong for this purpose** — they are imperatives
(*"Get noticed."*, *"Turn attention into a career."*), which read as objectives
handed to the player. A chapter line should describe a relationship, not assign a
task.

**Recommendation (copy change, existing surface):**

| Act | Line |
|---|---|
| `UNDERGROUND` | Nobody knows the name yet. |
| `COME_UP` | People are starting to know it. |

`INDUSTRY` and `LEGACY` are **not written in this milestone.** The grammar is
established; the content is a later act's business.

**Chronology is preserved.** Old releases were Underground releases. The chapter
that was is not relabelled by the chapter that is — Career shows both, in order,
and no history screen is rewritten to imply a record came out during The Come Up
when it did not.

## Surface by surface

### Home — first visit after the transition

One line, in the existing "right now" position, in the world's voice. It states
what changed, not what was satisfied. It links to Career.

It must not: enumerate what qualified, name a domain, congratulate, or offer a
"see what's new" tour.

### Home — settled

**Unchanged from Underground.** No permanent chapter module, no act badge, no
standing widget. The Come Up is not a thing Home is about; Home is about what is
being asked of the career right now, and that is as true after the transition as
before it.

### Career — the durable home of the act

Career already renders `ACT_LABELS` and `ACT_LINES` in an "Act" surface. M9 adds
exactly one fact: **when this chapter began**, read from
`career.entered_come_up`.`occurredAt` as an in-world date.

The previous chapter remains visible as history. A career in The Come Up can see
that it was in The Underground and when that ended. That is career history, and it
is the same register `getOfferStory` already writes in.

**Career must not become a progression sheet.** No domains, no first-reached
timestamps, no "how you got here" breakdown. The honest answer to *how did I get
here* is already on the surfaces where it happened: the record is in Catalogue,
the producer is in Messages, the night is in Career history.

**On Fame / Respect / Heat:** Career currently renders these as raw integers. That
is a pre-existing M5 decision, out of scope here, and it is **not** the chapter.
M9 adds no relationship between the act and those numbers, and no copy implying
one.

### World — the scene registering it

`career.entered_come_up` is already `LOCAL_PUBLIC` and already lands in the
`/world` feed. **The line it currently renders is wrong for a player.**

The feed reads `gameEventLabels`, which is written in inspector register. For this
event that yields *"Career entered The Come Up"* — a sentence about a database
row, in a feed that is supposed to be the scene talking. This is the same class of
finding M7 recorded about `trigger_reason`.

**Requirement:** a player-facing world line for this event, in the world's voice,
naming the artist rather than "career". `gameEventLabels` stays as it is —
World Control depends on it.

The line must read as something the scene noticed, not as an announcement about a
player. It should be sayable by a person.

### Catalogue → Projects — what can be made now

**This surface already does the right thing and needs no unlock treatment.**
`/catalogue/projects` renders every format, including locked ones, with an honest
`lockedReason`. Before the transition an EP reads *"Not at this stage of your
career."*; after it, the same row either becomes available or reads *"You need at
least 4 tracks."*

That change **is** the discovery. The player returns to a screen they already
know and finds a shape that was closed is open, or closed for a reason they can
actually act on.

**Requirements:** no unlock screen, no toast, no "new" badge, no reordering to
draw attention. Catalogue-count gates stay honest — a career that comes up with
two tracks is told it needs four, and is not implied to have unlocked an EP.

### Reach — felt, never explained

`ACT_REACH.COME_UP = 1.6` applies to future reception only. **No surface
mentions it.** No copy says a record will reach further, no multiplier appears,
and no comparison to a previous release is drawn.

The player finds out the way they would in life: the next record travels further
than the last one, and they attribute that to the world knowing the name. If the
interface explains the multiplier, it converts a felt consequence into a stat the
player will start optimising against.

**Nothing to build. The correct implementation is the absence of one.**

### Public profile — a page that is not only yours

Headless semantics, unchanged:

- **Solo:** the controlled artist becomes `PUBLIC`.
- **Group:** the group becomes `PUBLIC`; **member artists stay private**,
  including the player's own `player_artist_id`.

Player-facing meaning: the artist (or group) now resolves for somebody who is not
signed in as its owner. Previously it was `OWNER_PREVIEW`; now it is the page the
world sees.

**Requirements:** the group case must never imply member fame. A group coming up
does not give its members public pages, and no copy on the group profile
describes members as publicly established. If the owner-preview surface says
anything about visibility, the honest line is that the page is now reachable —
not that the artist is famous.

### Notifications — one, as a world fact

`career.entered_come_up` **should** notify. The transition happens on a day
advance while the player is not watching, which is exactly the case
Notifications exists for — the same argument M8 made for `battle.resolved`.

It is not in `NOTIFIED` today. Adding it is an event/copy change, not a
capability.

**Requirements:** world-fact register, not a reward toast. It links to Career.
Never *"You unlocked The Come Up!"*. One notification, ever — the event carries
an idempotency key and cannot fire twice.

### Messages — deliberately nothing

**No NPC message fires because a career changed act.** This is the strongest
"do not duplicate the world" call in the milestone.

The qualifying event has already spoken for itself in every route:

- **A** — the producer came back. That message already exists, and it *is* the
  acknowledgement.
- **B** — somebody said yes to joining. That answer already exists.
- **C** — a battle resolved and the scene saw it.
- **D** — a night happened, was paid for, and became a public fact.

Manufacturing a "congratulations, you've come up" message would have a character
speak because a boolean flipped, which is precisely the failure M6 and M7 were
built to avoid. If a character later has a *reason* to mention it, that belongs
to whichever milestone gives them one.

## The golden journeys

Written from the four proven headless histories. **No internal vocabulary
appears in any of them**, because none of it would ever be visible.

### A — the producer came back

The record went out weeks ago and found people. LEX, who produced it, raised the
idea of getting back in the room; the player took it and made a second record.

They advance a day. A notification: the scene has started to know the name.

Home, once: a line saying people are starting to know it. Career: the chapter is
The Come Up, and it began on the 14th; The Underground is behind it, dated.
World: a line about the artist, in the scene's voice. Projects: the EP row, which
has read *"not at this stage"* for the whole game, now reads *"you need at least
four tracks"* — three in the catalogue, so not yet, but for a reason they can do
something about.

**It should feel like:** somebody who knows what they are doing wanted to work
with you again, and that turned out to mean something.

### B — somebody committed

One record, which landed. LEX accepted an invitation to be crew.

The same four surfaces, the same day. **The difference is not in the interface —
it is in what the player did to get there**, and the interface's job is not to
explain that difference back to them. Career history shows a record and a person
who joined. That is a different story from A's two records, told by the same
screens.

**It should feel like:** somebody backed you, and the world took that as a
signal.

### C — the scene watched

One record, which landed, and a battle the player accepted, declared an angle
for, and won or lost — the model does not care which.

**It should feel like public recognition rather than a private relationship.** No
collaborator changed how they treat this artist; the *scene* has seen the name
twice now, in two different ways. World is the surface that carries this journey
best, and the transition line sits directly beneath the battle it followed.

### D — the room

One record, which landed, and a night the player agreed to and let the clock
reach. The fee settled, the room was played, and the scene was told.

This is the most culturally legible route. **It should feel like the obvious
thing:** you put out a record, you played a show, people know who you are.

Career history shows the night with its own date. The transition follows it.

### E — the record did not land

A career with a record out that converted almost nobody.

**Sees nothing.** No chapter, no hint, no "your record is close", no suggestion
that it might have landed differently. Home, Career, World and Projects are
exactly what they were. The player may reasonably conclude the record did not
connect, because it did not.

### F — a runaway record and nothing else

A career with a record doing unusually well — hundreds of people who stayed,
every promoter's bar cleared — and no returning collaborator, no crew, no battle,
no night.

**Sees nothing about The Come Up.** Specifically it must never see:

*"Almost there"* · *"1 of 2"* · *"Get someone to notice you"* · *"Play a show to
unlock The Come Up"* · a greyed chapter · a disabled meter.

It sees an Underground career whose music is doing very well, which is exactly
what it is. Its Catalogue still says an EP is not for this stage of its career,
because that is true.

**This is the milestone's hardest acceptance criterion**, and the one most likely
to be quietly violated by a well-meaning "help the player" instinct.

## Screen and state inventory

| # | Surface | State | Change |
|---|---|---|---|
| 1 | Home | first visit after transition | one-time chapter line |
| 2 | Home | settled | none |
| 3 | Home | before transition, any career | none — no module, ever |
| 4 | Career | current act | chapter name, line, **date it began** |
| 5 | Career | history | previous chapter, dated, chronology preserved |
| 6 | World | public feed | player-voice line for the transition |
| 7 | Projects | before | EP/mixtape/album locked, act reason |
| 8 | Projects | after | act reason gone; track reason honest |
| 9 | Public profile | solo | artist resolves `PUBLIC` |
| 10 | Public profile | group | group `PUBLIC`, members unchanged |
| 11 | Notifications | one entry | world-fact line, links to Career |
| 12 | Messages | — | **no change; deliberately nothing** |
| 13 | All | refresh / revisit | Home line persists for that in-world day, then never returns |
| 14 | All | mobile | every one of the above at phone width |

## Desktop and mobile

Designed at phone width first. The transition adds **one line to Home, one date
to Career and one line to World** — all of which are single-column text in
surfaces that already stack.

Explicitly refused because they do not survive a phone and should not exist
anywhere: a horizontal act timeline, a three-column chapter comparison, a stats
panel, a progression dashboard.

## Copy rules

Never, on any player surface: *unlock* · *level* · *tier* · *XP* · *rank* ·
*progress* · *requirement* · *2 of 3* · *domain* · *recognition score* ·
*milestone* · *achievement* · *complete* · *criteria* · *threshold* ·
*multiplier* · *reach increased*.

- The chapter is named, never numbered. No "Act II".
- No congratulation. The world noticing you is not a compliment from the game.
- No second person imperative about what to do next. The Come Up is not a quest
  hand-off.
- The transition line is in the world's register, about the artist, and could be
  said aloud by a person in that world.
- Dates are in-world dates.

## Cross-surface causality

The transition is **one fact**. Every surface resolves it from
`careers.career_act` and the single `career.entered_come_up` event — never from
an independent reading of the evidence, and never by re-evaluating anything.

```
day advance produces the second domain
  ↓
careers.career_act = COME_UP        (one row)
career.entered_come_up              (one event, LOCAL_PUBLIC, idempotency-keyed)
  ↓
Notification  ← the event
Home (once)   ← the row + the event date vs today
Career        ← the row + the event's occurredAt
World         ← the event
Projects      ← the row, through availableFormats
Public profile← is_public, written in the same transaction
```

**Test, analogous to M7's:** for one career followed end to end, the act shown on
Career, the date shown on Career, the line in World, the notification, and the
format availability in Projects must all trace to the same row and the same event
id. No surface may compute its own answer to *has this career come up*, and no
surface may call the evaluator.

## The leakage test

Asserted as strings over rendered output and serialised props, not reviewed by
eye. **No player-facing surface** may expose:

| Must not appear |
|---|
| `RECEPTION`, `PEER`, `PUBLIC_RECORD` |
| any descriptor name |
| `qualifying`, `breadth`, `beyondReception`, `satisfiedDomains` |
| any blocker enum value |
| first-reached timestamps |
| `evaluatorVersion` |
| the landed-work thresholds, in any framing |
| domain counts, "2 of 3", any fraction or percentage |
| `ACT_REACH` or any multiplier |
| `SCENE_WITNESSED_EVENT_TYPES` membership |
| the raw `gameEventLabels` string for `career.entered_come_up` |

**World Control may expose all of it and must continue to.** The test asserts the
boundary, not the absence of the data.

## Read-only invariance

Opening Home, Career, World, Projects, Notifications and both public profiles —
in any order, any number of times, before and after the transition — must not
change `careers.career_act`, write an observation row, emit an event, or alter
`is_public`. The progression evaluator runs on the day advance and nowhere else.

This is M7's census test extended by one column: the act.

## Implementation gaps

Found by inspection against `c7a2c87`. **No genuine domain gap exists** — every
fact this experience needs is already recorded.

**Copy gap — the World line.** `/world` renders
`gameEventLabels[event.eventType]`, which for this event is *"Career entered The
Come Up"*: inspector register on a player surface. A player-facing line is needed
beside it. *(Pre-existing pattern: `career.entered_underground` has the same
problem today and is out of scope here.)*

**Event gap — the notification.** `career.entered_come_up` is not in `NOTIFIED`
in `queries/notifications.ts`, so no notification fires. Adding the type and its
copy is the work.

**Presentation gap — the chapter date.** Career renders the act but not when it
began. The date is available from the event; nothing new is stored.

**Presentation gap — chapter line register.** `ACT_LINES` are imperatives and
should describe the world's relationship to the artist. Copy change to an existing
constant, affecting `UNDERGROUND` and `COME_UP` only.

**Read-model gap — Home.** `CareerHome` carries neither the act nor the
transition, and the Home page does not load notifications at all. The one-time
line needs two facts: the career's act (already on `CareerRow`, which Home's
caller has) and the transition event's `occurredAt` compared against
`currentGameDate`.

**Recommendation: extend `CareerHome` by one optional field rather than building a
`progression-view`.** Both facts are already player-safe — a chapter name and an
in-world date — and a dedicated projection for one line would be architectural
symmetry rather than need. The M7/M8 read-model pattern exists to *strip* unsafe
internals; here there are none to strip.

**Adjacent, not M9's:** `performance.resolved` is also absent from `NOTIFIED`, so
M8.5 nights currently produce no notification. Recorded here because it was found
here; it belongs to an M8.5 follow-up, not to this milestone.

## Implementation sequence

1. **The player-facing world line** for `career.entered_come_up`, beside
   `gameEventLabels` rather than replacing it.
2. **The notification** — add to `NOTIFIED`, with copy in world-fact register.
3. **Career**: the chapter date, and the previous chapter as history.
4. **`ACT_LINES` copy**, `UNDERGROUND` and `COME_UP` only.
5. **Home**: the one-time line, derived from the act and the transition date
   against the career's current in-world date.
6. **Verify Projects** needs nothing. Do not touch it if it does not.
7. **The leakage test**, as string assertions over every player surface, for a
   career that has come up and for Golden F.
8. **The cross-surface causality test**, one career end to end.
9. **The absence test** — F and E across every surface, asserting silence.
10. **E2E**: a career that comes up through a day advance and reads it; and F,
    which never sees anything.

## Acceptance criteria

1. **No screen evaluates or causes a transition.** Opening every surface
   repeatedly, in any order, changes nothing.
2. **A career that qualifies transitions on the day advance** and is notified
   rather than discovering it.
3. **The one-time Home treatment appears only while the transition is the
   current in-world day**, and never after the clock moves. Refreshing within
   that day shows the same Home, because nothing has changed.
4. **Career names the chapter and the date it began**, and shows the previous
   chapter without rewriting it.
5. **World carries a line a person in that world could say**, not a row label.
6. **Projects changes only its locked reasons**, with no unlock screen, and a
   career short of tracks is told so honestly.
7. **Nothing anywhere states or implies a reach multiplier.**
8. **Solo publishes the artist; group publishes only the group**, and no copy
   implies member fame.
9. **No NPC message fires because of the transition.**
10. **Golden F, at any reception magnitude, sees nothing** — no meter, no hint,
    no "almost", no locked chapter.
11. **Golden E is told nothing about what it is missing.**
12. **The leakage test passes** over rendered output and serialised props.
13. **Everything works at phone width**, single column, and survives
    reduced-motion.

## Out of scope

- **A dedicated Come Up screen, modal or takeover.**
- **Any progression dashboard, meter, checklist or chapter tracker**, before or
  after the transition.
- **INDUSTRY and LEGACY** — the chapter grammar is established here; their
  content is not.
- **Changing the progression engine, its thresholds, its ontology, or any
  M5–M8.5 system.**
- **Explaining `ACT_REACH`.**
- **An NPC message, thread or reaction caused by the transition.**
- **Retroactive relabelling of history** as having happened during The Come Up.
- **Fame / Respect / Heat presentation**, which is M5's and unchanged.
- **A `progression-view` read model**, unless step 5 proves one is needed.
- **M10.**

## The line to keep pinned

> **The player should never be able to work out what they had to do. They should
> only be able to tell that the world is treating them differently now.**
