import AccountPage from "./AccountClient";
import { pageSocial } from "@/lib/seo";

const DESCRIPTION =
  "Your Sortes account: your Oracle balance, your purchase history, and your sign-in settings, in one place.";

export const metadata = {
  title: "Account",
  description: DESCRIPTION,
  // AF-072 + AF-012: a personal page. No index, and a self-canonical instead
  // of inheriting the homepage canonical from the layout.
  alternates: { canonical: "/account" },
  robots: { index: false, follow: true },
  // Batch 4d: its own OG/Twitter instead of the generic homepage block.
  ...pageSocial({
    title: "Account",
    description: DESCRIPTION,
    path: "/account",
  }),
};

export default function Account() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* UX audit Phase 2, F36: the H1 used to be server HTML here
          ("Your account"), but a signed-out visitor sees a sign-in
          wall, not their account. The H1 now lives in AccountClient,
          which knows the auth state: "Sign in" for guests, "Your
          account" once signed in. The loading skeleton covers the
          wait, so no wrong H1 ever paints. */}
      <AccountPage />
    </div>
  );
}
