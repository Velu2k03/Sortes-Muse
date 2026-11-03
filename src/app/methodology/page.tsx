import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology | Sortes",
  description:
    "How Sortes calculates Western, Vedic, and Ziwei charts, transits, and panchanga: engines, time rules, orb tables, and stated limits.",
  alternates: { canonical: "/methodology" },
};

// M3.2: methodology page. Every claim here is either computed by the
// engines named below or stated as a limit. Nothing on this page is
// AI-generated, and nothing here costs a credit.
export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Methodology</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          How Sortes calculates
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          The methods, engines, and limits behind every chart on this site. If a
          number on a chart page cannot be traced to a rule below, treat it as a
          bug and tell us.
        </p>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Western charts</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Zodiac: tropical. Houses: Placidus. Engine: circular-natal-horoscope-js (Unlicense).</li>
          <li>Birth time is converted with a real timezone database that includes DST rules for the birthplace on the birth date. This was verified by direct reproduction, not assumed.</li>
          <li>Retrograde is computed, not looked up: each planet&apos;s longitude is compared with a second calculation 24 hours later. A decreasing longitude means apparent retrograde motion.</li>
          <li>Unknown birth time: planet positions use a noon stand-in and are labeled as such. Rising, Midheaven, and houses are withheld entirely, never estimated from noon.</li>
          <li>Transits: transit positions are geocentric, computed for 12:00 UTC on the chosen date. Houses and angles are not used; transits are longitude to longitude only. Orb table: conjunction 6°, sextile 4°, square 5°, trine 5°, opposition 6°. Motion state comes from a second calculation 24 hours later: building, easing, or holding when the change is under 0.001°.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Vedic charts</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Zodiac: sidereal, Lahiri ayanamsa. Houses: whole sign. Engine: caelus 0.25.0 (MIT), a clean-room implementation with no ephemeris files.</li>
          <li>Birth time is converted to UT with a longitude offset only (longitude divided by 15 hours). No timezone database, no DST, and no historical timezone rules are applied. A chart near a sign or nakshatra cusp may therefore differ by one division from a timezone-exact calculation. Unknown birth time follows the same policy as Western: noon stand-in for positions only, Lagna and houses withheld.</li>
          <li>Vimshottari dasha: 120-year cycle in the order Ketu 7, Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17 years. One dasha year is 365.25 days, the usual programmatic convention, and all dates are calendar dates in UTC. An antardasha lasts (mahadasha years times lord years) divided by 120.</li>
          <li>Navamsa (D9): each sign splits into nine 3°20&apos; parts. The first part starts at the sign itself for movable signs (Aries, Cancer, Libra, Capricorn), at the 9th sign from it for fixed signs (Taurus, Leo, Scorpio, Aquarius), and at the 5th from it for dual signs (Gemini, Virgo, Sagittarius, Pisces).</li>
          <li>Dasamsa (D10): each sign splits into ten 3° parts. Brihat Parashara Hora Shastra, Chap 6, Shloka 13-14: odd-numbered signs (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius) start at the sign itself; even-numbered signs (Taurus, Cancer, Virgo, Scorpio, Capricorn, Pisces) start at the 9th sign from it.</li>
          <li>Gochara: transit positions are sidereal Lahiri at 12:00 UTC on the chosen date. Houses from the Moon are counted in signs from the natal Moon sign. Aspects are Graha Drishti counted in signs, with no orbs: every planet aspects the 7th sign from itself, Mars adds the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th. The nodes aspect by the 7th sign only in this view, because their 5th and 9th aspects are debated and are not claimed here. No transit is rated good or bad.</li>
          <li>Panchanga for one date, from sidereal Sun and Moon longitudes: tithi from Sun-Moon elongation (12° each, 30 tithis), nakshatra from Moon longitude (13°20&apos; each, 27 nakshatras), yoga from Sun plus Moon longitude (13°20&apos; each, 27 yogas), karana from elongation (6° each, 60 karanas: Kimstughna opens the month, then the seven movable karanas repeat eight times, and Shakuni, Chatushpada, and Naga close it), vara is the weekday of the date.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Ziwei charts</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Engine: iztro 2.6.3 (MIT). Ziwei stars are calculated positions, not astronomical bodies: they are placed by rule from the birth date, time branch, and gender.</li>
          <li>Birth time is corrected by longitude only: 4 minutes per degree from the nearest 15-degree meridian. No equation of time and no DST are applied, and the page says so.</li>
          <li>An unknown birth hour is refused outright, because the twelve palaces are placed by the two-hour branch. A noon double-hour layout would be a guess presented as a chart.</li>
          <li>Late-night Zi hours, leap months, and the lunar year boundary follow the iztro engine&apos;s own rules. Sortes does not override them.</li>
          <li>Si Hua transformations follow the iztro engine&apos;s table. Sources disagree on at least one row (the Ren Ke row), so Sortes reports what its engine computes and does not mix tables.</li>
          <li>Palace activation stacks, for one chosen year, layer three things over the same twelve natal palaces: the natal major stars, the decade (Da Xian) layer, and the annual (Liu Nian) layer. The decade comes from iztro&apos;s decade list with its age and year ranges (nominal ages); the annual layer comes from iztro&apos;s horoscope at June 1 of the year, the same representative date iztro&apos;s own yearly list uses. A year outside the chart&apos;s decade range is refused rather than stacked from the wrong decade. The daily (Liu Ri) layer is shown only as rhythm, the palace and Si Hua of the day with no interpretation attached, because a layer that changes daily is not a personal reading.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Horoscopes, honestly labeled</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>The daily horoscope page is general sun-sign copy written in-house, labeled as a general reflection, not a personal reading and not a prediction. It uses no ephemeris and no birth data.</li>
          <li>A personal transit view exists only where a chart has actually been calculated: Western transits under a Western chart, Gochara under a Vedic chart. Both change as the planets move; the transit Moon sign changes roughly every two days, which is the check that the output is computed rather than rotated copy.</li>
          <li>No chart, transit, or panchanga on this site is a prediction, a medical opinion, or financial advice. Health and finance guardrails are appended to AI interpretations where the category calls for them.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Privacy of birth data</h2>
        <p className="mt-3 text-sm leading-relaxed text-cream/85">
          Birth date, time, and place are used in-memory for a calculation and are never
          stored in the database and never sent to any AI prompt. What is stored for a
          saved chart is positions, signs, and palaces only, plus the interpretation text
          when one is generated.
        </p>
      </section>
    </div>
  );
}
