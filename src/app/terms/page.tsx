import { APP_SHORT, CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Terms of Service",
  description: `The terms governing your use of ${APP_SHORT}.`,
};

const UPDATED = "September 29, 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Legal</p>
      <h1 className="mt-3 font-display text-5xl text-goldbright">Terms of Service</h1>
      <p className="mt-2 text-sm text-mist">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-cream/85">
        <section>
          <h2 className="font-display text-2xl text-goldbright">1. The service</h2>
          <p className="mt-2">
            {APP_SHORT} provides digital tarot readings, card meaning
            reference, and personalized AI-generated interpretations, sold
            pay-per-reading via credit packs. There are no subscriptions.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-goldbright">2. Readings are for reflection only</h2>
          <p className="mt-2">
            All readings, including AI-personalized interpretations, are
            provided for <strong>reflection, perspective, and entertainment
            only. They are never guaranteed predictions</strong> of future
            events. Decisions about your life, relationships, career,
            finances, studies, or health remain entirely your own
            responsibility.
          </p>
          <p className="mt-2">
            <strong>Health readings never diagnose, treat, or predict medical
            outcomes</strong> and are general wellness reflection only. They
            cannot replace a licensed professional. Nothing in this service
            constitutes legal, financial, or medical advice.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-goldbright">3. Credits and payments</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>1 credit unlocks 1 full reading of any spread.</li>
            <li>Credits never expire and are non-transferable.</li>
            <li>
              Payments are processed securely by Lemon Squeezy. We never see
              or store your card details.
            </li>
            <li>
              Refunds: unused credit packs may be refunded within 14 days of
              purchase by emailing {CONTACT_EMAIL}. Credits already spent on
              readings are non-refundable.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl text-goldbright">4. Acceptable use</h2>
          <p className="mt-2">
            You agree not to misuse the service, attempt to disrupt it, or use
            readings to harass, deceive, or harm others. You must be at least
            13 years old to use {APP_SHORT}.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-goldbright">5. Intellectual property</h2>
          <p className="mt-2">
            Card imagery uses the public-domain Rider-Waite deck (1909).
            Card meanings, interpretations, artwork, and site design are the
            property of Resonant Atlas. You may share your personal readings
            as images; you may not resell or republish our content wholesale.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-goldbright">6. Limitation of liability</h2>
          <p className="mt-2">
            To the maximum extent permitted by law, Resonant Atlas is not
            liable for decisions you make based on readings, or for any
            indirect or consequential damages arising from use of the service.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl text-goldbright">7. Changes and contact</h2>
          <p className="mt-2">
            We may update these terms; continued use after changes means you
            accept them. Contact:{" "}
            <a className="text-goldbright underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
