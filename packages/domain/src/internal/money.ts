import { eq } from "drizzle-orm";
import { careers, transactions, type CareerRow, type DbClient } from "@music-rpg/database";
import { ids, type TransactionCategory } from "@music-rpg/shared";

/**
 * Money movement.
 *
 * Two rules, enforced here rather than trusted to call sites:
 *
 * 1. **Never adjust a balance without a ledger row.** `careers.money_balance`
 *    is a running total; `transactions` is the record of why. They are written
 *    in one transaction, so a charge cannot be half-applied.
 * 2. **Never charge twice for the same intent.** Every movement carries an
 *    idempotency key; a replayed request returns the original row instead of
 *    taking the money again.
 *
 * Debt is not a mechanic in Act I, so a debit that would go below zero is
 * refused rather than allowed to overdraw.
 */
export type MoneyMovement = {
  careerId: string;
  category: TransactionCategory;
  /** Positive integer, minor units. `direction` carries the sign. */
  amountMinor: number;
  direction: "DEBIT" | "CREDIT";
  description: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  idempotencyKey: string;
  occurredAt: Date;
};

export type MoneyResult =
  | { ok: true; transactionId: string; balanceAfterMinor: number; alreadyApplied: boolean }
  | { ok: false; reason: "INSUFFICIENT_FUNDS"; balanceMinor: number; requiredMinor: number };

export async function applyMoneyMovement(
  tx: DbClient,
  movement: MoneyMovement,
): Promise<MoneyResult> {
  const existing = await tx
    .select()
    .from(transactions)
    .where(eq(transactions.idempotencyKey, movement.idempotencyKey))
    .limit(1);

  const already = existing[0];
  if (already) {
    return {
      ok: true,
      transactionId: already.id,
      balanceAfterMinor: already.balanceAfterMinor,
      alreadyApplied: true,
    };
  }

  const careerRows = await tx
    .select({ balance: careers.moneyBalance })
    .from(careers)
    .where(eq(careers.id, movement.careerId))
    .limit(1);

  const balance = careerRows[0]?.balance ?? 0;
  const delta = movement.direction === "DEBIT" ? -movement.amountMinor : movement.amountMinor;
  const balanceAfter = balance + delta;

  if (balanceAfter < 0) {
    return {
      ok: false,
      reason: "INSUFFICIENT_FUNDS",
      balanceMinor: balance,
      requiredMinor: movement.amountMinor,
    };
  }

  const transactionId = ids.generic();

  await tx.insert(transactions).values({
    id: transactionId,
    careerId: movement.careerId,
    category: movement.category,
    direction: movement.direction,
    amountMinor: movement.amountMinor,
    balanceAfterMinor: balanceAfter,
    description: movement.description,
    relatedEntityType: movement.relatedEntityType ?? null,
    relatedEntityId: movement.relatedEntityId ?? null,
    idempotencyKey: movement.idempotencyKey,
    occurredAt: movement.occurredAt,
  });

  await tx
    .update(careers)
    .set({ moneyBalance: balanceAfter, updatedAt: new Date() })
    .where(eq(careers.id, movement.careerId));

  return { ok: true, transactionId, balanceAfterMinor: balanceAfter, alreadyApplied: false };
}

/** Can this career afford an amount right now? */
export function canAfford(career: Pick<CareerRow, "moneyBalance">, amountMinor: number): boolean {
  return career.moneyBalance >= amountMinor;
}
