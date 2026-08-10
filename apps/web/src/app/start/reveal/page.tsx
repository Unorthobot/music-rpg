import { computeChemistry, describeStat, soundAdjectives, topSkills } from "@music-rpg/simulation";
import { Button, Label, StatDescriptor, Surface, Tag } from "@music-rpg/ui";
import type { TunableSoundAxis } from "@music-rpg/simulation";
import { createCommandContext } from "@/lib/command-context";
import { requireOnboardingStep } from "../guard";
import { enterUndergroundAction } from "../actions";
import { TuneIt } from "./tune-it";

export const metadata = { title: "Reveal" };

/**
 * The reveal.
 *
 * Everything on this screen is real persisted state derived from the player's
 * own answers: the archetype, the sound sentence, the strengths, the traits.
 * Nothing is decorative copy standing in for data.
 */
export default async function RevealPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const { user, onboarding } = await requireOnboardingStep("REVEAL");
  const { career, view } = onboarding;

  if (!view?.entity) {
    // The guard guarantees a controlled entity by this step; this is defensive.
    return (
      <div className="mx-auto max-w-[720px] py-10">
        <p className="text-base text-ink-muted">
          This career doesn&apos;t have an identity yet. Go back a step to build one.
        </p>
      </div>
    );
  }

  const entity = view.entity;
  const isGroup = entity.type === "GROUP";
  const name = entity.type === "GROUP" ? entity.group.name : entity.artist.stageName;
  const origin =
    entity.type === "GROUP" ? view.world.name : (entity.artist.origin ?? view.world.name);
  const philosophy =
    entity.type === "GROUP" ? entity.group.creativePhilosophy : entity.artist.creativePhilosophy;

  const sound = entity.sound;
  const adjectives = sound ? soundAdjectives(sound) : [];

  const ctx = await createCommandContext();
  await ctx.analytics.track({
    name: isGroup ? "group_reveal_viewed" : "artist_reveal_viewed",
    userId: user.id,
    careerId: career.id,
    properties: { archetype: view.archetype?.key ?? null },
  });

  const strengths =
    view.entity.type === "ARTIST" ? topSkills(view.entity.skills, 3) : [];

  const chemistry =
    view.entity.type === "GROUP"
      ? computeChemistry(
          view.entity.members
            .filter((member) => member.sound && member.psychology)
            .map((member) => ({ sound: member.sound!, psychology: member.psychology! })),
        )
      : null;

  const tunableSound = {
    darkBright: sound?.darkBright ?? 0,
    rawPolished: sound?.rawPolished ?? 0,
    minimalDense: sound?.minimalDense ?? 0,
    intimateAnthemic: sound?.intimateAnthemic ?? 0,
  } satisfies Record<TunableSoundAxis, number>;

  return (
    <div className="mx-auto w-full max-w-[720px] py-8 md:py-14 flex flex-col gap-10">
      <header className="flex flex-col gap-4 animate-rise-in">
        <Label>{isGroup ? "Your group" : "Your artist"}</Label>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-display break-words">{name}</h1>
        {view.archetype ? (
          <p className="text-lg md:text-xl text-ember uppercase tracking-label">
            {view.archetype.name}
          </p>
        ) : null}
        <p className="text-sm text-ink-subtle">{origin}</p>
        {view.entity.soundSummary ? (
          <p className="text-lg md:text-xl text-ink-muted max-w-[46ch] text-balance">
            {view.entity.soundSummary}
          </p>
        ) : null}
      </header>

      {searchParams.error ? (
        <p role="alert" className="text-sm text-danger">
          {searchParams.error}
        </p>
      ) : null}

      {view.archetype ? (
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          <Label>Creative identity</Label>
          <p className="text-base text-ink">{view.archetype.tagline}</p>
          <p className="text-sm text-ink-muted">{view.archetype.description}</p>
          {philosophy ? (
            <p className="text-sm text-ink border-l-2 border-ember-line pl-4 mt-2">
              {isGroup ? "When people hear us" : "When people hear me"}, I want them to {philosophy}
            </p>
          ) : null}
        </Surface>
      ) : null}

      {adjectives.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>Sound characteristics</Label>
          <div className="flex flex-wrap gap-2">
            {adjectives.map((adjective) => (
              <Tag key={adjective} tone="ember">
                {adjective}
              </Tag>
            ))}
          </div>
        </section>
      ) : null}

      {strengths.length > 0 ? (
        <section className="flex flex-col gap-2">
          <Label>Where you&apos;re strong</Label>
          <Surface level={1} padded="lg" className="py-2">
            {strengths.map((skill) => (
              <StatDescriptor key={skill.key} name={skill.label} descriptor={skill.descriptor} />
            ))}
          </Surface>
        </section>
      ) : null}

      {view.entity.type === "ARTIST" && view.entity.traits.length > 0 ? (
        <section className="flex flex-col gap-3">
          <Label>Starting traits</Label>
          <ul className="flex flex-col gap-2">
            {view.entity.traits.map((trait) => (
              <li
                key={trait.key}
                className="rounded-md border border-line-subtle bg-surface-2 px-4 py-3"
              >
                <span className="text-sm font-medium text-ink">{trait.name}</span>
                <p className="text-xs text-ink-muted mt-1">{trait.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.entity.type === "GROUP" ? (
        <section className="flex flex-col gap-3">
          <Label>The line-up{chemistry ? ` — chemistry ${describeStat(chemistry.score)}` : ""}</Label>
          {chemistry ? <p className="text-sm text-ink-muted">{chemistry.summary}</p> : null}
          <ul className="flex flex-col gap-2">
            {view.entity.members.map((member) => {
              const isYou = member.artist.id === career.playerArtistId;
              return (
                <li
                  key={member.artist.id}
                  className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 ${
                    isYou ? "border-ember-line bg-ember-soft" : "border-line-subtle bg-surface-2"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-base text-ink truncate">{member.artist.stageName}</span>
                    {isYou ? <Tag tone="ember">You</Tag> : null}
                    {member.artist.authoredByCareerId && !isYou ? <Tag>Written by you</Tag> : null}
                  </span>
                  <span className="text-xs text-ink-subtle uppercase tracking-label">
                    {member.membership.role.replace("_", " ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <form action={enterUndergroundAction}>
          <input type="hidden" name="careerId" value={career.id} />
          <Button type="submit" size="lg">
            ENTER THE UNDERGROUND
          </Button>
        </form>

        <TuneIt
          careerId={career.id}
          name={name}
          origin={view.entity.type === "ARTIST" ? view.entity.artist.origin : null}
          philosophy={philosophy}
          sound={tunableSound}
          isGroup={isGroup}
        />
      </div>
    </div>
  );
}
