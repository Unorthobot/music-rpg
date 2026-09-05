# Engineering debt

Known problems that are real, understood well enough to describe honestly, and
not owned by whichever milestone happened to notice them. Each entry says what
was measured, what was ruled out, and what has deliberately *not* been done.

---

## E2E full-suite intermittent 600s hangs

**Status:** open. **Root cause: unresolved.** **Not owned by any product
milestone.**

Roughly a third to a half of complete `npx playwright test` runs contain one
spec that hangs until its 600s budget expires. The suite otherwise passes.

### What was measured

Investigated during M8.5 closeout, because a full-suite gate was red and the
milestone could not be classified without knowing whether it owned the failure.
Two matched samples, same host, same production-build/server setup, nothing
heavy running alongside.

**Full-suite runs, 5 per branch:**

| | Clean runs | Failing runs | Rate |
|---|---|---|---|
| `m8-final` (630ef6d) | 2 | 3 | **3/5** |
| M8.5 | 1 | 4 | **4/5** |

Baseline reproduces the failure at a rate comparable to the branch under test.
With n=5 each the difference is one run and is not meaningful.

**Duration is bimodal, on both branches:**

- clean runs cluster at **~7.0–7.4m**
- failing runs expand to **16.4m–33.9m**

The whole suite dilates; it is not one slow test inside an otherwise normal run.

**The failure roams.** Across ten runs it landed on five unrelated specs:

- `battle-path.spec.ts:190` (desktop) — baseline ×2, M8.5 ×3
- `battle-path.spec.ts:392` (mobile) — baseline
- `reception-path.spec.ts:167` (mobile) — baseline
- `release-path-mobile.spec.ts:19` (mobile) — M8.5

Usually surfacing as `page.waitForURL` or `page.waitForTimeout` exceeding the
test budget.

**Isolated sampling does not reproduce it.** Ten runs per branch of
`battle-path.spec.ts:190` alone, with tracing: **20/20 green**, 53–61s, and the
full interaction chain intact every time — click fired, server action started
and returned 303, `/battles/{id}` requested, world state correct. The trigger
requires full-suite context.

### What has been ruled out

- **Not a code regression.** Untouched `m8-final` reproduces the identical
  signature — same spec, same `page.waitForURL`, same 600s, same test position.
- **Not accumulated database or server state.** `battle-path.spec.ts:190` runs
  at **position 1** against a freshly seeded world and still hangs.
- **Not a crash, lock or leak.** Across all ten full-suite runs, including every
  failure: zero server errors, zero PGlite lock or write errors, zero orphaned
  Chromium or `next start` processes afterwards.
- **Not per-day domain cost.** A 26-advance harness measured +2.3% on M8.5 with
  byte-identical director output.

### What is *not* claimed

Host resource contention is the obvious suspect and is **not proven**. Nothing
here identifies the mechanism, and the entry should not be read as if it did.

### What has deliberately not been done

No timeout raised. No retries added. No test skipped, weakened or quarantined.
No worker-count, browser-config or database-setup change. All of those would
hide the signal, and none of them would explain it.

### Where to start

The discriminating variable is sustained multi-test load in a single Playwright
invocation against one long-lived `next start`. Worth trying: per-spec resource
sampling across a failing run, and whether the hang survives `--workers=1` with
projects run as separate invocations.

---

## Split embedded database — `PGLITE_DATA_DIR` resolved against the launcher

**Status: closed.** Repaired after the M0–M9 playability audit, which it made
impossible to begin.

### Root cause

`PGLITE_DATA_DIR` is a relative path (`.pglite/dev`), and PGlite resolves
relative paths against `process.cwd()`. This repository's npm scripts do not
share a working directory:

| Command | Working directory | Physical database |
|---|---|---|
| `npm run dev` (`--workspace @music-rpg/web`) | `apps/web` | `apps/web/.pglite/dev` |
| `npm run db:seed` / `db:migrate` / `db:reset` | repository root | `.pglite/dev` |

One configured value therefore named **two different databases**. `npm run
db:seed` could not reach the database `npm run dev` served, so a fresh checkout
seeded one and played the other. The served database drifted ten migrations
behind with no seeded characters, and no error was raised by either side —
each was internally consistent.

The workaround already in the tree was the evidence: `playwright.config.ts` set
`PGLITE_DATA_DIR: "../../.pglite/e2e"`, hand-climbing out of `apps/web`, with a
comment explaining that the data directory lives at the repository root.

### Canonical path semantics

`resolvePgliteDataDir(configured, cwd)` in `packages/database/src/client.ts` is
now the single resolution point, and `createDatabase` is its only caller.

