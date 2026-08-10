import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  artistPsychology,
  artistSkills,
  artists,
  groupMemberships,
  soundProfiles,
  type ArtistRow,
  type CareerRow,
  type Database,
  type GroupMembershipRow,
} from "@music-rpg/database";
import {
  PSYCHOLOGY_KEYS,
  type DiscoveryQuestion,
  type DiscoveryResponses,
  type OnboardingState,
  type PsychologyValues,
} from "@music-rpg/shared";
import { describePersonality, describeStat } from "@music-rpg/simulation";
import { loadDiscoveryQuestions, loadDiscoverySession } from "../internal/discovery";
import { getActiveCareer, getCareerView, type CareerView } from "./career-view";

/**
 * Where a player should land when they come back.
 *
 * Onboarding is resumable across devices, so the route is derived from
 * persisted state — never from client-side progress.
 */
export const ONBOARDING_ROUTES: Record<OnboardingState, string> = {
  NOT_STARTED: "/start",
  CAREER_TYPE: "/start",
  IDENTITY: "/start/identity",
  FOUNDING_ARTIST: "/start/founder",
  SOUND_DISCOVERY: "/start/sound",
  MEMBERS: "/start/members",
  REVEAL: "/start/reveal",
  COMPLETE: "/home",
};

export function onboardingRoute(career: CareerRow | null): string {
  if (!career) return "/start";
  if (career.status === "ACTIVE") return "/home";
  return ONBOARDING_ROUTES[career.onboardingState] ?? "/start";
}

export type OnboardingView = {
  career: CareerRow;
  view: CareerView | null;
  questions: DiscoveryQuestion[];
  responses: DiscoveryResponses;
  discoveryComplete: boolean;
  route: string;
};

export async function getOnboardingView(
  db: Database,
  userId: string,
): Promise<OnboardingView | null> {
  const career = await getActiveCareer(db, userId);
  if (!career) return null;

  const [view, session] = await Promise.all([
    getCareerView(db, career.id),
    loadDiscoverySession(db, career.id),
  ]);

  const questions = career.careerType
    ? await loadDiscoveryQuestions(db, career.careerType)
    : [];

  return {
    career,
    view,
    questions,
    responses: session?.responses ?? {},
    discoveryComplete: session?.status === "COMPLETED",
    route: onboardingRoute(career),
  };
}

/**
 * Candidate members for the group flow.
 *
 * Everything shown is qualitative: role, one standout strength, a personality
 * read and a creative tendency. Exact skills and psychology stay hidden — the
 * player is meeting a person, not reading a stat block.
 */
export type CandidateView = {
  artist: ArtistRow;
  role: string;
  strength: string;
  personality: string;
  tendency: string;
  membership: GroupMembershipRow | null;
};

const ROLE_LABELS: Record<string, string> = {
  LEAD_MC: "Lead MC",
  MC: "MC",
  SINGER: "Vocalist",
  PRODUCER: "Producer",
  DJ: "DJ",
  MULTI_ROLE: "Multi-role",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Multi-role";
  return ROLE_LABELS[role] ?? role;
}

export async function getCandidateViews(
  db: Database,
  worldId: string,
  groupId?: string | null,
): Promise<CandidateView[]> {
  const candidates = await db
    .select()
    .from(artists)
    .where(
      and(
        eq(artists.worldId, worldId),
        inArray(artists.artistType, ["WORLD_NPC", "CORE_NPC", "PROCEDURAL"]),
        eq(artists.status, "ACTIVE"),
        // An artist already committed to another group is not available. Being
        // offered someone you cannot have is worse than a shorter list.
        groupId
          ? or(isNull(artists.currentGroupId), eq(artists.currentGroupId, groupId))
          : isNull(artists.currentGroupId),
      ),
    )
    .orderBy(artists.stageName);

  if (candidates.length === 0) return [];

  const ids = candidates.map((candidate) => candidate.id);

  const [skills, psychologies, profiles, memberships] = await Promise.all([
    db.select().from(artistSkills).where(inArray(artistSkills.artistId, ids)),
    db.select().from(artistPsychology).where(inArray(artistPsychology.artistId, ids)),
    db.select().from(soundProfiles).where(inArray(soundProfiles.ownerId, ids)),
    groupId
      ? db.select().from(groupMemberships).where(eq(groupMemberships.groupId, groupId))
      : Promise.resolve([]),
  ]);

  return candidates.map((artist) => {
    const skillRow = skills.find((row) => row.artistId === artist.id);
    const psychologyRow = psychologies.find((row) => row.artistId === artist.id);
    const profile = profiles.find(
      (row) => row.ownerId === artist.id && row.ownerType === "ARTIST",
    );

    const strengthEntries: [string, number][] = skillRow
      ? [
          ["hooks", skillRow.melody],
          ["writing", skillRow.lyricism],
          ["storytelling", skillRow.storytelling],
          ["stage presence", skillRow.performance],
          ["production", skillRow.production],
          ["battles", skillRow.battleIq],
          ["versatility", skillRow.versatility],
          ["experimentation", skillRow.experimentation],
        ]
      : [];

    const bestStrength = strengthEntries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

    const psychology = psychologyRow
      ? (Object.fromEntries(
          PSYCHOLOGY_KEYS.map((key) => [key, psychologyRow[key as keyof typeof psychologyRow] as number]),
        ) as PsychologyValues)
      : null;

    return {
      artist,
      role: roleLabel(artist.preferredRole),
      strength: bestStrength ? `${describeStat(bestStrength[1])} ${bestStrength[0]}` : "Unproven",
      personality: psychology ? describePersonality(psychology) : "Hard to read",
      tendency: profile?.summary ?? "Sound still forming.",
      membership: memberships.find((row) => row.artistId === artist.id) ?? null,
    };
  });
}
