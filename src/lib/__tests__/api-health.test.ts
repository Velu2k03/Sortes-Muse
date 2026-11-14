import { describe, it, expect, beforeEach, vi } from "vitest";
import { migrationHealth } from "@/app/api/health/route";

vi.mock("@/lib/db/client", () => ({
  sql: vi.fn(),
}));

import { sql } from "@/lib/db/client";
import { GET } from "@/app/api/health/route";

const mockedSql = vi.mocked(sql);

// Notes N2 (B1c): GET /api/health compares the applied ledger to
// the shipped migration files. 200 when all are applied, 503 when
// any is missing or the DB cannot be reached.
describe("migrationHealth", () => {
  it("is ok when every shipped migration is applied", () => {
    const health = migrationHealth(["001", "002", "003", "006", "007", "008", "009", "010"]);
    expect(health.ok).toBe(true);
    expect(health.applied).toBe("010");
    expect(health.expected).toBe(8);
    expect(health.latest).toBe("010");
    expect(health.missing).toEqual([]);
  });

  it("lists the missing versions when the ledger is behind", () => {
    const health = migrationHealth(["001", "002"]);
    expect(health.ok).toBe(false);
    expect(health.applied).toBe("002");
    expect(health.missing).toEqual(["003", "006", "007", "008", "009", "010"]);
  });

  it("reports null applied on an empty ledger", () => {
    const health = migrationHealth([]);
    expect(health.ok).toBe(false);
    expect(health.applied).toBeNull();
    expect(health.missing).toHaveLength(8);
  });
});

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 200 with applied/expected/latest when all migrations are applied", async () => {
    mockedSql.mockResolvedValue({
      rows: ["001", "002", "003", "006", "007", "008", "009", "010"].map((version) => ({ version })),
    } as never);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      applied: "010",
      expected: 8,
      latest: "010",
      missing: [],
    });
  });

  it("returns 503 with the missing versions when the DB is behind", async () => {
    mockedSql.mockResolvedValue({ rows: [{ version: "001" }] } as never);
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.missing).toContain("010");
  });

  it("returns 503 (not a crash) when the DB is unreachable", async () => {
    mockedSql.mockRejectedValue(new Error("Database not configured"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.applied).toBeNull();
  });
});
