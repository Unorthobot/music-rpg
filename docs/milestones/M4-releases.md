# Milestone 4 — Releases

**Baseline:** tag `m2-m3-baseline` (commit `0e5f052`). M0, M1, M1.1, M2 and M3 are accepted.

M3 answered *I made something.* M4 answers *do I put it into the world?* — and insists there is a
meaningful space between those two questions.

## The one non-negotiable

**Creation and publication are separate systems.**

The Studio makes work. Releases decide what happens to work. They share entities (`tracks`,
`track_versions`) and nothing else: no release command may create a version, no studio command may
publish anything, and a release must be describable entirely in terms of *decisions about existing
work*. We made Studio more than a Generate button; Release must be more than a Publish button.

## Starting state this milestone assumes

A career that has finished M3 has exactly this, and it is a good place to start from:

```
NO RECEPTION · UNRELEASED · 3 versions, v3 is master
0 fans · 0 fame · 0 respect · 0 heat · 0 legacy
R3,500 · one completed session with LEX
```

## Scope

```
CATALOGUE
↓
TRACK (UNRELEASED)
↓
KEEP PRIVATE  |  PLAN RELEASE
↓
FORMAT     → Loose Track | Single      (EP/Mixtape/Album locked at this act)
WHEN       → Now | Tomorrow | Choose a date
STRATEGY   → DROP IT | TEASE IT | PERFORM IT FIRST | SEND IT AROUND
↓
RELEASE PLAN (scheduled, editable, cancellable)
↓
RELEASE (OUT NOW)
↓
public Track page · appears in World · Career Timeline entry · plays in the player
```

## Extend, don't duplicate

| Existing | What M4 does with it |
|---|---|
| `tracks` (`status`, `released_at`, `current_master_version_id`) | The release lifecycle lives here. `UNRELEASED → SCHEDULED → RELEASED`. Do not add a parallel "published track" table. |
| `track_versions` | The released artefact is a version, already immutable. A release points at one; it never copies it. |
| `career_audience`, `fame/respect/heat/legacy` | **Do not write to these.** M5 owns consequence. |
| `game_events` | `release.planned`, `release.scheduled`, `release.published`, `release.cancelled` — the events M5's simulator will consume. |
| `calendar_items` (`RELEASE` type already exists) | A scheduled release is a calendar item, exactly like a session. |
| `career_memories` | One memory on first release. |
| `GameClock` (`advanceCareerTimeInTx`) | Scheduling is in-world time. A release "tomorrow" is a game date. |
| `@music-rpg/storage` (unused port) | The media model finally has a consumer. |
| `MusicMiniPlayer` (idle state) | Becomes real. See below. |
| `getCareerCounters` (`releases` counts `released_at IS NOT NULL`) | Already correct — it will simply stop being 0. |
| World-scoped public routes (`/world/[worldSlug]/artist/[slug]`) | Released tracks become publicly visible here. Unreleased ones must not. |

## Domain model

**Release** — the decision, not the file.

```
Release {
  id, careerId, worldId
  trackId | projectId          // exactly one
  format: LOOSE_TRACK | SINGLE | EP | MIXTAPE | ALBUM | COLLABORATIVE
  strategy: DROP | TEASE | PERFORM_FIRST | SEND_AROUND
  status: PLANNED | SCHEDULED | RELEASED | CANCELLED
  scheduledGameTime, releasedGameTime?
  strategyState jsonb          // teaser posted? performed? sent to whom?
  createdAt, updatedAt
}
```

**Project** — build the entity, not the feature.

```
Project { id, careerId, worldId, type, title?, status: DRAFT|..., createdAt }
ProjectTrack { projectId, trackId, position }
```

Seed nothing, expose nothing beyond a locked state. A one-track career must never be offered an
album. The format list is a function of the catalogue and the act — `availableFormats(career)` —
and the UI shows locked formats with the reason ("You need at least four tracks"), because that is
how the interface teaches the game.

**ReleaseStrategy** is a first-class concept, not a string on a form. Each strategy declares:
what it costs (money, in-world days), what it requires (a venue for `PERFORM_FIRST`, contacts for
`SEND_AROUND`), what pre-release steps it creates, and — for M5 — what modifiers it will hand to
the audience simulator. **M4 records the modifiers; it must not apply them.**

## Commands

`PlanRelease`, `ChooseReleaseFormat`, `ScheduleRelease`, `SetReleaseStrategy`, `CancelRelease`,
`PublishRelease`, `KeepPrivate`, plus `CreateProject`/`AddTrackToProject` behind their lock.

Same contract as M2/M3: validate the transition, write transactionally, record the decision, emit
canonical events, stay idempotent. `PublishRelease` in particular must be safe to retry — publishing
twice must not produce two release events, two timeline entries or two world events.

## The player becomes real

This is the milestone where the mini-player stops being an empty state. After a release:

- the player can start a track and it **keeps playing across navigation** — Home, Career, Studio,
  World. That means playback state lives above the route, not inside a page.
- the media source comes from the storage port, behind an asset abstraction. While the development
  provider produces structured work rather than audio, the player may render a clearly-labelled
  development preview — the same rule as M3: **never claim generated audio exists when it doesn't.**
- when real audio arrives, only the asset changes.

## Out of scope (M5 owns these)

Audience cohorts, fan movement, `ReleasePerformance`, fame/respect/heat/legacy movement, charts,
word of mouth, expectations, reviews, streaming counts. **No fabricated `+738 fans`.** After a
release the honest state is: it is out, and nobody has reacted yet.

## Definition of done

- A track can be kept private, and that is a real persisted decision, not an absence of one.
- Planning a release captures format, timing and strategy as durable domain state, and is editable
  and cancellable before it goes out.
- A scheduled release appears on the calendar and survives leaving the app.
- Publishing flips the track to `RELEASED`, makes it publicly visible at its world-scoped route,
  writes the canonical events, adds the Career Timeline entry, and creates the world's first
  player-authored release event.
- The catalogue distinguishes unreleased work from released work.
- The player plays a released track and it continues across navigation.
- Projects exist as entities with a locked, honest UX; no album is offered to a one-track career.
- Nothing writes to audience or career metrics.
- Unit, integration and E2E green, including a **group career release** proving attribution is
  correct externally (the debt we deferred from M3 lands here).
- World Control can reconstruct: track → release plan → strategy decisions → schedule → publication.

## Suggested build order

1. Schema + `availableFormats` + release state machine, headless tests first (as in M3).
2. Commands and read models.
3. Catalogue and release-planning UX.
4. Public track page and world visibility.
5. The persistent player.
6. Projects, locked.
7. Group release E2E.
