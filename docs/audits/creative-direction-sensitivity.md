# Creative-Direction Sensitivity Audit

**Audited commit:** `798b85c` (`main`, clean tree). Audit only — no gameplay code,
coefficients, thresholds, UI, progression or simulation behaviour was changed.

**Question:** if the same artist makes meaningfully different creative decisions under
otherwise equivalent conditions, does SAIFA produce meaningfully different outcomes?

---

## Verdict

**Hypothesis A — hidden differentiation** — with one material qualification.

Record-level creative decisions **do** materially change outcomes. Holding artist, producer,
format, strategy, timing and world constant, the safest and riskiest records differ by
**+38% listeners and 2.3× fans**, with non-overlapping ranges across three seeds. That is not a
lucky history; it is structural.

The player is not told. Across six direction contrasts spanning that entire range, the reported
verdict was the **same sentence in five of six cases**, and the sixth moved by one adjective.

The qualification, which matters as much as the verdict: **the sensitivity is concentrated in one
control.** `risk` carries almost all of it. `energy` is inert — a 0-to-100 sweep moves cohort fit by
0.004 and produces *identical* fan counts. Intention, mood and audience are modest. So the Studio
presents five controls of visibly equal weight, of which one is decisive, three are minor and one
does effectively nothing. For those controls the honest local verdict is **B**.

**A at the level of "do creative decisions matter" — B at the level of "does each control matter".**

---

## 1. Experimental design

Two measurement levels, because they answer different questions.

**Level 1 — pure model.** `interpretDirection` → `qualityMetrics` → `evaluateCohort` called
directly, with the real seeded cohorts loaded from a migrated in-memory database. Exact, noiseless,
and cheap enough to sweep. Used for effect sizes on `fit` and its components, and for a 500-point
direction grid (5 intentions × 4 audiences × 5 energies × 5 risks).

**Level 2 — end to end.** Real careers built through the real commands
(`makePublishedRelease` → 5 × `advanceCareerDay`), reading `release_performance` and
`release_cohort_performance` afterwards. Confirms that Level 1 differences survive into stored world
facts, and captures the reported verdict string.

**Held constant** throughout: artist identity and Sound DNA (identical discovery answers), producer
(MO unless the producer is the variable), solo arrangement, format SINGLE, strategy DROP unless
strategy is the variable, timing, world, and the proposal taken (AS_ASKED / first).

**Seeds.** Every end-to-end cell was run on three fixed seeds (`s1`, `s2`, `s3`) and is reported as
mean with the observed range, so structural separation can be told apart from seed noise.

**Comparisons are on facts, never prose** — unique listeners, engaged listeners, fan conversions,
per-cohort counts, and the components of `fit`. The verdict string is examined separately, as an
output to be explained rather than as evidence of an outcome.

---

## 2. Causal trace

The complete path from a player's choice to a world fact.

```
CreativeDirection { intention, moods[], energy, risk, audience, note }
   │
   ├─ directionToSound()                       packages/simulation/src/inference/interpretation.ts
   │    INTENTION_SOUND[intention]
   │  + MOOD_SOUND[mood] × (1/|moods| + 0.35)   per mood
   │  + AUDIENCE_SOUND[audience]
   │  + energy → intimateAnthemic × 0.40, melodicRhythmic × 0.25
   │  + risk   → accessibleExperimental × 0.60, rawPolished × −0.20
   │  → normalise()   x / (1 + |x|/1.6)         ← saturating
   │
   ├─ proposal sound = normalise(
   │        asked            × 1.00
   │      + artist.soundDNA  × 0.35
   │      + producer.bias    × 0.20  (AS_ASKED) | 0.90 (ANGLE) | 1.20 (COUNTER)
   │      + asked            × −0.35 (COUNTER only) )
   │
   ├─ proposal energy/risk   (AS_ASKED passes both through unchanged)
   │
   ├─ qualityMetrics()                          packages/simulation/src/inference/brief.ts
   │    commitment    = mean(|sound axis|)
   │    focus           = 35 + commitment × 90
   │    distinctiveness = 25 + risk × 0.60 + commitment × 40
   │    immediacy       = 90 − risk × 0.55 + (energy − 50) × 0.30
   │    (mastering: focus +6, immediacy +4)
   │
   ├─ evaluateCohort()                          packages/simulation/src/reception/evaluate.ts
   │    soundFit  = regionFit(track.sound,  cohort.region, tolerance)
   │    qualityFit= (focus·wF + distinct·wD + immediacy·wI) / 100
   │    artistFit = regionFit(artist.soundDNA, cohort.region, tolerance)
   │    fit = 0.38·soundFit + 0.34·qualityFit + 0.18·artistFit + 0.10·affinity
   │
   ├─ modifierBoosts()  ← release strategy, a SEPARATE channel
   │    reach/anticipation/credibility → multipliers on exposure, not on fit
   │
   └─ exposure → engagement → conversion → word of mouth → release_performance,
      release_cohort_performance, artist_audience, career metrics
```

