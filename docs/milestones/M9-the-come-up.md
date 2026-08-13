# Milestone 9 — The Come Up

**Baseline:** tag `m8-final` (commit `630ef6d`). M0–M8 accepted and frozen. 326
unit/domain/integration tests and 30 E2E pass on a clean tree; typecheck and lint
are clean.

This is the headless brief. **No progression interface is built in this
milestone.**

The working title survived the investigation, and it did not have to be argued
for: `CAREER_ACTS` has read `UNDERGROUND · COME_UP · INDUSTRY · LEGACY` since
`0001_init`, and `ACT_LABELS.COME_UP` has read *"The Come Up"* since the shell
was built. The vocabulary is the repository's own.

## The question

> **When is this career no longer Underground?**

Not *how much has this player done*. Eight milestones have made a career able to
accumulate; the thing that has never happened is the world drawing a conclusion
from what accumulated.

## The finding that decides the milestone

`careers.career_act` exists. It is `NOT NULL DEFAULT 'UNDERGROUND'` with a check
constraint naming all four acts. It is displayed on **every screen in the game**
through `AppShell`'s `act` prop. It is a **causal input to two live systems**:

| Reader | What the act already decides |
|---|---|
| `ACT_REACH` (`reception/constants.ts`) | Exposure multiplier per release: `UNDERGROUND 1.0`, `COME_UP 1.6`. Every record a Come Up career puts out meets substantially more of the city. |
| `availableFormats` (`shared/releases.ts`) | EP, mixtape, album and collaborative project are **`COME_UP`-and-above formats**. An Underground career can only ever release a loose track or a single. |

It is written in exactly three places — `createCareer` and both branches of
`completeCareerOnboarding` — and every one of them writes `"UNDERGROUND"`.
**Nothing in the game has ever written any other value.**

So the game already has a career phase, already tells the player which one they
are in, already changes the world's behaviour according to it, and has never once
been able to leave the first one. `/catalogue/projects` renders a page whose own
copy says bodies of work open *"when your catalogue and your career can carry
them"* — a promise no career in this game has ever been able to keep.

**M9 is not the milestone that invents career progression. It is the milestone
that supplies the missing cause for a progression the game was built around.**

## Does M9 need a progression engine?

No. Answered explicitly, because it is the most expensive way this milestone
could go wrong.

Everything M9 needs to reason about is already persisted, already deterministic
and already explainable by somebody else:

```
M5   artist_audience.fans / .affinity, release_performance, career_audience
M6   relationships (7 dimensions), relationship_moments, crew
M7   opportunities (+ eligibility, ranking, trigger_state), sceneStanding()
M8   battles, battle judgements, LOCAL_PUBLIC world facts
—    releases, calendar_items, game_events
```

M9 is a **small pure evaluator over facts M5–M8 already own**, plus one write on
the day advance. It introduces no new simulation, no new currency, no new score,
no second version of anything reception or the director already computes. If an
implementation session finds itself re-deriving a number that M5 or M7 already
records, it has taken a wrong turn.

The one thing it does introduce is the **transition** — and a transition is a
world fact, so it belongs to time, exactly like an opportunity.

## Archaeology: what progression already exists

### It exists, it is unnamed, and it is scene-shaped

The world already treats careers differently as they accumulate, and it does it
through one quantity: `sceneStanding()`, a weighted fold of M5's cohort affinity
and fans by each cohort's recorded scene concentration.

A 45-day observation run of a single scene-facing record — one release, no
further player action beyond advancing days — produced:

```
day  1   standing braam  2.35 · newtown  2.70    F0  R2   H1    every offer SUPPORT
day  2   standing braam  4.63 · newtown  5.32    F1  R4   H2    first HEADLINE offer
day 15   standing braam 25.88 · newtown 29.41    F5  R20  H10
day 30   standing braam 64.80 · newtown 74.39    F23 R100 H48
day 45   standing braam 73.84 · newtown 85.00    F67 R100 H100
         → every promoter in the world offering HEADLINE, including Soweto (standard 12)
         → scene heads affinity 1000/1000 · tastemakers affinity 1000/1000
         → careers.career_act: UNDERGROUND
```

That last line is the milestone. The world has completely revised its judgement —
Respect reads *Untouchable*, four promoters want this artist to carry their
rooms, a rival has called them out — and the game still classifies the career as
Underground and still refuses it an EP.

**Progression is already emergent. What is missing is recognition of it.** So
M9's answer to the A/B question the investigation was set is neither: it is
**mostly A with a small, well-bounded B**. The evidence exists; the transition
does not; and the two consequences that matter most are already wired and
inert.

### The same run, a different record

The controlled comparison — a record aimed at everybody, made with a different
producer, released straight — stalls:

```
day 10 – 45   standing braam 3.70 (frozen) · 121 listeners · 4 fans · F2 R3 H2
              momentum 0.3 · no further offers of any kind, ever
```

Two properties worth carrying into the design:

1. **Careers do not converge.** Two histories 45 days apart are unmistakably
   different to every system that reads them.
2. **`RECORD_IS_MOVING` is the world's off-switch.** Momentum decays; a career
   with nothing moving is offered nothing. Releasing again is the only way to
   re-open the world — which is a real pressure toward activity that M9 must be
   careful not to reward *as evidence*.

### What does not act like progression

- **Fame, Respect, Heat and Legacy are pure outputs.** They are written by
  reception and battles, displayed to the player, recorded into `trigger_state`
  — and **read by no decision anywhere in the simulation**. `rankShowcase` and
  `rankBattleChallenge` both name `fame` in their `irrelevant` list explicitly.
