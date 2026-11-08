import { describe, it, expect } from "vitest";
import { parseTypedDate } from "@/components/ThemedDatePicker";

// AF-047: the date picker must accept a typed date, so reaching 1990
// does not take ~430 month clicks.
describe("parseTypedDate", () => {
  it("parses MM/DD/YYYY", () => {
    expect(parseTypedDate("03/14/1990")).toBe("1990-03-14");
    expect(parseTypedDate("3/4/1990")).toBe("1990-03-04");
  });

  it("parses YYYY-MM-DD as typed", () => {
    expect(parseTypedDate("1990-03-14")).toBe("1990-03-14");
  });

  it("rejects impossible dates and junk", () => {
    expect(parseTypedDate("02/30/1990")).toBeNull();
    expect(parseTypedDate("13/01/1990")).toBeNull();
    expect(parseTypedDate("not a date")).toBeNull();
    expect(parseTypedDate("")).toBeNull();
    expect(parseTypedDate("03/14/90")).toBeNull();
  });
});
