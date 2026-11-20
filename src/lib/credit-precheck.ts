import { NextResponse } from "next/server";
import { getUserById } from "@/lib/db";
import { CREDIT_COSTS_ENABLED, creditsLabel } from "./subscription-tiers";

type User = Awaited<ReturnType<typeof getUserById>>;

// Phase 6 (N5) / F11: check the balance BEFORE calling the model. A
// signed-in user with 0 credits and no free use would otherwise get a
// full model call and only then a 402 (wasted quota on every attempt).
// The spend after generation stays as the atomic enforcement; this is
// only the early, quota-saving check, shared by the four AI routes.
//
// `required` is the route's gate (signed in and not a free use). When
// it is false nothing is fetched and the result is { user: null }.
// On an insufficient balance the 402 response is returned in `denied`.
//
// Phase 2 batch 3: `cost` is the flag-aware price of this product
// (1 while the credit-cost flag is OFF, 100/200/300/50 once it is
// ON). The error names the unit the user actually pays in.
/**
 * The unit a cost is shown in. Flag ON: "1 credit" / "200 credits".
 * Flag OFF: "1 Oracle" / "2 Oracles". The flag-ON branch used to say
 * "1 credits" (no singular); fixed on the D5 rehearsal branch
 * (c535154) and carried here at the cutover.
 */
export function costUnit(cost: number): string {
  if (CREDIT_COSTS_ENABLED) return creditsLabel(cost);
  return cost === 1 ? "1 Oracle" : `${cost} Oracles`;
}

/** The "nothing was charged" sentence every AI-route failure ends with. */
export function nothingSpent(): string {
  return CREDIT_COSTS_ENABLED ? "No credits were spent." : "No Oracle was spent.";
}

/** The 402 text for an insufficient balance, shared by the pre-check and the in-transaction spend. */
export function insufficientBalanceMessage(
  cost: number,
  noun: "reading" | "follow-up" | "interpretation" | "report"
): string {
  return `You need ${costUnit(cost)} for this ${noun}. ${nothingSpent()}`;
}

export async function preCheckOracleBalance(
  userId: string | null | undefined,
  required: boolean,
  noun: "reading" | "follow-up" | "interpretation" | "report",
  cost = 1
): Promise<{ denied: NextResponse } | { denied?: undefined; user: User }> {
  if (!userId || !required) return { user: null };
  const user = await getUserById(userId);
  if (!user || user.credits < cost) {
    return {
      denied: NextResponse.json(
        { error: insufficientBalanceMessage(cost, noun) },
        { status: 402 }
      ),
    };
  }
  return { user };
}
