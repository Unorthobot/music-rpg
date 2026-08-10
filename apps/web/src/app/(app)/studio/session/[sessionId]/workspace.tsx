"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AUDIENCES,
  INTENTIONS,
  MOODS,
  REVISION_KINDS,
  type CreativeDirection,
  type ProducerProposal,
} from "@music-rpg/shared";
import { Button, ChoiceCard, Field, Label, Surface, Tag, TextArea, TextInput, cn } from "@music-rpg/ui";
import {
  advanceRenderAction,
  combineProposalsAction,
  rejectProposalsAction,
  requestMasterAction,
  requestRevisionAction,
  saveTrackAction,
  selectProposalAction,
  submitDirectionAction,
} from "../../actions";

/**
 * The room.
 *
 * Composition differs by viewport rather than compressing: three zones on
 * desktop (what we're making / the work / who's in the room), four steps on a
 * phone. The producer is present in both — their line, their stance, their last
 * response — because the point of this screen is that you are working with
 * somebody, not filling in a generation form.
 */
export type WorkspaceVersion = {
  id: string;
  versionNumber: number;
  workingTitle: string | null;
  isMaster: boolean;
  content: {
    description: string;
    structure: string[];
    lyricalTheme: string;
    productionNotes: string;
    performanceDirection: string;
    waveform: number[];
    developmentPreview: boolean;
  };
  qualityMetrics: Record<string, number>;
};

export type WorkspaceProps = {
  sessionId: string;
  status: string;
  producerName: string;
  producerQuote: string | null;
  producerLine: string | null;
  direction: CreativeDirection | null;
  proposals: ProducerProposal[];
  proposalRound: number;
  versions: WorkspaceVersion[];
  trackTitle: string | null;
  masterVersionId: string | null;
  pendingJob: { id: string; status: string; jobType: string } | null;
  decisions: { id: string; decisionType: string; createdAt: string }[];
  error?: string;
};

const TABS = ["DIRECTION", "IDEAS", "TRACK", "REVIEW"] as const;
type Tab = (typeof TABS)[number];

function tabForStatus(status: string): Tab {
  if (status === "AWAITING_DIRECTION" || status === "AWAITING_INTERPRETATION") return "DIRECTION";
  if (status === "AWAITING_DECISION") return "IDEAS";
  if (status === "CREATING_VERSION" || status === "MASTERING") return "TRACK";
  return "REVIEW";
}

