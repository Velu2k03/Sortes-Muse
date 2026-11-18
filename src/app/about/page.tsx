import Link from "next/link";
import { pageSocial } from "@/lib/seo";
import PageHeader from "@/components/PageHeader";

export const metadata = {
  title: "About",
  description:
    "Sortes by Resonant Atlas: a tarot reading app for reflection. Who runs it, what it offers, how your data is handled, and how to reach us by email.",
  alternates: { canonical: "/about" },
  ...pageSocial({ title: "About Sortes", description: "Sortes by Resonant Atlas: a tarot reading app for reflection. Who runs it, what it offers, how your data is handled, and how to reach us by email.", path: "/about" }),
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <PageHeader title="About Sortes" />
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-cream/85">
        <section>
          <h2 className="font-display text-3xl text-cream">Who runs Sortes</h2>
          <p className="mt-3">
            Sortes is run by Resonant Atlas. Founder: Velu Murugan. Contact: support@resonantatlas.com. Location: Philippines.
          </p>
        </section>
        <section>
          <h2 className="font-display text-3xl text-cream">Why I built it</h2>
          <p className="mt-3">
            A friend&apos;s tarot business gave me the idea. Their clients
            pick a category, tell their story, and the cards answer. I
            wanted the cards to speak to your story, not plain card
            meanings.
          </p>
        </section>
        <section>
          <h2 className="font-display text-3xl text-cream">What Sortes offers</h2>
          <p className="mt-3">
            A free daily card, all 78 card meanings, six spreads, a
            daily sun-sign reflection, and three birth chart systems.
          </p>
        </section>
        {/* UX audit Phase 2, F31: a "Reflection, not prediction"
            section used to sit here, repeating the disclaimer that
            the footer already carries ("Readings are for reflection
            and perspective, never guaranteed predictions. Nothing
            here replaces professional advice."). One disclaimer per
            page; the footer carries it. */}
        <section>
          <h2 className="font-display text-3xl text-cream">How your data is handled</h2>
          <p className="mt-3">
            As a guest, your cards, balance, and history live in your
            browser. Your story goes to the AI for one reading only.
            Full details in the Privacy Policy.
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
