import { isSunSign, type SunSign } from "@/lib/daily";
import HoroscopeClient from "./HoroscopeClient";

// AF-088: the page is a server component so the HTML carries the real
// reflection for the chosen sign (default Aries) for today. The client
// component enhances it with the wheel, date picker, and reveal.
// Reading searchParams makes this route dynamic, so "today" is never
// frozen at build time. The server date is UTC; the client swaps in
// the visitor's local date after mount.
export default async function HoroscopePage({
  searchParams,
}: {
  searchParams: Promise<{ sign?: string | string[] }>;
}) {
  const { sign: raw } = await searchParams;
  const q = Array.isArray(raw) ? raw[0] : raw;
  const sign: SunSign = q && isSunSign(q) ? q : "Aries";
  const today = new Date().toISOString().slice(0, 10);
  // UX audit Phase 2, F28: a 12-sign link grid used to sit below
  // the form, doing the same job as the sign picker. The picker is
  // now a grid of buttons inside the form itself, so the duplicate
  // grid is gone. ?sign= deep links still work (the searchParams
  // handling above is unchanged).
  return (
    <HoroscopeClient key={sign} initialSign={sign} initialDate={today} />
  );
}
