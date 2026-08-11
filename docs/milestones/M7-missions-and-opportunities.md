# Milestone 7 — Missions & the Opportunity Director

**Baseline:** tag `m6-final` (commit `06bca76`). M0–M6 accepted and frozen.

Five milestones have been spent making a career *have* state: a sound, a
catalogue, a record that went out, an audience that reacted to it, and people
who have opinions about all of it. M7 is where that state starts producing
situations.

## The question

**Given the current world and career state, what situations are actually
plausible now?**

Not *what story would be good here*. The director is not a writer and must never
become one. It asks what this world could credibly offer this career at this
moment, and offers it — a promoter with a slot, a battle somebody wants, a
producer with an idea. Whether that makes a good story is what the player
decides by acting on it.

## The constitutional rule

> **Screens may reveal, rank, accept, decline, or act on opportunities. They
> must never create them. New opportunities are world facts created by time
> progression.**

This is the general form of the boundary M6 arrived at, and it now applies to
everything. Folding recorded history is safe anywhere — it is idempotent,
decides nothing, and produces the same answer whenever it runs. Bringing a new
fact into the world is a decision, and decisions belong to time.

Opening Home must not conjure a promoter. If a player opens Home ten times
before letting a day pass, they see the same world ten times.

## The day-advance chain

M7 extends the chain rather than joining it sideways. Each step reads what the
one before it wrote, which is why they are sequential:

```
advance time
  → reception simulation
  → relationship derivation
  → relationship moments
  → opportunity generation
  → persist world facts
  → notifications / Home surface them
```

Generation runs **after** moments, deliberately. "LEX wants to talk" is itself a
fact an opportunity might key off, and a director running beside the moment
engine would be reading a half-built world.

## What already exists

M7 is unusual in that its table was built in M2 and has been waiting since.

| Already persisted | State |
|---|---|
| `opportunities` — type, source entity, status, payload, `available_at`, `expires_at`, `accepted_at`, `resolved_at` | The spine. Correct shape, barely used. |
| `OPPORTUNITY_STATUSES` — AVAILABLE, ACCEPTED, DECLINED, EXPIRED, RESOLVED | Declared in full. |
| `OPPORTUNITY_TYPES` | **One member: `PRODUCER_INTRO`.** |
| `first-contact.ts`, `select-producer.ts` | The only writers. Thabo's introduction, authored by hand. |
| Reception — Fame, Respect, Heat, release performance, cohort response | Available and never read by anything else yet. |
| Relationships — trust, respect, tension, chemistry, crew, open moments | M6. |
| `calendar_items` | What the career is already committed to. |
| `career_memories`, `game_events` | What has happened, in order. |
| `characters` — goals, motives, personality | Who might offer something, and why they would. |

Three findings that shape the work:

1. **`expires_at` is never written, and nothing ever becomes `EXPIRED`.** The
   status exists; the mechanism does not. M7 makes both real.
2. **There is a unique index on `(career_id, type)`.** It was correct for its
   purpose — it is what makes Thabo's introduction happen exactly once however
   many times the page is refreshed — but it makes two live opportunities of the
   same type impossible. Two promoters cannot both want you. That index has to
   change, and the idempotency it was providing has to be re-established some
   other way, per opportunity rather than per type.
3. **Nothing reads reception or relationships to decide anything.** M7 is the
   first system that consumes what M5 and M6 produced. If the inputs turn out to
   be insufficient, that is a finding worth reporting rather than working around.

## Authored versus generated

Both are real and both must survive. They differ in origin, not in kind, and the
player should not be able to tell which is which from the interface.

- **Authored** — hand-written, fixed content, triggered by a condition. Thabo's
  producer introduction is one, and it must keep working exactly as it does.
  These are how a milestone introduces a mechanic or a character for the first
  time, and they will always exist.
- **Generated** — assembled by the director from world and career state. The
  promoter, the venue, the terms and the deadline are chosen from what the world
  actually contains.

An opportunity records which it was. Not for the player, but because the two
need different reasoning when something goes wrong: an authored one that fires
at the wrong time is a condition bug, and a generated one that reads implausibly
is a scoring bug.

## Eligibility versus ranking

Two gates, answering different questions. The crew invitation in M6 proved the
shape and it generalises.

**Eligibility is binary and about the world.** Could this situation exist at all?
A showcase invitation requires a scene that knows you, a catalogue with
something in it, and no clashing commitment. Anything failing eligibility is not
a low-scoring opportunity — it is not an opportunity.

**Ranking is comparative and about the career.** Of the things that *could*
happen, which are worth surfacing now? Ranking never resurrects something
ineligible, and a high score never overrides a failed condition.

