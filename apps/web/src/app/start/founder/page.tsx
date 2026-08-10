import { memberRoleProfiles } from "@music-rpg/simulation";
import { Button, Field, Label, Surface, TextInput } from "@music-rpg/ui";
import { requireOnboardingStep } from "../guard";
import { StepFrame } from "../step-frame";
import { saveFoundingArtistAction } from "../actions";

export const metadata = { title: "Your founding member" };

/**
 * Step 3, group path — the player, as a musician.
 *
 * A group career controls the Group, but the player is still a person in it.
 * This creates that person: a `PLAYER` artist who is a founding member of the
 * group and stays individually persistent no matter what happens to the band.
 */
export default async function FounderPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { onboarding } = await requireOnboardingStep("FOUNDING_ARTIST");
  const { career, view } = onboarding;

  const groupName = view?.entity?.type === "GROUP" ? view.entity.group.name : "your group";
  const existing = view?.playerArtist?.artist ?? null;

  return (
    <StepFrame
      step={3}
      totalSteps={5}
      eyebrow="Your founding member"
      title="AND WHO ARE YOU IN IT?"
      intro={`${groupName} is the group. You're one of the people in it — this is the musician you'll still be if the group ends, blows up, or somebody walks.`}
      error={searchParams.error}
    >
      <Surface level={1} padded="lg">
        <form action={saveFoundingArtistAction} className="flex flex-col gap-5">
          <input type="hidden" name="careerId" value={career.id} />

          <Field label="Your stage name" htmlFor="stageName" hint="2–32 characters." required>
            <TextInput
              id="stageName"
              name="stageName"
              required
              minLength={2}
              maxLength={32}
              autoComplete="off"
              defaultValue={existing?.stageName ?? ""}
              placeholder="KXMO"
            />
          </Field>

          <Field label="Where are you from?" htmlFor="origin">
            <TextInput
              id="origin"
              name="origin"
              maxLength={60}
              defaultValue={existing?.origin ?? ""}
              placeholder="Braamfontein"
            />
          </Field>

          <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
            <legend className="p-0">
              <Label>What do you do in this group?</Label>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {memberRoleProfiles.map((profile, index) => (
                <label
                  key={profile.role}
                  className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-2 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors duration-fast has-[:checked]:border-ember has-[:checked]:bg-ember-soft min-h-[44px]"
                >
                  <input
                    type="radio"
                    name="role"
                    value={profile.role}
                    defaultChecked={
                      existing?.preferredRole
                        ? existing.preferredRole === profile.role
                        : index === 0
                    }
                    className="mt-1 accent-[color:var(--ember)]"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm text-ink">{profile.label}</span>
                    <span className="text-xs text-ink-subtle">{profile.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" size="lg">
            Continue
          </Button>
        </form>
      </Surface>
    </StepFrame>
  );
}