export function StudioWorkspace(props: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>(tabForStatus(props.status));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setTab(tabForStatus(props.status));
  }, [props.status]);

  const centre = (
    <>
      {props.error ? (
        <p role="alert" className="text-sm text-danger">
          {props.error}
        </p>
      ) : null}

      {tab === "DIRECTION" ? (
        <DirectionStep
          sessionId={props.sessionId}
          producerName={props.producerName}
          direction={props.direction}
          locked={props.status !== "AWAITING_DIRECTION"}
        />
      ) : null}

      {tab === "IDEAS" ? (
        <IdeasStep
          sessionId={props.sessionId}
          producerName={props.producerName}
          proposals={props.proposals}
          round={props.proposalRound}
          disabled={props.status !== "AWAITING_DECISION" || pending}
        />
      ) : null}

      {tab === "TRACK" ? (
        <RenderStep
          producerName={props.producerName}
          pendingJob={props.pendingJob}
          versions={props.versions}
          onAdvance={(jobId) => startTransition(async () => void (await advanceRenderAction(jobId)))}
        />
      ) : null}

      {tab === "REVIEW" ? (
        <ReviewStep
          sessionId={props.sessionId}
          producerName={props.producerName}
          versions={props.versions}
          status={props.status}
          masterVersionId={props.masterVersionId}
          trackTitle={props.trackTitle}
        />
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Mobile: four steps, one at a time. */}
      <nav aria-label="Session steps" className="xl:hidden">
        <ul className="grid grid-cols-4 gap-1 rounded-md border border-line-subtle bg-surface-2 p-1">
          {TABS.map((entry) => (
            <li key={entry} className="flex">
              <button
                type="button"
                onClick={() => setTab(entry)}
                aria-current={tab === entry ? "step" : undefined}
                className={cn(
                  "flex-1 rounded-sm px-2 py-2 text-2xs uppercase tracking-label min-h-[44px] transition-colors duration-fast",
                  tab === entry ? "bg-surface-raised text-ink" : "text-ink-subtle hover:text-ink",
                )}
              >
                {entry}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        {/* Desktop left: what exists so far. */}
        <aside className="hidden xl:flex flex-col gap-3">
          <Label>This session</Label>
          <ol className="flex flex-col gap-1">
            {TABS.map((entry) => (
              <li key={entry}>
                <button
                  type="button"
                  onClick={() => setTab(entry)}
                  aria-current={tab === entry ? "step" : undefined}
                  className={cn(
                    "w-full text-left rounded-md px-3 py-2 text-sm min-h-[44px] transition-colors duration-fast",
                    tab === entry
                      ? "bg-surface-3 text-ink"
                      : "text-ink-muted hover:text-ink hover:bg-surface-2",
                  )}
                >
                  {entry.charAt(0) + entry.slice(1).toLowerCase()}
                </button>
              </li>
            ))}
          </ol>

          {props.versions.length > 0 ? (
            <>
              <Label>Versions</Label>
              <ul className="flex flex-col gap-1">
                {props.versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-line-subtle bg-surface-2 px-3 py-2"
                  >
                    <span className="text-sm text-ink truncate">v{version.versionNumber}</span>
                    {version.isMaster ? <Tag tone="ember">master</Tag> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>

        <div className="flex flex-col gap-5 min-w-0">{centre}</div>

        {/* Desktop right, mobile sheet: the person you're working with. */}
        <aside className="flex flex-col gap-3">
          <Label>In the room</Label>
          <Surface level={1} padded="lg" className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-10 w-10 shrink-0 rounded-md bg-surface-3 border border-line-subtle flex items-center justify-center text-sm font-semibold"
              >
                {props.producerName.slice(0, 2)}
              </span>
              <span className="flex flex-col">
                <span className="text-base font-medium text-ink">{props.producerName}</span>
                <span className="text-2xs uppercase tracking-label text-ink-subtle">Producer</span>
              </span>
            </div>

            {props.producerLine ? (
              <p className="text-sm text-ink border-l-2 border-ember-line pl-3">
                “{props.producerLine}”
              </p>
            ) : props.producerQuote ? (
              <p className="text-sm text-ink-muted border-l-2 border-line pl-3">
                “{props.producerQuote}”
              </p>
            ) : null}

            <p className="text-xs text-ink-subtle">
              {props.decisions.length} {props.decisions.length === 1 ? "decision" : "decisions"} made
              in this session.
            </p>
          </Surface>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- direction */

function DirectionStep({
  sessionId,
  producerName,
  direction,
  locked,
}: {
  sessionId: string;
  producerName: string;
  direction: CreativeDirection | null;
  locked: boolean;
}) {
  const [intention, setIntention] = useState(direction?.intention ?? "introduce");
  const [moods, setMoods] = useState<string[]>(direction?.moods ?? []);
  const [pending, startTransition] = useTransition();

  if (locked && direction) {
    return (
      <Surface level={1} padded="lg" className="flex flex-col gap-3">
        <Label>What you asked for</Label>
        <p className="text-lg text-ink">
          {INTENTIONS.find((entry) => entry.id === direction.intention)?.label}
        </p>
        <div className="flex flex-wrap gap-2">
          {direction.moods.map((mood) => (
            <Tag key={mood}>{MOODS.find((entry) => entry.id === mood)?.label ?? mood}</Tag>
          ))}
        </div>
        {direction.note ? (
          <p className="text-sm text-ink border-l-2 border-ember-line pl-4">“{direction.note}”</p>
        ) : null}
      </Surface>
    );
  }

  return (
    <form
      action={(formData) => {
        formData.set("sessionId", sessionId);
        formData.set("intention", intention);
        for (const mood of moods) formData.append("moods", mood);
        startTransition(() => void submitDirectionAction(formData));
      }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <p className="text-xl md:text-2xl font-semibold tracking-display text-balance">
          {producerName} is set up. What are we making?
        </p>
        <p className="text-sm text-ink-muted">
          Tell them the idea, not the settings. They&apos;ll come back with three ways to do it.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
        <legend className="p-0">
          <Label>What are you trying to do?</Label>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTENTIONS.map((entry) => (
            <ChoiceCard
              key={entry.id}
              label={entry.label}
              detail={entry.detail}
              selected={intention === entry.id}
              onSelect={() => setIntention(entry.id)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
        <legend className="p-0">
          <Label>How should it feel? (pick any)</Label>
        </legend>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((mood) => {
            const selected = moods.includes(mood.id);
            return (
              <button
                key={mood.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setMoods((current) =>
                    selected ? current.filter((entry) => entry !== mood.id) : [...current, mood.id],
                  )
                }
                className={cn(
                  "rounded-pill border px-4 min-h-[44px] text-sm transition-colors duration-fast",
                  selected
                    ? "border-ember bg-ember-soft text-ink"
                    : "border-line text-ink-muted hover:text-ink",
                )}
              >
                {mood.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Energy" htmlFor="energy" hint="Still ↔ relentless">
          <input
            id="energy"
            name="energy"
            type="range"
            min={0}
            max={100}
            defaultValue={direction?.energy ?? 50}
            className="w-full accent-[color:var(--ember)] h-11"
          />
        </Field>
        <Field label="Risk" htmlFor="risk" hint="Safe ↔ experimental">
          <input
            id="risk"
            name="risk"
            type="range"
            min={0}
            max={100}
            defaultValue={direction?.risk ?? 50}
            className="w-full accent-[color:var(--ember)] h-11"
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
        <legend className="p-0">
          <Label>Who is it for?</Label>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((entry, index) => (
            <label
              key={entry.id}
              className="flex items-start gap-3 rounded-md border border-line-subtle bg-surface-2 px-4 py-3 cursor-pointer hover:bg-surface-3 transition-colors duration-fast has-[:checked]:border-ember has-[:checked]:bg-ember-soft min-h-[44px]"
            >
              <input
                type="radio"
                name="audience"
                value={entry.id}
                defaultChecked={direction ? direction.audience === entry.id : index === 0}
                className="mt-1 accent-[color:var(--ember)]"
              />
              <span className="flex flex-col">
                <span className="text-sm text-ink">{entry.label}</span>
                <span className="text-xs text-ink-subtle">{entry.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        label="Anything else?"
        htmlFor="note"
        hint="Optional. A picture, a place, a feeling — whatever you'd actually say out loud."
      >
        <TextArea
          id="note"
          name="note"
          maxLength={180}
          defaultValue={direction?.note ?? ""}
          placeholder="Driving through Joburg at 2am. Empty city."
        />
      </Field>

      <Button type="submit" size="lg" loading={pending}>
        Tell {producerName}
      </Button>
    </form>
  );
}

/* ----------------------------------------------------------------- ideas */

const STANCE_LABEL: Record<string, string> = {
  ENTHUSIASTIC: "He's into it",
  INTERESTED: "He'll do it",
  CAUTIOUS: "He has doubts",
  PUSHING_BACK: "He disagrees",
  COMPROMISING: "He'd meet you halfway",
};

function IdeasStep({
  sessionId,
  producerName,
  proposals,
  round,
  disabled,
}: {
  sessionId: string;
  producerName: string;
  proposals: ProducerProposal[];
  round: number;
  disabled: boolean;
}) {
  const [combining, setCombining] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  if (proposals.length === 0) {
    return (
      <Surface level={1} padded="lg">
        <p className="text-base text-ink-muted">{producerName} hasn&apos;t responded yet.</p>
      </Surface>
    );
  }

  const toggleCombine = (id: string) =>
    setCombining((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id].slice(-2),
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Label>{round === 0 ? "First pass" : `Pass ${round + 1}`}</Label>
        <p className="text-xl md:text-2xl font-semibold tracking-display">
          {round === 0
            ? `${producerName} came back with three.`
            : `${producerName} went away and came back with three more.`}
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <Surface level={1} padded="lg" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xl font-semibold tracking-display">{proposal.title}</span>
                <Tag tone={proposal.stance === "PUSHING_BACK" ? "heat" : "neutral"}>
                  {STANCE_LABEL[proposal.stance] ?? proposal.stance}
                </Tag>
              </div>

              <p className="text-sm text-ink-muted">{proposal.rationale}</p>
              <p className="text-sm text-ink border-l-2 border-ember-line pl-4">“{proposal.line}”</p>
              <p className="text-xs text-ink-subtle">{proposal.structure}</p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <form action={selectProposalAction}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <Button type="submit" size="sm" disabled={disabled}>
                    Make this one
                  </Button>
                </form>

                <button
                  type="button"
                  aria-pressed={combining.includes(proposal.id)}
                  onClick={() => toggleCombine(proposal.id)}
                  disabled={disabled}
                  className={cn(
                    "rounded-md border px-3 min-h-[44px] text-sm transition-colors duration-fast",
                    combining.includes(proposal.id)
                      ? "border-ember bg-ember-soft text-ink"
                      : "border-line text-ink-muted hover:text-ink",
                  )}
                >
                  {combining.includes(proposal.id) ? "Selected to combine" : "Combine"}
                </button>
              </div>
            </Surface>
          </li>
        ))}
      </ul>

      <div className="flex flex-col sm:flex-row gap-3">
        <form
          action={(formData) => {
            formData.set("sessionId", sessionId);
            for (const id of combining) formData.append("combine", id);
            startTransition(() => void combineProposalsAction(formData));
          }}
        >
          <Button
            type="submit"
            variant="secondary"
            disabled={combining.length !== 2 || disabled}
            loading={pending}
          >
            Combine the two
          </Button>
        </form>

        <form action={rejectProposalsAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <Button type="submit" variant="ghost" disabled={disabled}>
            None of these — try again
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- render */

const JOB_COPY: Record<string, string> = {
  REQUESTED: "sending it through",
  QUEUED: "getting to it",
  GENERATING: "putting the sketch together",
  EVALUATING: "listening back",
};

function RenderStep({
  producerName,
  pendingJob,
  versions,
  onAdvance,
}: {
  producerName: string;
  pendingJob: { id: string; status: string; jobType: string } | null;
  versions: WorkspaceVersion[];
  onAdvance: (jobId: string) => void;
}) {
  // The job is real work with real states; the screen watches it move.
  useEffect(() => {
    if (!pendingJob) return;
    const timer = setTimeout(() => onAdvance(pendingJob.id), 700);
    return () => clearTimeout(timer);
  }, [pendingJob, onAdvance]);

  if (!pendingJob) {
    const latest = versions[versions.length - 1];
    return (
      <Surface level={1} padded="lg" className="flex flex-col gap-2">
        <Label>Nothing rendering</Label>
        <p className="text-base text-ink">
          {latest ? `Version ${latest.versionNumber} is ready to hear.` : "Nothing made yet."}
        </p>
      </Surface>
    );
  }

  return (
    <Surface level={1} padded="lg" className="flex flex-col gap-4">
      <Label>{pendingJob.jobType === "MASTER" ? "Mastering" : "Quick render"}</Label>
      <p
        className="text-xl font-semibold tracking-display"
        role="status"
        aria-live="polite"
      >
        {producerName} is {JOB_COPY[pendingJob.status] ?? "working"}…
      </p>
      <p className="text-sm text-ink-muted">
        You can leave and come back — this keeps going without you.
      </p>

      <ol className="flex flex-wrap gap-2 pt-1">
        {["REQUESTED", "QUEUED", "GENERATING", "EVALUATING", "COMPLETE"].map((state) => (
          <li
            key={state}
            className={cn(
              "rounded-pill border px-3 py-1 text-2xs uppercase tracking-label",
              state === pendingJob.status
                ? "border-ember text-ember"
                : "border-line-subtle text-ink-subtle",
            )}
          >
            {state.toLowerCase()}
          </li>
        ))}
      </ol>
    </Surface>
  );
}

/* ---------------------------------------------------------------- review */

function ReviewStep({
  sessionId,
  producerName,
  versions,
  status,
  masterVersionId,
  trackTitle,
}: {
  sessionId: string;
  producerName: string;
  versions: WorkspaceVersion[];
  status: string;
  masterVersionId: string | null;
  trackTitle: string | null;
}) {
  const [revising, setRevising] = useState(false);
  const latest = versions[versions.length - 1];

  if (!latest) {
    return (
      <Surface level={1} padded="lg">
        <p className="text-base text-ink-muted">Nothing to review yet.</p>
      </Surface>
    );
  }

  const master = versions.find((version) => version.id === masterVersionId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Surface level={1} padded="lg" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tracking-display">
            {latest.workingTitle ?? "Untitled"}
          </span>
          <Tag tone={latest.isMaster ? "ember" : "neutral"}>
            version {latest.versionNumber}
            {latest.isMaster ? " · master" : ""}
          </Tag>
        </div>

        <div
          aria-hidden
          className="flex h-16 items-end gap-[2px] rounded-md bg-surface-inset px-3 py-2"
        >
          {latest.content.waveform.map((value, index) => (
            <span
              key={index}
              className="flex-1 rounded-sm bg-ember/70"
              style={{ height: `${Math.max(6, value)}%` }}
            />
          ))}
        </div>
        <p className="text-2xs uppercase tracking-label text-ink-subtle">
          Development preview — structured work, not audio
        </p>

        <p className="text-base text-ink-muted">{latest.content.description}</p>

        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-2xs uppercase tracking-label text-ink-subtle">Structure</dt>
            <dd className="text-sm text-ink">{latest.content.structure.join(" · ")}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-label text-ink-subtle">Theme</dt>
            <dd className="text-sm text-ink">{latest.content.lyricalTheme}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-label text-ink-subtle">Production</dt>
            <dd className="text-sm text-ink">{latest.content.productionNotes}</dd>
          </div>
          <div>
            <dt className="text-2xs uppercase tracking-label text-ink-subtle">Performance</dt>
            <dd className="text-sm text-ink">{latest.content.performanceDirection}</dd>
          </div>
        </dl>
      </Surface>

      {status === "COMPLETED" ? (
        <Surface level={2} padded="lg" className="flex flex-col gap-2 border-ember-line">
          <Label>Saved</Label>
          <p className="text-lg text-ink">“{trackTitle}” is in your catalogue.</p>
          <p className="text-sm text-ink-muted">
            Nobody has heard it yet. Releasing comes later.
          </p>
        </Surface>
      ) : master ? (
        <Surface level={2} padded="lg" className="flex flex-col gap-4 border-ember-line">
          <Label>Mastered — name it and keep it</Label>
          <form action={saveTrackAction} className="flex flex-col gap-4">
            <input type="hidden" name="sessionId" value={sessionId} />
            <Field label="Track title" htmlFor="title" hint="We suggested one. Change it if it's wrong.">
              <TextInput
                id="title"
                name="title"
                defaultValue={trackTitle ?? master.workingTitle ?? ""}
                maxLength={60}
              />
            </Field>
            <Button type="submit" size="lg">
              Save to catalogue
            </Button>
          </form>
        </Surface>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setRevising((value) => !value)}>
              Keep working
            </Button>

            <form action={requestMasterAction}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="versionId" value={latest.id} />
              <Button type="submit">Master this</Button>
            </form>
          </div>

          {revising ? (
            <Surface level={2} padded="lg" className="flex flex-col gap-4">
              <Label>What should {producerName} change?</Label>
              <form action={requestRevisionAction} className="flex flex-col gap-4">
                <input type="hidden" name="sessionId" value={sessionId} />
                <div className="flex flex-wrap gap-2">
                  {REVISION_KINDS.map((kind, index) => (
                    <label
                      key={kind.id}
                      className="flex items-center gap-2 rounded-pill border border-line-subtle bg-surface-1 px-4 min-h-[44px] cursor-pointer hover:bg-surface-3 transition-colors duration-fast has-[:checked]:border-ember has-[:checked]:bg-ember-soft"
                    >
                      <input
                        type="radio"
                        name="kind"
                        value={kind.id}
                        defaultChecked={index === 0}
                        className="accent-[color:var(--ember)]"
                      />
                      <span className="text-sm text-ink">{kind.label}</span>
                    </label>
                  ))}
                </div>

                <Field label="Anything specific?" htmlFor="revision-note">
                  <TextArea id="revision-note" name="note" maxLength={180} />
                </Field>

                <Button type="submit">Send it back</Button>
              </form>
            </Surface>
          ) : null}
        </div>
      )}

      {versions.length > 1 ? (
        <section className="flex flex-col gap-2">
          <Label>Earlier versions</Label>
          <ul className="flex flex-col gap-2">
            {versions.slice(0, -1).map((version) => (
              <li
                key={version.id}
                className="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-surface-2 px-4 py-3"
              >
                <span className="flex flex-col min-w-0">
                  <span className="text-sm text-ink truncate">
                    v{version.versionNumber} — {version.workingTitle}
                  </span>
                  <span className="text-xs text-ink-subtle truncate">
                    {version.content.description}
                  </span>
                </span>
                {version.isMaster ? <Tag tone="ember">master</Tag> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-subtle">Nothing here is ever overwritten.</p>
        </section>
      ) : null}
    </div>
  );
}
