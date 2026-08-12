import Link from "next/link";
import { getNPCConversations } from "@music-rpg/domain";
import { EmptyState, Label, Surface, Tag } from "@music-rpg/ui";
import { AppShell } from "@/components/shell/app-shell";
import { getAppDb } from "@/lib/db";
import { ACT_LABELS, requireCareer } from "@/lib/career";

export const metadata = { title: "Messages" };

/**
 * NPC messages.
 *
 * A list on every viewport; opening a conversation is a route, so mobile gets a
 * full screen and desktop keeps its place in the shell. Player-to-player
 * messaging is a different system and does not appear here.
 *
 * Genuinely multi-conversation since M7. The schema always allowed it and the
 * list has only ever had Thabo in it — now every promoter and producer who has
 * something to ask has a thread of their own, which is what makes "somebody
 * wants something from me" a thing the player reads rather than a thing the
 * interface announces.
 */
export default async function MessagesPage() {
  const { view } = await requireCareer();
  const db = await getAppDb();
  const conversations = await getNPCConversations(db, view.career);

  return (
    <AppShell
      displayName={view.displayName}
      act={ACT_LABELS[view.career.careerAct]}
      eyebrow="Messages"
      title="Messages"
    >
      {conversations.length === 0 ? (
        <EmptyState
          eyebrow="Messages"
          title="No one has reached out."
          description="Managers, promoters, producers and rivals start messaging you when they have a reason to."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((entry) => (
            <li key={entry.conversation.id}>
              <Link href={`/messages/${entry.conversation.id}`} className="block">
                <Surface
                  level={1}
                  padded="sm"
                  className="flex items-start justify-between gap-4 hover:border-line-strong transition-colors duration-fast"
                >
                  <span className="flex flex-col gap-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-base font-medium text-ink">
                        {entry.character.name}
                      </span>
                      {entry.unread > 0 ? <Tag tone="ember">{entry.unread} new</Tag> : null}
                    </span>
                    <span className="text-xs text-ink-subtle">
                      {entry.character.role.toLowerCase()} · {entry.character.origin}
                    </span>
                    {entry.lastMessage ? (
                      <span className="text-sm text-ink-muted line-clamp-2 mt-1">
                        {entry.lastMessage.content}
                      </span>
                    ) : null}
                  </span>

                  <span className="flex flex-col items-end gap-1 shrink-0">
                    {entry.conversation.lastMessageAt ? (
                      <time className="text-2xs uppercase tracking-label text-ink-subtle whitespace-nowrap">
                        {new Date(entry.conversation.lastMessageAt).toLocaleDateString("en-ZA", {
                          day: "numeric",
                          month: "short",
                        })}
                      </time>
                    ) : null}
                    {/*
                      About the offer's state, not the message's. A thread you
                      have read but not answered is still somebody waiting on
                      you, and the marker goes when the offer is answered.
                    */}
                    {entry.offerWaiting ? <Tag tone="ember">Offer waiting</Tag> : null}
                  </span>
                </Surface>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Label>Player messaging arrives with a later milestone.</Label>
    </AppShell>
  );
}