**Two structural facts fall straight out of this trace.**

**Record-level input dominates `fit` on paper.** `trackSound (0.38) + trackQuality (0.34) = 0.72`
against artist DNA's `0.18`. Direction enters the sound blend at weight `1.00` against DNA's `0.35`.
The architecture is built for creative choices to matter.

**Release strategy never touches `fit`.** It multiplies exposure. So strategy and direction are
genuinely independent channels — quantity of ears versus response per ear — and conflating them
would have made both look weaker than they are.

---

## 3. Results

### 3.1 The direction space is large

500-point grid, scene-heads `fit`, everything else held:

| | min | max | spread |
|---|---|---|---|
| Scene heads `fit` across all directions | 0.5327 | 0.7347 | **0.2020** |

Deliberate targeting works, and the optimum differs per cohort in ways that read correctly:

| Cohort | Best direction | fit | Worst direction | fit | Swing |
|---|---|---|---|---|---|
| Scene heads | story / scene / e100 / **r100** | 0.7347 | move / general / e0 / r0 | 0.5327 | 0.2020 |
| Casual listeners | introduce / general / e100 / **r0** | 0.7012 | strange / scene / e0 / r100 | 0.4726 | 0.2286 |
| Tastemakers | strange / general / e100 / **r100** | 0.7676 | move / general / e0 / r0 | 0.5596 | 0.2080 |

Casual listeners want low risk; tastemakers want high risk and strangeness. That is a real, designed
strategy space.

### 3.2 It survives to world facts

End to end, 5 in-world days, 3 seeds, everything else identical:

| Direction | Listeners (mean [range]) | Engaged | Fans (mean [range]) |
|---|---|---|---|
| **SAFE** introduce / general / e100 / **r0** | 70.7 [67–74] | 26.7 | **2.7 [2–3]** |
| **RISKY** strange / general / e100 / **r100** | 97.3 [96–99] | 42.7 | **6.3 [6–7]** |
| audit-A story / scene / e32 / r72 | 92.0 [87–96] | 38.7 | 6.3 [5–7] |
| audit-B strange / general / e88 / r95 | 96.3 [94–98] | 42.7 | 7.7 [7–9] |
| ENERGY-LO introduce / general / **e0** / r50 | 84.0 [82–87] | 32.0 | 5.0 [5–5] |
| ENERGY-HI introduce / general / **e100** / r50 | 87.7 [86–91] | 34.7 | 5.0 [5–5] |

**SAFE vs RISKY: +38% listeners, 2.3× fans, ranges disjoint on both.** Structural.

**ENERGY-LO vs ENERGY-HI: +4.4% listeners, identical fan counts.** A full sweep of a headline
control changes nothing a player could notice.

### 3.3 The report cannot express it

The verdict string for every one of those six runs, all three seeds:

- SAFE → *"Scene heads are responding **more** strongly than casual listeners."*
- **All five others** → *"Scene heads are responding **much more** strongly than casual listeners."*

A 2.3× difference in fans is compressed into one adjective, and a 4.7% difference (audit-A vs
audit-B) into none at all.

---

## 4. Sensitivity by variable

Measured separately rather than conflated. Level 1 is scene-heads `fit` spread; Level 2 is
end-to-end means over three seeds.