- Worse, they saturate. One record with no further player input reaches
  `respect = 100` and `heat = 100` — the `CAREER_METRIC_CEILING` — by day 30.
  Any model keyed to them would promote a career that has released one single and
  done nothing else.
- **The economy is inert past the studio.** `TRANSACTION_CATEGORIES` is
  `STUDIO_COST · SESSION_REFUND · STARTING_CAPITAL · OTHER`. Nothing pays a
  career. Money never moved once across 45 days.
- **Live performance does not resolve** (see *Defects*). A career cannot
  currently accumulate live evidence at all.

### The vocabulary that is already sitting there

| Declared | State |
|---|---|
| `CAREER_ACTS` (4 members) | Complete. `career_act` written once, never again. |
| `ACT_LABELS` / `ACT_LINES` | Complete, player-facing, on every screen. |
| `GameEventType.CareerEnteredUnderground` (`career.entered_underground`) | Real, `LOCAL_PUBLIC`, importance 90, written at onboarding. **The exact shape a second transition needs.** |
| `artists.is_public` / `groups.is_public` | `DEFAULT false`. Player entities are created `false` and **nothing ever flips it**. The public-profile route, the `PUBLIC / OWNER_PREVIEW / HIDDEN` access model and the owner preview all exist and have never had a cause. |
| `EVENT_VISIBILITIES` `GLOBAL_PUBLIC` | Declared, never written. The World feed does not currently distinguish it from `LOCAL_PUBLIC`. |
| `CHARACTER_ROLES` `MANAGER · JOURNALIST · EXECUTIVE · ENGINEER` | Declared, **none seeded**. The world contains 1 connector, 3 producers, 4 promoters, 3 opponents. |
| `AFFINITY_FULL = 250` | Documented as *"as far as the Underground needs to reach; the rest is for later acts to earn"* — and empirically reached and exceeded fourfold by one record. |

The `is_public` finding and the `entered_underground` finding are the two that
matter: between them, the whole world-facing half of a phase transition is
already built and waiting.

## What a career phase is

> **A career phase is a durable classification of how the world currently relates
> to an artist, inferred from several independent forms of accumulated evidence,
> and never from a total.**

Three clauses, each doing work:

- **How the world relates** — not what the player did. This is the whole
  activity/recognition distinction, below.
- **Several independent forms** — plurality is structural, not a balancing pass.
- **Durable** — momentum is velocity and a phase is not. Heat spikes; a phase
  does not.

And what it is not: not XP, not a level, not a rank, not a tier of Fame, not an
achievement count, not a hidden score with a name on it. There is no progression
number in M9 and no place for one to be stored.

### Activity is not evidence

The distinction the whole model rests on, and the hardest rule in the milestone:

> **No evidence family may qualify because the player performed an action.**
> Every family must read a judgement the world made, a threshold the world
> seeded, or a state change that some system other than the player's input
> produced.

| Activity — the player did something | Recognition — the world changed its judgement |
|---|---|
| Released three records | Reception happened: people who did not know this artist came back a second time and stayed |
| Booked six sessions | LEX raised an unprompted `WANTS_ANOTHER_SESSION` — M6's bar, on M6's state, not the player's booking |
| Was offered nine nights | A scene's standing crossed a **promoter's own headline standard** — a bar the world seeded, not one M9 invented |
| **Accepted a showcase** | **Nothing yet.** A booking is an intention. A night that actually happened could be evidence — and cannot be, until the game can resolve performances at all (see *Defects*) |
| Accepted a challenge | The scene watched a battle happen and it is a `LOCAL_PUBLIC` fact |
| Has 3,400 listeners | 828 of them became fans, which conversion only produces against genuine fit |

The showcase row is the one to hold the line on, because it is the tempting one:
an accepted booking is a row in the database that looks exactly like evidence and
is not. **An accepted offer is a decision the player made about the future.** It
becomes recognition only when the world has done something with it, and today the
world does nothing with it.

The general test for any family, now or later:

1. Could this be satisfied by a player taking an action, without any other system
   agreeing? If yes, it is not a family.
2. Whose threshold decides it? If the answer is "M9's", prefer a bar the world
   already seeded.
3. If the family requires an event to have *happened*, can the game currently
   make it happen? If not, **exclude or defer the family** rather than accepting
   a proxy for it.

Every family below passes all three. Where a family could be read either way, it
reads the world's own recorded threshold rather than a count of player actions.

## Stored or derived

**Both, split cleanly — and the split is forced by the architecture rather than
chosen for taste.**

**Evidence is derived.** A pure fold over recorded facts. It decides nothing, is
idempotent, returns the same answer whenever it runs, and is therefore safe to
read anywhere — the rule M6's moments established and M7 generalised.

**The phase is stored**, in `careers.career_act`, which already exists. This is
not a convenience. `career_act` is an **input to reception's stochastic,
versioned, replayable simulation** through `ACT_REACH`. A derived phase would
mean a replayed tick could read a different act from the one that actually
applied on the day, and M5's replay guarantee — *same seed, same sixty days,
identical stored state* — would stop being true. A quantity a historical
simulation consumed must be the quantity it consumed.

**The transition is an event.** `career.entered_come_up`, `LOCAL_PUBLIC`, carrying
the evidence that qualified it, so that months later under a newer evaluator the
inspector can say *why this career came up* using the facts the old one actually
saw. This is `trigger_state`'s discipline, applied to a phase.

