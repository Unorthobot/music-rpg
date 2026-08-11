import { eq } from "drizzle-orm";
import {
  gameEvents,
  type Database,
} from "@music-rpg/database";
import {
  getArtistAudience,
  getCareerReception,
  getReceptionHistory,
  getReleaseCohortPerformance,
} from "@music-rpg/domain";
import { groupDigits, type CohortEvaluation, type ReceptionTickResult } from "@music-rpg/shared";
import { Label, Surface } from "@music-rpg/ui";

/**
 * Reception inspection.
 *
 * The question this section exists to answer is "why did this record perform
 * this way?", and it answers it in the order the simulation did:
 *
 *     stored M4 modifiers → cohort → evaluation → exposure → listening →
 *     engagement → conversion → word of mouth → metric pressure
 *
 * If a number on a player-facing screen cannot be traced through these tables,
 * the simulation is not finished. This is not an analytics dashboard and is not
 * trying to be readable at a glance — it is trying to be complete.
 */
export async function CareerReception({
  db,
  careerId,
  world,
  entity,
}: {
  db: Database;
  careerId: string;
  world: { id: string };
  entity: { type: "ARTIST" | "GROUP"; id: string } | null;
}) {
  const [reception, audience] = await Promise.all([
    getCareerReception(db, careerId),
    entity
      ? getArtistAudience(db, { worldId: world.id, ownerType: entity.type, ownerId: entity.id })
      : Promise.resolve([]),
  ]);

  /*
   * Everything is loaded before anything renders. Each release needs three
   * further queries, and doing them inside the JSX would put promises in the
   * children position — resolved up front instead, so the markup below is
   * plain synchronous rendering.
   */
  const detail = await Promise.all(
    reception.releases.map(async (entry) => {
      const [cohorts, history, publishedRows] = await Promise.all([
        getReleaseCohortPerformance(db, entry.release.id),
        getReceptionHistory(db, entry.release.id),
        db
          .select()
          .from(gameEvents)
          .where(eq(gameEvents.idempotencyKey, `release:${entry.release.id}:published`))
          .limit(1),
      ]);

      return {
        ...entry,
        cohorts,
        history,
        // The copy of the modifiers carried in the canonical event, shown
        // beside the release's own so the two can be seen to agree.
        publishedModifiers:
          (publishedRows[0]?.payload as { audienceModifiers?: Record<string, number> } | undefined)
            ?.audienceModifiers ?? null,
      };
    }),
  );

  if (reception.releases.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <Label>Reception</Label>
        <p className="text-sm text-ink-subtle">
          Nothing has been released yet, so there is nothing for the world to react to.
        </p>
      </section>
    );
  }

  return (
    <>
      <Surface level={1} padded="lg" className="flex flex-col gap-3">
        <Label>Career metric pressure</Label>
        <p className="text-xs text-ink-subtle">
          Fame, Respect and Heat accrue as fractions; the career shows the floor. Legacy has no
          accrual and cannot move in this milestone.
        </p>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-3 text-xs font-mono">
          <span className="text-ink-muted">
            fame accrued: <span className="text-ink">{(reception.pressure?.fameAccrued ?? 0).toFixed(5)}</span>
          </span>
          <span className="text-ink-muted">
            respect accrued:{" "}
            <span className="text-ink">{(reception.pressure?.respectAccrued ?? 0).toFixed(5)}</span>
          </span>
          <span className="text-ink-muted">
            heat accrued: <span className="text-ink">{(reception.pressure?.heatAccrued ?? 0).toFixed(5)}</span>
          </span>
        </div>
      </Surface>

      {audience.length > 0 ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          <Label>Artist audience — standing with each cohort</Label>
          <p className="text-xs text-ink-subtle">
            World-scoped cohorts. A cohort with no row exists and has not heard of this artist.
          </p>
          <div className="overflow-x-auto rounded-md border border-line-subtle">
            <table className="w-full text-xs min-w-[720px] font-mono">
              <thead className="bg-surface-2 text-ink-subtle uppercase tracking-label">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Cohort</th>
                  <th className="text-left font-medium px-3 py-2">Population</th>
                  <th className="text-left font-medium px-3 py-2">Fans</th>
                  <th className="text-left font-medium px-3 py-2">Affinity</th>
                  <th className="text-left font-medium px-3 py-2">Expectation</th>
                  <th className="text-left font-medium px-3 py-2">Engage tendency</th>
                  <th className="text-left font-medium px-3 py-2">Prior exposure</th>
                </tr>
              </thead>
              <tbody>
                {audience.map((row) => (
                  <tr key={row.cohort.id} className="border-t border-line-subtle">
                    <td className="px-3 py-2 text-ink">{row.cohort.slug}</td>
                    <td className="px-3 py-2 text-ink-muted">{groupDigits(row.cohort.size)}</td>
                    <td className="px-3 py-2 text-ink">{row.audience?.fans ?? 0}</td>
                    <td className="px-3 py-2 text-ink-muted">
                      {(row.audience?.affinity ?? 0).toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{row.audience?.expectation ?? 0}</td>
                    <td className="px-3 py-2 text-ink-muted">
                      {row.audience?.engagementTendency ?? 0}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{row.audience?.priorExposure ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : null}

      {detail.map(({ release, title, performance, cohorts, history, publishedModifiers }) => {
        return (
          <Surface key={release.id} level={1} padded="lg" className="flex flex-col gap-5">
            <Label>
              Reception — {title ?? "Untitled"} ({release.format} · {release.strategy})
            </Label>

            {/* 1. The handoff. What M4 recorded is what M5 read. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                stored audience modifiers — the M4 handoff
              </span>
              <span className="text-xs font-mono text-ink break-all">
                releases.audience_modifiers: {JSON.stringify(release.audienceModifiers)}
              </span>
              <span className="text-xs font-mono text-ink-muted break-all">
                release.published payload: {JSON.stringify(publishedModifiers)}
              </span>
              <span className="text-2xs text-ink-subtle">
                The simulator consumes these. It never re-derives them from {release.strategy}.
              </span>
            </div>

            {/* 2. What the record did overall. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                release performance
              </span>
              {performance ? (
                <>
                  <span className="text-xs font-mono text-ink-muted">
                    exposure <span className="text-ink">{groupDigits(performance.totalExposures)}</span> ·
                    listeners <span className="text-ink">{groupDigits(performance.uniqueListeners)}</span> ·
                    engaged <span className="text-ink">{groupDigits(performance.engagedListeners)}</span> ·
                    repeat <span className="text-ink">{groupDigits(performance.repeatListeners)}</span> ·
                    fans <span className="text-ink">{groupDigits(performance.fanConversions)}</span> ·
                    shares <span className="text-ink">{groupDigits(performance.shares)}</span>
                  </span>
                  <span className="text-xs font-mono text-ink-subtle break-all">
                    momentum {performance.currentMomentum.toFixed(3)} · days{" "}
                    {performance.daysSimulated} · simulator {performance.simulatorVersion} · seed{" "}
                    {performance.simulationSeed}
                  </span>
                </>
              ) : (
                <span className="text-xs text-ink-subtle">
                  No reception simulated. Zero here means the simulation has not run — not that
                  nobody listened.
                </span>
              )}
            </div>

            {/* 3. Each cohort, and the evaluation that produced its numbers. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                cohort evaluation and response
              </span>
              <div className="overflow-x-auto rounded-md border border-line-subtle">
                <table className="w-full text-xs min-w-[980px] font-mono">
                  <thead className="bg-surface-2 text-ink-subtle uppercase tracking-label">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Cohort</th>
                      <th className="text-left font-medium px-3 py-2">Fit</th>
                      <th className="text-left font-medium px-3 py-2">Sound</th>
                      <th className="text-left font-medium px-3 py-2">Quality</th>
                      <th className="text-left font-medium px-3 py-2">Artist</th>
                      <th className="text-left font-medium px-3 py-2">Reach×</th>
                      <th className="text-left font-medium px-3 py-2">Antic×</th>
                      <th className="text-left font-medium px-3 py-2">Cred×</th>
                      <th className="text-left font-medium px-3 py-2">Expo</th>
                      <th className="text-left font-medium px-3 py-2">Listen</th>
                      <th className="text-left font-medium px-3 py-2">Engaged</th>
                      <th className="text-left font-medium px-3 py-2">Repeat</th>
                      <th className="text-left font-medium px-3 py-2">Fans</th>
                      <th className="text-left font-medium px-3 py-2">Shares</th>
                      <th className="text-left font-medium px-3 py-2">WoM next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map(({ cohort, performance: row }) => {
                      const evaluation = row?.evaluation as CohortEvaluation | undefined;
                      return (
                        <tr key={cohort.id} className="border-t border-line-subtle">
                          <td className="px-3 py-2 text-ink">{cohort.slug}</td>
                          <td className="px-3 py-2 text-ink">{evaluation?.fit?.toFixed(3) ?? "—"}</td>
                          <td className="px-3 py-2 text-ink-muted">
                            {evaluation?.soundFit?.toFixed(3) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-muted">
                            {evaluation?.qualityFit?.toFixed(3) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-muted">
                            {evaluation?.artistFit?.toFixed(3) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-subtle">
                            {evaluation?.reachBoost?.toFixed(3) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-subtle">
                            {evaluation?.anticipationBoost?.toFixed(3) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-subtle">
                            {evaluation?.credibilityBoost?.toFixed(3) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-ink">{row?.exposures ?? 0}</td>
                          <td className="px-3 py-2 text-ink-muted">{row?.listeners ?? 0}</td>
                          <td className="px-3 py-2 text-ink-muted">{row?.engagedListeners ?? 0}</td>
                          <td className="px-3 py-2 text-ink-muted">{row?.repeatListeners ?? 0}</td>
                          <td className="px-3 py-2 text-ink">{row?.fanConversions ?? 0}</td>
                          <td className="px-3 py-2 text-ink-muted">{row?.shares ?? 0}</td>
                          <td className="px-3 py-2 text-ink-subtle">{row?.wordOfMouth ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <span className="text-2xs text-ink-subtle">
                Counts are cumulative. &ldquo;WoM next&rdquo; is pending exposure the last tick&rsquo;s
                sharing will create, after routing between cohorts.
              </span>
            </div>

            {/* 4. Day by day: the trajectory, and what it did to the career. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                simulation history ({history.length} ticks)
              </span>
              <div className="overflow-x-auto rounded-md border border-line-subtle">
                <table className="w-full text-xs min-w-[900px] font-mono">
                  <thead className="bg-surface-2 text-ink-subtle uppercase tracking-label">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Day</th>
                      <th className="text-left font-medium px-3 py-2">Game time</th>
                      <th className="text-left font-medium px-3 py-2">Expo</th>
                      <th className="text-left font-medium px-3 py-2">Listen</th>
                      <th className="text-left font-medium px-3 py-2">Engaged</th>
                      <th className="text-left font-medium px-3 py-2">Fans</th>
                      <th className="text-left font-medium px-3 py-2">Shares</th>
                      <th className="text-left font-medium px-3 py-2">Momentum</th>
                      <th className="text-left font-medium px-3 py-2">Fame +</th>
                      <th className="text-left font-medium px-3 py-2">Respect +</th>
                      <th className="text-left font-medium px-3 py-2">Heat +</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((tick) => {
                      const result = tick.result as ReceptionTickResult;
                      return (
                        <tr key={tick.id} className="border-t border-line-subtle">
                          <td className="px-3 py-2 text-ink">{tick.dayIndex}</td>
                          <td className="px-3 py-2 text-ink-subtle">
                            {new Date(tick.gameTime).toISOString()}
                          </td>
                          <td className="px-3 py-2 text-ink">{result.totals?.exposures ?? 0}</td>
                          <td className="px-3 py-2 text-ink-muted">{result.totals?.listeners ?? 0}</td>
                          <td className="px-3 py-2 text-ink-muted">
                            {result.totals?.engagedListeners ?? 0}
                          </td>
                          <td className="px-3 py-2 text-ink">{result.totals?.fanConversions ?? 0}</td>
                          <td className="px-3 py-2 text-ink-muted">{result.totals?.shares ?? 0}</td>
                          <td className="px-3 py-2 text-ink-subtle">
                            {result.momentumBefore?.toFixed(2)} → {result.momentumAfter?.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-ink-muted">
                            {result.pressure?.fame?.toFixed(5)}
                          </td>
                          <td className="px-3 py-2 text-ink-muted">
                            {result.pressure?.respect?.toFixed(5)}
                          </td>
                          <td className="px-3 py-2 text-ink-muted">
                            {result.pressure?.heat?.toFixed(5)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Surface>
        );
      })}
    </>
  );
}
