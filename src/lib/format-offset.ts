// Pure, client-safe: formats a UTC offset in minutes as "UTC−04:00".
// Lives here (not in timezone.ts) because timezone.ts uses
// createRequire for tz-lookup and is server-only, while the charts
// page and VedicChart need the same formatting on the client.
// Minus is U+2212, matching the site's typographic style.
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "−" : "+";
  const abs = Math.round(Math.abs(offsetMinutes));
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}