| Variable | Level 1 — `fit` spread | Level 2 — listeners | Level 2 — fans |
|---|---|---|---|
| **Direction — `risk`** (0→100) | **0.1573** | 70.7 → 97.3 (**+38%**) | 2.7 → 6.3 (**2.3×**) |
| **Release strategy** (DROP→TEASE) | 0 on fit; **boost ×1.00 → ×1.15** on exposure | 92.0 → 112.0 (**+22%**) | 6.3 → 8.7 (1.4×) |
| **Artist Sound DNA** (purist vs performer) | 0.1094 | not isolatable end-to-end¹ | — |
| **Direction — `moods`** | 0.0599 | not run individually | — |
| **Direction — `audience`** | 0.0595 | not run individually | — |
| **Direction — `intention`** | 0.0562 | not run individually | — |
| **Direction — `energy`** (0→100) | **0.0041** | 84.0 → 87.7 (+4.4%) | **5.0 → 5.0 (1.00×)** |
| **Producer** (lex / mo / zero) | **0.0032** | 91.7 → 95.0 (+3.6%) | 5.7 → 7.7 (1.35×) |
| **Whole direction space** (500 combos) | 0.2020 | — | — |

¹ The test harness fixes discovery answers, so artist DNA could not be varied end-to-end without
changing the harness. Reported from the pure model only, and flagged in §8.

**Reading of the table.** Direction as a whole is the single largest lever on `fit` — larger than
artist DNA, and about sixty times the producer. But nearly all of it is `risk`. Strategy is the
second real lever and operates on a different channel. Producer barely moves `fit` at all, though it
moves end-to-end fans slightly more than `fit` alone predicts, which is worth a note: the producer's
influence is expressed mainly through *which proposals are offered* (`PRODUCER_ANGLE` at bias 0.90,
`COUNTER` at 1.20) rather than through the AS_ASKED record measured here. A player who takes the
producer's angle or counter is exercising a larger producer effect than this audit measured.

---

## 5. Why the two "opposite" records were identical

The playability audit made two deliberately opposite records and got the same verdict. Both halves
of that are now explained, and they are different failures.

**The records were not actually opposite where it counts.**

| | audit-A | audit-B | Effect size of that axis |
|---|---|---|---|
| intention | story | strange | 0.0562 |
| moods | tense + melancholic | aggressive + warm | 0.0599 |
| **energy** | **32** | **88** | **0.0041 — inert** |
| **risk** | **72** | **95** | **0.1573 — dominant** |
| audience | scene | general | 0.0595 |

They were opposed on every axis that barely matters and **on the same side of the one that does** —
both high-risk. The subjective sense of "opposite" came from energy, which is the single least
consequential control in the system.

The simulation agreed they were similar, and was right to: scene-heads `fit` 0.7174 vs 0.7314
(+2.0%), end-to-end 92.0 vs 96.3 listeners (+4.7%). **This half was not a bug.** It was a genuine
near-null result that the player had no way to anticipate, because nothing communicates that risk is
the load-bearing control.

**The verdict would have been the same anyway.** `cohortInsight`
(`packages/simulation/src/reception/interpret.ts`) reports a *rank plus a three-way bucket* on the
ratio of engagement **rates** between the leading and lagging cohort:

```
ratio ≥ 1.8  → "much more strongly"
ratio ≥ 1.3  → "more strongly"
otherwise    → null
```

It is deliberately lossy — its own comment says *"an insight that is true of every record is not an
insight"*, and the wide thresholds exist so the sentence does not flip on seed noise. But three
consequences follow:

1. **It reports ordering, not magnitude.** For a given artist DNA the ordering is highly stable:
   `artistFit` is a constant 0.18 of every cohort's fit, and for the purist artist it is 0.84 for
   scene heads against 0.60 for casual listeners. Across all 500 directions the dominant fit
   ordering held 69% of the time, and in all 18 end-to-end runs scene heads led.
2. **Two adjectives cannot carry a 2.3× range.** SAFE and RISKY differed by more than double in
   fans and by one word in the report.
3. **It compares only the leader and the laggard.** Tastemakers — the cohort whose fit moved *most*
   between the two audit records (0.7209 → 0.7576) — appeared in neither sentence.

So the audit observation had two causes: **a genuine near-null** (the records really were similar),
sitting behind **a reporting function that would have hidden a real difference too.**

---

## 6. A / B / C

**A — hidden differentiation**, at the level of the question as posed. The evidence:

- 2.3× fans and +38% listeners between the safest and riskiest record, ranges disjoint across seeds;
- a 0.202 `fit` span across the direction space, larger than artist DNA's 0.109;
- per-cohort optima that differ coherently (casual want safe, tastemakers want risk);
- and a reported verdict that was identical in five of six cases spanning that entire range.

**B applies locally**, and the distinction is not pedantic. Of the five controls the Studio offers
as peers, `risk` carries 0.157 of fit spread and `energy` carries 0.004. A player experimenting with
energy — the most tactile control on the screen, a slider with a visible position — is adjusting
something that does not measurably change their career. Intention, mood and audience sit in between
at ~0.06 each. So "creative decisions matter" is true; "the decisions the interface emphasises
matter" is not uniformly true.

**C is refuted.** There is no reading of this evidence in which record-level decisions fail to
influence outcomes.

---

## 7. Implications for the Studio / music-creation experience

Stated as consequences of the evidence, not as proposals.

- **The differentiation the Studio needs already exists in the model.** Nothing here suggests the
  reception engine needs to be made more sensitive to be interesting; it is already about twice as
  sensitive to the record as to the artist's DNA.
- **The gap is reporting, and it is specifically a magnitude gap.** The reception surfaces are good
  at *who* responded and silent about *how much more than last time*. Every finding in §3.3 is the
  absence of a comparison, not the absence of a fact.
- **The controls are not peers and the interface presents them as peers.** Any future Studio — 2D or
  spatial — inherits this: a risk control that reshapes a career and an energy control that does
  almost nothing, rendered as two identical sliders.
- **Producer influence lives in the proposals, not in the brief.** The producer moves AS_ASKED by
  0.003 and the counter-proposal by up to 1.20 of their bias. Producer choice matters mainly through
  *which of the three ideas the player takes* — which is exactly the decision the playability audit
  found illegible, because two of the three proposals were near-indistinguishable in the UI.
- **Strategy and direction are independent channels** — exposure versus response. They can be
  communicated separately without either being made to explain the other.
- **This audit measured the AS_ASKED path only.** The largest single act of authorship available to
  a player — taking the producer's angle or their counter — was not measured and is not in these
  numbers.

---

## 8. Uncertainties and evidence genuinely required

1. **Artist Sound DNA was measured in the pure model only** (spread 0.109, two archetypes). The test
   harness fixes discovery answers, so it could not be varied end-to-end. Two archetypes is also a
   thin basis for a range; eight would give a real one.
2. **Only the AS_ASKED proposal was measured.** `PRODUCER_ANGLE` (bias × 0.90) and `COUNTER`
   (bias × 1.20, brief × −0.35) should move outcomes considerably more, and would raise the measured
   producer effect. This is the largest single gap in the audit.
3. **Five in-world days, three seeds, one artist archetype, one world.** Enough to separate
   structure from seed noise for the contrasts reported — the disjoint ranges carry that — but not
   enough to characterise long-run career divergence, where compounding through `artist_audience`
   affinity and `ACT_REACH` may amplify or wash out day-5 differences.
4. **Cohort *ordering* stability was measured on `fit`, not on realised engagement.** End-to-end,
   scene heads led all 18 runs, but all 18 used one purist artist; a performer-DNA artist may order
   cohorts differently and would test whether the verdict sentence is stable *per artist* or
   *globally*.
5. **Interaction effects were not measured.** Every sweep varied one axis with the others held. If
   `risk` interacts with `audience` or with cohort affinity, one-at-a-time sweeps understate the
   reachable space.
6. **`note` (free text) was excluded.** It enters the interpretation seed key but, per the M0–M9
   audit, is not interpreted; it was held empty here and is not part of any number above.
7. **Mastering is applied uniformly** (focus +6, immediacy +4) and was not varied, so revision depth
   is not represented in any of these figures.

---

## Method note

All figures were produced by throwaway harness scripts run against a migrated, seeded in-memory
database at `798b85c`, then deleted — this is a documentation-only commit. The harness did three
things: loaded the real seeded cohorts, called the real inference and evaluation functions directly
for Level 1, and drove real careers through `makePublishedRelease` and `advanceCareerDay` for
Level 2. No gameplay code, coefficient, threshold or behaviour was modified at any point, and no
figure in this document comes from a modified system.
