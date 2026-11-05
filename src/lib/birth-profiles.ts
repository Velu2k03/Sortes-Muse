// Phase 5 (5.2): saved birth profiles, local-only. A profile is a
// named set of birth details ("Me", "Partner", "Friend") stored in
// localStorage, the same privacy model as the existing remembered
// birth details: never synced to the server, never sent to AI (only
// the computed chart positions are). Pure functions over arrays, so
// they are unit-testable without storage; src/lib/storage.ts owns
// the localStorage read/write.

export interface BirthProfileInput {
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, "" when unknownTime
  unknownTime: boolean;
  gender: "" | "male" | "female";
  preset: string; // city label, "" for custom coordinates
  latitude: string;
  longitude: string;
  timeZone?: string;
}

export interface BirthProfile extends BirthProfileInput {
  id: string;
}

export const MAX_BIRTH_PROFILES = 20;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** One human-readable problem, or null when the input is usable.
 *  Only the first problem is reported, so the form can fix one
 *  thing at a time. */
export function validateBirthProfile(input: BirthProfileInput): string | null {
  if (!input.name.trim()) return "Give the profile a name.";
  if (input.name.trim().length > 60) return "Keep the profile name under 60 characters.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    return "Enter a valid birth date.";
  }
  if (!input.unknownTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) {
    return "Enter a valid birth time (HH:MM), or tick unknown time.";
  }
  const lat = Number(input.latitude);
  if (input.latitude.trim() === "" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return "Enter a valid latitude (-90 to 90).";
  }
  const lon = Number(input.longitude);
  if (input.longitude.trim() === "" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return "Enter a valid longitude (-180 to 180).";
  }
  if (input.gender !== "" && input.gender !== "male" && input.gender !== "female") {
    return "Gender must be male, female, or blank.";
  }
  return null;
}

export interface CreateResult {
  profiles: BirthProfile[];
  profile?: BirthProfile;
  error?: string;
}

export function createBirthProfile(
  profiles: BirthProfile[],
  input: BirthProfileInput
): CreateResult {
  const problem = validateBirthProfile(input);
  if (problem) return { profiles, error: problem };
  if (profiles.length >= MAX_BIRTH_PROFILES) {
    return { profiles, error: `Keep at most ${MAX_BIRTH_PROFILES} saved profiles.` };
  }
  const profile: BirthProfile = {
    ...input,
    name: input.name.trim(),
    timeZone: input.timeZone ?? "",
    id: newId(),
  };
  return { profiles: [...profiles, profile], profile };
}

export function updateBirthProfile(
  profiles: BirthProfile[],
  id: string,
  patch: Partial<BirthProfileInput>
): BirthProfile[] {
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx < 0) return profiles;
  const next = { ...profiles[idx], ...patch };
  const problem = validateBirthProfile(next);
  if (problem) return profiles;
  const copy = [...profiles];
  copy[idx] = { ...next, name: next.name.trim(), id: profiles[idx].id };
  return copy;
}

export function deleteBirthProfile(profiles: BirthProfile[], id: string): BirthProfile[] {
  const next = profiles.filter((p) => p.id !== id);
  return next.length === profiles.length ? profiles : next;
}

/** Charts form fields: date, HH:MM time, gender, preset, coords, timezone. */
export function profileToChartFields(profile: BirthProfile): {
  date: string;
  time: string;
  unknownTime: boolean;
  gender: "male" | "female";
  preset: string;
  latitude: string;
  longitude: string;
  timeZone: string;
} {
  return {
    date: profile.date,
    time: profile.unknownTime ? "08:00" : profile.time,
    unknownTime: profile.unknownTime,
    // Charts default to female when the profile has no gender; the
    // form only uses gender for Ziwei.
    gender: profile.gender === "male" ? "male" : "female",
    preset: profile.preset,
    latitude: profile.latitude,
    longitude: profile.longitude,
    timeZone: profile.timeZone ?? "",
  };
}

/** Reports form fields: date, hour/minute split, gender, preset, coords. */
export function profileToReportFields(profile: BirthProfile): {
  date: string;
  unknownTime: boolean;
  hour: string;
  minute: string;
  preset: string;
  latitude: string;
  longitude: string;
  gender: "" | "male" | "female";
} {
  const [hour = "8", minute = "0"] = profile.unknownTime
    ? ["8", "0"]
    : profile.time.split(":");
  return {
    date: profile.date,
    unknownTime: profile.unknownTime,
    hour: String(Number(hour)),
    minute: String(Number(minute)),
    preset: profile.preset,
    latitude: profile.latitude,
    longitude: profile.longitude,
    gender: profile.gender,
  };
}
