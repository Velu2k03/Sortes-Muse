import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Frequently asked questions",
  description:
    "Sortes answers: what is free, how credits work, whether readings are predictions, how birth data is handled, and how sign-in works.",
};

const FAQS = [
  {
    q: "What is free in Sortes?",
    a: "The daily card is free every day, the deck browser with all 78 card meanings is free forever, chart calculation is free, and your first Quick Insight reading and your first chart interpretation per system are free. No account and no payment are needed for the free parts.",
  },
  {
    q: "How do credits work?",
    a: "One credit buys one full reading, any spread, or one chart interpretation after the first free one per system. Credits never expire. Packs are sold on the credits page: 5 readings, 12 readings, and 30 readings. The daily card never uses a credit.",
  },
  {
    q: "Are readings predictions?",
    a: "No. Readings and chart interpretations in Sortes are for reflection and perspective only. They are never guaranteed predictions, and they never replace professional advice about health, money, or legal matters.",
  },
  {
    q: "How is my birth data handled for charts?",
    a: "Sortes calculates positions and stores only those positions, signs, and palaces. It does not store your raw birth date, time, or place in the database, and it never sends raw birth data to an AI prompt. The AI interpretation receives only positions, signs, houses, and stars, plus your question or focus.",
  },
  {
    q: "How long is tarot intake data kept?",
    a: "Raw tarot intake data is deleted after 30 days. Guest daily cards, credit balance, and reading history live in your browser until you create an account, and then they move into your account automatically.",
  },
  {
    q: "How do I sign in?",
    a: "On the account page, use the email code tab. In production, Sortes sends an 8 digit code through Supabase, or a magic link you can click instead. After you sign in, your guest credits and journal move into your account, and you stay signed in for 30 days.",
  },
  {
    q: "What if I bought credits with a different email?",
    a: "Sign in with that email and the credits merge into that account. If you signed in with a different email by mistake, sign out and sign in again with the email you used at checkout.",
  },
  {
    q: "What is the difference between a tarot spread and a birth chart?",
    a: "A tarot spread answers a specific question in the moment, with cards drawn for that situation. A birth chart maps a birth moment, with planets in signs and houses, or stars in palaces, and it does not change with your question. The guides page explains both in more detail.",
  },
  {
    q: "Who runs Sortes, and how do I contact you?",
    a: "Sortes is run by Resonant Atlas. Contact is by email, listed in the footer of every page.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Help</p>
      <h1 className="mt-3 font-display text-5xl text-goldbright">
        Frequently asked questions
      </h1>
      <p className="mt-4 max-w-xl text-cream/75">
        Short answers to the questions Sortes users actually ask. For more
        detail, read the guides, the privacy policy, and the terms.
      </p>
      <div className="mt-10 space-y-4">
        {FAQS.map((f) => (
          <details key={f.q} className="rounded-3xl border border-gold/25 bg-panel/70 p-6">
            <summary className="cursor-pointer font-display text-2xl text-goldbright">{f.q}</summary>
            <p className="mt-3 leading-relaxed text-cream/85">{f.a}</p>
          </details>
        ))}
      </div>
      <p className="mt-10 text-sm text-mist">
        Still stuck? Contact {CONTACT_EMAIL}, listed in the footer, or read the{" "}
        <Link href="/about" className="text-goldbright underline underline-offset-4">About {APP_NAME}</Link> page.
      </p>
    </div>
  );
}
