import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "About",
  description:
    "Sortes by Resonant Atlas: a tarot reading app for reflection. Who runs it, what it offers, how it handles your data, and how to contact it.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">About</p>
      <h1 className="mt-3 font-display text-5xl text-goldbright">
        About Sortes
      </h1>
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-cream/85">
        <section>
          <h2 className="font-display text-3xl text-goldbright">Who runs Sortes</h2>
          <p className="mt-3">
            {APP_NAME} is run by Resonant Atlas. It is a tarot reading web app.
            Contact is {CONTACT_EMAIL}.
          </p>
        </section>
        <section>
          <h2 className="font-display text-3xl text-goldbright">What Sortes offers</h2>
          <p className="mt-3">
            A free daily card, all 78 Rider-Waite card meanings, six spreads,
            a daily sun-sign reflection, and three birth chart systems
            (Ziwei, Western, Vedic). First Quick Insight and first chart
            interpretation per system are free; later readings cost 1 Oracle
            each, in packs sold through Lemon Squeezy.
          </p>
        </section>
        <section>
          <h2 className="font-display text-3xl text-goldbright">Reflection, not prediction</h2>
          <p className="mt-3">
            Readings and chart interpretations in Sortes are for reflection and
            perspective only. They are never guaranteed predictions, and they
            never replace professional advice about health, money, or legal
            matters.
          </p>
        </section>
        <section>
          <h2 className="font-display text-3xl text-goldbright">How your data is handled</h2>
          <p className="mt-3">
            As a guest, your daily cards, balance, and history live in your
            browser. Your story goes to the AI for one reading only and is
            not saved. Your question, first name, and category are saved in
            your journal until you delete them. For charts, only calculated
            positions are stored, never raw birth data, and raw birth data is
            never sent to AI. Full details are in the Privacy Policy.
          </p>
        </section>
      </div>
      {/* AF-035: .btn-gold/.btn-ghost carry no padding themselves, so
          these links need the shared px-5 py-3 rounded-full shape
          instead of rendering as unpadded text. */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/guides" className="btn-gold rounded-full px-5 py-3 font-semibold">
          Read the guides
        </Link>
        <Link href="/privacy" className="btn-ghost rounded-full px-5 py-3 font-semibold">
          Privacy Policy
        </Link>
        <Link href="/terms" className="btn-ghost rounded-full px-5 py-3 font-semibold">
          Terms of Service
        </Link>
      </div>
    </div>
  );
}
