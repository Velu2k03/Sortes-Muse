import Link from "next/link";
import { SUN_SIGNS, isSunSign, type SunSign } from "@/lib/daily";
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
  return (
    <>
      <HoroscopeClient key={sign} initialSign={sign} initialDate={today} />
      <nav aria-label="All twelve sun signs" className="mx-auto max-w-2xl px-4 pb-10 sm:px-6">
        <h2 className="font-display text-2xl text-cream">All twelve signs</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SUN_SIGNS.map((s) => (
            <li key={s}>
              <Link
                href={`/horoscope?sign=${s}`}
                aria-current={s === sign ? "page" : undefined}
                className="block rounded-xl border border-gold/25 px-4 py-3 text-center text-sm font-semibold text-goldbright underline"
              >
                {s}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
