import type { ShowcaseBilling } from "@music-rpg/shared";

/**
 * What the people offering actually say.
 *
 * Deterministic fixtures, conditioned on the two axes already in the data: which
 * end of the bill, and what has just become true about the offer. No model, in
 * this milestone or the next — and none is needed, because what matters is not
 * that the sentence is novel but that it arrives from somebody who exists in the
 * world, about a night that exists in the world.
 *
 * The register is the whole discipline here. These are people sending short
 * messages about a Friday, not delivering monologues: Naledi is direct, Dineo is
 * particular, Sizwe is unhurried, Tumi is measured, and LEX says as little as he
 * can get away with. A promoter who suddenly became eloquent about the player's
 * artistic journey would do more damage to the fiction than a missing message.
 *
 * Nothing here decides anything. Voice is presentation over facts the director
 * already wrote down, which is why it lives in the simulation package next to
 * the other deterministic describers rather than inside the command that writes
 * the row.
 */

/**
 * The moments an offer can be spoken about.
 *
 * One per thing that has become true, and deliberately five rather than three:
 * a night that lapsed, a night that was turned down and a night that became
 * impossible are different messages from the same person, and flattening them
 * would put the same sentence in three situations that feel nothing alike.
 */
export const OFFER_MOMENTS = [
  /** It has just been offered. */
  "OFFER",
  /** The player said yes. */
  "ACCEPTED",
  /** The player said no. */
  "DECLINED",
  /** Nobody answered in time. */
  "EXPIRED",
  /** Something else was taken that night. */
  "WITHDRAWN",
] as const;
export type OfferMoment = (typeof OFFER_MOMENTS)[number];

type ShowcaseVoice = {
  /** The offer itself, by billing. Their own line does the inviting. */
  accepted: string;
  declined: string;
  expired: string;
  withdrawn: string;
};

/**
 * Promoters, one voice each.
 *
 * Keyed by slug rather than by personality score. These are four specific people
 * the world already describes in prose, and deriving their diction from
 * `directness: 80` would produce something that reads like a spreadsheet's idea
 * of a person.
 */
const PROMOTER_VOICES: Record<string, ShowcaseVoice> = {
  naledi: {
    accepted: "Good. Don't make me regret the slot.",
    declined: "Fair enough. I'll find someone.",
    expired: "Filled the slot. Next time.",
    withdrawn: "Heard you're playing elsewhere that night. These things happen.",
  },
  dineo: {
    accepted: "Right. The room's small — come prepared.",
    declined: "Noted. The basement isn't for everyone.",
    expired: "I've given it to someone else. It doesn't wait.",
    withdrawn: "You're booked that night, I hear. Another time, maybe.",
  },
  tumi: {
    accepted: "Booked. The band will want a rehearsal.",
    declined: "Understood. The room's not going anywhere.",
    expired: "Bill's finished. I needed an answer.",
    withdrawn: "You've taken something else that Friday. I'll keep you in mind.",
  },
  sizwe: {
    accepted: "Then it's yours. The room will tell you the truth.",
    declined: "That's your call to make.",
    expired: "I said I don't offer them twice.",
    withdrawn: "You're elsewhere that night. So be it.",
  },
};

/** Anybody the world adds later, before somebody writes them a voice. */
const DEFAULT_PROMOTER_VOICE: ShowcaseVoice = {
  accepted: "Good. See you on the night.",
  declined: "Understood.",
  expired: "Slot's gone. Next time.",
  withdrawn: "Heard you're busy that night.",
};

/**
 * What the offer message says.
 *
 * The promoter's own `offerLine` carries the invitation, so this adds only what
 * the line does not already say: which end of the bill they are asking for. In
 * human language, because "SUPPORT" is a database value and "half an hour before
 * the room fills up" is an offer.
 */
const BILLING_ASK: Record<ShowcaseBilling, string> = {
  HEADLINE: "I want you carrying it, not opening it.",
  SUPPORT: "Opening the night — half an hour, before the room fills up.",
};

export function showcaseOfferMessage(input: {
  offerLine: string;
  billing: ShowcaseBilling;
}): string {
  return `${input.offerLine} ${BILLING_ASK[input.billing]}`;
}

export function showcaseReplyMessage(input: {
  promoterSlug: string;
  moment: Exclude<OfferMoment, "OFFER">;
}): string {
  const voice = PROMOTER_VOICES[input.promoterSlug] ?? DEFAULT_PROMOTER_VOICE;

  switch (input.moment) {
    case "ACCEPTED":
      return voice.accepted;
    case "DECLINED":
      return voice.declined;
    case "EXPIRED":
      return voice.expired;
    case "WITHDRAWN":
      return voice.withdrawn;
  }
}

/**
 * Producers asking for another record.
 *
 * A different kind of ask from a promoter's, and it should not sound like one. A
 * promoter has a room to fill and a date to hit; a producer who wants to go again
 * is saying something about the last one — which is why the invitation names it.
 */
const PRODUCER_VOICES: Record<string, { invite: string } & ShowcaseVoice> = {
  lex: {
    invite: "That one worked. I've got time next week if you want to go again.",
    accepted: "Good. Bring something.",
    declined: "Alright.",
    expired: "Filled the week. Another time.",
    withdrawn: "Something else came up for you. Fine.",
  },
  mo: {
    invite: "I liked what we did. There's room in the diary if you want another.",
    accepted: "Booked. I'll have ideas ready.",
    declined: "No problem at all.",
    expired: "The week's gone. Say the word another time.",
    withdrawn: "You've got something else on. Understood.",
  },
  "producer-zero": {
    invite: "We should do another one. I've got a week free.",
    accepted: "Done. See you in the room.",
    declined: "Sure.",
    expired: "Week's booked now.",
    withdrawn: "You're busy. Noted.",
  },
};

const DEFAULT_PRODUCER_VOICE: { invite: string } & ShowcaseVoice = {
  invite: "Worth doing another one. I've got time if you do.",
  accepted: "Good. See you in the room.",
  declined: "Understood.",
  expired: "The week's gone.",
  withdrawn: "You've got something else on.",
};

export function sessionInviteMessage(input: {
  producerSlug: string;
  afterReleaseTitle: string | null;
}): string {
  const voice = PRODUCER_VOICES[input.producerSlug] ?? DEFAULT_PRODUCER_VOICE;
  /*
   * Naming the record is what makes this an invitation rather than a menu item:
   * somebody is asking for more of a specific thing you made together. When the
   * title is missing the line still stands on its own rather than saying
   * "Untitled".
   */
  if (!input.afterReleaseTitle) return voice.invite;
  return `${input.afterReleaseTitle} worked. ${voice.invite.replace(/^That one worked\. /, "")}`;
}

export function sessionInviteReplyMessage(input: {
  producerSlug: string;
  moment: Exclude<OfferMoment, "OFFER">;
}): string {
  const voice = PRODUCER_VOICES[input.producerSlug] ?? DEFAULT_PRODUCER_VOICE;

  switch (input.moment) {
    case "ACCEPTED":
      return voice.accepted;
    case "DECLINED":
      return voice.declined;
    case "EXPIRED":
      return voice.expired;
    case "WITHDRAWN":
      return voice.withdrawn;
  }
}

/**
 * What the player said, in the thread.
 *
 * Short on purpose. The thread records that an answer was given and closes the
 * fiction; it is not a place where the player performs a personality they were
 * never asked to choose.
 */
export function playerReplyMessage(moment: "ACCEPTED" | "DECLINED"): string {
  return moment === "ACCEPTED" ? "Taking it." : "Can't do this one.";
}
