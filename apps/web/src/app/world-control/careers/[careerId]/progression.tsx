import { eq } from "drizzle-orm";
import { careerProgressionObservations, careers, type Database } from "@music-rpg/database";
import { loadEvidenceFacts, loadProgressionObservation } from "@music-rpg/domain";
import { PHASE_BLOCKER_LABELS, decidePhase } from "@music-rpg/simulation";
import {
  DOMAIN_EXPLAINED_BY,
  DOMAIN_QUALIFIER,
  RECOGNITION_DOMAINS,
  type EvidenceCheck,
} from "@music-rpg/shared";
import { Label, Surface } from "@music-rpg/ui";

/**
 * Progression inspection.
 *
 * The question this section exists to answer is "why is this career in the act
 * it is in?", and it answers it in the order the model decides it:
 *
 *     canonical facts → evidence descriptors → recognition domains →
 *     first-reached history → qualification → career.entered_come_up →
 *     career_act
 *
 * **There is no percentage here and there is nothing to compute one from.** A
 * career is not seventy per cent of the way to The Come Up; it either has two
 * kinds of recognition or it does not. The most useful thing this screen can
 * say about a blocked career is *which* recognition is missing, and it says
 * exactly that.
 *
 * Descriptors are shown beneath the domain they explain, visually subordinate,
 * because that is their actual status: they describe, and they do not vote.
 */
export async function CareerProgression({ db, careerId }: { db: Database; careerId: string }) {
  const careerRows = await db.select().from(careers).where(eq(careers.id, careerId)).limit(1);
  const career = careerRows[0];
  if (!career) return null;

  /*
   * Read-only. `decidePhase` is pure and `loadEvidenceFacts` only selects, so
   * opening this screen cannot move a career — the same rule every other
   * inspector section follows.
   */
  /*
   * `loadEvidenceFacts` and `loadProgressionObservation` read `ctx.db` and
   * nothing else — no analytics, no moderation, no writes. The narrow shape is
   * the honest one for an inspector.
   */
  const ctx = { db } as Parameters<typeof loadEvidenceFacts>[0];
  const facts = await loadEvidenceFacts(ctx, career);
  const stored = await loadProgressionObservation(ctx, careerId);
  const decision = decidePhase(facts, stored);

  const observationRows = await db
    .select()
    .from(careerProgressionObservations)
    .where(eq(careerProgressionObservations.careerId, careerId))
    .limit(1);
  const persisted = observationRows[0];

  const byDescriptor = new Map<string, EvidenceCheck>(
    decision.evidence.checks.map((entry) => [entry.descriptor, entry]),
  );

  const firstReached = {
    RECEPTION: persisted?.receptionFirstReachedGameTime ?? null,
    PEER: persisted?.peerFirstReachedGameTime ?? null,
    PUBLIC_RECORD: persisted?.publicRecordFirstReachedGameTime ?? null,
  } as const;

  const tick = (passed: boolean) => (passed ? "✓" : "✗");

  return (
    <section className="flex flex-col gap-3">
      <Label>Progression</Label>

      <Surface className="flex flex-col gap-3 p-4 text-xs font-mono">
        <div className="text-ink">
          act {career.careerAct}
          {" · "}
          qualifying {String(decision.evidence.qualifying)}
          {" · "}
          transitions {String(decision.transitions)}
          {decision.blockedBy ? (
            <span className="text-ink-muted">
              {" · "}
              blocked: {decision.blockedBy} — {PHASE_BLOCKER_LABELS[decision.blockedBy]}
            </span>
          ) : null}
        </div>

        {/* The three domains, each with the one descriptor that decides it. */}
        {RECOGNITION_DOMAINS.map((domain) => {
          const check = decision.evidence.domains.find((entry) => entry.domain === domain)!;
          const reachedAt = firstReached[domain];

          return (
            <div key={domain} className="flex flex-col gap-1 border-t border-line-subtle pt-2">
              <div className="text-ink">
                {tick(check.passed)} {domain}
                <span className="text-ink-subtle">
                  {" — decided by "}
                  {DOMAIN_QUALIFIER[domain]}
                </span>
                {reachedAt ? (
                  <span className="text-ink-muted">
                    {" · first reached "}
                    {new Date(reachedAt).toISOString().slice(0, 10)}
                  </span>
                ) : null}
              </div>
              <div className="text-ink-muted pl-4">{check.reason}</div>

              {/* Explanatory descriptors. These never vote. */}
              {DOMAIN_EXPLAINED_BY[domain].map((descriptor) => {
                const entry = byDescriptor.get(descriptor);
                if (!entry) return null;
                return (
                  <div key={descriptor} className="text-ink-subtle pl-8 break-all">
                    {tick(entry.passed)} {descriptor} · {entry.reason} ·{" "}
                    {JSON.stringify(entry.observed)}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="border-t border-line-subtle pt-2 text-ink-subtle">
          domains held: {decision.evidence.satisfiedDomains.join(" + ") || "none"} · beyond
          reception: {String(decision.evidence.beyondReception)} · evaluator{" "}
          {decision.evidence.evaluatorVersion}
        </div>

        {/*
          * Said out loud, because its absence is the design: there is no
          * progress figure, and nothing here from which one could be derived.
          */}
        <div className="text-ink-subtle">
          no score · no total · no window · a career either has two kinds of recognition or it
          does not
        </div>
      </Surface>
    </section>
  );
}
