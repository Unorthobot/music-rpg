import { formatCount, formatMoney } from "@music-rpg/shared";
import { describeStat, soundAxisWords, topSkills } from "@music-rpg/simulation";
import { SOUND_DIMENSIONS } from "@music-rpg/shared";
import { getCareerPulse } from "@music-rpg/domain";
import { CareerMetric, Label, PulseMetric, StatDescriptor, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, ACT_LINES, requireCareer } from "@/lib/career";

export const metadata = { title: "Career" };

/**
 * Career.
 *
 * Identity, act and Sound DNA, read from persisted state. Sound axes are shown
 * as language plus a position, never as editable numbers — tuning lives in the
 * reveal flow, and the hidden simulation values stay hidden.
 */
export default async function CareerPage() {
  const { view } = await requireCareer();
  const act = view.career.careerAct;
  const entity = view.entity;
  const sound = entity?.sound ?? null;

  const db = await getAppDb();
  const pulse = await getCareerPulse(db, view.career);

  const levelOf = (key: "FAME" | "RESPECT" | "HEAT" | "LEGACY"): string =>
    pulse.metrics.find((metric) => metric.key === key)?.level ?? "";

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[act]}
      eyebrow="Career"
      title={view.displayName}
      context={
        <Surface level={1} padded="lg" className="flex flex-col gap-2">
          <Label>Act</Label>
          <p className="text-lg font-semibold tracking-display">{ACT_LABELS[act]}</p>
          <p className="text-sm text-ink-muted">{ACT_LINES[act]}</p>
          <p className="text-xs text-ink-subtle mt-2">
            Started {new Date(view.career.startedAt).toLocaleDateString("en-ZA")} in {view.world.name}.
          </p>
        </Surface>
      }
      contextLabel="Act"
    >
      <section className="flex flex-col gap-3">
        <Label>Identity</Label>
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-semibold tracking-display">{view.displayName}</span>
            {view.archetype ? (
              <span className="text-sm text-ember uppercase tracking-label">
                {view.archetype.name}
              </span>
            ) : null}
          </div>
          {entity?.soundSummary ? (
            <p className="text-base text-ink-muted">{entity.soundSummary}</p>
          ) : null}
          {entity?.type === "ARTIST" && entity.artist.creativePhilosophy ? (
            <p className="text-sm text-ink border-l-2 border-ember-line pl-4">
              When people hear me, I want them to {entity.artist.creativePhilosophy}
            </p>
          ) : null}
          {entity?.type === "GROUP" && entity.group.creativePhilosophy ? (
            <p className="text-sm text-ink border-l-2 border-ember-line pl-4">
              When people hear us, I want them to {entity.group.creativePhilosophy}
            </p>
          ) : null}
        </Surface>
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <CareerMetric
          label="Fame"
          value={String(view.career.fame)}
          descriptor={levelOf("FAME")}
          tone="fame"
        />
        <CareerMetric
          label="Respect"
          value={String(view.career.respect)}
          descriptor={levelOf("RESPECT")}
          tone="respect"
        />
        <CareerMetric
          label="Heat"
          value={String(view.career.heat)}
          descriptor={levelOf("HEAT")}
          tone="heat"
        />
        <CareerMetric
          label="Legacy"
          value={String(view.career.legacy)}
          descriptor={levelOf("LEGACY")}
          tone="legacy"
        />
      </section>

      {/*
        What the last week did. Four currencies that move for four different
        reasons, each reported as a direction — and Legacy reported as unchanged
        rather than omitted, because the restraint is the statement.
      */}
      <section className="flex flex-col gap-3">
        <Label>This week</Label>
        <Surface level={1} padded="lg" className="flex flex-col gap-3">
          {pulse.quiet ? (
            <p className="text-sm text-ink-muted">
              Nothing has reached anybody this week. Put something out, or let a day pass.
            </p>
          ) : (
            <p className="text-base text-ink">
              +{pulse.fansGained} {pulse.fansGained === 1 ? "fan" : "fans"} ·{" "}
              {formatCount(pulse.newListeners)}{" "}
              {pulse.newListeners === 1 ? "listener" : "listeners"}
            </p>
          )}
          <div className="border-t border-line-subtle pt-1">
            {pulse.metrics.map((metric) => (
              <PulseMetric
                key={metric.key}
                label={metric.label}
                level={metric.level}
                movementLabel={metric.movementLabel}
                moved={metric.movement !== "UNCHANGED"}
                tone={
                  metric.key === "FAME"
                    ? "fame"
                    : metric.key === "RESPECT"
                      ? "respect"
                      : metric.key === "HEAT"
                        ? "heat"
                        : "legacy"
                }
              />
            ))}
          </div>
        </Surface>
      </section>

      <section className="flex flex-col gap-3">
        <Label>Balance</Label>
        <Surface level={1} padded="lg">
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(view.career.moneyBalance)}
          </p>
          <p className="text-sm text-ink-muted mt-1">
            Starting capital. Nothing has spent it and nothing has grown it.
          </p>
        </Surface>
      </section>

      {sound ? (
        <section className="flex flex-col gap-3">
          <Label>Sound DNA</Label>
          <Surface level={1} padded="lg" className="flex flex-col gap-4">
            {SOUND_DIMENSIONS.map((axis) => {
              const words = soundAxisWords[axis];
              const value = sound[axis];
              // -1..1 mapped onto a 0..100 position.
              const position = ((value + 1) / 2) * 100;

              return (
                <div key={axis} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={value <= -0.22 ? "text-ink" : "text-ink-subtle"}>
                      {words.lowLabel}
                    </span>
                    <span className={value >= 0.22 ? "text-ink" : "text-ink-subtle"}>
                      {words.highLabel}
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-pill bg-surface-3">
                    <span
                      aria-hidden
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-ember"
                      style={{ left: `${position}%` }}
                    />
                  </div>
                  <span className="sr-only">
                    {words.lowLabel} to {words.highLabel}:{" "}
                    {value <= -0.22 ? words.low : value >= 0.22 ? words.high : "balanced"}
                  </span>
                </div>
              );
            })}
          </Surface>
        </section>
      ) : null}

      {entity?.type === "ARTIST" ? (
        <>
          <section className="flex flex-col gap-3">
            <Label>Craft</Label>
            <Surface level={1} padded="lg" className="py-2">
              {topSkills(entity.skills, 5).map((skill) => (
                <StatDescriptor key={skill.key} name={skill.label} descriptor={skill.descriptor} />
              ))}
            </Surface>
          </section>

          {entity.traits.length > 0 ? (
            <section className="flex flex-col gap-3">
              <Label>Traits</Label>
              <div className="flex flex-wrap gap-2">
                {entity.traits.map((trait) => (
                  <Tag key={trait.key} tone="ember" title={trait.description}>
                    {trait.name} · {describeStat(trait.strength)}
                  </Tag>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
