"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, ChoiceCard, Field, Label, Surface, TextArea } from "@music-rpg/ui";
import type { DiscoveryQuestion, DiscoveryResponses } from "@music-rpg/shared";
import { answerDiscoveryAction, completeDiscoveryAction } from "../actions";

/**
 * Sound Discovery.
 *
 * One question at a time, rendered from seeded configuration — this component
 * knows nothing about what any answer means. Each answer is written to the
 * server as it is given, so the flow is resumable to the exact question.
 */
export function DiscoveryFlow({
  careerId,
  questions,
  initialResponses,
}: {
  careerId: string;
  questions: DiscoveryQuestion[];
  initialResponses: DiscoveryResponses;
}) {
  const [responses, setResponses] = useState<DiscoveryResponses>(initialResponses);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Resume at the first unanswered question rather than the beginning.
  const firstUnanswered = useMemo(() => {
    const index = questions.findIndex((question) => !initialResponses[question.id]);
    return index === -1 ? Math.max(0, questions.length - 1) : index;
  }, [questions, initialResponses]);

  const [index, setIndex] = useState(firstUnanswered);
  const [freeText, setFreeText] = useState(
    () => initialResponses[questions[firstUnanswered]?.id ?? ""] ?? "",
  );

  const question = questions[index];
  if (!question) return null;

  const total = questions.length;
  const isLast = index === total - 1;
  const answeredChoices = questions
    .filter((candidate) => candidate.kind === "CHOICE")
    .every((candidate) => responses[candidate.id]);

  const persist = (value: string, then?: () => void) => {
    const formData = new FormData();
    formData.set("careerId", careerId);
    formData.set("questionId", question.id);
    formData.set("value", value);

    startTransition(async () => {
      try {
        await answerDiscoveryAction(formData);
        setError(null);
        then?.();
      } catch (caught) {
        // A redirect from the action is not an error.
        if (caught && typeof caught === "object" && "digest" in caught) throw caught;
        setError("That answer didn't save. Nothing else is lost — try again.");
      }
    });
  };

  const choose = (optionId: string) => {
    setResponses((current) => ({ ...current, [question.id]: optionId }));
    persist(optionId, () => {
      if (!isLast) {
        const next = index + 1;
        setIndex(next);
        setFreeText(responses[questions[next]?.id ?? ""] ?? "");
      }
    });
  };

  const finish = () => {
    const formData = new FormData();
    formData.set("careerId", careerId);
    startTransition(() => {
      void completeDiscoveryAction(formData);
    });
  };

  const goBack = () => {
    const previous = Math.max(0, index - 1);
    setIndex(previous);
    setFreeText(responses[questions[previous]?.id ?? ""] ?? "");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Label>
          {index + 1} / {total}
        </Label>
        <div className="flex-1 h-px bg-line-subtle">
          <div
            className="h-px bg-ember transition-all duration-slow ease-out"
            style={{ width: `${((index + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <div key={question.id} className="flex flex-col gap-4 animate-fade-in">
        <h2 className="text-xl md:text-2xl font-semibold tracking-display text-balance">
          {question.prompt}
        </h2>
        {question.helpText ? <p className="text-sm text-ink-muted">{question.helpText}</p> : null}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        {question.kind === "CHOICE" ? (
          <div className="flex flex-col gap-3">
            {question.options.map((option) => (
              <ChoiceCard
                key={option.id}
                label={option.label}
                detail={option.detail ?? null}
                selected={responses[question.id] === option.id}
                disabled={pending}
                onSelect={() => choose(option.id)}
              />
            ))}
          </div>
        ) : (
          <Surface level={1} padded="lg">
            <Field
              label={question.prompt}
              htmlFor="free-text"
              hint="Up to 180 characters. This becomes your creative philosophy."
            >
              <TextArea
                id="free-text"
                value={freeText}
                maxLength={180}
                onChange={(event) => setFreeText(event.target.value)}
                placeholder="…feel like they've been let in on something."
              />
            </Field>
          </Surface>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {index > 0 ? (
          <Button variant="secondary" onClick={goBack} disabled={pending}>
            Back
          </Button>
        ) : null}

        {question.kind === "FREE_TEXT" ? (
          <Button
            size="lg"
            loading={pending}
            onClick={() => {
              if (freeText.trim()) {
                persist(freeText.trim(), finish);
              } else {
                finish();
              }
            }}
            disabled={!answeredChoices}
          >
            See what that makes
          </Button>
        ) : null}

        {question.kind === "CHOICE" && responses[question.id] && !isLast ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const next = index + 1;
              setIndex(next);
              setFreeText(responses[questions[next]?.id ?? ""] ?? "");
            }}
          >
            Next
          </Button>
        ) : null}
      </div>
    </div>
  );
}
