"use client";

import { useState, useTransition } from "react";
import { Button, ChoiceCard } from "@music-rpg/ui";
import type { CareerType } from "@music-rpg/shared";
import { selectCareerTypeAction } from "./actions";

/**
 * The fork.
 *
 * The choice is persisted the moment the player continues, so leaving here and
 * coming back lands on the identity step rather than asking again.
 */
export function CareerTypeForm({ initial }: { initial: CareerType | null }) {
  const [selected, setSelected] = useState<CareerType | null>(initial);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!selected) return;
    const formData = new FormData();
    formData.set("careerType", selected);
    startTransition(() => {
      void selectCareerTypeAction(formData);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <ChoiceCard
          size="lg"
          label="SOLO"
          detail="Build an individual artist."
          selected={selected === "SOLO"}
          onSelect={() => setSelected("SOLO")}
        >
          <span className="text-sm text-ink-subtle mt-2">
            One name, one direction, nobody to blame.
          </span>
        </ChoiceCard>

        <ChoiceCard
          size="lg"
          label="GROUP"
          detail="Build something together."
          selected={selected === "GROUP"}
          onSelect={() => setSelected("GROUP")}
        >
          <span className="text-sm text-ink-subtle mt-2">
            More range, more reach, more people who can leave.
          </span>
        </ChoiceCard>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button size="lg" onClick={submit} disabled={!selected} loading={pending}>
          Continue
        </Button>
      </div>
    </div>
  );
}
