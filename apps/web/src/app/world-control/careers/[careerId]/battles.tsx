import type { Database } from "@music-rpg/database";
import { getCareerBattles } from "@music-rpg/domain";
import {
  BATTLE_JUDGE_QUESTIONS,
  BATTLE_PERFORMANCE_FACTS,
  BATTLE_PERFORMANCE_FACT_LABELS,
  BATTLE_STRATEGY_LABELS,
  formatMoney,
  type BattleJudge,
  type JudgeContribution,
  type PerformanceFactDerivation,
} from "@music-rpg/shared";
import { Label, Surface } from "@music-rpg/ui";

/**
 * Battle inspection.
 *
 * Two questions, and the whole section exists because they have different
 * answers:
 *
 *     Why did this career beat that opponent?
 *     Why did the Technical judge disagree with the Audience judge?
 *
 * The first is answered by walking the chain — the challenge, the angles, the
 * preparation, and what each artist actually did. The second cannot be: it is a
 * question about three mandates reading different facts, so it needs each
 * judge's own decomposition, including the terms it *did not* consider.
 *
 * Everything here is raw and none of it is player-facing. A player is eventually
 * told that they won a night in Braamfontein; they are never shown a fact value,
 * a judge total or a contribution weight, and the moment they are, the panel has
 * stopped being three perspectives and become a scoreboard.
 */
