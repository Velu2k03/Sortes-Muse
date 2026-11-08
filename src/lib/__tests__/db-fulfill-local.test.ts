import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { createUser, fulfillOrder } from "@/lib/db";

// AF-004: duplicate rule for fulfillOrder on the local JSON branch.
// A row is a duplicate when its order_id matches, or (for files
// written before order_id existed) when the old pack_type marker
// matches. Backs up data/local-db.json and restores it afterwards.
const hasPostgres = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
const LOCAL_PATH = path.join(process.cwd(), "data", "local-db.json");

describe.skipIf(hasPostgres)("fulfillOrder duplicate rule (local JSON branch)", () => {
  let backup: string | null = null;
  let hadFile = false;

  beforeAll(async () => {
    try {
      backup = await fs.readFile(LOCAL_PATH, "utf8");
      hadFile = true;
    } catch {
      backup = null;
      hadFile = false;
    }
    await fs.rm(LOCAL_PATH, { force: true });
  });

  afterAll(async () => {
    if (hadFile && backup !== null) {
      await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
      await fs.writeFile(LOCAL_PATH, backup);
    } else {
      await fs.rm(LOCAL_PATH, { force: true });
    }
  });

  it("stores order_id and rejects a redelivery by order_id", async () => {
    const user = await createUser("af004-local@example.com");
    const args = {
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:af004-local)",
      amount: 3.99,
      readings: 5,
      orderId: "af004-local",
    };
    const first = await fulfillOrder(args);
    expect(first.duplicate).toBe(false);
    expect(first.transaction?.order_id).toBe("af004-local");
    // Same order_id, different pack_type shape: still a duplicate.
    const second = await fulfillOrder({ ...args, packType: "pack5 (renamed)" });
    expect(second.duplicate).toBe(true);
    expect(second.credits).toBe(5);
  });

  it("treats a legacy row (no order_id, old pack_type marker) as a duplicate", async () => {
    const user = await createUser("af004-legacy@example.com");
    const db = JSON.parse(await fs.readFile(LOCAL_PATH, "utf8"));
    db.transactions.unshift({
      id: "t_legacy",
      user_id: user.id,
      email: user.email,
      pack_type: "pack5 (lemonsqueezy:af004-legacy)",
      amount: 3.99,
      readings: 5,
      created_at: new Date().toISOString(),
    });
    await fs.writeFile(LOCAL_PATH, JSON.stringify(db));
    const res = await fulfillOrder({
      userId: user.id,
      email: user.email,
      packType: "pack5 (lemonsqueezy:af004-legacy)",
      amount: 3.99,
      readings: 5,
      orderId: "af004-legacy",
    });
    expect(res.duplicate).toBe(true);
  });
});
