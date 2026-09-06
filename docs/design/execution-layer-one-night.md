# Execution Layer — One Night

**Design only. Nothing implemented, no coefficients or simulation behaviour touched, no M10
proposed.** Written against `de18d3c`.

**Hypothesis under test:** can an existing SAIFA career event feel like something the player
participated in, rather than something the simulation calculated and reported afterwards?

**The experiment:** one artist, one venue, one scheduled night, one show. Naledi's rooftop in
Braamfontein — 120 capacity, opening the night, R120 agreed in advance, **36 people in the room**.
The first show from the M0–M9 playability audit, chosen deliberately because it is the *weakest*
night in that history. If a thin room can be made to feel like something the player did, a full one
follows. The reverse does not.

---

## 0. The constraint that shapes everything

Before any design: what the simulation actually knows.

**Known before the night** — venue name, scene, capacity, promoter (a real character row), billing,
agreed fee, date; and about the artist, `sceneStanding` in that scene, `momentum`,
`performanceSkill`, career act.

**Computed when the night resolves** — three facts, each bounded by the one above it:

| Fact | Bound | This night |
|---|---|---|
| `attendance` | the room's capacity | 36 of 120 |
| `wonOver` | attendance | ≤ 36 |
| `wordLeftTheRoom` | wonOver | ≤ wonOver |

…derived from a closed list of six terms — `room`, `sceneStanding`, `momentum`, `billing`,
`performanceSkill`, `nerves` (seeded, reproducible) — plus per-cohort room shares
(`cohortSlug`, `attendees`, `wonOver`, `newFans`, `affinityGain`), fame/respect/heat pressure, and a
fee that is **fixed by the agreed terms and explicitly not scaled by how the night went**.

**Not known, at all:**

- any individual audience member;
- what anyone thought, said, or felt — `wonOver` is a *count*, never a sentiment;
- any structure *within* the night: **no songs, no setlist, no arc, no moments**;
- whether the promoter was pleased;
- whether crew attended — crew is a career-level fact, never linked to a night.

### The finding this forces

**The outcome of a night is fully determined before the artist walks on stage.** Every term is
either fixed by prior state or drawn from a seed. There is no player lever during the night, at any
stage, in the current simulation.

So the design has two honest options:

- **(A)** accept it, and make the night about *presence and knowledge* rather than influence;
- **(B)** give the player influence, which requires a new simulation term — out of scope, and a
  much larger commitment than this experiment should quietly smuggle in.

**This document designs (A) deliberately**, and §13 treats "is (A) enough?" as the thing the
experiment exists to answer. Designing (B) here would be inventing a performance simulation under
the cover of a UX experiment.

The productive consequence: since the player cannot change what happens, the only thing they can
spend is **attention** — and attention is scarce, irreversible, and determines what they *know*
about their own career. **The honesty constraint becomes the mechanic.** What you did not watch
stays genuinely unknown, because the simulation genuinely does not know it either.

---

## 1. The journey as it exists now

| Stage | What happens today |
|---|---|
| **Reason** | Naledi messages. The offer screen states the room, the date, the billing, the fee, the deadline, and what else is that week. **This works.** |
| **Place** | Nothing. The venue is a string. |
| **Preparation** | Nothing. No load-in, no soundcheck, no anticipation surface beyond a calendar row and a *"Next: Rooftop hours — 16 Jan"* line in Home's rail. |
| **Execution** | Nothing. On the day advance that reaches the date, `resolveDuePerformances` runs inside `advanceCareerDay`. The player is not present, and is not told it happened. |
| **Outcome** | The fee lands in the ledger. The calendar row flips to COMPLETED. The world feed gains **"You played a room."** No notification — `performance.resolved` is not in `NOTIFIED`. Attendance, won-over and word-left-the-room are computed, stored, and **never shown anywhere**. |

The audit's summary stands: *my first show drew 36 people into a 120-capacity room, and I found out
it had happened at all because my bank balance changed by R120.*

---

