import Link from "next/link";
import { APP_SHORT, TAGLINE, CONTACT_EMAIL } from "@/lib/site";

const COPYRIGHT_YEAR = new Date().getFullYear();

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
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Explore</p>
          {/* Two columns on phone widths, so the footer does not
              run to eleven single-column rows; single column again
              at md, where the footer itself is three columns. */}
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:block md:space-y-2">
            <li><Link href="/daily" className="text-cream/80 hover:text-goldbright">Daily Card</Link></li>
            <li><Link href="/spreads" className="text-cream/80 hover:text-goldbright">Spreads</Link></li>
            <li><Link href="/deck" className="text-cream/80 hover:text-goldbright">Deck</Link></li>
            <li><Link href="/charts" className="text-cream/80 hover:text-goldbright">Charts</Link></li>
            <li><Link href="/reports" className="text-cream/80 hover:text-goldbright">Reports</Link></li>
            <li><Link href="/horoscope" className="text-cream/80 hover:text-goldbright">Horoscope</Link></li>
            <li><Link href="/oracles" className="text-cream/80 hover:text-goldbright">Oracles</Link></li>
            <li><Link href="/journal" className="text-cream/80 hover:text-goldbright">Journal</Link></li>
            <li><Link href="/guides" className="text-cream/80 hover:text-goldbright">Guides</Link></li>
            <li><Link href="/faq" className="text-cream/80 hover:text-goldbright">FAQ</Link></li>
            <li><Link href="/birth-card" className="text-cream/80 hover:text-goldbright">Birth Card</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Trust</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:block md:space-y-2">
            <li><Link href="/about" className="text-cream/80 hover:text-goldbright">About Sortes</Link></li>
            <li><Link href="/account" className="text-cream/80 hover:text-goldbright">Sign in</Link></li>
            <li><Link href="/methodology" className="text-cream/80 hover:text-goldbright">Methodology</Link></li>
            <li><Link href="/privacy" className="text-cream/80 hover:text-goldbright">Privacy Policy</Link></li>
            <li><Link href="/terms" className="text-cream/80 hover:text-goldbright">Terms of Service</Link></li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-cream/80 hover:text-goldbright">
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
