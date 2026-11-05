import { describe, it, expect } from "vitest";
import {
  createBirthProfile,
  updateBirthProfile,
  deleteBirthProfile,
  validateBirthProfile,
  profileToChartFields,
  profileToReportFields,
  type BirthProfile,
  type BirthProfileInput,
} from "@/lib/birth-profiles";

function mustCreate(profiles: BirthProfile[], input: BirthProfileInput): { profiles: BirthProfile[]; profile: BirthProfile } {
  const res = createBirthProfile(profiles, input);
  if (!res.profile) throw new Error(`expected profile creation to succeed: ${res.error ?? "unknown"}`);
  return { profiles: res.profiles, profile: res.profile };
}

const INPUT: BirthProfileInput = {
  name: "Me",
  date: "1990-01-01",
  time: "08:00",
  unknownTime: false,
  gender: "female",
  preset: "Manila, Philippines",
  latitude: "14.5995",
  longitude: "120.9842",
  timeZone: "",
};

describe("birth profile validation", () => {
  it("accepts a complete profile", () => {
    expect(validateBirthProfile(INPUT)).toBeNull();
  });

  it("rejects a blank name, a bad date, and out-of-range coordinates", () => {
    expect(validateBirthProfile({ ...INPUT, name: "   " })).toContain("name");
    expect(validateBirthProfile({ ...INPUT, date: "1990-13-40" })).toContain("date");
    expect(validateBirthProfile({ ...INPUT, date: "not-a-date" })).toContain("date");
    expect(validateBirthProfile({ ...INPUT, latitude: "200" })).toContain("latitude");
    expect(validateBirthProfile({ ...INPUT, longitude: "abc" })).toContain("longitude");
    expect(validateBirthProfile({ ...INPUT, time: "25:00" })).toContain("time");
  });

  it("allows unknown time with no time value", () => {
    expect(
      validateBirthProfile({ ...INPUT, unknownTime: true, time: "" })
    ).toBeNull();
  });
});

describe("birth profile CRUD (pure, over arrays)", () => {
  it("creates a profile with a fresh id and keeps the list immutable", () => {
    const before: BirthProfile[] = [];
    const { profiles, profile } = mustCreate(before, INPUT);
    expect(before).toHaveLength(0);
    expect(profiles).toHaveLength(1);
    expect(profile.id).toBeTruthy();
    expect(profile.name).toBe("Me");
    expect(profile.date).toBe("1990-01-01");
  });

  it("returns an error instead of creating an invalid profile", () => {
    const res = createBirthProfile([], { ...INPUT, name: "" });
    expect("error" in res && res.error).toContain("name");
    expect("profiles" in res && res.profiles).toHaveLength(0);
  });

  it("updates a profile by id and leaves others alone", () => {
    const { profiles } = mustCreate([], INPUT);
    const { profiles: p2 } = mustCreate(profiles, {
      ...INPUT,
      name: "Partner",
    });
    const updated = updateBirthProfile(p2, p2[0].id, { name: "Renamed" });
    expect(updated[0].name).toBe("Renamed");
    expect(updated[1].name).toBe("Partner");
    // Unknown id: list unchanged.
    expect(updateBirthProfile(p2, "nope", { name: "X" })).toEqual(p2);
  });

  it("deletes a profile by id", () => {
    const { profiles } = mustCreate([], INPUT);
    const { profiles: p2 } = mustCreate(profiles, {
      ...INPUT,
      name: "Partner",
    });
    const kept = deleteBirthProfile(p2, p2[0].id);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("Partner");
    expect(deleteBirthProfile(p2, "nope")).toEqual(p2);
  });
});

describe("prefill mapping", () => {
  it("maps a profile onto the charts form fields", () => {
    const { profile } = mustCreate([], INPUT);
    expect(profileToChartFields(profile)).toEqual({
      date: "1990-01-01",
      time: "08:00",
      unknownTime: false,
      gender: "female",
      preset: "Manila, Philippines",
      latitude: "14.5995",
      longitude: "120.9842",
      timeZone: "",
    });
  });

  it("maps a profile onto the reports form fields (hour/minute split)", () => {
    const { profile } = mustCreate([], INPUT);
    expect(profileToReportFields(profile)).toEqual({
      date: "1990-01-01",
      unknownTime: false,
      hour: "8",
      minute: "0",
      preset: "Manila, Philippines",
      latitude: "14.5995",
      longitude: "120.9842",
      gender: "female",
    });
  });

  it("maps an unknown-time profile onto the reports form with hour kept but unused", () => {
    const { profile } = mustCreate([], {
      ...INPUT,
      unknownTime: true,
      time: "",
    });
    const fields = profileToReportFields(profile);
    expect(fields.unknownTime).toBe(true);
    expect(fields.hour).toBe("8");
  });
});