Keeping them apart is what makes a director explainable. "Why didn't I get the
showcase?" has two completely different answers — *you have nothing to play* and
*something better came up* — and a single blended score could not tell them
apart.

Scoring must be deterministic and bounded, and every score must decompose into
named contributions, in the way reception's metric pressure and M6's crew
decision already do. No opaque weight.

## Persistence, expiry and state

An opportunity is a world fact with a lifetime.

- Written once, when generated. Never recomputed on read, never rerolled by a
  refresh — the rule M6's moments established.
- The state it was generated from is kept with it, so months later the inspector
  can say why this appeared.
- **It expires.** `expires_at` is set at generation and honoured: an offer nobody
  answered lapses, and lapsing is itself a fact. A promoter whose date has passed
  does not wait indefinitely.
- Expiry happens on the day advance, like everything else that changes the world.
  Not on read, and not by a background timer.
- Declining and lapsing are different, and both are kept. Turning something down
  is a choice; letting it rot is a different one, and later systems — and the
  people who offered — may care which.

## Competing opportunities

The interesting case, and the reason the unique index has to go.

Two things can be plausible at once and mutually exclusive in practice: a
showcase and a battle on the same night, two promoters wanting the same weekend,
a session that clashes with a performance. The director must be able to generate
both, and the world must understand that taking one costs the other.

M7 needs, at minimum:

- Multiple live opportunities per career, and more than one of a type.
- A limit on how many are live at once, so the screen is a set of real choices
  rather than a backlog. An opportunity nobody will ever get to is noise.
- Conflict as an explicit relationship between opportunities — competing for the
  same slot on the calendar, or for a resource the career has one of — so that
  accepting one can resolve the others honestly rather than leaving stale offers
  lying around.

What M7 does **not** need is a full scheduling economy. Detecting that two things
want the same day is enough.

## Consequences

Accepting is not the end of it. An accepted opportunity has to be able to
produce something — a calendar item, a session, a performance, a relationship
event — and the result has to flow back into the systems that already exist
rather than into a parallel one. A showcase that went well should move Heat and
scene Respect through reception's existing pressure model, not through a
mission-specific reward.

Declining is also a consequence. A promoter turned down twice is a relationship,
and M6 already knows how to hold that.

## The golden proof

Two careers, the same day advanced, different offers — and every difference
explainable from recorded state.

```
Career A   KXMO. A respected experimental record that found the scene.
           Strong Respect, modest Fame, good-but-tense relationship with LEX,
           nothing in the calendar.

Career B   Same starting identity. A record that reached people and lost them,
           no meaningful producer relationship, a different history.
```

Advance both one day. The director should produce something like an **underground
showcase invitation** for A — because scene credibility, current Heat and a
catalogue with something playable in it crossed the conditions — and something
different and equally plausible for B, because the world sees a different viable
path from where B actually stands.

The proof has two halves, exactly like M5's sensitivity test:

1. **The offers differ**, and neither is empty. A director that gave both
   careers the same thing would be reading nothing.
2. **The difference is attributable.** For each offer: which conditions passed,
   which failed for the ones that did not appear, what the score decomposed
   into, and why one outranked another. Not asserted — reconstructible.

## Keep it narrow

The director is not a story engine and must not become one in this milestone.
Build deterministic generation, eligibility, scoring, expiry, conflict and
persistence, and get the world facts correct. Narrative dressing sits on top of
correct facts later, exactly as reception's classification sat on top of a
finished simulator.

If the temptation arises to make the director choose what would be dramatic, the
answer is that it does not know what dramatic means and should not learn.

## Out of scope

Full mission chains and multi-stage arcs, contracts and labels, touring,
rival-artist behaviour, an attention economy between careers, procedural venues
or characters, and anything that generates prose with a model.

## Sequence

Headless first, exactly like M5 and M6. No opportunity UI until the golden proof
passes.

1. **Opportunity primitives** — types, the source/authored distinction, the
   index change, expiry fields honoured.
2. **Eligibility** — conditions as named, inspectable rules.
3. **Scoring** — deterministic, bounded, decomposable.
4. **Generation on the day advance** — persisted, never rerolled.
5. **Expiry and conflict** — lapsing, and accepting one resolving another.
6. **Consequences** — accepted opportunities producing real state through
   existing systems.
7. **World Control** — the chain from career state to eligible set to ranked
   offer to persisted fact.
8. **Golden proof** — two histories, one day, different explainable offers.

## The line to keep pinned

> **The world offers what is plausible. The player decides what is interesting.**
