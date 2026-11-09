/** Normalise an angle in degrees to [0, 360). */
export function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** Zodiac sign index (0 = Aries/Mesha ... 11) for an ecliptic longitude. */
export function signIndex(lon: number): number {
  return Math.floor(norm360(lon) / 30);
}
