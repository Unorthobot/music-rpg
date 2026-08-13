"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  declareBattleStrategy,
  prepareForBattle,
  scoutBattleOpponent,
} from "@music-rpg/domain";
import { BATTLE_STRATEGIES, type BattleStrategy } from "@music-rpg/shared";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";
import { requireCareer } from "@/lib/career";

/**
 * The decisions a battle asks for.
 *
 * Adapters, and nothing more. What can still be decided, what an angle costs to
 * change, what preparation spends and whether the career can afford it are all
 * the domain's; these carry an answer back to a screen.
 *
 * **Writes belong here, not to a render.** Every one of these is a player
 * decision, and a decision is allowed to change the world — which is exactly why
 * the battle page itself does nothing but read. In particular there is **no
 * action here that resolves a battle**, and there is no code path from this
 * route to one: the night happens on the day advance because game time reached
 * it, and no button anywhere can bring that forward.
 */

function refresh(battleId: string): void {
  revalidatePath(`/battles/${battleId}`);
  revalidatePath("/home");
  revalidatePath("/calendar");
  revalidatePath("/career");
}

/**
 * Look into somebody.
 *
 * Reveals what the world already recorded and changes nothing else. It is
 * written down rather than recomputed so that what was knowable on the day you
 * asked stays what you were told, and looking twice is looking once.
 */
export async function scoutAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const battleId = String(formData.get("battleId") ?? "");

  const result = await scoutBattleOpponent(ctx, {
    careerId: view.career.id,
    userId: user.id,
    battleId,
  });

  if (!result.ok) {
    redirect(`/battles/${battleId}?error=${encodeURIComponent(result.error.message)}`);
  }

  refresh(battleId);
  redirect(`/battles/${battleId}`);
}

/** Declare the angle. Before preparation, and never after the night. */
export async function declareAngleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const battleId = String(formData.get("battleId") ?? "");
  const strategy = String(formData.get("strategy") ?? "") as BattleStrategy;

  if (!BATTLE_STRATEGIES.includes(strategy)) {
    redirect(`/battles/${battleId}?error=${encodeURIComponent("That isn't an angle you can take.")}`);
  }

  const result = await declareBattleStrategy(ctx, {
    careerId: view.career.id,
    userId: user.id,
    battleId,
    strategy,
  });

  if (!result.ok) {
    redirect(`/battles/${battleId}?error=${encodeURIComponent(result.error.message)}`);
  }

  refresh(battleId);
  redirect(`/battles/${battleId}`);
}

/**
 * Put work into it.
 *
 * Spends money through the same ledger a studio session spends it through, and
 * days on the same calendar every other commitment occupies. Optional, always —
 * a battle can be entered with nothing prepared, and the day advance will carry
 * the career into the night either way.
 */
export async function prepareAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const battleId = String(formData.get("battleId") ?? "");

  const result = await prepareForBattle(ctx, {
    careerId: view.career.id,
    userId: user.id,
    battleId,
    sessions: 1,
  });

  if (!result.ok) {
    redirect(`/battles/${battleId}?error=${encodeURIComponent(result.error.message)}`);
  }

  refresh(battleId);
  redirect(`/battles/${battleId}`);
}
