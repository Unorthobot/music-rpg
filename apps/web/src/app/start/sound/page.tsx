import { requireOnboardingStep } from "../guard";
import { StepFrame } from "../step-frame";
import { DiscoveryFlow } from "./discovery-flow";

export const metadata = { title: "Sound discovery" };

/**
 * Step 3 — Sound Discovery.
 *
 * Questions come from the database, not from this file. The inference that
 * turns answers into Sound DNA is deterministic and runs on the server when the
 * player finishes.
 */
export default async function SoundPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { onboarding } = await requireOnboardingStep("SOUND_DISCOVERY");

  return (
    <StepFrame
      step={3}
      totalSteps={4}
      eyebrow="Sound discovery"
      title="FIND THE SOUND"
      intro="Five questions. Answer them the way you'd actually answer them — the system is listening for what you mean, not what sounds impressive."
      error={searchParams.error}
    >
      <DiscoveryFlow
        careerId={onboarding.career.id}
        questions={onboarding.questions}
        initialResponses={onboarding.responses}
      />
    </StepFrame>
  );
}
