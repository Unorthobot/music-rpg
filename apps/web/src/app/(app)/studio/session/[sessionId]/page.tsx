import { notFound } from "next/navigation";
import { getCreativeSession } from "@music-rpg/domain";
import { Button, Surface } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, requireCareer } from "@/lib/career";
import { startSessionAction } from "../../actions";
import { StudioWorkspace, type WorkspaceVersion } from "./workspace";

export const metadata = { title: "Session" };

/**
 * A session, resumed.
 *
 * The page renders whatever state the session is actually in — there is no
 * client-side wizard position to lose. Closing the tab mid-render and coming
 * back lands on the same step, with the same decisions behind it.
 */
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: { sessionId: string };
  searchParams: { error?: string };
}) {
  const { user, view } = await requireCareer();
  const db = await getAppDb();

  const session = await getCreativeSession(db, view.career.id, params.sessionId);
  if (!session) notFound();

  const producerName = session.producer?.name ?? "Your producer";

  if (session.session.status === "SCHEDULED") {
    return (
      <AppShell
        displayName={view.displayName}
        act={ACT_LABELS[view.career.careerAct]}
        eyebrow="Studio"
        title={`Session with ${producerName}`}
      >
        <Surface level={2} padded="lg" className="flex flex-col gap-3 border-ember-line">
          <p className="text-xl font-semibold tracking-display">
            {producerName} is expecting you.
          </p>
          <p className="text-sm text-ink-muted">
            The room is paid for. Nothing starts until you walk in.
          </p>
          <form action={startSessionAction}>
            <input type="hidden" name="sessionId" value={session.session.id} />
            <Button type="submit" size="lg">
              Start the session
            </Button>
          </form>
        </Surface>
      </AppShell>
    );
  }

  const ctx = await createCommandContext();
  if (session.session.status === "REVIEW" && session.versions.length > 0) {
    await ctx.analytics.track({
      name: "track_version_reviewed",
      userId: user.id,
      careerId: view.career.id,
      properties: { versions: session.versions.length },
    });
  }

  const versions: WorkspaceVersion[] = session.versions.map((version) => ({
    id: version.id,
    versionNumber: version.versionNumber,
    workingTitle: version.workingTitle,
    isMaster: version.isMaster,
    content: version.content,
    qualityMetrics: version.qualityMetrics,
  }));

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow={`Studio · ${session.session.status.replace(/_/g, " ").toLowerCase()}`}
      title={session.track?.title ?? `Session with ${producerName}`}
      wide
    >
      <StudioWorkspace
        sessionId={session.session.id}
        status={session.session.status}
        producerName={producerName}
        producerQuote={session.producer?.quote ?? null}
        producerLine={session.producerLine}
        direction={session.direction}
        proposals={session.proposals}
        proposalRound={session.session.proposalRound}
        versions={versions}
        trackTitle={session.track?.title ?? null}
        masterVersionId={session.track?.currentMasterVersionId ?? null}
        pendingJob={
          session.pendingJob
            ? {
                id: session.pendingJob.id,
                status: session.pendingJob.status,
                jobType: session.pendingJob.jobType,
              }
            : null
        }
        decisions={session.decisions.map((decision) => ({
          id: decision.id,
          decisionType: decision.decisionType,
          createdAt: decision.createdAt.toISOString(),
        }))}
        error={searchParams.error}
      />
    </AppShell>
  );
}
