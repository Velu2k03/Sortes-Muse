import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PUT, PATCH, DELETE } from "@/app/api/[...notfound]/route";

/**
 * AF-096: unknown /api/* paths used to fall through to the HTML
 * not-found page (GET /api/broadcast returned a 35 KB HTML 404).
 * The catch-all below answers JSON for every verb instead. Routing
 * precedence (explicit routes win over the catch-all) is verified by
 * the build + curl check, not here: these tests pin the handlers.
 */
describe("unknown /api/* paths return JSON 404 (AF-096)", () => {
  function req(method: string): NextRequest {
    return new NextRequest("http://localhost/api/broadcast", { method });
  }

  it.each([
    ["GET", GET],
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ])("%s returns 404 with a JSON error body", async (_method, handler) => {
    const res = await (handler as (r: NextRequest) => Promise<Response>)(req("GET"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Not found." });
  });
});
