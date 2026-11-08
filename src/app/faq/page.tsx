import Link from "next/link";
import { pageSocial } from "@/lib/seo";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";
import FaqList from "@/components/FaqList";

export const metadata = {
  title: "Frequently asked questions",
  description:
    "Sortes answers: what is free, how Oracles work, whether readings are predictions, how birth data is handled, how sign-in works, and refunds.",
  alternates: { canonical: "/faq" },
  ...pageSocial({ title: "Frequently asked questions", description: "Sortes answers: what is free, how Oracles work, whether readings are predictions, how birth data is handled, how sign-in works, and refunds.", path: "/faq" }),
};

export const FAQS = [
  {
    q: "What is free in Sortes?",
    a: "The daily card is free every day, the deck browser with all 78 card meanings is free forever, chart calculation is free, and your first Quick Insight reading and your first chart interpretation per system are free. No account and no payment are needed for the free parts. These free parts are fixed in writing: they stay free, and if that ever changes, this page will say so first.",
  },
  {
    q: "How do Oracles work?",
    a: "One Oracle opens one full reading, any spread, or one chart interpretation after the first free one per system. Oracles never expire. Packs are sold on the Oracles page: 5 Oracles, 12 Oracles, and 30 Oracles. The daily card never uses an Oracle.",
  },
  {
    q: "What are the five Oracle rules?",
    bullets: [
      "Your first Quick Insight reading is free, once per device as a guest and once per account when signed in.",
      "A chart interpretation is free the first time per system, Ziwei, Western, and Vedic separately, then 1 Oracle each.",
      "Each report costs 1 Oracle.",
      "A reading follow-up is free the first time per reading, then 1 Oracle each, up to 3 per reading.",
      "The daily card is always free and never uses an Oracle.",
    ],
    a: "Oracles never expire, and there is no subscription.",
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
    a: "On the account page, choose Continue with Google to sign in with your Google account, or choose Email link to have a sign-in link sent to your email, then click the link in the email to sign in. Or choose Password to sign in with email and password. After you sign in, your guest Oracles and journal move into your account, and you stay signed in for 30 days.",
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
    q: "Can I get a refund?",
    a: "Unused Oracle packs may be refunded within 14 days of purchase. Readings that have already been delivered or used are non-refundable. See the Terms page for the full wording.",
  },
  {
    q: "How do I pay for Oracles?",
    a: "Oracle packs are paid through a secure checkout powered by Lemon Squeezy. Packs are 5 Oracles for $3.99, 12 for $7.99, and 30 for $14.99, one-time, with no subscription.",
  },
  {
    q: "What if a payment fails?",
    a: "If a payment fails, no Oracles are added to your balance. You can try again from the Oracles page. If you were charged and no Oracles appeared, email " + CONTACT_EMAIL + ".",
  },
  {
    q: "What does a reading include?",
    a: "Each reading is a written interpretation of your cards (or chart) around your question, about 300 to 600 words, shown on screen in under a minute and saved to your journal. It includes what stands out, the tension and opportunity, what you may be overlooking, one practical step, and one reflection question. A reading costs 1 Oracle, and your first Quick Insight is free. Your first follow-up question for each reading is free, then each follow-up costs 1 Oracle, up to 3 per reading.",
  },
  {
    q: "How do I delete my data?",
    a: "You can delete saved readings and journal entries yourself, and you can delete your account from the account page. To ask for deletion or an export by email, write to " + CONTACT_EMAIL + ".",
  },
  {
    q: "Who runs Sortes, and how do I contact you?",
    a: "Sortes is run by Resonant Atlas. Contact is by email, listed in the footer of every page.",
  },
  {
    q: "How much does a reading cost?",
    a: "Daily card free. First reading free. Then $0.50-$0.80 per reading. After that, a reading costs 1 Oracle. Packs are 5 Oracles for $3.99, 12 for $7.99, and 30 for $14.99, which works out to about $0.80, $0.67, and $0.50 per reading. Prices are in US dollars (USD). Oracles never expire, and there is no subscription.",
  },
  {
    q: "How do I pay?",
    a: "You can pay by card, PayPal, Apple Pay, or Google Pay through Lemon Squeezy secure checkout. Checkout shows the full amount, including any applicable taxes or fees, before you pay.",
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
              acceptedAnswer: {
                "@type": "Answer",
                text: f.bullets ? [...f.bullets, f.a].join("\n") : f.a,
              },
            })),
          }),
        }}
      />
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Help</p>
      <h1 className="mt-3 font-display text-5xl text-goldbright">
        Frequently asked questions
      </h1>
      <FaqList faqs={FAQS} />
      <p className="mt-10 text-sm text-mist">
        Still stuck? Contact {CONTACT_EMAIL}, or read the{" "}
        <Link href="/about" className="text-goldbright underline underline-offset-4">About {APP_NAME}</Link> page.
      </p>
    </div>
  );
}
