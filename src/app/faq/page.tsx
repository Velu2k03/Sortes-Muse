import Link from "next/link";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";
import FaqList from "@/components/FaqList";

export const metadata = {
  title: "Frequently asked questions",
  description:
    "Sortes answers: what is free, how Oracles work, whether readings are predictions, how birth data is handled, and how sign-in works.",
  alternates: { canonical: "/faq" },
};

const FAQS = [
  {
    q: "What is free in Sortes?",
    a: "The daily card is free every day, the deck browser with all 78 card meanings is free forever, chart calculation is free, and your first Quick Insight reading and your first chart interpretation per system are free. No account and no payment are needed for the free parts.",
  },
  {
    q: "How do Oracles work?",
    a: "One Oracle opens one full reading, any spread, or one chart interpretation after the first free one per system. Oracles never expire. Packs are sold on the Oracles page: 5 Oracles, 12 Oracles, and 30 Oracles. The daily card never uses an Oracle.",
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
    a: "Your story goes to the AI for this reading only and is not saved. Your question, first name, and category are saved in your journal: on this device as a guest, in your account when signed in, until you delete them.",
  },
  {
    q: "How do I sign in?",
    a: "On the account page, use the email code tab. In production, Sortes sends an 8 digit code through Supabase, or a magic link you can click instead. After you sign in, your guest Oracles and journal move into your account, and you stay signed in for 30 days.",
  },
  {
    q: "What if I bought Oracles with a different email?",
    a: "Sign in with that email and the Oracles merge into that account. If you signed in with a different email by mistake, sign out and sign in again with the email you used at checkout.",
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
      <FaqList faqs={FAQS} />
      <p className="mt-10 text-sm text-mist">
        Still stuck? Contact {CONTACT_EMAIL}, or read the{" "}
        <Link href="/about" className="text-goldbright underline underline-offset-4">About {APP_NAME}</Link> page.
      </p>
    </div>
  );
}