**The observation is persisted**, because durability cannot be answered from
current state alone — see *Durability*, below. This is the one piece of new
storage M9 needs: a single row per career, following `career_metric_pressure`'s
established precedent exactly (a per-career accumulator, written only on the day
advance, read by nothing that decides anything else).

So: one new table with one row per career, one migration, one new event type, one
new command, one call site. No new column on `careers`, and no second opinion
about anything M5–M8 already records.

## Transition semantics

- **Monotonic.** A career that reaches `COME_UP` never returns to `UNDERGROUND`.
  Three reasons, and the first is decisive: `ACT_REACH` would make a later
  release reach *fewer* people than an earlier one for reasons no player can see;
  `availableFormats` would revoke an album a career already has eight tracks
  toward, which is a punishment with no author; and conceptually the scene does
  not un-know you. What decays is Heat and momentum, and both already decay.
  If a decline phase is ever wanted it is a **different phase**, not a reversal.
- **Career-scoped and global**, not scene-specific. Scene-specific standing
  already exists, is already causal, and already produces the SUPPORT/HEADLINE
  distinction. A per-scene phase would be a second opinion about the same
  question. The phase is the career's relationship with the world; standing is
  its relationship with a neighbourhood.
- **Evaluated on the day advance and nowhere else.** Screens may reveal the
  phase. They must never cause one. A player who opens Home ten times before
  letting a day pass is in the same act ten times.
- **Written once**, under `career:{careerId}:entered_come_up`, in one transaction
  with the act update.
- **One transition per advance, maximum.** M9 implements exactly one:
  `UNDERGROUND → COME_UP`. `INDUSTRY` and `LEGACY` are not in this milestone and
  no code should be shaped for them speculatively.

### Where in the day advance

Step 6 — **after** the director and after opportunity messages.

The act is an input to reception, so a phase that changed before step 1 would
apply a Come Up's reach to a day the career only qualified at the end of. And the
director's own argument applies unchanged: a conclusion drawn about a
half-written day would be explaining a world that never existed. The world
decides at the close of the day and treats the artist differently **from
tomorrow**, which is also the honest fiction.

A failure at step 6 must not undo the day. The reception, the relationships, the
moments and the offers are already real; a phase that could not be evaluated is
reported as *no transition*, and the next advance evaluates the same facts again.

## The evidence model

Five **families**. Each is an independent boolean with a named reason and the
value it was applied to. There are no weights, no confidence, no partial credit
and no total.

Each family reuses the `EligibilityCheck` shape M7 already established —
`{ rule, passed, reason, observed }` — so World Control's existing inspector
idiom works unchanged and every bar can be disagreed with later using the numbers
the old evaluator actually saw. **Every family is evaluated even after enough
have passed**, for the same reason eligibility never short-circuits: "why not
yet?" is usually three separate things.

| Family | What it claims | Read from |
|---|---|---|
| **AUDIENCE_THAT_STAYED** | People who did not know this artist came back and stayed | M5 `artist_audience.fans`, across cohorts. Fans, never listeners — the distinction M5 exists to hold. |
| **A_SCENE_THAT_KNOWS_YOU** | Somewhere in the city, the artist is worth building a night around | `sceneStanding()` at or above a seeded promoter's **headline** `standard` in at least one scene. The world's own bar. |
| **WORK_THAT_LANDED** | More than one record has met an audience | M5 `release_performance` — releases with real engaged listeners and conversions. **Not a release count.** |
| **PEOPLE_WHO_CAME_BACK** | Somebody in the world decided, unprompted, that they want more | M6: an open or answered `WANTS_ANOTHER_SESSION`, a crew member who said yes, a relationship past a producer's own `INVITE_MIN_RESPECT`. The NPC's decision, never the player's booking. |
| **THINGS_THE_SCENE_SAW** | The artist is a public fact more than once, in more than one way | A **closed allow-list** of world-witnessed event types (see below). |

### The public-record family needs an allow-list, not a visibility filter

Five event types are written `LOCAL_PUBLIC` today: `career.entered_underground`,
`release.published`, `battle.resolved`, `producer.selected` and
`track.saved_to_catalogue`. The last two are not things the scene witnessed —
saving a track to your own catalogue is a private act with a public visibility
tag. Counting `LOCAL_PUBLIC` naively would let a career manufacture public record
by finishing tracks in a room nobody was in.

So this family reads a **named vocabulary of world-witnessed facts**, in the same
closed-list discipline `RANKING_TERMS` uses, and it requires **more than one
kind** — which is precisely what keeps battles optional. A record out and a
battle fought satisfies it. So does a record out and a night played, once nights
resolve. So does two records out and a battle refused in public, if the world
records that. No single kind can satisfy it alone.

*(The `producer.selected` / `track.saved_to_catalogue` visibility tags are noted
as pre-existing and are **not** changed by M9 — see Defects.)*

### Qualification

A career transitions to `COME_UP` when **all three** hold:

1. **Breadth** — at least **three of the five** families are satisfied.
   Three, not five, so no route is mandatory. Three, not one, so no single
   quantity can carry a career.
2. **An anchor** — at least one of **A_SCENE_THAT_KNOWS_YOU** or
   **PEOPLE_WHO_CAME_BACK** is among them. A person or a place has to have
   changed how they treat this artist. Audience, catalogue and public record are
   all things that can be true of somebody nobody has decided anything about.
3. **Durability** — breadth and anchor have both held continuously for at least
   `COME_UP_DURABILITY_DAYS` of **game time**. A phase is not a spike, and Heat
   already exists for spikes.

That is the entire model. It fits in a paragraph, it is explainable in the
player's language without exposing anything, and it produces the properties the
milestone requires.

