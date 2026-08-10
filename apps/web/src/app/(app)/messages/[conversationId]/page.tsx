import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull, npcMessages } from "@music-rpg/database";
import { getNPCConversation } from "@music-rpg/domain";
import { Label, LinkButton, Surface } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, requireCareer } from "@/lib/career";

/**
 * One conversation.
 *
 * Opening it marks the character's messages read — the unread state is real,
 * not a client-side flag — and, when the thread is about an opportunity, offers
 * the way into it.
 */
export default async function ConversationPage({
  params,
}: {
  params: { conversationId: string };
}) {
  const { user, view } = await requireCareer();
  const db = await getAppDb();

  const conversation = await getNPCConversation(db, view.career.id, params.conversationId);
  if (!conversation) notFound();

  await db
    .update(npcMessages)
    .set({ readAt: new Date() })
    .where(
      and(eq(npcMessages.conversationId, params.conversationId), isNull(npcMessages.readAt)),
    );

  const ctx = await createCommandContext();
  await ctx.analytics.track({
    name: "npc_conversation_opened",
    userId: user.id,
    careerId: view.career.id,
    properties: { character: conversation.character.slug },
  });

  const showOpportunity =
    conversation.opportunity?.status === "AVAILABLE" &&
    conversation.messages.some(
      (message) => (message.payload as { opportunityId?: string }).opportunityId,
    );

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Messages"
      title={conversation.character.name}
    >
      <Link
        href="/messages"
        className="text-sm text-ink-muted hover:text-ink min-h-[44px] inline-flex items-center"
      >
        ← All messages
      </Link>

      <Surface level={1} padded="lg" className="flex flex-col gap-2">
        <Label>{conversation.character.role.toLowerCase()}</Label>
        <p className="text-sm text-ink-muted">{conversation.character.biography}</p>
        {conversation.character.quote ? (
          <p className="text-sm text-ink border-l-2 border-ember-line pl-4 mt-1">
            “{conversation.character.quote}”
          </p>
        ) : null}
      </Surface>

      <ol className="flex flex-col gap-3">
        {conversation.messages.map((message) => (
          <li
            key={message.id}
            className={
              message.senderType === "PLAYER"
                ? "self-end max-w-[85%] rounded-lg bg-surface-3 px-4 py-3"
                : "self-start max-w-[85%] rounded-lg border border-line-subtle bg-surface-2 px-4 py-3"
            }
          >
            <span className="block text-2xs uppercase tracking-label text-ink-subtle mb-1">
              {message.senderType === "PLAYER" ? "You" : conversation.character.name}
            </span>
            <span className="text-base text-ink">{message.content}</span>
          </li>
        ))}
      </ol>

      {showOpportunity ? (
        <Surface level={2} padded="lg" className="flex flex-col gap-3 border-ember-line">
          <Label>What he&apos;s offering</Label>
          <p className="text-lg text-ink">Three producers, looking for artists.</p>
          <p className="text-sm text-ink-muted">
            Each one works differently and charges differently. You can only afford one right now.
          </p>
          <div className="pt-1">
            <LinkButton href="/opportunities/producers">See the producers</LinkButton>
          </div>
        </Surface>
      ) : null}
    </AppShell>
  );
}
