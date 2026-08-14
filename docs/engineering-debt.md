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