- **Relative paths anchor to the workspace root**, found by walking up from the
  working directory for the one `package.json` that declares `workspaces`. Every
  command in this repository launches from somewhere inside that tree, so all of
  them find the same ceiling.
- **`memory://` and other URL forms pass through**, so throwaway test databases
  are unaffected.
- **Absolute paths pass through**, so an operator can still point a process
  anywhere.
- **`DATABASE_URL` never reaches this code.** Hosted Postgres semantics are
  unchanged, and so is the rule that hosted databases are migrated and seeded by
  deliberate commands rather than at runtime.
- **No machine-specific paths are configured anywhere.** `.env` still reads
  `PGLITE_DATA_DIR=.pglite/dev`; only its resolution became absolute.

`playwright.config.ts` no longer climbs; it configures `.pglite/e2e`, the same
value `scripts/e2e-split-battle.ts` uses from the root.

### Regression coverage

`tests/unit/pglite-data-dir.test.ts` — the lowest boundary the property lives
at, since the behaviour is path arithmetic. Asserts that one configured value
resolves identically from the repository root, `apps/web`, a package directory
and a deeply nested directory; that the pre-repair resolution demonstrably
differed; that URL and absolute forms are untouched; and that an orphaned
directory with no workspace falls back to the launcher.

### Left behind

`apps/web/.pglite/dev` is now orphaned. It is stale local data and nothing reads
it; it was deliberately **not** deleted by the repair. Remove it by hand when
convenient.

---

## First contact could fail silently and leave a career unplayable

**Status: closed.** Same audit; the second half of the same failure.

### Root cause

Three defects compounded, and all three were required.

1. **`completeOnboarding` discarded the result of `createFirstContact`.** The
   reasoning for not failing the career was sound — a world with no producers
   must not undo somebody's entry into The Underground — but the failure was
   neither logged nor surfaced.
2. **`ensureSeeded` in `apps/web/src/lib/db.ts` treated "a world exists" as
   "the seed has been applied".** That proxy fails whenever the seed grows: a
   database seeded before characters existed kept its world for ever and never
   gained a connector or a producer.
3. **The split database above** put the seeded characters somewhere the running
   application never looked.

The result was an `ACTIVE` career in a world with no connector: no message, no
producers, so no session, no track, no release — and therefore no day advance
either, because that control renders only inside the reception panel. Home said
*"Nothing's waiting on you. The Underground doesn't come to you. Go and make
something happen."*

### The invariant

> **A failed first-contact attempt must never consume the player's ability to
> make first contact.**

Structurally this was already true and is now enforced: `createFirstContact`
returns before it writes on both failure branches, so a failed attempt consumes
nothing. What was missing was anybody knowing it had failed, and anything ever
calling it again.

### What changed

- **The failure is reported.** `completeOnboarding` keeps the career and logs
  the domain error rather than discarding it.
- **The world retries.** `advanceCareerDay` re-attempts first contact as step 0,
  **above** its "nothing of yours is out yet" guard — because a career in this
  state has no release to get past that guard with. Idempotent on the success
  path via the existing `authored:first_contact:{careerId}` identity key, so a
  healthy career pays one indexed lookup.
- **`ensureSeeded` runs the seed** rather than guessing from one row whether it
  has been run. `seedDatabase` is idempotent by construction — every insert is
  an upsert on its natural key. Embedded databases only; the hosted contract is
  unchanged.
- **Home tells the truth.** A career with no conversation and no opportunity
  resolves to `AWAITING_FIRST_CONTACT` — *"Nobody in the scene has reached you
  yet"* — instead of `NOTHING`, which told a stuck player to go and make
  something happen and pointed them at a studio that would point at an empty
  inbox. This is a read-model correction in the existing `rightNow` grammar. No
  new mechanic, and nothing on a render path writes.

### Regression coverage

`tests/domain/first-contact-recovery.test.ts`, injecting the fault by removing
the `thabo` connector from a seeded world:

1. the career still starts, nothing is written, and Home reports
   `AWAITING_FIRST_CONTACT`;
2. failure → retry → success creates exactly one opportunity and one
   conversation, and a further retry creates no duplicates;
3. `advanceCareerDay` performs the retry even for a career it then refuses a day
   to, proving the retry sits above the release guard;
4. a normally-contacted career stays exactly-once across day advances.

### Known residual

A career that fails first contact **and** has no release still cannot trigger
the retry from the interface, because "Let a day pass" renders only inside the
reception panel. After this repair that state requires a genuinely broken world
rather than a misconfigured one, and the honest Home copy now names it. Making
the day advance reachable earlier is a playability question, recorded as P1 #12
in `docs/audits/M0-M9-playability-audit.md`, and was deliberately left to that
work rather than changed here.