**This is the implementation hypothesis, not a product constant.** Three-of-five,
the anchor pair and the window are the simplest rule that could produce the
required properties, and the golden careers exist to **falsify** it. If they
cannot be separated honestly — if the busy career qualifies, or the grinder does,
or two genuinely different careers become indistinguishable — the correct
response is to report that and revise the rule, not to move a bar until the
suite passes.

What must **not** happen under that revision: weights, totals, scores, partial
credit or confidence. Those are only on the table if the simple rule is proven
incapable of separating the golden careers, and proving that is a finding worth
its own report — not a decision an implementation session takes quietly to make
a test go green.

### Plural paths, structurally

Not a balancing exercise — a consequence of the shape. With three-of-five plus an
anchor, there are ten qualifying combinations, and:

- **Battles are never required.** They contribute only to
  `THINGS_THE_SCENE_SAW`, which has other satisfiers. Any career qualifying with
  the other four families never fights anybody.
- **Crew is never required.** It is one of three satisfiers of
  `PEOPLE_WHO_CAME_BACK`, and that family is one of two anchors.
- **Virality is never required.** `AUDIENCE_THAT_STAYED` reads fans, not reach,
  and is not an anchor.
- **A large audience cannot dominate.** It is one family. The largest audience in
  the world is one of the three needed and cannot be the anchor.
- **Coherence beats completion.** A career with four families is not "further
  along" than one with three; there is no further along. It qualified, or it has
  not yet.

### Durability

The rule that stops an instant from being a phase, and the one part of the model
that cannot be answered by folding current state — because "is this true now" and
"has this been true since" are different questions, and only the second one
describes a career.

**Represented as a persisted observation**, one row per career, upserted at
step 6 of every day advance:

| Field | Meaning |
|---|---|
| `careerId` | Primary key. One row per career, like `career_metric_pressure`. |
| per-family `trueSinceGameTime` | The game time each family first became true **and has been true continuously since**. Null when the family is currently false. Cleared when a family goes false. |
| `qualifyingSinceGameTime` | The game time breadth-and-anchor first held **and has held continuously since**. Null when qualification is not currently met. |
| `lastEvaluatedGameTime` | The game time of the most recent evaluation. |
| `evaluatorVersion` | Which evaluator produced this. Rules change; history must not. |

Durability is met when
`currentGameDate − qualifyingSinceGameTime ≥ COME_UP_DURABILITY_DAYS`.

Four properties this shape buys, each of which is a requirement rather than a
nicety:

- **Game time only.** Every timestamp written here comes from the career's own
  clock during the advance. **No wall-clock time is read, stored or compared
  anywhere in the durability model.** A career left alone for a month of real
  time has not become more durable.
- **Replay-safe.** The same seed and the same sequence of advances produce the
  same game dates, so they produce the same watermarks and the same transition
  day. A durability model that re-derived from wall time could not be replayed at
  all.
- **A break resets.** If qualification lapses — a family goes false, most
  plausibly `PEOPLE_WHO_CAME_BACK` when a moment resolves —
  `qualifyingSinceGameTime` is cleared and the window starts again from the next
  day it holds. **A career that qualifies for three days, lapses, and qualifies
  again does not add the two stretches together.**
- **It answers the question.** *Which evidence families were true, from when, and
  what made the transition durable enough to become a world fact?* is a single
  row plus the transition event, without replaying anything.

The observation decides nothing except durability. It is not a score, it is not
read by any other system, and it is never shown to a player.

### Why grinding fails

Stated as mechanisms, not as intentions:

- **Repetition saturates.** Fan conversion is fit-gated and bounded by cohort
  size; a fourth record aimed at the same three thousand people converts almost
  nobody new. `AUDIENCE_THAT_STAYED` and `WORK_THAT_LANDED` both stop moving.
- **One number cannot reach three families.** They read disjoint tables.
- **The anchor cannot be manufactured by activity.** A promoter's headline
  standard is the promoter's; `WANTS_ANOTHER_SESSION` is M6's condition on
  somebody else's state. Booking more sessions does not raise trust — the *work*
  does, and badly-received work lowers it.
- **Durability defeats the spike.** The one thing an activity burst reliably
  produces is momentum, and momentum decays inside the window. A career that
  crosses breadth and anchor for two days and lapses has its window reset, not
  banked.
- **There is no number to discover.** There is no total, so there is nothing to
  optimise toward. The most a player could learn is that several different kinds
  of thing have to be true, which is the actual design and is safe to know.

## The transition does not rewrite history

A phase change is a fact about the world **from now on**. It is never a new lens
over what already happened, and an implementation that reinterprets the past
through the new act has broken the milestone rather than completed it.

When `UNDERGROUND → COME_UP` occurs:

- **Existing releases keep the act context they were simulated under.** A record
  that reached people as an Underground record reached them as one. No
  `release_performance`, `release_cohort_performance` or `reception_ticks` row is
  recomputed, rewritten or re-explained.
- **Existing opportunities remain historical facts.** Every offer keeps its
  `trigger_state`, `eligibility` and `ranking` exactly as the director recorded
  them. A `SUPPORT` billing offered last month stays a support slot that was
  offered; it does not become a headline slot in hindsight.
- **Existing audience results are not recomputed.** `artist_audience`,
  `career_audience` and every cohort projection carry on from where they are. The
  new act does not retroactively widen a reach that already happened.
- **Relationships, battles and moments are untouched.** M6's fold resumes from
  its watermark; it does not re-derive under a new act.
