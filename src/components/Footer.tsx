import Link from "next/link";
import { APP_SHORT, TAGLINE, CONTACT_EMAIL } from "@/lib/site";

const COPYRIGHT_YEAR = new Date().getFullYear();

// AF-091: footer links do not prefetch (was ~28 prefetch requests per
// page load). AF-086: every footer link is py-2 so the tap target is
// 44px-tall on mobile instead of 17px. AF-076: group labels are real
// h2 headings, not styled paragraphs.
export default function Footer() {
  // mt-12, not mt-20: the old 80px gap read as empty space
  // before the footer, on mobile most of all.
  return (
    <footer className="mt-12 border-t border-gold/15 bg-navydeep/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-2xl text-goldbright">{APP_SHORT}</p>
          <p className="mt-2 text-sm italic text-mist">{TAGLINE}</p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-mist">
            Readings are for reflection and perspective, never guaranteed
            predictions. Nothing here replaces professional advice.
          </p>
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-gold">Explore</h2>
          {/* Two columns on phone widths, so the footer does not
              run to eleven single-column rows; single column again
              at md, where the footer itself is three columns. */}
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:block md:space-y-2">
            <li><Link href="/daily" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Daily Card</Link></li>
            <li><Link href="/spreads" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Spreads</Link></li>
            <li><Link href="/deck" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Deck</Link></li>
            <li><Link href="/charts" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Charts</Link></li>
            <li><Link href="/reports" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Reports</Link></li>
            <li><Link href="/horoscope" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Horoscope</Link></li>
            <li><Link href="/oracles" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Oracles</Link></li>
            <li><Link href="/journal" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Journal</Link></li>
            <li><Link href="/guides" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Guides</Link></li>
            <li><Link href="/faq" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">FAQ</Link></li>
            <li><Link href="/birth-card" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Birth Card</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-[0.2em] text-gold">About &amp; legal</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:block md:space-y-2">
            <li><Link href="/about" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">About Sortes</Link></li>
            <li><Link href="/methodology" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Methodology</Link></li>
            <li><Link href="/privacy" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Privacy Policy</Link></li>
            <li><Link href="/terms" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Terms of Service</Link></li>
            <li><Link href="/terms" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Refunds</Link></li>
            <li><Link href="/contact" prefetch={false} className="inline-block py-2 text-cream/80 hover:text-goldbright">Contact</Link></li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="inline-block py-2 text-cream/80 hover:text-goldbright">
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gold/10 py-5 text-center text-xs text-mist">
        © {COPYRIGHT_YEAR} Resonant Atlas · {APP_SHORT}. Cast the lots, read your story.
      </div>
    </footer>
  );
}
