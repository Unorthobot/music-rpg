# M8 — Battles: headless implementation notes

Written at tag `m8-headless`. The brief is `M8-battles.md`; this is the record of
what was built against it, and of what was deliberately left.

## Model corrections made during implementation

Three, all found by inspecting outputs rather than by a failing assertion, and
all conceptual rather than numeric. They are recorded because a coefficient
changed after seeing a result is a calibration, and calibrations are reported.

1. **Every room was the same room.** Weighting cohorts by
   `sceneAffinity × size` made casual listeners 88–98% of every scene, and
   Alexandra and Soweto came out identical to within a tenth of a percent.
   `audience_cohorts.size` is *city population*, and a ninety-person yard is not
   a population sample. Population is now damped (`ROOM_POPULATION_DAMPING`) and
   multiplied by the cohort's own `attention`.
2. **The Strategic judge was measuring a constant.** `STRATEGY_EMPHASIS` was
   fixed, so every artist declaring an angle moved the same distance from their
   own baseline and the judge's dominant term compared 76.2 against 77.4.
   `STRATEGY_APTITUDE` makes an angle an *attempt*: it scales what an angle buys
   and never what it costs.
3. **The Audience judge carried a room-blind term.** A standalone `immediacy`
   term read identically in every room, which is the one thing a judge whose
   mandate is "this crowd, this room" must not do. Removed; `cohortTaste` already
   carries immediacy weighted by how much the room actually wants it.

## Non-blocking debt

### `BATTLE_BORN` has no independent battle-time effect

The trait is inferred from `competitiveness >= 70`, and the same discovery
answers that raise competitiveness also raise `battleIQ` directly — so the
battle-relevant signal is already represented, through `battleIQ`, which
`rebuttal` and `structure` both read. Adding the trait to `FACT_COMPOSITION`
would count one piece of evidence twice.

If it is worth expanding later, **composure / pressure response is the preferred
seam**: a battle-born artist holding their nerve in a contest is a genuinely
different claim from being better at battling, and `composureShift` is currently
damped by `resilience` alone. That is a non-overlapping signal. The same argument
applies to `competitiveness`, which is likewise absent from fact composition for
the same non-double-counting reason.

### The first golden battle is deliberately asymmetric

KXMO enters it as an early-career beginner — four skills still sitting on
`SKILL_BASELINE = 18`, because a first career's discovery answers only move the
skills they actually address — against a seeded veteran. Losing 2-1 with three
sessions of preparation is the correct answer and is exactly the property the
brief asks for: preparation lifts the round and does not decide it.

A more evenly matched panel stress-test would exercise the judges harder, but it
needs a career further along than one released single. **That belongs to later
career progression rather than to M8 calibration**, and no coefficient should be
moved to manufacture it.

### Structured character pronouns

The world states pronouns for SEKO and MADALA in biography prose and for KGOSI not
at all, and no structured field exists on `characters`, `artists` or
`opponentSeeds`. Player-facing copy therefore templates on the name or uses
*them*, which is the M8 player-experience decision and covers every surface that
milestone builds.

**Deliberately not fixed here.** Expanding the content model to carry pronouns for
the sake of gendered copy is a schema change made for a wording preference. If a
later milestone wants per-character pronoun copy — or gives NPCs enough voice that
it starts to matter — an explicit field on the seed is the honest fix, and it
should arrive with that need rather than ahead of it.

### Scouting has no person-attributed provenance

`ScoutingFinding.source` is `WORLD | SCENE | RELATIONSHIP | BATTLE_HISTORY` — the
four things the world actually knows. An insight attributed to a *named advisor*
("LEX reckons you shouldn't try to out-perform him") reads considerably better and
is backed by nothing: `scoutOpponent` takes no crew input, and no part of the model
gives a crew member an opinion about a battle.

**Deliberately not fixed here.** A named advisor requires a real crew-advice and
knowledge system — who knows what, who is willing to say it, and how that changes
with the relationship. That is its own milestone. Until then the four owned
provenances translate into player language directly and claim nothing the world
cannot support.

## Other debt

- No player-facing battle interface. Out of scope by design; the player-facing
  milestone follows this one as it did for M7.
- A first challenge arrives around game day nine and ranks below promoter nights
  early on. Correct — a career has to be noticed first — but the player
  experience should confirm it does not read as absence.
- `readResolved` reconstructs `question: ""` from rows; the judge's question text
  lives in shared constants rather than being persisted.
- Rivals never prepare and always take their highest-aptitude angle.
  Deterministic and explainable; NPC preparation is a later question.
