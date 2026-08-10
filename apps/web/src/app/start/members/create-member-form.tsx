"use client";

import { useState, useTransition } from "react";
import { Button, Field, Label, Surface, TextInput } from "@music-rpg/ui";
import {
  memberPersonalities,
  memberRoleProfiles,
  memberTendencies,
  visualIdentities,
} from "@music-rpg/simulation";
import { createMemberAction } from "../actions";

/**
 * Writing a bandmate.
 *
 * Four choices, not a second onboarding: a role, how they make music, what
 * they're like, and what they look like. Everything measurable is derived from
 * those answers on the server — the player never sees a stat, they see a person.
 */
export function CreateMemberForm({ careerId, disabled }: { careerId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
        Create a member
      </Button>
    );
  }

  return (
    <Surface level={2} padded="lg" className="flex flex-col gap-6">
      <form
        action={(formData) => {
          formData.set("careerId", careerId);
          startTransition(async () => {
            await createMemberAction(formData);
            setOpen(false);
          });
        }}
        className="flex flex-col gap-6"
      >
        <Field label="Their name" htmlFor="member-name" hint="2–32 characters." required>
          <TextInput
            id="member-name"
            name="stageName"
            required
            minLength={2}
            maxLength={32}
            autoComplete="off"
            placeholder="VELA"
          />
        </Field>

        <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
          <legend className="p-0">
            <Label>What do they do?</Label>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {memberRoleProfiles.map((profile, index) => (
              <label
                key={profile.role}
                className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-1 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors duration-fast has-[:checked]:border-ember has-[:checked]:bg-ember-soft min-h-[44px]"
              >
                <input
                  type="radio"
                  name="role"
                  value={profile.role}
                  defaultChecked={index === 0}
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

        <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
          <legend className="p-0">
            <Label>How do they make music?</Label>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {memberTendencies.map((tendency, index) => (
              <label
                key={tendency.id}
                className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-1 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors duration-fast has-[:checked]:border-ember has-[:checked]:bg-ember-soft min-h-[44px]"
              >
                <input
                  type="radio"
                  name="tendencyId"
                  value={tendency.id}
                  defaultChecked={index === 0}
                  className="mt-1 accent-[color:var(--ember)]"
                />
                <span className="flex flex-col">
                  <span className="text-sm text-ink">{tendency.label}</span>
                  <span className="text-xs text-ink-subtle">{tendency.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
          <legend className="p-0">
            <Label>What are they like?</Label>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {memberPersonalities.map((personality, index) => (
              <label
                key={personality.id}
                className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-1 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors duration-fast has-[:checked]:border-ember has-[:checked]:bg-ember-soft min-h-[44px]"
              >
                <input
                  type="radio"
                  name="personalityId"
                  value={personality.id}
                  defaultChecked={index === 0}
                  className="mt-1 accent-[color:var(--ember)]"
                />
                <span className="flex flex-col">
                  <span className="text-sm text-ink">{personality.label}</span>
                  <span className="text-xs text-ink-subtle">{personality.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
          <legend className="p-0">
            <Label>How do they look?</Label>
          </legend>
          <div className="flex flex-wrap gap-2">
            {visualIdentities.map((visual, index) => (
              <label
                key={visual.id}
                className="flex items-center gap-2 rounded-pill border border-line-subtle bg-surface-1 px-3 py-2 cursor-pointer hover:bg-surface-3 transition-colors duration-fast has-[:checked]:border-ember has-[:checked]:bg-ember-soft min-h-[44px]"
              >
                <input
                  type="radio"
                  name="visualId"
                  value={visual.id}
                  defaultChecked={index === 0}
                  className="accent-[color:var(--ember)]"
                />
                <span
                  aria-hidden
                  className="h-3 w-3 rounded-pill border border-line"
                  style={{ background: visual.palette[1] ?? visual.palette[0] }}
                />
                <span className="text-sm text-ink">{visual.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="submit" loading={pending}>
            Add them to the group
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </Surface>
  );
}