- **The new act applies from the next simulation boundary onward** — the next
  reception tick, the next release planned, the next director run. Which is
  exactly why the evaluation sits at step 6: the day that qualified a career is
  simulated under the act the career held while living it.

The single-sentence form, and it belongs in a test: **no row written before the
transition may differ after it.**

## What becomes different

A phase with no behavioural consequence is a badge. Every consequence below is
in an existing system; **M9 introduces no reward of its own**, exactly as M8
introduced no battle currency.

### Already wired — becomes true the moment the act changes

1. **Bodies of work open.** EP, mixtape, album and collaborative project.
   `availableFormats` already gates on the act and is already tested. This is the
   single largest change in the game's possibility space and it costs **no new
   code at all** — the milestone's whole job is to make the condition reachable.
2. **Records reach further.** `ACT_REACH` goes 1.0 → 1.6. Every subsequent
   release meets substantially more of the city, which is the only mechanism in
   the game by which the 94,000-strong casual population becomes reachable at
   all. The player experiences this as records travelling further, never as a
   multiplier.

### Small new work, on architecture that exists and has never had a cause

3. **The scene notices.** `career.entered_come_up` as a `LOCAL_PUBLIC` world
   fact, importance 90 — the exact sibling of `career.entered_underground`. It
   lands in the World feed beside releases and battles, which is where the scene
   already learns things.
4. **The profile opens.** `artists.is_public` (or `groups.is_public` for a group
   career) flips to `true`. The public route, the world-scoped slug resolution and
   the `PUBLIC / OWNER_PREVIEW / HIDDEN` access model are all built and proven,
   and this is the first cause the flip has ever had. *Becoming a public fact at
   a wider scope* is the one world consequence M9 can deliver honestly, because
   the architecture for it already exists.

### Deliberately not M9's, with reasons

- **Billing.** `SUPPORT → HEADLINE` already flips on day 2 from scene standing.
  It is a scene-standing consequence and must stay one; giving the phase a second
  say would put two systems in charge of one decision.
- **Different people calling.** The world contains no manager, journalist,
  executive or engineer. This is a **content gap**, the same shape as M8's *there
  is nobody to battle* — and naming it first is the point. Seeding later-act
  characters is a real milestone's work, not a side effect of this one.
- **Fees, terms and leverage.** There is no performance payout to improve
  (see Defects) and no transaction category for one. M9 cannot change economic
  terms that do not yet exist.
- **Audience behaviour changes** beyond `ACT_REACH`. Cohort discovery, repeat
  behaviour and conversion stay exactly as M5 built them. A phase that quietly
  rewrote the audience model would make reception unexplainable.
- **Recognition travelling between scenes.** `sceneStanding` is already a fold
  over city-wide cohorts weighted by concentration, so warmth already travels.
  Nothing more is needed and nothing more should be added.

### The closed list

The consequences of coming up, in full. **Nothing outside this list is M9's**,
and the list is closed rather than illustrative:

1. `careers.career_act` becomes `COME_UP`.
2. `career.entered_come_up` is emitted exactly once, `LOCAL_PUBLIC`.
3. `artists.is_public` (or `groups.is_public`) flips where appropriate.
4. Subsequent reception uses the existing `ACT_REACH` value for `COME_UP`.
5. Release formats already gated by act become available under the existing
   `availableFormats` rules.

Four and five are not new behaviour — they are existing behaviour becoming
reachable. **M9 writes no new consequence logic for either.**

Explicitly **not** added by M9, in any form:

- managers, labels or signings;
- new promoter classes or tiers;
- fee systems, payouts or economic leverage of any kind;
- press, media or journalists;
- global or national fame;
- new opportunity types;
- new relationship kinds, moment kinds or interaction kinds;
- new calendar item types;
- new event visibilities in use.

Each of those becomes a legitimate consequence once the system that owns it
exists. Adding one here would mean M9 building somebody else's milestone badly in
order to make its own transition feel bigger.

## The Legacy decision

**M9 touches neither Legacy, and they are two different things that share a
word.**

- `careers.legacy` — the fourth metric, deliberately immobile since M5, with no
  accrual column in `career_metric_pressure` by design and no term in
  `battleStandingPressure`. M5's restraint — *one Underground single does not
  create a legacy* — is exactly as true of one Come Up. **Nothing M9 introduces
  may write it** — no pressure, no accrual, no transition, no reward.
- `LEGACY` the **career act** — two transitions away and out of scope.

**Golden invariant, asserted for every career in the suite:** a career can enter
`COME_UP` — with all of its consequences — while `careers.legacy` and
`artists.legacy` both remain exactly `0`. Coming up writes no legacy.

And the concepts are genuinely distinct, which is why activating one for the
other would be a mistake: **a phase is how the world relates to you now; Legacy
is what survives you not being there.** A career can come up, be treated
completely differently by everybody, and leave nothing behind. If Legacy becomes
relevant it will be because something outlasted a career, and M9 produces no such
fact.

## Player-information boundary

M9 builds no read model. The boundary is specified now so the eventual
player-facing milestone inherits it rather than negotiating it, exactly as M7 and
M8 did.

**Never reaches a player, under any framing:**

| Internal | Player-facing |
|---|---|
| Evidence-family booleans — which passed, which failed | *nothing* |
| The count — "3 of 5" | *nothing*, in any wording |
| Any family's threshold, bar or `observed` value | *nothing* |
| The anchor requirement, or that one exists | *nothing* |
| The durability window, or any counter toward it | *nothing* |
| `qualifyingSinceGameTime` / any `trueSinceGameTime` | *nothing* |
| A promoter's `standard` / `supportStandard` | *nothing* |
| `sceneStanding` as a number | *nothing* — M7's boundary, unchanged |
| Any phase score, confidence or percentage toward Come Up | *nothing* — none exists |
| Anything phrased as progress, remaining, requirements or unlocked | *nothing* |