## 2. The redesigned journey

```
REASON        the offer, taken            interface     unchanged
   ↓
PLACE         arriving at the room        world         new, minimal
   ↓
PREPARATION   the room fills              world         new, minimal
   ↓
EXECUTION     you play it                 world         new, minimal
   ↓
OUTCOME       what it cost and bought     split         world → then interface, next day
```

The split at the end is not arbitrary. **`wordLeftTheRoom` is by definition a thing that happens
outside the room** — people telling someone who was not there. It therefore *cannot* be witnessed
and must not appear in the room. It arrives afterwards, through the surfaces that already carry
public facts. The night has an afterlife because the simulation says it does.

---

## 3. What the player sees, does and decides

### Reason — interface, unchanged

**Sees:** Naledi's message; the offer screen (Rooftop hours · Braamfontein · Friday 16 January ·
120-capacity · Opening the night · R120, paid on the night · *"Thirty minutes, bring your own
people"* · answer by 14 January); the week's other commitments.
**Does:** takes it or turns it down.
**Decides:** the only outcome-bearing decision in the whole sequence, and it already exists.

No change. This is the natural-interface rule working: bookings arrive as messages, and dates live
in calendars.

### Place — world, first spatial moment

**Sees:** the room, empty, from where they will play. Braamfontein rooftop at dusk. **120 capacity
expressed as space rather than as a number** — the far wall is a long way off. Naledi is here,
because the simulation has her as a real character attached to this performance.
**Does:** looks around. Nothing else.
**Decides:** nothing.

This stage exists to make capacity a felt quantity *before* attendance can be compared against it.
Without it, 36 is a number. With it, 36 is a room that stayed mostly empty.

### Preparation — world, the wait

**Sees:** the room filling, in real time, up to exactly 36 people. Then it stops.
**Does:** watches, or looks away. May look at the door, the bar, the front, the back, Naledi.
**Decides:** where to spend the wait — the first spend of the scarce resource.

**This is where `attendance` becomes an experience.** No counter, no capacity bar. The player
watches the room reach the size it reaches and then stop filling — and stopping is the information.

### Execution — world, the show

**Sees:** the room from the stage, for the duration of a short set. The people who are with it and
the people who are not, in whatever proportion `wonOver` says.
**Does:** plays — meaning the player advances the night beat by beat and chooses, each beat, where
to look. There are more things worth looking at than there are beats.
**Decides:** what they will know about their own show. Nothing they can do changes what happens.

**This is where `wonOver` becomes an experience** — as orientation and attention in the room, never
as a figure, and never completely, because the player cannot watch everyone.

### Outcome — world, then interface

**In the room, immediately:** Naledi pays R120, in cash, as agreed. Flatly. **The fee is fixed by
the terms and is not scaled by the night**, so it must carry no verdict — a promoter who paid warmly
or coldly would be inventing sentiment the simulation does not have.

**Interface, next day:** the ledger row; the world feed's public line; Career's metrics moving; and
— if and only if `wordLeftTheRoom > 0` — the fact that word travelled, arriving as what it is:
something you were not there for.

---

## 4. Which existing facts power each moment

| Moment | Powered by | Never implies |
|---|---|---|
| Empty room's size | `capacity` (120) | that it will fill |
| Naledi present | `promoterCharacterId`, `promoterName` | that she approves |
| Room fills to 36 and stops | `attendance` | why; that 36 is good or bad |
| Who is in the room | per-cohort `attendees` (scene heads / casual / tastemakers) | that any individual is anyone |
| Standing at the front vs the back | per-cohort `wonOver` split | what any person thinks |
| The room at the end | `wonOver` total | enthusiasm, approval, or a verdict |
| Naledi pays R120 | `feeMinor`, agreed in the offer | that it was earned or deserved |
| Word travelled | `wordLeftTheRoom`, next day | who said it, or to whom |
| Career moved | existing pressure/standing/audience writes | anything not already written |
| The night is public | existing world-feed event | more than "this happened" |

