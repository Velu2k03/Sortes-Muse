import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Phase 5 Batch 5.3 notifications honesty", () => {
  it("the install banner no longer promises daily card reminders", () => {
    const banner = src("src/components/InstallBanner.tsx");
    expect(banner).not.toContain("daily card reminders");
    expect(banner).not.toContain("reminders");
    expect(banner).toContain("offline access");
  });

  it("migration 012 adds the win-back opt-out flag, with a rollback", () => {
    const migration = src("migrations/012_winback_opt_out.sql");
    expect(migration).toContain("winback_opted_out");
    expect(migration).toContain("BOOLEAN");
    const rollback = src("migrations/rollback/012_winback_opt_out.sql");
    expect(rollback).toContain("DROP COLUMN IF EXISTS winback_opted_out");
    const generated = src("src/lib/migrations.generated.ts");
    expect(generated).toContain('"012"');
  });

  it("the win-back candidate query excludes opted-out users", () => {
    const stats = src("src/lib/db/stats.ts");
    expect(stats).toContain("NOT COALESCE(u.winback_opted_out, FALSE)");
    expect(stats).toContain("u.winback_opted_out");
    expect(stats).toContain("setWinbackOptedOut");
  });

  it("the win-back email has a working opt-out, not a dead Reply STOP", () => {
    const email = src("src/lib/email.ts");
    expect(email).not.toContain("Reply STOP");
    expect(email).toContain("List-Unsubscribe");
    expect(email).toContain("List-Unsubscribe-Post");
    expect(email).toContain("Unsubscribe from these reminders");
    expect(email).toContain("unsubscribeUrl");
  });

  it("the unsubscribe link is signed and verified, GET confirms, POST opts out", () => {
    const unsub = src("src/lib/unsubscribe.ts");
    expect(unsub).toContain("createHmac");
    expect(unsub).toContain("winback-unsubscribe:");
    expect(unsub).toContain("timingSafeEqual");
    expect(unsub).toContain("/api/unsubscribe");
    const route = src("src/app/api/unsubscribe/route.ts");
    expect(route).toContain("verifyUnsubscribeToken");
    expect(route).toContain("setWinbackOptedOut");
    // GET must not mutate: it shows a confirmation form, and only the
    // POST handler changes the preference (link scanners fetching the
    // URL cannot unsubscribe anyone; mail clients POST one-click).
    expect(route).toContain("export async function POST");
    expect(route).toContain('method="post"');
    expect(route).toContain("Stop win-back emails?");
  });

  it("the account page has a notifications toggle wired to its API", () => {
    const panels = src("src/app/account/AccountPanels.tsx");
    expect(panels).toContain("NotificationsPanel");
    expect(panels).toContain("Stop win-back emails");
    const route = src("src/app/api/account/notifications/route.ts");
    expect(route).toContain("winbackOptedOut");
    expect(route).toContain("setWinbackOptedOut");
    const client = src("src/app/account/AccountClient.tsx");
    expect(client).toContain("NotificationsPanel");
  });
});