There is no progression bar, no score, no percentage, no checklist, no
locked-stage list, no "what do I need". **The player experiences the world
changing first**, and the vocabulary of qualification never reaches them at all.
World Control may inspect every one of the above and should.

### How the player finds out

M7's test, applied: **who would tell them, and where would the consequence live?**

**Nothing announces it first.** The first thing that happens is that
`/catalogue/projects` stops saying *"Not yet"* — the page that has always shown
the shape of a career this game is heading toward, doing what its own copy
promised. The world behaving differently, discovered rather than declared.

- **Who tells them.** The scene, in the World feed, as a `LOCAL_PUBLIC` fact
  among the other things the scene noticed. Not a system, not a modal.
- **Where the consequence lives.** Catalogue and Projects (formats), World (the
  public fact), Career (the act, already rendered on every screen), and the
  public profile (now reachable).
- **A notification is warranted** — one, `DONE` tone, pointing at Career — under
  M8's rule that the player must be told about the thing that happened while they
  were not looking. It says the act changed. It does not say why, and it carries
  no number.

If a later milestone wants a retrospective, it builds it from `career-story.ts`,
which already reads history back from persisted rows and already refuses to
narrate more than the world recorded.

## Golden careers

Seven deterministic careers for the headless proof. They are built with content
that exists — three producers, four promoters, three opponents, one connector —
because a golden career the world cannot produce proves nothing.

Every career publishes at least one record before advancing, since
`advanceCareerDay` refuses a career with nothing out. All seven share one seed,
so every difference is attributable to what the career did rather than to the
dice.

| | Career | History | Families | Qualifies |
|---|---|---|---|---|
| **A** | **The scene writer** | LEX, friction, experimental direction, `TEASE`; a second record after the session invite; never battles, never takes a night | AUDIENCE · SCENE · WORK · PEOPLE | **Yes**, anchored on PEOPLE |
| **B** | **The releaser** | ZERO, accessible direction, `DROP`; several records; thin relationships; declines every session invite | AUDIENCE · SCENE · WORK | **Yes**, anchored on SCENE |
| **C** | **The collaborator** | Two producers, a crew invitation accepted, session invites taken; fewer records than A or B | WORK · PEOPLE · SAW | **Yes**, anchored on PEOPLE |
| **D** | **The competitor** | One record, KGOSI's challenge accepted and fought, a second record after | SCENE · WORK · SAW | **Yes**, anchored on SCENE |
| **E** | **Busy, not progressing** | Many sessions; tracks kept private or released to nothing; every offer declined; no relationship crossing an NPC's own bar | SAW only | **No** |
| **F** | **The one-dimensional grinder** | One record that ran away in the scene — the observed 45-day run: `respect 100`, `heat 100`, standing 85, every promoter offering HEADLINE | AUDIENCE · SCENE | **No** |
| **G** | **The spike** | Reaches breadth and anchor, then loses one of them inside the durability window — most plausibly by an open `WANTS_ANOTHER_SESSION` resolving | Qualifies at an instant, not across the window | **No** |

Four cross-assertions carry the proof, and they matter more than the seven rows:

- **A and B qualify on different family sets**, one anchored on a person and one
  on a place. That is plural paths, demonstrated rather than asserted.
- **A, B and C never battle. C never releases more than twice. D never invites
  crew.** Nothing is mandatory. At least one successful path has no battles and
  at least one has no crew, asserted directly rather than inferred.
- **E and F are the milestone's real tests.** E did *more things* than A and does
  not qualify. F has *larger numbers* than A — the largest this game currently
  produces — and does not qualify, because two families is not three and one
  record is not a body of work. F is not a hypothetical: it is the exact career
  the 45-day observation run produced, and it would pass any threshold model
  keyed to Fame, Respect, Heat or scene standing. **If F ever qualifies, the
  model has failed.**
- **G proves durability is real.** It is the one career that would qualify under
  an instantaneous rule and must not under this one. Its `qualifyingSinceGameTime`
  is set, cleared, and — if it later re-qualifies — restarted rather than resumed.
  Without G, durability is an assertion in a document rather than a property of
  the system.

Together the seven prove the thesis the milestone rests on: **progression is
about independent evidence, not volume of activity.** E has the most activity and
F has the biggest numbers, and neither has come up.

## Determinism, idempotency, replay, long horizon

- **The evaluator is pure and total.** Facts in, qualification out. No clock, no
  randomness, no database, no network — the shape `direct()` and the three
  judges already hold. Ties and orderings break on stable keys, never on a seed.
- **Idempotent.** A career already at `COME_UP` is not evaluated for it. The
  transition is keyed `career:{careerId}:entered_come_up` and a replayed advance
  collapses onto the original event.
- **Replay-exact.** Two worlds, the same seed, the same sequence of advances:
  the same act on the same day, the same evidence, the same event. This is
  asserted the way `reception-long-horizon` asserts sixty days.
- **Long horizon.** The evaluator reads projections, never the event log
  replayed — `THINGS_THE_SCENE_SAW` counts rows through the existing indexes.
  A career must be evaluable on day 400 in the same time it takes on day 4.
- **Durability is measured in game time and persisted**, as a per-career
  observation written only by the day advance. It is never derived from wall
  time, and it is never re-derived from current state — which is the whole reason
  it is stored (see *Durability*).
