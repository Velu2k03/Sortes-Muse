import AccountPage from "./AccountClient";

export const metadata = {
  title: "Account",
  description: "Your Sortes account: Oracle balance and purchase history.",
  // AF-072: a personal page. No index, and a self-canonical instead
  // of inheriting the homepage canonical from the layout.
  alternates: { canonical: "/account" },
  robots: { index: false, follow: true },
};

export default function Account() {
  return <AccountPage />;
}