export async function CareerBattles({ db, careerId }: { db: Database; careerId: string }) {
  const dossiers = await getCareerBattles(db, careerId);

  const stamp = (value: Date | null) =>
    value ? new Date(value).toISOString().slice(0, 16) : "—";

  return (
    <section className="flex flex-col gap-3">
      <Label>Battles ({dossiers.length})</Label>

      {dossiers.length === 0 ? (
        <p className="text-xs font-mono text-ink-subtle">
          Nobody has called this career out. A world with no rivals offers no challenges.
        </p>
      ) : null}

      {dossiers.map(({ battle, sceneName, challenger, opponent, performances, judgements, scouting, events }) => {
        const nameOf = (artistId: string | null) =>
          artistId === challenger?.id
            ? (challenger?.stageName ?? "—")
            : artistId === opponent?.id
              ? (opponent?.stageName ?? "—")
              : "—";

        const sideName = (side: string) =>
          side === "CHALLENGER" ? (challenger?.stageName ?? "Challenger") : (opponent?.stageName ?? "Opponent");

        return (
          <Surface key={battle.id} level={1} padded="lg" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-base text-ink font-semibold">
                {challenger?.stageName ?? "—"} v {opponent?.stageName ?? "—"}
              </span>
              <span className="text-xs font-mono text-ink-muted">{battle.status}</span>
              {battle.decision ? (
                <span className="text-xs font-mono text-ember">
                  {battle.decision} → {nameOf(battle.winnerArtistId)}
                </span>
              ) : null}
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                player is {battle.playerSide ?? "—"}
              </span>
            </div>

            {/* Why it existed at all, in the world's own words. */}
            {battle.challengeReason ? (
              <p className="text-sm text-ink-muted max-w-[70ch]">{battle.challengeReason}</p>
            ) : null}

            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 text-xs font-mono">
              {[
                ["id", battle.id],
                ["identity key", battle.idempotencyKey ?? "—"],
                ["from challenge", battle.opportunityId ?? "—"],
                ["scene", sceneName ?? "—"],
                ["challenged (game)", stamp(battle.challengedAtGameTime)],
                ["scheduled (game)", stamp(battle.scheduledGameTime)],
                ["simulator", battle.simulatorVersion ?? "—"],
                ["seed", battle.seed ?? "—"],
                ["accepted", stamp(battle.acceptedAt)],
                ["declined", stamp(battle.declinedAt)],
                ["performed", stamp(battle.performedAt)],
                ["judged", stamp(battle.judgedAt)],
                ["resolved", stamp(battle.resolvedAt)],
                ["outcome (career)", battle.outcome ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-ink-subtle">{label}</dt>
                  <dd className="text-ink break-all">{value}</dd>
                </div>
              ))}
            </dl>

            {/* The world as it stood when somebody decided to call them out. */}
            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                challenge state — the recorded facts it was generated from
              </span>
              <pre className="text-xs font-mono text-ink-muted whitespace-pre-wrap break-all">
                {JSON.stringify(battle.challengeState, null, 2)}
              </pre>
            </div>

            {/* What each of them actually did. Facts, never prose. */}
            {performances.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-2xs uppercase tracking-label text-ink-subtle">
                  performances — what each artist actually did
                </span>
                {performances.map((row) => (
                  <div key={row.id} className="flex flex-col gap-1">
                    <span className="text-xs font-mono text-ink">
                      {sideName(row.side)} · {BATTLE_STRATEGY_LABELS[row.strategy] ?? row.strategy}
                      {row.preparationSessions > 0
                        ? ` · prepared ${row.preparationSessions}× for ${formatMoney(row.preparationSpendMinor)}`
                        : " · unprepared"}
                    </span>
                    <div className="flex flex-wrap gap-x-4 text-xs font-mono text-ink-muted">
                      {BATTLE_PERFORMANCE_FACTS.map((fact) => (
                        <span key={fact}>
                          {BATTLE_PERFORMANCE_FACT_LABELS[fact]}{" "}
                          <span className="text-ink">
                            {Number(row[fact as keyof typeof row] ?? 0).toFixed(1)}
                          </span>
                        </span>
                      ))}
                    </div>
                    {/*
                     * How every one of those was arrived at. This is the only
                     * reason the numbers above are allowed to exist.
                     */}
                    <details>
                      <summary className="text-2xs uppercase tracking-label text-ink-subtle cursor-pointer">
                        derivation
                      </summary>
                      <ul className="text-xs font-mono text-ink-subtle flex flex-col gap-1 mt-1">
                        {(row.derivation as PerformanceFactDerivation[]).map((entry) => (
                          <li key={entry.fact} className="break-all">
                            {entry.fact}: base {entry.base.toFixed(2)} · angle{" "}
                            {entry.strategyShift >= 0 ? "+" : ""}
                            {entry.strategyShift.toFixed(2)} · prep +
                            {entry.preparationShift.toFixed(2)} · night{" "}
                            {entry.composureShift >= 0 ? "+" : ""}
                            {entry.composureShift.toFixed(2)} → {entry.value.toFixed(2)}
                            <span className="text-ink-subtle"> — {entry.note}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                ))}
              </div>
            ) : null}

            {/*
             * The panel. This is where "why did the audience disagree with the
             * technical judge" becomes answerable rather than assertable.
             */}
            {judgements.length > 0 ? (
              <div className="flex flex-col gap-3">
                <span className="text-2xs uppercase tracking-label text-ink-subtle">
                  judges — three questions, three sets of inputs, one vote each
                </span>
                {judgements.map((row) => (
                  <div key={row.id} className="flex flex-col gap-1">
                    <span className="text-xs font-mono">
                      <span className="text-ink">{row.judge}</span>{" "}
                      <span className="text-ink-subtle">({row.panelRole})</span> →{" "}
                      <span className="text-ember">{sideName(row.verdictSide)}</span>{" "}
                      <span className="text-ink-muted">
                        {challenger?.stageName} {row.challengerTotal.toFixed(2)} /{" "}
                        {opponent?.stageName} {row.opponentTotal.toFixed(2)} · margin{" "}
                        {row.margin.toFixed(2)}
                      </span>
                    </span>
                    <span className="text-xs text-ink-subtle">
                      {BATTLE_JUDGE_QUESTIONS[row.judge as BattleJudge] ?? ""}
                    </span>
                    <ul className="text-xs font-mono text-ink-muted flex flex-col gap-0.5 pl-2">
                      {(row.contributions as JudgeContribution[]).map((entry) => (
                        <li key={entry.term} className="break-all">
                          {entry.term} ×{entry.weight}: {entry.challengerInput.toFixed(1)} →{" "}
                          {entry.challengerContribution.toFixed(2)} vs{" "}
                          {entry.opponentInput.toFixed(1)} →{" "}
                          {entry.opponentContribution.toFixed(2)}
                          <span className="text-ink-subtle"> — {entry.note}</span>
                        </li>
                      ))}
                    </ul>
                    {/* "That was irrelevant to me" is a real answer, and is kept. */}
                    {(row.irrelevant as string[]).length > 0 ? (
                      <p className="text-xs font-mono text-ink-subtle pl-2">
                        not considered: {(row.irrelevant as string[]).join(", ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {/* What followed. Decomposed, and with Legacy conspicuously absent. */}
            {Object.keys(battle.consequences).length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-2xs uppercase tracking-label text-ink-subtle">
                  consequences — standing pressure and what happened between the two
                </span>
                <pre className="text-xs font-mono text-ink-muted whitespace-pre-wrap break-all">
                  {JSON.stringify(battle.consequences, null, 2)}
                </pre>
              </div>
            ) : null}

            {/* What was knowable beforehand — and never an input to any of it. */}
            {scouting.length > 0 ? (
              <details>
                <summary className="text-2xs uppercase tracking-label text-ink-subtle cursor-pointer">
                  scouting — revealed, never a modifier
                </summary>
                <pre className="text-xs font-mono text-ink-muted whitespace-pre-wrap break-all mt-2">
                  {JSON.stringify(
                    scouting.map((row) => ({ findings: row.findings, unknowns: row.unknowns })),
                    null,
                    2,
                  )}
                </pre>
              </details>
            ) : null}

            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                canonical events ({events.length})
              </span>
              <ol className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                {events.map((event) => (
                  <li key={event.id} className="break-all">
                    #{event.sequence} {event.eventType}{" "}
                    <span className="text-ink-subtle">({event.visibility})</span> @{" "}
                    {new Date(event.occurredAt).toISOString().slice(0, 16)}
                  </li>
                ))}
              </ol>
            </div>
          </Surface>
        );
      })}
    </section>
  );
}