**Nothing above is new.** Every one is a column or a derivation the resolver already writes.

---

## 5. What must remain unknown

Ambiguity is not a shortfall here; it is a requirement, and mostly it is enforced by simply not
having the data.

- **Why 36.** The derivation exists and explains it in terms of `sceneStanding`, `momentum`,
  `billing` and `nerves`. **None of that belongs in the room.** An artist on a stage does not know
  their own scene-standing coefficient. It stays in World Control, where it already lives.
- **Whether anyone enjoyed it.** `wonOver` counts people who left caring more. It does not model
  enjoyment and the room must never assert it.
- **What any individual thought.** No individual exists in the data.
- **What was played.** There is no setlist model. The night must not imply one — no song titles, no
  track references, no "you opened with…".
- **Whether the promoter was pleased.** Not modelled. Naledi may be present and civil; she may not
  evaluate.
- **Everything the player did not watch.** Deliberately unrecoverable. No replay, no summary of the
  parts you missed.
- **Whether crew were there.** Crew is a career-level fact with no link to a night. **The room must
  contain no named person other than the promoter** unless a per-night attendance fact is added
  later — which would be a simulation change.

---

## 6. What becomes unnecessary

Very little, because very little exists — which is itself the finding.

- **The post-hoc night report that has never been built.** The natural response to the audit was a
  results panel: attendance, won-over, word-left, fee, cohort split. **This design makes that
  unnecessary and would make it harmful** — it would restate as a table what the player just stood
  in, and re-introduce the score screen the experiment exists to avoid.
- **"You played a room"** in the world feed. Written for an absent player. The scene's public
  record of the night can stay; its wording should stop narrating the player's own experience back
  to them.
- **Any "how did it go?" prompt.** The player was there.

---

## 7. What appropriately remains

Per the natural-interface rule — an artist meets these as screens in life, so they stay screens.

- **Messages** — the booking arrives as a message. Correct already.
- **Calendar** — a date you are committed to. Correct already, including collision warnings.
- **The offer screen** — terms, room, fee, deadline. The one outcome-bearing decision.
- **Money / the ledger** — R120 appearing as a row is exactly how a fee is met afterwards.
- **Career metrics, Home, World feed** — where consequences accumulate and where the public record
  lives.
- **World Control** — keeps the full derivation, unchanged. The inspector is entitled to everything
  the room withholds.

**The exact figures — 36, won-over, word-left — remain reachable** on the surfaces that already
hold career facts. The design does not hide them; it changes the *order*. You form an impression by
being there, and can check it afterwards. The gap between the two is the most interesting thing this
experiment can measure (§13).

---

## 8. The smallest spatial environment required

**One room. One vantage point. Three states. No navigation.**

- **One location.** The rooftop. No street, no arrival journey, no backstage, no other venue. Travel
  to the venue is a cut, not a walk.
- **One vantage.** Where the artist stands. The player never moves through the space. They **look**,
  they do not walk. This is the single largest scope saving and the design's core claim: *presence
  is a matter of viewpoint and attention, not of locomotion.*
- **Three states of the same room** — empty (Place), filling to 36 (Preparation), played
  (Execution). Same geometry, different occupancy.
- **Crowd rendered as counted bodies**, at the resolution the data supports: 36 people, distributed
  by cohort share, positioned front/back. Individuals are deliberately non-specific — no faces to
  read, because there is nothing to read.
- **One named character present**, the promoter, because the data names her.

Explicitly **not** required: street navigation, interiors beyond the one room, an avatar body, a
day/night cycle, other patrons as characters, dialogue, animation of performance itself, or any
second location.

---

## 9. The minimum interaction model for Execution

Three properties separate playable from cinematic. All three are required; none needs more than a
look control and a confirm.

**1. The player drives the clock.** Nothing advances on a timer. The night proceeds in a small
number of beats, and each waits for input. A cutscene runs on its own clock; a scene you are in runs
on yours.