- **The observation is an upsert, not a log.** One row per career, so a
  four-hundred-day career carries the same durability state as a four-day one.
- **`career_act` at the time of a tick is history.** Nothing may retroactively
  reinterpret a past reception tick under a later act.

## Falsifiable conditions

The model is **wrong** — not badly tuned, wrong — if any of these is true:

1. One metric dominates every successful path.
2. Releasing or performing repeatedly eventually guarantees the transition
   regardless of reception.
3. Battle participation is required, or measurably accelerates the transition
   more than any other route.
4. Two meaningfully different successful careers produce the same evidence.
5. A career crosses the phase and nothing in the world behaves differently.
6. Progression can only be explained by exposing an internal score.
7. A player can optimise by finding one hidden number and grinding it.
8. The phase duplicates Fame, Respect, Heat or Legacy — in particular, **if
   golden career F qualifies**.
9. The transition requires rewriting any M5–M8 canonical output.
10. The system cannot say *why* the world now treats this artist differently
    using facts already in the career history.

Four more the repository itself suggests:

11. **A career transitions on a render.** The act changed because somebody opened
    a screen.
12. **A career can go back.** Anything that writes `UNDERGROUND` over `COME_UP`.
13. **The transition changes a past tick.** A replayed release simulates
    differently after a phase change than it did before.
14. **The evaluator recomputes something M5 or M7 already records.** A second
    opinion about standing, reception or a relationship is a second source of
    truth, and the first thing to go wrong under it is an explanation that no
    longer matches the row.
15. **A family qualifies on a player action alone.** Any family that becomes true
    without some other system having agreed — in particular, any family satisfied
    by an *accepted* offer rather than a *resolved* one.
16. **Durability reads wall-clock time.** Any comparison against `Date.now()`,
    `created_at` or any server clock in the qualification path.
17. **A lapsed window is banked rather than reset.** Golden career G qualifies.

## World Control

The inspector must reconstruct the full chain without inference:

```
career history → each family, passed or failed, with the value it was applied to
  → the anchor, satisfied or not, and by which family
  → the durability window and whether it held
  → the qualifying day
  → career.entered_come_up, with the evidence as it stood
  → what changed: formats, reach, the public fact, the profile
```

For a career that has *not* transitioned, the same view must say which families
are unsatisfied and what they were measured against — the failure side is the
one that gets debugged, and eligibility's *every rule is evaluated* discipline is
why it can be answered at all.

## Defects and gaps discovered

Reported here, **not fixed in M9**, per the M7/M8 discipline.

### Genuine defect — an accepted showcase never happens

`acceptOpportunity` writes a `PERFORMANCE` calendar item for a `SHOWCASE_SLOT`
and **nothing in the game ever resolves it**.

- **Violated expectation.** `getOfferView` labels a showcase `"EARNS"` and
  surfaces `payoutMinor`. No money ever moves: `TRANSACTION_CATEGORIES` has no
  performance fee, and no code path credits one. The game tells the player a
  night pays and it does not.
- **Origin.** M7's acceptance path, `commands/opportunities.ts`. The calendar
  item is created; nothing consumes it. `advance-day.ts` resolves due *battles*
  and nothing else.
- **Behaviour that exposes it.** Accept a night, advance past it: the item stays
  `SCHEDULED` forever, no `CalendarItemCompleted`, no world event, no reception
  effect, no relationship interaction with the promoter, and — because it remains
  a commitment — it permanently fails `NIGHT_IS_FREE` for that night against
  every future offer.
- **Blast radius.** The entire live limb of the causal chain. It is why M9's
  evidence model has no live-performance family and why "economic terms change"
  is out of scope: **a career cannot currently accumulate live evidence at all.**
- **Smallest honest correction.** A performance is the *second* scheduled world
  event, joining the seam M8 built for exactly this — beside `resolveDueBattles`,
  not inside it. That is a milestone, not a patch, and M9 must not attempt it.
- **Canonical outputs changed:** none, by leaving it alone.

**This defect is not absorbed into M9, and the boundary is explicit.** M9 must
not, in any form:

- resolve a performance;
- pay a fee or add a transaction category;
- complete or cancel a `PERFORMANCE` calendar item;
- emit a performance world event;
- derive a relationship interaction from a night;
- or treat an *accepted* showcase as though a night had happened.

It stays open, documented, and owned by a later milestone. **Its existence is the
reason there is no live-performance family**, and the reason
`THINGS_THE_SCENE_SAW` currently has fewer satisfiers than it eventually should —
a record out and a battle fought, where a night played ought to be a third. That
is the honest position: the live family is excluded, not faked. When performances
resolve, a night becomes a satisfier and a live family becomes arguable, and both
should arrive with that milestone rather than ahead of it.

### Calibration, and it bears directly on M9

**Scene standing and the career metrics saturate inside the Underground.**
`AFFINITY_FULL = 250` is documented as the Underground's reach with *"the rest
for later acts to earn"*, and one record reaches `affinity = 1000` — the column
ceiling — in both small cohorts within 45 days. `respect` and `heat` both pin at
`CAREER_METRIC_CEILING` by day 30 with no player action whatsoever.

Nothing is violated; the model does what its constants say. But a signal at its
ceiling discriminates nothing, and this is a large part of why M9 reads fans,
relationships and public record rather than Fame, Respect and Heat.

**No coefficient is changed in this session, and none should be changed to make
M9 work.** If the implementation finds that
`A_SCENE_THAT_KNOWS_YOU` is satisfied by every career that has released anything,
the honest response is to report it — not to raise the bar until the golden
careers separate.

