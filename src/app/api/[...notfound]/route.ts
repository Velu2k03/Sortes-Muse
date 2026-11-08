import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * AF-096: unknown /api/* paths used to fall through to the HTML
 * not-found page (GET /api/broadcast returned a 35 KB HTML 404).
 * This catch-all answers JSON 404s instead. Explicit API routes
 * take precedence over a catch-all in the App Router, so real
 * endpoints are unaffected.
 */
function jsonNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function GET(): Promise<NextResponse> {
  return jsonNotFound();
}

export async function POST(): Promise<NextResponse> {
  return jsonNotFound();
}

export async function PUT(): Promise<NextResponse> {
  return jsonNotFound();
}

export async function PATCH(): Promise<NextResponse> {
  return jsonNotFound();
}

export async function DELETE(): Promise<NextResponse> {
  return jsonNotFound();
}
