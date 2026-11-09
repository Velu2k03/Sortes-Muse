import type { Metadata } from "next";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Contact Sortes",
  description:
    "Contact Sortes by email for help with Oracles, readings, or your account. We aim to reply within two business days. Include a few details so we can help.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Sortes",
    description:
      "Contact Sortes by email for help with Oracles, readings, or your account. We aim to reply within two business days. Include a few details so we can help.",
    url: `${SITE_URL}/contact`,
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Sortes" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Sortes",
    description:
      "Contact Sortes by email for help with Oracles, readings, or your account. We aim to reply within two business days. Include a few details so we can help.",
    images: ["/og-image.jpg"],
  },
};

// AF-079: a real /contact page. Email only, no new backend, no form
// that promises a reply it cannot send. The reply-time note is an
// aim, not a guarantee.
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <PageHeader eyebrow="Contact" title="Contact Sortes" />
      <p className="mt-4 text-[15px] leading-relaxed text-cream/85">
        Email is the only way to reach us. Write to{" "}
        <a
          className="font-semibold text-goldbright underline underline-offset-4"
          href={`mailto:${CONTACT_EMAIL}`}
        >
          {CONTACT_EMAIL}
        </a>{" "}
        about Oracles, a reading, your account, or a refund. We aim to reply
        within two business days.
      </p>
      <section className="mt-10">
        <h2 className="font-display text-2xl text-goldbright">Before you write</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-cream/85">
          <li>
            Refunds: unused Oracle packs can be refunded within 14 days of
            purchase. See the Terms of Service for the full wording.
          </li>
          <li>
            Deleting your data: you can ask for export or deletion of your
            data at any time by emailing {CONTACT_EMAIL}.
          </li>
          <li>
            Include the email address on your account, so we can find it.
            Never send a password.
          </li>
        </ul>
      </section>
    </div>
  );
}
