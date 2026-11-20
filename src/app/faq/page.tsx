import Link from "next/link";
import { pageSocial } from "@/lib/seo";
import { APP_NAME, CONTACT_EMAIL } from "@/lib/site";
import FaqList, { type FaqItem } from "@/components/FaqList";
import PageHeader from "@/components/PageHeader";
import { READING_CREDIT_COSTS, creditsLabel } from "@/lib/subscription-tiers";

export const metadata = {
  title: "Frequently asked questions",
  description:
    "Sortes answers: what is free, how credits work, whether readings are predictions, how birth data is handled, how sign-in works, and refunds.",
  alternates: { canonical: "/faq" },
  ...pageSocial({ title: "Frequently asked questions", description: "Sortes answers: what is free, how credits work, whether readings are predictions, how birth data is handled, how sign-in works, and refunds.", path: "/faq" }),
};

const credits = creditsLabel;

export const FAQS: FaqItem[] = [
  {
    group: "Pricing and credits",
    q: "What is free in Sortes?",
    a: "The daily card, the deck browser, and chart calculation are free, no account needed. Your first Quick Insight reading and your first chart interpretation per system are free too, but chart interpretations need you to sign in.",
  },
  {
    group: "Pricing and credits",
    q: "How do credits work?",
    a: `Readings, chart interpretations, reports, and follow-up questions are paid in credits. A one-card reading is ${credits(READING_CREDIT_COSTS.oneCard)} and a three-card reading is ${credits(READING_CREDIT_COSTS.threeCard)}. Purchased credits never expire; top-ups are 1,000 for $9.99 or 3,000 for $24.99. Subscriptions add credits every month.`,
  },
  {
    group: "Pricing and credits",
    q: "What does each reading cost?",
    table: [
      { item: "Quick Insight (1 card)", cost: credits(READING_CREDIT_COSTS.oneCard), note: "Your first one is free, once per device as a guest and once per account" },
      { item: "Three-card spread", cost: credits(READING_CREDIT_COSTS.threeCard) },
      { item: "Celtic Cross (10 cards)", cost: credits(READING_CREDIT_COSTS.chart) },
      { item: "Chart interpretation", cost: credits(READING_CREDIT_COSTS.chart), note: "First one free per system: Ziwei, Western, and Vedic" },
      { item: "Report", cost: credits(READING_CREDIT_COSTS.report) },
      { item: "Follow-up question", cost: credits(READING_CREDIT_COSTS.followUp), note: "First one free per reading, up to 3 per reading" },
      { item: "Daily card", cost: "Free", note: "Always free, never uses credits" },
    ],
  },
  {
    group: "Readings and Charts",
    q: "Are readings predictions?",
    a: "No. Readings are for reflection and perspective only, never guaranteed predictions, and never a replacement for professional advice.",
  },
  {
    group: "Privacy and Data",
    q: "How is my birth data handled for charts?",
    a: "Sortes stores only calculated positions, signs, and palaces, never your raw birth date, time, or place, and never sends raw birth data to an AI prompt.",
  },
  {
    group: "Privacy and Data",
    q: "How long is tarot intake data kept?",
    a: "Your story goes to the AI for this reading only and is not saved. Your question, first name, and category are saved in your journal until you delete them.",
  },
  {
    group: "Account",
    q: "How do I sign in?",
    a: "On the account page, choose Continue with Google, Email link, or Password. After you sign in, your guest credits and journal move into your account.",
  },
  {
    group: "Pricing and credits",
    q: "What if I bought credits with a different email?",
    a: "Sign in with that email and the credits merge in. If you used a different email by mistake, sign out and sign in again with the checkout email.",
  },
  {
    group: "Readings and Charts",
    q: "What is the difference between a tarot spread and a birth chart?",
    a: "A spread answers one question in the moment. A birth chart maps a birth moment, and does not change with your question.",
  },
  {
    group: "Pricing and credits",
    q: "Can I get a refund?",
    a: "Unused top-ups may be refunded within 14 days of purchase. Readings already delivered are non-refundable.",
  },
  {
    group: "Pricing and credits",
    q: "How do I pay for credits?",
    a: "Top-ups are paid through a secure checkout powered by Lemon Squeezy, by card, PayPal, Apple Pay, or Google Pay. Checkout shows the full amount, including taxes and fees, before you pay.",
  },
  {
    group: "Pricing and credits",
    q: "What if a payment fails?",
    a: "If a payment fails, no credits are added. Try again from the Credits page. If you were charged and no credits appeared, email " + CONTACT_EMAIL + ".",
  },
  {
    group: "Readings and Charts",
    q: "What does a reading include?",
    a: "A written interpretation of your cards or chart around your question, 300 to 600 words, on screen in up to about 3 minutes and saved to your journal. It names what stands out, the tension, what you may be overlooking, one practical step, and one reflection question.",
  },
  {
    group: "Privacy and Data",
    q: "How do I delete my data?",
    a: "Delete saved readings and journal entries yourself, and your account from the account page. For export or deletion by email, write to " + CONTACT_EMAIL + ".",
  },
  {
    group: "Pricing and credits",
    q: "How much does a reading cost?",
    a: `Daily card free. First reading free. After that, ${credits(READING_CREDIT_COSTS.oneCard)} for one card, ${credits(READING_CREDIT_COSTS.threeCard)} for three cards. Top-ups are 1,000 credits for $9.99 or 3,000 for $24.99, in US dollars. Purchased credits never expire.`,
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
                text: f.table
                  ? f.table.map((r) => `${r.item}: ${r.cost}${r.note ? ` (${r.note})` : ""}`).join("\n")
                  : f.bullets
                    ? [...f.bullets, ...(f.a ? [f.a] : [])].join("\n")
                    : (f.a ?? ""),
              },
            })),
          }),
        }}
      />
      <PageHeader eyebrow="Help" title="Frequently asked questions" />
      <FaqList faqs={FAQS} />
      <p className="mt-10 text-sm text-mist">
        Still stuck? Contact {CONTACT_EMAIL}, or read the{" "}
        <Link href="/about" className="text-goldbright underline underline-offset-4">About {APP_NAME}</Link> page.
      </p>
    </div>
  );
}
