import type { ReactNode } from "react";
import { EmptyState } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { ACT_LABELS, requireCareer } from "@/lib/career";

/**
 * Shared frame for the infrastructure destinations.
 *
 * These are real routes with real empty states — reachable, navigable and
 * honest about what does not exist yet — rather than links that go nowhere.
 */
export async function UtilityPage({
  title,
  eyebrow,
  emptyTitle,
  description,
  children,
}: {
  title: string;
  eyebrow: string;
  emptyTitle: string;
  description: string;
  children?: ReactNode;
}) {
  const { view } = await requireCareer();

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow={eyebrow}
      title={title}
    >
      <EmptyState eyebrow={eyebrow} title={emptyTitle} description={description} comingNext />
      {children}
    </AppShell>
  );
}