**2. Attention is scarce and irreversible.** Each beat, the player looks at one thing. There are
more things worth looking at than beats — the front of the room, the back, the door, the bar, the
promoter, the group that came together. **What you look at, you learn. What you do not, you never
find out.** No replay. No end-of-night recap of the missed parts.

**3. What you learn is real and consequential *outside* the night.** This is what stops attention
being decoration. The per-cohort split is genuine data: noticing that the people who stayed were
scene heads rather than casual listeners is information about your own audience — the same
information the reception system will keep acting on. A player who watched the room knows something
about who their music is for. A player who did not, does not.

That is the whole model: **advance, look, live with what you chose.** It requires a look control and
a confirm, and nothing else.

**What is deliberately absent:** any input that changes the outcome. No timing mini-game, no
crowd-work meter, no performance skill check. All of them would be lying — the result was fixed
before the player walked on, and a control that appears to change it would manufacture causation,
which is the one thing the constraints forbid outright.

---

## 10. How 36 / 85 / 137 should feel different

Two independent visual channels, because they are two independent facts, and conflating them is
exactly the failure mode the honesty rule names.

**Density carries `attendance`.** It is bounded by capacity, so it reads as *proportion of the room
used*:

| Night | Reads as |
|---|---|
| **36 / 120** | A room with more floor than people. Gaps. The back wall visible. Sound with space around it. People standing in ones and twos, not a mass. |
| **85 / 120** | A crowd. Loose at the edges, solid in the middle. The back of the room still legible. |
| **137 / 180** | Full enough that the back is not readable. Bodies, not people. |

**Orientation carries `wonOver`.** How many are turned toward the stage rather than toward each
other; how many stayed. **A small room can be entirely with you and a full one can be indifferent**
— and the design must be able to show both, because the data can produce both.

Three rules keep this honest:

- **No cheering, no applause volume, no faces.** Enthusiasm is not modelled. A room can be attentive
  without being appreciative, and the difference is invisible to the simulation, so it must be
  invisible in the room.
- **No counter, no capacity bar, no fill meter.** The moment a number appears, the player reads the
  number and stops reading the room.
- **The room stops filling.** That is the single most important beat of the whole design. Nobody
  announces 36; the door simply stops producing people, and the player understands.

The audit's own words are the target: *"36 in a 120-capacity rooftop is a thin, awkward room; 137 in
a 180-capacity room is nearly full."* The design's job is to make that sentence unnecessary.

---

## 11. How the outcome emerges instead of being scored

The night's consequences arrive in the order and place they would actually reach an artist:

1. **During** — occupancy and orientation. Perceived, never stated.
2. **On leaving the room** — R120 from Naledi, flat, as agreed. Money is the one fact that arrives
   as a number, because that is how money arrives.
3. **The following day, in interfaces** — the ledger row; the world feed's public line; Career's
   metrics having moved; and word having left the room, if it did.
4. **Never** — a panel that totals it up.

**The player leaves with an impression, not a score.** That impression may be wrong; the exact
figures are checkable afterwards on surfaces that already exist. The design's claim is that
*forming* the impression is what makes the night theirs, and that checking it later is a different
and lesser act that should not be allowed to happen first.

**On money specifically:** the fee is fixed by the terms and is not scaled by the night. So the
payment must be affectless. A promoter who paid warmly after a good night would be manufacturing the
correlation the constraints forbid — and worse, would teach the player that the fee is feedback.

---

## 12. Minute-by-minute walkthrough

*VELD RADIO. Friday 16 January. Rooftop hours, Braamfontein. Opening the night. 120 capacity. R120,
paid on the night. Attendance will be 36.*

**00:00 — Interface.** The player advances to Friday from Home. The calendar row for tonight is
present. They tap it. A cut, not a journey.

**00:10 — Place. The room, empty.** Dusk over Braamfontein. The player is standing where they will
play. Free look. The far wall is a long way off — 120 people would be a lot of people. Naledi is by
the stairs, doing something else. No dialogue. *The only information here is scale, and it is
delivered as scale.*

