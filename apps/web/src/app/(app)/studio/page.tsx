import { Button, EmptyState, Label, TrackCard } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Studio" };

/**
 * Studio.
 *
 * Creative sessions, tracks and releases are out of scope for M0/M1. The
 * surface exists with its real empty state and a visibly disabled entry point —
 * a fake session button would be worse than an honest locked one.
 */
export default async function StudioPage() {
  const { view } = await requireCareer();

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Studio"
      title="Studio"
    >
      <EmptyState
        eyebrow="Sessions"
        title="Your first session starts here."
        description="Writing, production, features and releases open in the Studio milestone. When they do, everything you decided in Sound Discovery is what the room will sound like."
        comingNext
        action={
          <Button disabled title="Opens in the Studio milestone">
            Start a session
          </Button>
        }
      />

      <section className="flex flex-col gap-3">
        <Label>Catalogue</Label>
        <TrackCard title="No tracks yet" artistName={view.displayName} state="LOCKED" />
      </section>
    </AppShell>
  );
}
