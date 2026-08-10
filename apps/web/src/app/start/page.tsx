import { StepFrame } from "./step-frame";
import { CareerTypeForm } from "./career-type-form";
import { loadOnboardingEntry } from "./guard";

export const metadata = { title: "Start your career" };

/**
 * Step 1 — WHO ARE YOU BECOMING?
 *
 * The career record itself is created by the action on continue, which is
 * idempotent, so double-taps and refreshes cannot produce two careers.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { onboarding } = await loadOnboardingEntry();

  return (
    <StepFrame
      step={1}
      totalSteps={4}
      eyebrow="Career creation"
      title="WHO ARE YOU BECOMING?"
      intro="This decides how the next three acts feel. You can't change it once your identity exists, so take a second."
      error={searchParams.error}
    >
      <CareerTypeForm initial={onboarding?.career.careerType ?? null} />
    </StepFrame>
  );
}
