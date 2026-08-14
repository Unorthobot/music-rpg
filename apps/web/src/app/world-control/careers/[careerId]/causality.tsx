import { asc, desc, eq } from "drizzle-orm";
import {
  calendarItems,
  characters,
  creativeDecisions,
  creativeSessionParticipants,
  creativeSessions,
  generationJobs,
  musicBriefs,
  npcConversations,
  npcMessages,
  opportunities,
  performances,
  trackVersions,
  tracks,
  transactions,
  careerMemories,
  type Database,
} from "@music-rpg/database";
import { formatMoney, type PerformanceDerivation } from "@music-rpg/shared";
import { Label, Surface } from "@music-rpg/ui";

/**
 * Causality inspection.
 *
 * The question this section exists to answer is "how did this track get here?".
 * Everything is raw and in order: the opportunity, the charge, the session, who
 * was in it, every decision, every brief, every job, every version. If the
 * chain can't be reconstructed here, the domain has a hole.
 */
export async function CareerCausality({ db, careerId }: { db: Database; careerId: string }) {
  const [
    opportunityRows,
    conversationRows,
    calendarRows,
    transactionRows,
    sessionRows,
    trackRows,
    memoryRows,
    performanceRows,
  ] = await Promise.all([
    db.select().from(opportunities).where(eq(opportunities.careerId, careerId)),
    db
      .select({ conversation: npcConversations, character: characters })
      .from(npcConversations)
      .innerJoin(characters, eq(characters.id, npcConversations.characterId))
      .where(eq(npcConversations.careerId, careerId)),
    db.select().from(calendarItems).where(eq(calendarItems.careerId, careerId)),
    db
      .select()
      .from(transactions)
      .where(eq(transactions.careerId, careerId))
      .orderBy(desc(transactions.occurredAt)),
    db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.careerId, careerId))
      .orderBy(asc(creativeSessions.createdAt)),
    db.select().from(tracks).where(eq(tracks.careerId, careerId)),
    db.select().from(careerMemories).where(eq(careerMemories.careerId, careerId)),
    db
      .select()
      .from(performances)
      .where(eq(performances.careerId, careerId))
      .orderBy(asc(performances.occurredAtGameTime)),
  ]);

  const messages = conversationRows.length
    ? await db
        .select()
        .from(npcMessages)
        .where(eq(npcMessages.conversationId, conversationRows[0]!.conversation.id))
        .orderBy(asc(npcMessages.createdAt))
    : [];

  const sessionIds = sessionRows.map((session) => session.id);

  const [participants, decisions, briefs, jobs, versions] = await Promise.all([
    sessionIds.length
      ? db.select().from(creativeSessionParticipants)
      : Promise.resolve([]),
    sessionIds.length
      ? db.select().from(creativeDecisions).orderBy(asc(creativeDecisions.sequence))
      : Promise.resolve([]),
    sessionIds.length ? db.select().from(musicBriefs) : Promise.resolve([]),
    sessionIds.length
      ? db.select().from(generationJobs).where(eq(generationJobs.careerId, careerId))
      : Promise.resolve([]),
    sessionIds.length ? db.select().from(trackVersions) : Promise.resolve([]),
  ]);

  const mine = <T extends { sessionId?: string | null }>(rows: T[]) =>
    rows.filter((row) => row.sessionId && sessionIds.includes(row.sessionId));

  /*
   * Nights the career has agreed to and not yet reached. Read from the calendar
   * rather than from the offer, because the commitment is what the clock acts
   * on — and a booking still SCHEDULED is precisely a night that has not
   * happened, whatever else the world holds about it.
   */
  const pendingNights = calendarRows
    .filter((row) => row.type === "PERFORMANCE" && row.status === "SCHEDULED")
    .sort((a, b) => a.startGameTime.getTime() - b.startGameTime.getTime());

  return (
    <>
      <section className="flex flex-col gap-3">
        <Label>Opportunities ({opportunityRows.length})</Label>
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-xs min-w-[620px] font-mono">
            <tbody>
              {opportunityRows.map((row) => (
                <tr key={row.id} className="border-b border-line-subtle last:border-0">
                  <td className="px-3 py-2 text-ink">{row.type}</td>
                  <td className="px-3 py-2 text-ink-muted">{row.status}</td>
                  <td className="px-3 py-2 text-ink-subtle break-all">
                    {JSON.stringify(row.payload)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Label>NPC messages ({messages.length})</Label>
        <ul className="flex flex-col gap-1 text-xs font-mono text-ink-muted">
          {messages.map((message) => (
            <li key={message.id}>
              <span className="text-ink">{message.senderType}</span> · {message.content}
              {message.readAt ? " · read" : " · unread"}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Label>Transactions ({transactionRows.length})</Label>
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="w-full text-xs min-w-[720px] font-mono">
            <thead className="bg-surface-2 text-ink-subtle uppercase tracking-label">
              <tr>
                <th className="text-left font-medium px-3 py-2">Category</th>
                <th className="text-left font-medium px-3 py-2">Dir</th>
                <th className="text-left font-medium px-3 py-2">Amount</th>
                <th className="text-left font-medium px-3 py-2">Balance after</th>
                <th className="text-left font-medium px-3 py-2">Idempotency key</th>
              </tr>
            </thead>
            <tbody>
              {transactionRows.map((row) => (
                <tr key={row.id} className="border-t border-line-subtle">
                  <td className="px-3 py-2 text-ink">{row.category}</td>
                  <td className="px-3 py-2 text-ink-muted">{row.direction}</td>
                  <td className="px-3 py-2 text-ink-muted">{formatMoney(row.amountMinor)}</td>
                  <td className="px-3 py-2 text-ink-muted">{formatMoney(row.balanceAfterMinor)}</td>
                  <td className="px-3 py-2 text-ink-subtle break-all">{row.idempotencyKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Label>Calendar ({calendarRows.length})</Label>
        <ul className="flex flex-col gap-1 text-xs font-mono text-ink-muted">
          {calendarRows.map((row) => (
            <li key={row.id}>
              {row.type} · {row.status} · {new Date(row.startGameTime).toISOString()} ·{" "}
              {row.relatedEntityType}:{row.relatedEntityId}
            </li>
          ))}
        </ul>
      </section>

      {/*
        * Nights.
        *
        * The chain the inspector must be able to walk without inferring
        * anything: the offer with the promoter's terms as recorded, the
        * commitment acceptance created, the night the clock reached, each of
        * the three facts with its derivation, the fee and the ledger row it
        * became, the standing movement decomposed, who in the audience was
        * touched cohort by cohort within capacity, and the public fact.
        *
        * And — separately and just as important — that a night which has not
        * happened yet is *scheduled*, for a date, with nothing paid and
        * nothing moved. "This has not happened" is an answer the inspector has
        * to be able to give as confidently as "this did".
        */}
      <section className="flex flex-col gap-3">
        <Label>
          Nights ({performanceRows.length} played · {pendingNights.length} scheduled)
        </Label>

        {pendingNights.map((item) => {
          const offer = opportunityRows.find((row) => row.id === item.relatedEntityId);
          const terms = (offer?.payload ?? {}) as Record<string, unknown>;
          return (
            <div
              key={item.id}
              className="rounded-md border border-line-subtle px-3 py-2 text-xs font-mono text-ink-muted"
            >
              <div className="text-ink">
                SCHEDULED · {String(terms.nightName ?? item.title)} ·{" "}
                {new Date(item.startGameTime).toISOString()}
              </div>
              <div>
                billing {String(terms.billing ?? "?")} · capacity{" "}
                {String(terms.capacity ?? "?")} · agreed fee{" "}
                {formatMoney(Number(terms.payoutMinor ?? 0))}
              </div>
              {/* Asserted from rows, not claimed: there is no night behind this. */}
              <div className="text-ink-subtle">
                no performances row · nothing paid · nothing moved · offer{" "}
                {offer?.status ?? "?"}
              </div>
            </div>
          );
        })}

        {performanceRows.map((row) => {
          const offer = opportunityRows.find((item) => item.id === row.opportunityId);
          const fee = transactionRows.find((item) => item.id === row.transactionId);
          const consequences = row.consequences as {
            pressure?: {
              fame?: number;
              respect?: number;
              heat?: number;
              contributions?: { metric: string; from: string; contribution: number }[];
            };
            audience?: {
              totalAffected?: number;
              capacity?: number;
              cohorts?: { cohortSlug: string; attendees: number; wonOver: number; newFans: number }[];
            };
          };

          return (
            <div
              key={row.id}
              className="rounded-md border border-line-subtle px-3 py-2 text-xs font-mono text-ink-muted flex flex-col gap-1"
            >
              <div className="text-ink">
                {row.billing} · {row.nightName ?? "a night"} · {row.sceneSlug} ·{" "}
                {new Date(row.occurredAtGameTime).toISOString()}
              </div>

              {/* The offer, with the promoter's terms as recorded. */}
              <div>
                offer {row.opportunityId} · {offer?.status ?? "?"} · promoter{" "}
                {row.promoterName ?? "?"} ({row.promoterCharacterId ?? "no character"}) ·{" "}
                {row.termsLine ?? "no terms line"}
              </div>

              {/* The commitment it created, and the night the clock reached. */}
              <div>
                commitment {row.calendarItemId ?? "none"} · capacity {row.capacity} · standing{" "}
                {row.sceneStandingValue} · momentum {row.momentum} · seed {row.seed} ·{" "}
                {row.simulatorVersion}
              </div>

              {/* Each fact, with its derivation. Nothing sums them. */}
              <div className="text-ink">
                in the room {row.attendance} · won over {row.wonOver} · word left the room{" "}
                {row.wordLeftTheRoom}
              </div>
              {(row.derivation as PerformanceDerivation[]).map((entry) => (
                <div key={entry.fact} className="text-ink-subtle pl-3">
                  {entry.fact} = {entry.value} (bound {entry.bound} · {entry.boundLabel} ·{" "}
                  {entry.bounded ? "bound bit" : "bound spare"}) ←{" "}
                  {entry.contributions
                    .map((one) => `${one.term} ${one.input}×${one.weight}=${one.contribution}`)
                    .join(" · ")}
                </div>
              ))}

              {/* The fee, and the ledger row it became. */}
              <div>
                fee {formatMoney(row.feeMinor)} ={" "}
                {fee
                  ? `${fee.category} ${fee.direction} ${formatMoney(fee.amountMinor)} → balance ${formatMoney(
                      fee.balanceAfterMinor,
                    )} · ${fee.idempotencyKey}`
                  : "no ledger row"}
              </div>

              {/* Fame / Respect / Heat movement, decomposed. */}
              <div>
                pressure fame {consequences.pressure?.fame ?? 0} · respect{" "}
                {consequences.pressure?.respect ?? 0} · heat {consequences.pressure?.heat ?? 0}
              </div>
              {(consequences.pressure?.contributions ?? []).map((one, index) => (
                <div key={index} className="text-ink-subtle pl-3">
                  {one.metric} ← {one.from} = {one.contribution}
                </div>
              ))}

              {/* Who was touched, cohort by cohort, within capacity. */}
              <div>
                audience {consequences.audience?.totalAffected ?? 0} affected ≤ attendance{" "}
                {row.attendance} ≤ capacity {row.capacity}
              </div>
              {(consequences.audience?.cohorts ?? []).map((one) => (
                <div key={one.cohortSlug} className="text-ink-subtle pl-3">
                  {one.cohortSlug} · {one.attendees} in the room · {one.wonOver} won over ·{" "}
                  {one.newFans} new fans
                </div>
              ))}

              {/* As the scene saw it. */}
              <div className="text-ink-subtle">
                performance.resolved · LOCAL_PUBLIC · performance:{row.opportunityId}:resolved
              </div>
            </div>
          );
        })}
      </section>

      {sessionRows.map((session) => {
        const sessionDecisions = decisions.filter((row) => row.sessionId === session.id);
        const sessionJobs = mine(jobs).filter((row) => row.sessionId === session.id);
        const sessionBriefs = briefs.filter((row) => row.sessionId === session.id);
        const sessionParticipants = participants.filter((row) => row.sessionId === session.id);
        const trackForSession = trackRows.find((row) => row.id === session.trackId);
        const sessionVersions = versions
          .filter((row) => row.trackId === session.trackId)
          .sort((a, b) => a.versionNumber - b.versionNumber);

        return (
          <Surface key={session.id} level={1} padded="lg" className="flex flex-col gap-4">
            <Label>Creative session — {session.status}</Label>

            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2 text-xs font-mono">
              <div>
                <dt className="text-ink-subtle">id</dt>
                <dd className="text-ink break-all">{session.id}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">cost / transaction</dt>
                <dd className="text-ink break-all">
                  {formatMoney(session.costMinor)} · {session.transactionId}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">proposal round</dt>
                <dd className="text-ink">{session.proposalRound}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">track</dt>
                <dd className="text-ink break-all">
                  {trackForSession
                    ? `${trackForSession.title ?? "untitled"} (${trackForSession.status})`
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="text-xs font-mono text-ink-muted">
              participants:{" "}
              {sessionParticipants
                .map((row) => `${row.role}:${row.entityType}:${row.entityId.slice(0, 12)}`)
                .join(" · ")}
            </div>

            {session.creativeDirection ? (
              <div className="flex flex-col gap-1">
                <span className="text-2xs uppercase tracking-label text-ink-subtle">direction</span>
                <pre className="text-xs font-mono text-ink-muted whitespace-pre-wrap break-all">
                  {JSON.stringify(session.creativeDirection, null, 2)}
                </pre>
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                decisions ({sessionDecisions.length})
              </span>
              <ol className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                {sessionDecisions.map((decision) => (
                  <li key={decision.id}>
                    #{decision.sequence} {decision.decisionType}{" "}
                    <span className="text-ink-subtle break-all">
                      {JSON.stringify(decision.payload)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                briefs ({sessionBriefs.length})
              </span>
              <ul className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                {sessionBriefs.map((brief) => (
                  <li key={brief.id} className="break-all">
                    {brief.id.slice(0, 12)} · {brief.intention} · energy {brief.energy} · risk{" "}
                    {brief.risk}
                    {brief.revisionOfId ? ` · revision of ${brief.revisionOfId.slice(0, 12)}` : ""}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                generation jobs ({sessionJobs.length})
              </span>
              <ul className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                {sessionJobs.map((job) => (
                  <li key={job.id} className="break-all">
                    {job.jobType} · {job.status} · attempts {job.attempts} · version{" "}
                    {job.trackVersionId?.slice(0, 12) ?? "—"} · key {job.idempotencyKey}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-2xs uppercase tracking-label text-ink-subtle">
                versions ({sessionVersions.length}) — immutable
              </span>
              <ul className="text-xs font-mono text-ink-muted flex flex-col gap-1">
                {sessionVersions.map((version) => (
                  <li key={version.id} className="break-all">
                    v{version.versionNumber} · {version.workingTitle}
                    {version.isMaster ? " · MASTER" : ""} · brief{" "}
                    {version.musicBriefId?.slice(0, 12) ?? "—"} · metrics{" "}
                    {JSON.stringify(version.qualityMetrics)}
                  </li>
                ))}
              </ul>
            </div>
          </Surface>
        );
      })}

      <section className="flex flex-col gap-3">
        <Label>Career memories ({memoryRows.length})</Label>
        <ul className="text-xs font-mono text-ink-muted flex flex-col gap-1">
          {memoryRows.map((memory) => (
            <li key={memory.id} className="break-all">
              {memory.kind} · {memory.summary} · from event {memory.sourceEventId?.slice(0, 12)}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
