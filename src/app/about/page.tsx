import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "About Sortes",
  description:
    "Sortes by Resonant Atlas: a tarot reading app for reflection. Who runs it, what it offers, how it handles your data, and how to contact it.",
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
            {APP_NAME} is run by Resonant Atlas. It is a tarot reading web app,
            built as a product you use on your own, with no client work and no
            outreach behind it. Contact is {CONTACT_EMAIL}.
          </p>
        </section>
        <section>
          <h2 className="font-display text-3xl text-goldbright">What Sortes offers</h2>
          <p className="mt-3">
            A free daily card, a browser for all 78 Rider-Waite card meanings,
            three spreads (Quick Insight, Past Present Future, and the Celtic
            Cross), a daily sun-sign reflection, and three birth chart systems
            (Ziwei, Western, and Vedic). The first full reading and the first
            chart interpretation per system are free. Later readings and
            interpretations cost one credit each, in packs sold through Lemon
            Squeezy.
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
            Guest daily cards, credit balance, and reading history live in your
            browser until you create an account. Raw tarot intake data is
            deleted after 30 days. For charts, only calculated positions,
            signs, and palaces are stored, never raw birth date, time, or
            place, and raw birth data is never sent to an AI prompt. Full
            details are in the Privacy Policy.
          </p>
        </section>
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/guides" className="btn-gold">
          Read the guides
        </Link>
        <Link href="/privacy" className="btn-secondary">
          Privacy Policy
        </Link>
        <Link href="/terms" className="btn-secondary">
          Terms of Service
        </Link>
      </div>
    </div>
  );
}
