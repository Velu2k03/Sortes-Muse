import { describe, it, expect } from "vitest";
import { findMissingMigrations } from "../../../scripts/check-migrations.mjs";

// Notes N2 (B1a): the prebuild guard's comparison logic, pure (no DB).
describe("findMissingMigrations", () => {
  it("returns nothing when every expected version is applied", () => {
    expect(findMissingMigrations(["001", "002", "009"], ["001", "002", "009"])).toEqual([]);
  });

  it("lists the missing versions in expected order", () => {
    expect(findMissingMigrations(["001", "002", "009", "010"], ["001", "010"])).toEqual([
      "002",
      "009",
    ]);
  });

  it("lists everything when nothing is applied (e.g. no ledger table)", () => {
    expect(findMissingMigrations(["001", "002"], [])).toEqual(["001", "002"]);
  });

  it("ignores applied versions that are not expected (rolled-back extras)", () => {
    expect(findMissingMigrations(["001"], ["001", "004"])).toEqual([]);
  });
});
