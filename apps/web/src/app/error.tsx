"use client";

import { ErrorState } from "@music-rpg/ui";

/**
 * Route-level failure.
 *
 * A failed screen never implies lost progress: career state lives on the
 * server, and the copy says so.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-gutter py-16">
      <ErrorState
        title="This screen didn't load"
        description="Your career is safe on the server — nothing was lost. Try again, and if it keeps happening, it's ours to fix."
        onRetry={reset}
      />
    </div>
  );
}
