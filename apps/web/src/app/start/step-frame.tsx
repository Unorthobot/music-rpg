import type { ReactNode } from "react";
import { Label } from "@music-rpg/ui";

/**
 * Shared frame for every onboarding step: eyebrow, question, supporting line,
 * content, then actions. One column at every width — no side-by-side
 * comparisons that would need horizontal compression on a phone.
 */
export function StepFrame({
  step,
  totalSteps,
  eyebrow,
  title,
  intro,
  error,
  children,
  actions,
}: {
  step: number;
  /**
   * Omitted on the first screen, where the path — and therefore how many steps
   * remain — has not been chosen yet. Solo runs three steps, group runs five.
   */
  totalSteps?: number;
  eyebrow?: string;
  title: string;
  intro?: string;
  error?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[720px] flex flex-col gap-8 py-6 md:py-10 animate-rise-in">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Label>{totalSteps ? `Step ${step} of ${totalSteps}` : `Step ${step}`}</Label>
          <div
            className="flex-1 h-px bg-line-subtle"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={totalSteps ?? step + 1}
            aria-label="Onboarding progress"
          >
            <div
              className="h-px bg-ember transition-all duration-slow ease-out"
              style={{ width: `${(step / (totalSteps ?? step + 2)) * 100}%` }}
            />
          </div>
        </div>

        {eyebrow ? <Label>{eyebrow}</Label> : null}
        <h1 className="text-2xl md:text-4xl font-semibold tracking-display text-balance">{title}</h1>
        {intro ? <p className="text-base text-ink-muted max-w-[60ch]">{intro}</p> : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">{children}</div>

      {actions ? <div className="flex flex-col sm:flex-row gap-3">{actions}</div> : null}
    </div>
  );
}
