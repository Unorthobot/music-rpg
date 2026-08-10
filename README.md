# Music RPG

A persistent, simulation-first music-career RPG. Create a solo artist or a group, find a sound that
belongs to you, and live a career through three permanent acts — The Underground, The Come Up, The
Industry — and the Legacy state beyond them.

This repository currently implements **Milestone 0 (Foundation)** and **Milestone 1 (Identity)**.

> `Music RPG` is a configurable codename. Every user-facing reference reads from
> [`packages/shared/src/brand.ts`](packages/shared/src/brand.ts) — renaming the product is a one-file change.

---

## Engineering principles

These are load-bearing, not aspirational:

- **The simulation owns truth. AI does not.** Sound Discovery inference is deterministic and runs
  with no model, no network. `packages/ai` exists as a port for later *interpretation* — language
  around the numbers — and every consumer works correctly with the null provider.
- **History is preserved.** `game_events` is an immutable, ordered log written in the same
  transaction as the state change it describes. Current-state tables are projections.
- **`User`, `Career`, `Artist` and `Group` stay distinct.** A human is not a career; a career is not
  an artist; a group is a creative unit of artists.
- **No XP, no levels.** Progression is acts plus four independent currencies — Fame, Respect, Heat,
  Legacy — which are never collapsed into one score.
- **Group ≠ Crew.** Group membership is modelled now; crew (management, engineers, allies) is its
  own system in a later milestone.
- **Frontend never touches domain tables.** Screens call commands; commands validate, mutate
  transactionally, emit events and return typed results.

---

## Stack

| Concern        | Choice                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| App            | Next.js 14 (App Router), React 18, TypeScript strict                    |
| Database       | PostgreSQL via Drizzle ORM                                              |
| Local database | Embedded [PGlite](https://pglite.dev) — real Postgres, no Docker needed |
| Auth           | Server-side sessions behind an `AuthService` port (managed-auth ready)  |
| Tests          | Vitest (unit / domain / integration), Playwright (E2E)                  |

Set `DATABASE_URL` and the identical schema, migrations and commands run against hosted Postgres —
no code change.

## Repository layout

```
apps/
  web/                 Next.js app: shell, onboarding, destinations, world-control
packages/
  shared/              Brand config, enums, game config, ids, slugs, money, results
  database/            Drizzle schema, migrations, client (PGlite | postgres-js), seed
  domain/              Typed errors, commands, read models — the only writer of state
  events/              Canonical event catalogue and the append-only recorder
  simulation/          Deterministic inference, descriptors, chemistry, seed content
  ai/                  Provider-neutral AI port (null provider by default)
  analytics/           Vendor-neutral analytics port + console/memory/database adapters
  auth/                Password hashing, sessions, credentials provider
  jobs/                Async job port + in-process development queue
  moderation/          Moderation port for player-authored text
  storage/             Object-storage port (no assets generated yet)
  ui/                  Design tokens and the component system
```

## Getting started

```bash
npm install
npm run db:seed
npm run dev
```

The app runs on <http://localhost:3100>. With no `DATABASE_URL`, it creates and migrates an embedded
database in `.pglite/dev` and seeds it on first boot — Johannesburg, its scenes, archetypes, traits,
Sound Discovery questions and six candidate members.

**Hosted deployments migrate deliberately.** The runtime never changes a hosted schema: it verifies
that every migration has been applied and refuses to start otherwise. Run `npm run db:migrate` as a
deploy step (`DB_ALLOW_RUNTIME_MIGRATION=true` overrides, for preview environments that want the
embedded behaviour).

| Command                | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `npm run dev`          | Next dev server on port 3100                                    |
| `npm run db:migrate`   | Apply pending migrations — the deploy pipeline's schema step    |
| `npm run db:migrate:check` | Report pending migrations without applying (pre-deploy gate) |
| `npm run db:seed`      | Seed content (idempotent; migrates only embedded databases)     |
| `npm run db:reset`     | Drop everything and rebuild (refuses non-local `DATABASE_URL`)  |
| `npm run typecheck`    | Typecheck packages and the app                                  |
| `npm test`             | Unit, domain and integration tests against embedded Postgres    |
| `npm run test:e2e`     | Playwright, desktop + mobile viewports                          |

E2E needs browsers once: `npm run test:e2e:install`. It builds the app and runs against
`next start` with its own wiped database, so results don't depend on dev-server compilation timing.

### World Control

The internal inspector lives at `/world-control`: worlds, careers, artists, groups, Sound DNA,
skills, psychology, traits and the canonical event log. Access requires `users.is_internal` or an
allow-listed address in `WORLD_CONTROL_EMAILS`.

---

## What M0 + M1 deliver

**Foundation.** Responsive three-zone desktop shell, collapsed rail plus context drawer on tablet,
bottom navigation with a mini-player on mobile. Five destinations (Home, World, Studio, Career,
Crew) plus Search, Messages, Notifications, Calendar, Profile and Settings — all real routes with
intentional empty states. Design tokens, component system, typed domain errors, command layer,
canonical events, analytics port, job port, storage port.

**Identity.** Landing → auth → start career → solo or group → identity → (group: your founding
member) → Sound Discovery → (group: line-up) → reveal (with Tune It) → ENTER THE UNDERGROUND → Home.
Discovery questions are seeded configuration; the inference engine turns answers into Sound DNA,
starting skills, psychology, an archetype and up to three traits, deterministically. Onboarding is
resumable to the exact step across devices, and every command is idempotent under retries.

**Every career belongs to a musician.** A solo career controls its artist; a group career controls
the Group *and* carries `playerArtistId` — the player's own founding member, individually
persistent. Bandmates can be recruited from the world or written by the player (name, role, creative
tendency, personality, look, everything else derived). Public identity is world-scoped:
`/world/[worldSlug]/artist/[slug]`, because a stage name is only unique inside a world.

Starting state is real persisted state: `R5,000`, 0 fans, 0 Fame, 0 Respect, 0 Heat, 0 Legacy, no
catalogue, no battles, Act I.

### Deliberately not built yet

Music generation, studio sessions, tracks, releases, audience simulation, charts, missions, NPC
relationships, battles, PvP, contracts, live seasons, full world simulation. Where those surfaces
exist, they are visibly inactive — nothing pretends to work. The schema, ports and event log are
shaped so they arrive without a rewrite.

**Next:** M2 + M3 — Career HQ and Studio.
