import Link from "next/link";
import { APP_SHORT, TAGLINE, CONTACT_EMAIL } from "@/lib/site";

const COPYRIGHT_YEAR = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-gold/15 bg-navydeep/60">
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
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/daily" className="text-cream/80 hover:text-goldbright">Daily Card</Link></li>
            <li><Link href="/spreads" className="text-cream/80 hover:text-goldbright">Readings</Link></li>
            <li><Link href="/deck" className="text-cream/80 hover:text-goldbright">Card Meanings</Link></li>
            <li><Link href="/credits" className="text-cream/80 hover:text-goldbright">Credits</Link></li>
            <li><Link href="/history" className="text-cream/80 hover:text-goldbright">Journal</Link></li>
            <li><Link href="/guides" className="text-cream/80 hover:text-goldbright">Guides</Link></li>
            <li><Link href="/faq" className="text-cream/80 hover:text-goldbright">FAQ</Link></li>
            <li><Link href="/birth-card" className="text-cream/80 hover:text-goldbright">Birth Card</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Trust</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/about" className="text-cream/80 hover:text-goldbright">About Sortes</Link></li>
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