### Non-blocking observations

- **`producer.selected` and `track.saved_to_catalogue` are `LOCAL_PUBLIC`** and
  are not things the scene witnessed. Not corrected here — the visibility tags
  are load-bearing for the World feed and changing them is a behaviour change to
  a shipped surface. M9 works around it correctly by reading a named allow-list
  rather than a visibility filter, which is the better discipline anyway.
- **`GLOBAL_PUBLIC` is indistinguishable from `LOCAL_PUBLIC`** in the World feed,
  which filters on both. Writing `GLOBAL_PUBLIC` would change nothing today, so
  M9 does not write it.
- **The world has no later-act characters.** Managers, journalists, executives
  and engineers are declared roles with no seeds. A content gap, named so it does
  not masquerade as an engine gap.
- **`advanceCareerDay` requires a released record.** Time cannot move for a
  career with nothing out. Correct as designed, and a hard constraint on every
  golden career's construction.

## Out of scope

Unchanged from the brief that set this milestone, and to be resisted:

- **Any progression interface.** No screens, no route, no badge, no card. The
  player-facing milestone comes after, as it did for M7 and M8.
- **`INDUSTRY` and `LEGACY` transitions.** One transition, properly modelled,
  before any structure is built on top of it.
- **Legacy the metric.** Nothing may write it.
- **Performance resolution**, and everything downstream of it: fees, terms,
  leverage, session economics.
- **New characters, roles or content** for later acts.
- **Billing, promoter standards, ranking, eligibility or the cap.** The director
  is not reopened.
- Labels, signings, managers, touring, awards, charts, streaming platforms,
  social media, press, festivals, brand deals, contracts, national fame, PvP,
  multiplayer, new battle mechanics, new creation mechanics, skill trees, XP,
  levels, perks, achievements.

M9 makes the systems already built accumulate into a career that changes. It does
not become *everything that happens after Underground*.

## Headless implementation sequence

Locked. Each step is the precondition for the next, and the order is not an
implementation session's to rearrange.

1. **Shared evidence vocabulary.** The five families and the qualification rules
   as a closed list in `shared`, in the shape `EligibilityCheck` already uses.
   Named before anything evaluates them, so the model is designed rather than
   accumulated — M5's rule for its event vocabulary.
2. **Pure evidence evaluator** in `simulation`. Facts in, families out. No
   database, no clock, no randomness. Testable against hand-built facts before a
   world exists around it.
3. **Fact assembly from existing canonical systems** in `domain`, reading M5–M8's
   projections. Nothing recomputed. This is where the temptation to re-derive
   standing lives; it is the step to review hardest.
4. **Durability tracking.** The persisted per-career observation: family
   watermarks, `qualifyingSinceGameTime`, reset-on-lapse. Game time only.
5. **Transition command and orchestration** at step 6 of the day advance — one
   command, one transaction, evaluated after the director and after messages.
6. **`career.entered_come_up`**, `LOCAL_PUBLIC`, emitted exactly once, carrying
   the evidence as it stood.
7. **Prove the existing consequences** — `career_act`, `ACT_REACH` on the next
   release, formats opening under `availableFormats`, the public profile
   resolving `PUBLIC`.
8. **The golden careers A–D**, qualifying on different family sets.
9. **The negative proofs** — the one-dimensional grinder (F), the busy career
   (E), and the spike that fails the durability window (G).
10. **Replay, idempotency and long-horizon tests**, including
    `career.entered_come_up` exactly once under repeated advances.
11. **World Control causality** — the full chain, for a career that came up and
    for one that has not.
12. **Stop before any player-facing UI.** The player experience is the next
    milestone, as it was for M7 and M8.

## Acceptance criteria

- `careers.career_act` reaches `COME_UP` for at least four constructed careers
  with materially different histories, and at least two of them qualify on
  disjoint family sets.
- At least two qualifying careers never battle; at least one never invites crew.
- Golden careers **E**, **F** and **G** do not qualify, and World Control
  explains why in terms of families rather than numbers.
- **G is refused for durability specifically** — its qualifying window was set
  and cleared, and a re-qualification restarts rather than resumes it.
- Bodies of work become available exactly when the act changes, and not before.
- A subsequent release reaches measurably further under `COME_UP` than the same
  release would have under `UNDERGROUND`, attributable to `ACT_REACH`.
- `career.entered_come_up` exists **exactly once** per career under any number of
  repeated advances, is `LOCAL_PUBLIC`, and carries the evidence as it stood.
- The public profile resolves `PUBLIC` after the transition and `HIDDEN` to a
  stranger before it.
- `careers.legacy` and `artists.legacy` are `0` for every career in the suite,
  including every career that came up.
- No render transitions a career. Opening every screen in the app ten times
  changes nothing.
- Replay is exact across the horizon: same seed, same sequence of advances, same
  transition day, same evidence, same watermarks.
- **No wall-clock time is read anywhere in the qualification path.**
- **No row written before a transition differs after it** — releases, reception
  ticks, cohort performance, opportunities and relationships are all byte-identical
  across the phase change.
- No M5–M8 canonical output changed.

## What would justify `m9-final`

The headless proof above, complete, with the seven golden careers passing and the
whole suite green — and one thing more, which is the only real test of the
milestone:

**A player who never sees the word "Come Up" should still be able to tell that
something changed**, because their records now reach further, and because the
game will finally let them make an album.

## The line to keep pinned

> **A career phase is not something the player earns. It is a conclusion the
> world draws — and it has to be able to say what it drew it from.**
