"use client";

import { useState, useTransition } from "react";
import { Button, Field, Label, Surface, TextArea, TextInput } from "@music-rpg/ui";
import { soundAxisWords, TUNABLE_SOUND_AXES, type TunableSoundAxis } from "@music-rpg/simulation";
import { tuneIdentityAction } from "../actions";

/**
 * TUNE IT.
 *
 * Four audible characteristics, the name, the origin and the player's own
 * words. Skills, psychology and the four derived axes are not here — the point
 * is to adjust an identity, not to edit a character sheet.
 */
export function TuneIt({
  careerId,
  name,
  origin,
  philosophy,
  sound,
  isGroup,
}: {
  careerId: string;
  name: string;
  origin: string | null;
  philosophy: string | null;
  sound: Record<TunableSoundAxis, number>;
  isGroup: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(sound);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" size="lg" onClick={() => setOpen(true)}>
        Tune it
      </Button>
    );
  }

  return (
    <Surface level={2} padded="lg" className="w-full flex flex-col gap-6">
      <form
        action={(formData) => {
          formData.set("careerId", careerId);
          for (const axis of TUNABLE_SOUND_AXES) {
            formData.set(`sound.${axis}`, String(values[axis]));
          }
          startTransition(() => {
            void tuneIdentityAction(formData);
          });
        }}
        className="flex flex-col gap-6"
      >
        <Field label={isGroup ? "Group name" : "Stage name"} htmlFor="tune-name">
          <TextInput id="tune-name" name="stageName" defaultValue={name} maxLength={32} />
        </Field>

        {!isGroup ? (
          <Field label="Where you're from" htmlFor="tune-origin">
            <TextInput id="tune-origin" name="origin" defaultValue={origin ?? ""} maxLength={60} />
          </Field>
        ) : null}

        <Field
          label={isGroup ? "When people hear us…" : "When people hear me…"}
          htmlFor="tune-philosophy"
          hint="Your own words. Leave it as it is if it's already right."
        >
          <TextArea
            id="tune-philosophy"
            name="creativePhilosophy"
            defaultValue={philosophy ?? ""}
            maxLength={180}
          />
        </Field>

        <div className="flex flex-col gap-5">
          <Label>Sound characteristics</Label>
          {TUNABLE_SOUND_AXES.map((axis) => {
            const words = soundAxisWords[axis];
            const value = values[axis];
            return (
              <div key={axis} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>{words.lowLabel}</span>
                  <span>{words.highLabel}</span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={value}
                  aria-label={`${words.lowLabel} to ${words.highLabel}`}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [axis]: Number(event.target.value) }))
                  }
                  className="w-full accent-[color:var(--ember)] h-11"
                />
                <span className="text-xs text-ink-subtle">
                  {value <= -0.22
                    ? words.low
                    : value >= 0.22
                      ? words.high
                      : `balanced between ${words.low} and ${words.high}`}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="submit" loading={pending}>
            Save changes
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Surface>
  );
}
