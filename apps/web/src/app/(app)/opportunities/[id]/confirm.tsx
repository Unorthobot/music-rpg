"use client";

import { useState } from "react";
import { Button, Surface } from "@music-rpg/ui";

/**
 * The one confirmation in this flow.
 *
 * Shown only when accepting will end another offer, because that is the only
 * case where the consequence reaches past the thing being accepted. Accepting a
 * night with nothing against it needs no confirmation, and declining never does:
 * turning something down is recorded rather than destructive, and a promoter may
 * come back with a different night.
 *
 * The language is a person's. What is being decided is an availability — you
 * cannot be in two rooms on a Friday — not a "conflict" being "resolved", and the
 * primary action names the thing being taken rather than the operation being
 * performed. A button that says "Confirm" describes the machinery; a button that
 * says "Take Naledi's slot" describes the choice.
 *
 * On a phone this is a sheet over the page rather than a side-by-side, so the
 * comparison stays legible at one column.
 */
export function AcceptWithConflict({
  takeLabel,
  title,
  explanation,
  children,
}: {
  /** "Take Naledi's slot". Never "Confirm". */
  takeLabel: string;
  /** "This means turning down Dineo's offer." */
  title: string;
  explanation: string;
  /** The real submit button, supplied by the server component. */
  children: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button type="button" size="lg" onClick={() => setAsking(true)}>
        {takeLabel}
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
    >
      <Surface
        level={2}
        padded="lg"
        className="w-full sm:max-w-[520px] flex flex-col gap-4 rounded-b-none sm:rounded-lg"
      >
        <p className="text-xl font-semibold tracking-display text-balance">{title}</p>
        <p className="text-sm text-ink-muted">{explanation}</p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
            Not yet
          </Button>
          {children}
        </div>
      </Surface>
    </div>
  );
}
