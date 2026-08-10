import { Button, Field, Surface, TextArea, TextInput } from "@music-rpg/ui";
import { requireOnboardingStep } from "../guard";
import { StepFrame } from "../step-frame";
import { saveIdentityAction } from "../actions";

export const metadata = { title: "Identity" };

/**
 * Step 2 — the name.
 *
 * The artist or group row is written here, before Sound Discovery, so leaving
 * mid-flow returns to something that exists rather than an empty form.
 */
export default async function IdentityPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { onboarding } = await requireOnboardingStep("IDENTITY");
  const { career, view } = onboarding;
  const isSolo = career.careerType === "SOLO";

  const existingName =
    view?.entity?.type === "ARTIST"
      ? view.entity.artist.stageName
      : view?.entity?.type === "GROUP"
        ? view.entity.group.name
        : "";

  const existingOrigin = view?.entity?.type === "ARTIST" ? (view.entity.artist.origin ?? "") : "";
  const existingDirection =
    view?.entity?.type === "GROUP" ? (view.entity.group.creativeDirection ?? "") : "";

  return (
    <StepFrame
      step={2}
      totalSteps={4}
      eyebrow={isSolo ? "Solo artist" : "Group"}
      title={isSolo ? "WHAT DO THEY CALL YOU?" : "WHAT ARE YOU CALLED?"}
      intro={
        isSolo
          ? "The name people will use in rooms you're not in. It can be one word, it can be three."
          : "The name on the flyer. Everything else about the group can shift; this is what sticks."
      }
      error={searchParams.error}
    >
      <Surface level={1} padded="lg">
        <form action={saveIdentityAction} className="flex flex-col gap-5">
          <input type="hidden" name="careerId" value={career.id} />
          <input type="hidden" name="careerType" value={career.careerType ?? "SOLO"} />

          <Field
            label={isSolo ? "Stage name" : "Group name"}
            htmlFor="stageName"
            hint="2–32 characters."
            required
          >
            <TextInput
              id="stageName"
              name="stageName"
              required
              minLength={2}
              maxLength={32}
              autoComplete="off"
              defaultValue={existingName}
              placeholder={isSolo ? "KXMO" : "THE LONG WAY"}
            />
          </Field>

          {isSolo ? (
            <Field
              label="Where are you from?"
              htmlFor="origin"
              hint="A suburb, a township, a city. It shapes which scene notices you first."
            >
              <TextInput
                id="origin"
                name="origin"
                maxLength={60}
                defaultValue={existingOrigin}
                placeholder="Braamfontein"
              />
            </Field>
          ) : (
            <Field
              label="Initial creative direction"
              htmlFor="creativeDirection"
              hint="One line. What is this group trying to do?"
            >
              <TextArea
                id="creativeDirection"
                name="creativeDirection"
                maxLength={180}
                defaultValue={existingDirection}
                placeholder="Live instrumentation, hard drums, nothing quantised."
              />
            </Field>
          )}

          <Button type="submit" size="lg">
            Continue
          </Button>
        </form>
      </Surface>
    </StepFrame>
  );
}