**00:40 — Preparation. Doors.** The player advances. People begin arriving through the stairwell
door. The player can look wherever they like: the door, the bar, the front, Naledi.

**01:30 — The room stops filling.** Thirty-six people. There is no announcement. The stairwell door
simply stops producing anyone, and there is a great deal of floor. **This is the beat the whole
design exists for.** The player is allowed to sit in it for as long as they like; nothing advances
until they do.

**02:00 — Execution, beat 1 of 4.** The player begins. Each beat, one look:

- *the front* — a small knot of people who came forward;
- *the back* — people nearer the bar than the stage;
- *the door* — whether anyone is still arriving, or leaving;
- *Naledi* — present, watching the room rather than the stage.

There are four beats and more than four things worth watching. **The player cannot see their own
show completely**, and is never told what they missed.

**04:00 — The end.** The room as it is. Some people are facing the stage; some are not. The
proportion is `wonOver`, and it is never named. If the night went well for a room this size, the
impression is *"that was small, and the ones who were there were actually there."* If it did not,
it is *"thirty-six people and I could feel the floor."* Both are honest readings of real numbers.

**04:30 — Outcome, in the room.** Naledi pays R120 in cash. One line, no verdict — *"Same time in a
few weeks, maybe."* is already more than the data supports, so she says less than that or nothing.
The player leaves.

**04:45 — Back to interfaces.** Home. The balance has moved by R120. The calendar row reads
completed. The world feed carries the public fact.

**Next day.** If `wordLeftTheRoom > 0`, the player learns — through the surfaces that already carry
this kind of thing — that people who were not there have heard about it. **They were not present for
that, and that is correct: it happened somewhere else.**

**Total: under five minutes, one room, one vantage, four decisions, and none of them changed
anything that happened.**

---

## 13. What this experiment proves or falsifies

**The single question:** is *presence without influence* enough to convert "the game simulated my
show" into "I played that show"?

**It is proved if**, having stood in a room that stopped filling at 36 and having chosen where to
look, the player describes the night as something they did — and if, on later checking the figures,
those figures confirm an impression they already had rather than delivering news.

**It is falsified if** the player experiences it as a cutscene with a look button. That outcome
would be genuinely informative: it would mean embodiment requires *outcome-agency*, which requires a
new simulation term — option (B) from §0 — and would tell us the execution layer is a simulation
commitment rather than a presentation one. **That is the most valuable thing this experiment can
tell us, and it can only tell us by being allowed to fail.**

**Four secondary measurables:**

1. **The impression/figure gap.** Does the player guess roughly right about attendance and won-over?
   A large gap means the room is not communicating; a zero gap means the room is just a slower
   dashboard.
2. **Does scarcity of attention produce attachment, or frustration?** Not being able to watch
   everything is the core mechanic and the most likely thing to be disliked.
3. **Does a thin room survive?** 36 of 120 was chosen because it is the weakest night available. If
   *only* full rooms feel good, the design rewards success rather than conveying it.
4. **Does the split ending hold?** Learning about word-of-mouth the next day, elsewhere, should feel
   like the night having an afterlife. If it reads as a delayed score, the split is wrong.

**What it does not test, deliberately:** navigation, multiple venues, any other event type, and
whether this generalises to releases, battles or studio sessions. One night, one room.

---

## 14. Deliberately excluded

- **A setlist.** No song model exists. Letting the player choose what to play would introduce a
  player-authored fact the simulation cannot react to — and the moment it is displayed beside an
  outcome, it implies a causation that is not there. Excluded, and worth revisiting only alongside a
  simulation that can read it.
- **Any control that alters the outcome.** §0(B). It is the honest larger question and it is not
  this experiment.
- **Crew or any named attendee besides the promoter.** Not a per-night fact.
- **Walking, travel, or a second location.**
- **Dialogue with the promoter beyond what the terms support.**
- **A results panel.** §6.
