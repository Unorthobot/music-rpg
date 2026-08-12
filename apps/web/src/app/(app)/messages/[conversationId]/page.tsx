import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull, npcMessages } from "@music-rpg/database";
import { getNPCConversation } from "@music-rpg/domain";
import type { PlayerOffer } from "@music-rpg/shared";
import { Label, LinkButton, OfferCard, OfferOutcomeNote, Surface } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { ACT_LABELS, requireCareer } from "@/lib/career";

/**
 * One conversation.
 *
 * Opening it marks the character's messages read — the unread state is real,
 * not a client-side flag — and, when a message is about an offer, the offer
 * appears as a card in the thread where it was mentioned.
 *
 * **The card is the same projection every other surface renders.** The thread
 * does not restate the terms in prose and does not format its own date: the
 * night shown here, on Home, on the offer screen and on the Calendar is one date
 * from one row. That is the property that stops four surfaces from slowly
 * developing four opinions about what the offer was.
 */
export default async function ConversationPage({
  params,
}: {
  params: { conversationId: string };
}) {
  const { user, view } = await requireCareer();
  const db = await getAppDb();

  const conversation = await getNPCConversation(db, view.career, params.conversationId);
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

  const showProducerIntro =
    conversation.opportunity?.status === "AVAILABLE" &&
    conversation.messages.some(
      (message) => (message.payload as { opportunityId?: string }).opportunityId,
    );

  const offerById = new Map(conversation.offers.map((offer) => [offer.id, offer]));

  /*
   * An offer is rendered once, under the first message that mentions it, so the
   * thread reads as a conversation rather than as a list with a card repeated
   * beneath every line.
   */
  const rendered = new Set<string>();

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
        {conversation.messages.map((message) => {
          const offerId = (message.payload as { opportunityId?: string }).opportunityId;
          const offer = offerId ? offerById.get(offerId) : undefined;
          const showCard = offer !== undefined && !rendered.has(offer.id);
          if (showCard && offer) rendered.add(offer.id);

          return (
            <li key={message.id} className="flex flex-col gap-3">
              <div
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
              </div>

              {showCard && offer ? <ThreadOffer offer={offer} /> : null}
            </li>
          );
        })}
      </ol>

      {showProducerIntro ? (
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

/**
 * The offer, in the thread.
 *
 * Live offers get a card with a way in; answered ones collapse to what became of
 * them, so the fiction closes where it opened. Nothing is removed from the
 * thread when it ends — the conversation is a record of what was said, and a
 * night that lapsed was still offered.
 */
function ThreadOffer({ offer }: { offer: PlayerOffer }) {
  if (offer.outcome === "WAITING") {
    return (
      <OfferCard
        offer={offer}
        className="self-start w-full max-w-[85%]"
        action={<LinkButton href={offer.href}>Look at it</LinkButton>}
      />
    );
  }

  return (
    <div className="self-start w-full max-w-[85%]">
      <OfferOutcomeNote
        offer={offer}
        action={
          offer.sessionId ? (
            <LinkButton href={`/studio/session/${offer.sessionId}`} variant="secondary">
              Go to the session
            </LinkButton>
          ) : offer.calendarItemId ? (
            <LinkButton href="/calendar" variant="secondary">
              On your calendar
            </LinkButton>
          ) : (
            <LinkButton href={offer.href} variant="secondary">
              See the offer
            </LinkButton>
          )
        }
      />
    </div>
  );
}
