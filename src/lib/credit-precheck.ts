import { NextResponse } from "next/server";
import { getUserById } from "@/lib/db";

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
export async function preCheckOracleBalance(
  userId: string | null | undefined,
  required: boolean,
  noun: "reading" | "follow-up" | "interpretation" | "report"
): Promise<{ denied: NextResponse } | { denied?: undefined; user: User }> {
  if (!userId || !required) return { user: null };
  const user = await getUserById(userId);
  if (!user || user.credits < 1) {
    return {
      denied: NextResponse.json(
        { error: `You need 1 Oracle for this ${noun}. No Oracle was spent.` },
        { status: 402 }
      ),
    };
  }
  return { user };
}
