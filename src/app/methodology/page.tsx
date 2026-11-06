import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Sortes calculates Western, Vedic, and Ziwei charts, transits, and panchanga: engines, time rules, orb tables, and stated limits.",
  alternates: { canonical: "/methodology" },
};

// M3.2: methodology page. Every claim here is either computed by the
// engines named below or stated as a limit. Nothing on this page is
// AI-generated, and nothing here costs a credit.
// Phase E (item 3): the Vedic and Ziwei timezone bullets were false
// (they claimed longitude-only conversion). Both now match
// src/lib/timezone.ts and the charts-page disclosure: IANA lookup
// with historical offset and DST, longitude fallback only when no
// zone resolves. New sections: natal orb and rulership tables,
// node convention, yogas and Ashtakavarga lineage, Known limits,
// and the AI role.
export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Methodology</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          How Sortes calculates
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-cream/75">
          The methods, engines, and limits behind every chart. If a number
          cannot be traced to a rule below, treat it as a bug.
        </p>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Western charts</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Zodiac: tropical. Houses: Placidus. Engine: circular-natal-horoscope-js 1.1.0 (Unlicense). Timezone lookup: tz-lookup 6.1.25.</li>
          <li>Bodies in the planet table: Sun to Pluto only. No nodes, no Lilith, no Chiron. The aspects list also includes points that are not in the planet table: Chiron, Lilith (Black Moon Lilith, the mean lunar apogee), Sirius, and the North and South Nodes; the chart page says so next to the list.</li>
          <li>Birth time is converted with a real timezone database that includes DST rules for the birthplace on the birth date. This was verified by direct reproduction, not assumed.</li>
          <li>Retrograde is computed, not looked up: each planet&apos;s longitude is compared with a second calculation 24 hours later. A decreasing longitude means apparent retrograde motion.</li>
          <li>Natal aspects carry an applying or separating state from the same 24-hour-later comparison: applying when the separation is closing toward the exact angle, separating when it is opening, steady when it barely moves in a day. The natal orb table is the library&apos;s own defaults: conjunction 8°, opposition 8°, trine 8°, square 7°, sextile 6°, quincunx 5°, quintile 1°, septile 1°, semi-square 1°, semi-sextile 1°.</li>
          <li>Traditional rulership (reference only; no calculation uses it): Sun rules Leo, Moon rules Cancer, Mercury rules Gemini and Virgo, Venus rules Taurus and Libra, Mars rules Aries and Scorpio, Jupiter rules Sagittarius and Pisces, Saturn rules Capricorn and Aquarius.</li>
          <li>Unknown birth time: planet positions use a noon stand-in and are labeled as such. Rising, Midheaven, and houses are withheld entirely, never estimated from noon.</li>
          <li>Transits: transit positions are geocentric, computed for 12:00 UTC on the chosen date. Houses and angles are not used; transits are longitude to longitude only. Orb table: conjunction 6°, sextile 4°, square 5°, trine 5°, opposition 6°. Motion state comes from a second calculation 24 hours later: building, easing, or holding when the change is under 0.001°.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Vedic charts</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Zodiac: sidereal, Lahiri ayanamsa. Houses: whole sign. Engine: caelus 0.25.0 (MIT), a clean-room implementation with no ephemeris files. The ayanamsa in degrees for the birth date is read from caelus itself and published on every Vedic chart.</li>
          <li>Birth time is converted to UT with the IANA timezone resolved from the birthplace coordinates: the historical offset for the birth date, including daylight saving. Only when no zone can be resolved does it fall back to a longitude offset (longitude divided by 15 hours), and the chart says so. Unknown birth time follows the same policy as Western: noon stand-in for positions only, Lagna and houses withheld.</li>
          <li>Nodes: the true node gives Rahu&apos;s position (Ketu is its exact opposite point); the mean node gives the retrograde flag, because the true node wobbles and can move direct for days while the mean node always regresses, which is the standard &quot;nodes are always retrograde&quot; convention.</li>
          <li>Vimshottari dasha: 120-year cycle in the order Ketu 7, Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17 years. One dasha year is 365.25 days, the usual programmatic convention, and all dates are calendar dates in UTC. An antardasha lasts (mahadasha years times lord years) divided by 120, and the pratyantar is dated the same way inside the antardasha, so the pratyantar name is never shown without its dates.</li>
          <li>Navamsa (D9): each sign splits into nine 3°20&apos; parts. The first part starts at the sign itself for movable signs (Aries, Cancer, Libra, Capricorn), at the 9th sign from it for fixed signs (Taurus, Leo, Scorpio, Aquarius), and at the 5th from it for dual signs (Gemini, Virgo, Sagittarius, Pisces).</li>
          <li>Dasamsa (D10): each sign splits into ten 3° parts. Brihat Parashara Hora Shastra, Chap 6, Shloka 13-14: odd-numbered signs (Aries, Gemini, Leo, Libra, Sagittarius, Aquarius) start at the sign itself; even-numbered signs (Taurus, Cancer, Virgo, Scorpio, Capricorn, Pisces) start at the 9th sign from it.</li>
          <li>Only the D9 Navamsa and D10 Dasamsa divisional charts are offered. No other varga is computed or shown.</li>
          <li>Yogas are computed from the sidereal D1 sign map with caelus&apos;s BPHS-following rules, never invented: the five Pancha Mahapurusha yogas (own sign or exaltation in a kendra), Gajakesari (Jupiter in a kendra from the Moon), Budha-Aditya (Sun and Mercury in one sign), Chandra-Mangala (Moon and Mars in one sign), Kemadruma (the Moon isolated from the five tara grahas; the Sun and nodes are not counted, the default convention), raja yogas (a kendra lord associated with a trikona lord) and dhana yogas (two wealth-house 2/5/9/11 lords associated) by conjunction, sign exchange, or mutual graha drishti, and the yogakaraka (a planet ruling both a pure kendra 4/7/10 and a pure trikona 5/9). Yogas need a birth time, because kendras are counted from the Ascendant.</li>
          <li>Ashtakavarga is the unreduced Bhinnashtakavarga per planet plus the Sarvashtakavarga, computed from the same natal positions. Tables follow B.V. Raman, Hindu Predictive Astrology Ch. XXVI, with three entries following the BPHS recension as published by Astro Clock AI (Kannan, Fundamentals of Hindu Astrology Ch. XXXII, checked against BPHS Ch. 66): the Moon&apos;s 9th from the Moon instead of the 9th from Mars, Venus&apos;s 4th from Mars instead of the 5th, and the Moon&apos;s 2nd from Jupiter instead of the 12th. The tables are verified against Astro Clock AI&apos;s published sample grid (14 Aug 1994, 06:42, Ahmedabad): all 84 cells match and the totals are the fixed 48/49/39/54/56/52/39, summing to 337. Not computed: Trikona/Ekadhipatya reductions, Shodhya Pinda, Kaksha, the Lagna&apos;s own table, and Rahu/Ketu, which take no part in the system.</li>
          <li>Gochara: transit positions are sidereal Lahiri at 12:00 UTC on the chosen date. Houses from the Moon are counted in signs from the natal Moon sign. Aspects are Graha Drishti counted in signs, with no orbs: every planet aspects the 7th sign from itself, Mars adds the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th. The nodes aspect by the 7th sign only in this view, because their 5th and 9th aspects are debated and are not claimed here. No transit is rated good or bad.</li>
          <li>Panchanga for one date, from sidereal Sun and Moon longitudes: tithi from Sun-Moon elongation (12° each, 30 tithis), nakshatra from Moon longitude (13°20&apos; each, 27 nakshatras), yoga from Sun plus Moon longitude (13°20&apos; each, 27 yogas), karana from elongation (6° each, 60 karanas: Kimstughna opens the month, then the seven movable karanas repeat eight times, and Shakuni, Chatushpada, and Naga close it), vara is the weekday of the date.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Ziwei charts</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Engine: iztro 2.6.3 (MIT). Ziwei stars are calculated positions, not astronomical bodies: they are placed by rule from the birth date, time branch, and gender.</li>
          <li>Birth time is converted the same way as the other systems: the IANA timezone is resolved from the birthplace coordinates (historical offset, DST included), the clock time is converted to UTC, and then solar time is UTC plus longitude divided by 15 hours. Only when no zone can be resolved does the old longitude-only correction run, and the chart says so. The equation of time is never applied for Ziwei.</li>
          <li>An unknown birth hour is refused outright, because the twelve palaces are placed by the two-hour branch. A noon double-hour layout would be a guess presented as a chart.</li>
          <li>Late-night Zi hours, leap months, and the lunar year boundary follow the iztro engine&apos;s own rules. Sortes does not override them.</li>
          <li>School and lineage: iztro publishes no school label, so Sortes names none and reports iztro&apos;s tables without mixing. Brightness comes from iztro&apos;s built-in per-star table. Si Hua transformations follow iztro&apos;s table, stated here for the two rows sources argue about most: Geng gives Lu to Taiyang (Sun), Quan to Wu Qu, Ke to Taiyin (Moon), Ji to Tian Tong; Ren gives Lu to Tian Liang, Quan to Zi Wei, Ke to Zuo Fu, Ji to Wu Qu.</li>
          <li>Minor stars are placed by birth month or year alone, so they describe a whole cohort, not one person: the chart interpretation is instructed never to let a minor star carry a personal verdict, and personal claims must rest on major stars, palaces, and transformations only.</li>
          <li>Palace activation stacks, for one chosen year, layer three things over the same twelve natal palaces: the natal major stars, the decade (Da Xian) layer, and the annual (Liu Nian) layer. The decade comes from iztro&apos;s decade list with its age and year ranges (nominal ages); the annual layer comes from iztro&apos;s horoscope at June 1 of the year, the same representative date iztro&apos;s own yearly list uses. A year outside the chart&apos;s decade range is refused rather than stacked from the wrong decade. The daily (Liu Ri) layer is shown only as rhythm, the palace and Si Hua of the day with no interpretation attached, because a layer that changes daily is not a personal reading.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">Known limits</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Polar Placidus: inside the Arctic or Antarctic circle (|latitude| at or above 66.55°), Placidus houses can collapse or distort. Charts there are flagged as polar, and the house placements are approximate, not exact. Planet longitudes are unaffected.</li>
          <li>Birth-time precision: positions move with the clock. A birth time off by an hour can shift the Moon by about 0.5° and the Ascendant by about 15°, so a chart near a sign, house, or nakshatra cusp can differ by one division from a minute-exact calculation. The chart shows the time basis it used so the reader can judge this.</li>
          <li>Moon transits: Western transit positions are computed for 12:00 UTC on the chosen date, and the Moon moves about 13° a day, so a same-day Moon aspect is approximate. The transit view says so where the Moon is shown.</li>
          <li>Dasha dates use a 365.25-day year. That is the usual programmatic convention, not an astronomical year, so long dasha spans can differ by days from a calendar-year count.</li>
          <li>One engine per system: Western positions come from circular-natal-horoscope-js, Vedic from caelus, Ziwei from iztro. No second ephemeris is cross-checked locally; if a position looks wrong, that is the place to check it.</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-3xl text-goldbright">The AI&apos;s role</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-cream/85">
          <li>Positions are computed by the engines above; the AI writes prose from those positions only. It never calculates a chart, and it never invents a placement, aspect, transformation, yoga, bindu, or date that is not in the chart positions sent to it.</li>
          <li>Prose is generated by the free-tier OpenRouter chain, in order: openrouter/free, nvidia/nemotron-3-ultra-550b-a55b:free, xingchen-agi/xing4.0-29b-a4b:free, at temperature 0.8. The serving model for each reading is shown on the reading itself (&quot;Written with [model]&quot;) and in the journal export.</li>
          <li>Every generated reading is validated before it is delivered: the tarot validator requires the drawn card names, the question&apos;s key words, one reflection question, and one practical step inside the 300-600 word band; chart and report validators require the named placements and dates back from the prompt. A reading that fails validation is not delivered as if it passed.</li>
          <li>The standard chart interpretation is not AI-generated at all: it is a deterministic text built from the computed positions, and it is labeled as such wherever it appears.</li>
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
