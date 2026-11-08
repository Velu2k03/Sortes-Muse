import AccountPage from "./AccountClient";

export const metadata = {
  title: "Account",
  description: "Your Sortes account: Oracle balance and purchase history.",
  // AF-012: the account page is private: canonical to itself (not
  // the homepage) and noindex, so it never shows up in search.
  alternates: { canonical: "/account" },
  robots: { index: false, follow: false },
};

export default function Account() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {/* AF-012: this header is server HTML, so the signed-out state
          is in the first paint instead of a bare "Loading your
          account…" from the client component below. */}
      <p className="text-center text-xs uppercase tracking-[0.35em] text-gold">
        Account
      </p>
      <h1 className="mt-3 text-center font-display text-5xl text-goldbright">
        Your account
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-cream/75">
        Your Oracles, journal, and purchase history live here. Sign in
        to sync them across devices.
      </p>
      <AccountPage />
    </div>
  );
}
