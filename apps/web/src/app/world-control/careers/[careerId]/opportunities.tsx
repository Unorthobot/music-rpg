import type { Database } from "@music-rpg/database";
import { getCareerOpportunities, getDirectorRuns, traceOf } from "@music-rpg/domain";
import {
  ELIGIBILITY_RULE_LABELS,
  conflictLabel,
  explainAssessment,
  explainRanking,
} from "@music-rpg/simulation";
import { formatMoney, type CandidateAssessment } from "@music-rpg/shared";
import { Label, Surface } from "@music-rpg/ui";

/**
 * Opportunity inspection.
 *
 * Two questions, and the whole section exists because they have different
 * answers:
 *
 *     Why did this opportunity exist?
 *     Why did this one outrank that one?
 *
 * The first is answered from an offer's own row: its origin, the world state it
 * was generated from, the named conditions it passed, its lifetime, and the events
 * that moved it through its states. The second cannot be — ranking is comparative,
 * so it needs the run, including the candidates that lost and the ones that were
 * never written down at all.
 *
 * Everything here is raw and none of it is player-facing. A player is told that a
 * promoter has a night; they are never shown a rule name, a weight or a score, and
 * the moment they are, the director has stopped being a world and become a
 * spreadsheet.
 */
export async function CareerOpportunities({
  db,
  careerId,
}: {
  db: Database;
  careerId: string;
}) {
  const [offers, runs] = await Promise.all([
    getCareerOpportunities(db, careerId),
    getDirectorRuns(db, careerId),
  ]);

  const stamp = (value: Date | null) => (value ? new Date(value).toISOString().slice(0, 16) : "—");

  return (
    <>
      <section className="flex flex-col gap-3">
        <Label>Opportunities ({offers.length})</Label>

        {offers.length === 0 ? (
          <p className="text-xs font-mono text-ink-subtle">
            Nothing has been offered. A world with no promoters offers no nights.
          </p>
        ) : null}

        {offers.map(({ opportunity, source, sceneName, conflicts, events }) => {
          const eligibility = opportunity.eligibility as {
            checks?: { rule: string; passed: boolean; reason: string; observed: Record<string, unknown> }[];
          };
          const ranking = opportunity.ranking as {
            score?: number;
            contributions?: { term: string; input: number; weight: number; contribution: number; note: string }[];
            irrelevant?: string[];
          };
          const payload = opportunity.payload as Record<string, unknown>;

          return (
            <Surface key={opportunity.id} level={1} padded="lg" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-base text-ink font-semibold">{opportunity.type}</span>
                <span className="text-xs font-mono text-ink-muted">{opportunity.status}</span>
                {/* Authored or generated: same kind of fact, different bugs. */}
                <span className="text-2xs uppercase tracking-label text-ink-subtle">
                  {opportunity.origin}
                </span>
                {payload.billing ? (
                  <span className="text-xs font-mono text-ember">{String(payload.billing)}</span>
                ) : null}
              </div>

              {/* Why it exists, in the world's own words. */}
              {opportunity.triggerReason ? (
                <p className="text-sm text-ink-muted max-w-[70ch]">{opportunity.triggerReason}</p>
              ) : null}

              <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 text-xs font-mono">
                {[
                  ["id", opportunity.id],
                  ["identity key", opportunity.idempotencyKey ?? "— (pre-M7)"],
                  ["source", source ? `${source.name} (${source.role})` : "—"],
                  ["scene", sceneName ?? "—"],
                  ["director", opportunity.directorVersion ?? "—"],
                  ["available (game)", stamp(opportunity.availableAtGameTime)],
                  ["expires (game)", stamp(opportunity.expiresAtGameTime)],
                  ["generated (game)", stamp(opportunity.generatedAtGameTime)],
                  ["accepted", stamp(opportunity.acceptedAt)],
                  ["declined", stamp(opportunity.declinedAt)],
                  ["expired", stamp(opportunity.expiredAt)],
                  [
                    "withdrawn",
                    opportunity.withdrawnAt
                      ? `${stamp(opportunity.withdrawnAt)} for ${opportunity.withdrawnForOpportunityId?.slice(0, 12)}`
                      : "—",
                  ],
                  ["resolved", stamp(opportunity.resolvedAt)],
                  [
                    "terms",
                    payload.payoutMinor !== undefined
                      ? `${formatMoney(Number(payload.payoutMinor))} · cap ${payload.capacity ?? "—"}`
                      : payload.sessionCostMinor !== undefined && payload.sessionCostMinor !== null
                        ? `costs ${formatMoney(Number(payload.sessionCostMinor))}`
                        : "—",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col">
                    <dt className="text-ink-subtle">{label}</dt>
                    <dd className="text-ink break-all">{value}</dd>
                  </div>
                ))}
              </dl>

              {/* The conditions, with the values they were applied to. */}
              {eligibility.checks?.length ? (
                <div className="flex flex-col gap-1">
                  <span className="text-2xs uppercase tracking-label text-ink-subtle">
                    eligibility — could this exist at all
                  </span>
                  <ul className="text-xs font-mono flex flex-col gap-1">
                    {eligibility.checks.map((check) => (
                      <li key={check.rule} className="break-all">
                        <span className={check.passed ? "text-ink" : "text-danger"}>
                          {check.passed ? "pass" : "FAIL"}
                        </span>{" "}
                        <span className="text-ink-muted">
                          {ELIGIBILITY_RULE_LABELS[
                            check.rule as keyof typeof ELIGIBILITY_RULE_LABELS
                          ] ?? check.rule}
                        </span>{" "}
                        <span className="text-ink-subtle">{JSON.stringify(check.observed)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* The score, decomposed. Never a bare number. */}
              {ranking.contributions?.length ? (
                <div className="flex flex-col gap-1">
                  <span className="text-2xs uppercase tracking-label text-ink-subtle">
                    ranking — why it was worth surfacing · total {ranking.score}
                  </span>
                  <ul className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                    {explainRanking(ranking.contributions as never).map((line) => (
                      <li key={line} className="break-all">
                        {line}
                      </li>
                    ))}
                  </ul>
                  {ranking.irrelevant?.length ? (
                    <p className="text-xs font-mono text-ink-subtle">
                      not considered: {ranking.irrelevant.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* The world as it stood. Kept, never recomputed. */}
              <div className="flex flex-col gap-1">
                <span className="text-2xs uppercase tracking-label text-ink-subtle">
                  trigger state — the recorded facts it was generated from
                </span>
                <pre className="text-xs font-mono text-ink-muted whitespace-pre-wrap break-all">
                  {JSON.stringify(opportunity.triggerState, null, 2)}
                </pre>
              </div>

              {conflicts.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-2xs uppercase tracking-label text-ink-subtle">
                    conflicts ({conflicts.length})
                  </span>
                  <ul className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                    {conflicts.map((conflict) => (
                      <li key={conflict.id} className="break-all">
                        {conflictLabel(conflict.kind)} with{" "}
                        {(conflict.opportunityId === opportunity.id
                          ? conflict.otherOpportunityId
                          : conflict.opportunityId
                        ).slice(0, 12)}{" "}
                        · {JSON.stringify(conflict.detail)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col gap-1">
                <span className="text-2xs uppercase tracking-label text-ink-subtle">
                  canonical events ({events.length})
                </span>
                <ol className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                  {events.map((event) => (
                    <li key={event.id} className="break-all">
                      #{event.sequence} {event.eventType} @{" "}
                      {new Date(event.occurredAt).toISOString().slice(0, 16)}
                    </li>
                  ))}
                </ol>
              </div>
            </Surface>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <Label>Director runs ({runs.length})</Label>
        <p className="text-xs text-ink-subtle max-w-[70ch]">
          One row per career per game day. This is the only place the candidates that
          were <em>eligible and not surfaced</em> can be seen — they are deliberately
          not opportunity rows, and without them &ldquo;something more relevant came
          up&rdquo; would be an assertion rather than an answer.
        </p>

        {runs.map((run) => {
          const trace = traceOf(run);

          return (
            <Surface key={run.id} level={1} padded="lg" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 text-xs font-mono">
                <span className="text-ink">{new Date(run.gameTime).toISOString().slice(0, 16)}</span>
                <span className="text-ink-muted">{run.directorVersion}</span>
                <span className="text-ink-subtle">
                  considered {run.candidatesConsidered} · eligible {run.eligibleCount} · created{" "}
                  {run.createdCount} · expired {run.expiredCount}
                  {trace ? ` · cap ${trace.liveCap}, live before ${trace.liveBefore}` : ""}
                </span>
              </div>

              {trace ? (
                <>
                  <ol className="flex flex-col gap-2">
                    {trace.candidates.map((candidate: CandidateAssessment) => (
                      <li
                        key={`${candidate.identityKey}-${candidate.rank ?? "x"}`}
                        className="text-xs font-mono flex flex-col gap-0.5"
                      >
                        <span className="break-all">
                          <span
                            className={
                              candidate.created
                                ? "text-ink"
                                : candidate.suppressedBy === "INELIGIBLE"
                                  ? "text-danger"
                                  : "text-ink-muted"
                            }
                          >
                            {candidate.created ? "OFFERED" : (candidate.suppressedBy ?? "—")}
                          </span>{" "}
                          {candidate.type} {candidate.sceneSlug ?? ""}{" "}
                          <span className="text-ink-subtle">{candidate.identityKey}</span>
                        </span>
                        <span className="text-ink-muted pl-2">
                          {explainAssessment(candidate)}
                        </span>
                        {candidate.eligibility.failed.length > 0 ? (
                          <span className="text-ink-subtle pl-2">
                            failed: {candidate.eligibility.failed.join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>

                  {trace.expired.length > 0 ? (
                    <p className="text-xs font-mono text-ink-subtle break-all">
                      lapsed this day:{" "}
                      {trace.expired
                        .map((entry) => `${entry.type}@${entry.expiresAtGameTime.slice(0, 10)}`)
                        .join(" · ")}
                    </p>
                  ) : null}

                  {/* What the whole run was reasoned from. */}
                  <details>
                    <summary className="text-2xs uppercase tracking-label text-ink-subtle cursor-pointer">
                      inputs
                    </summary>
                    <pre className="text-xs font-mono text-ink-muted whitespace-pre-wrap break-all mt-2">
                      {JSON.stringify(trace.inputs, null, 2)}
                    </pre>
                  </details>
                </>
              ) : null}
            </Surface>
          );
        })}
      </section>
    </>
  );
}
