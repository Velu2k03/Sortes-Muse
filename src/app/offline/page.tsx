import Link from "next/link";
import { pageSocial } from "@/lib/seo";

const DESCRIPTION =
  "You appear to be offline. Check your connection and try again; your saved readings stay on this device until you are back.";

export const metadata = {
  title: "Offline",
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  // Batch 4d: its own OG/Twitter instead of the generic homepage block.
  ...pageSocial({
    title: "Offline",
    description: DESCRIPTION,
    path: "/offline",
  }),
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl text-gold">✦</p>
      <h1 className="mt-4 font-display text-4xl text-goldbright">
        The mists are thick
      </h1>
      <p className="mt-3 text-cream/75">
        You appear to be offline. Pages you have already visited, including
        your card images, are saved on this device and will work without a
        connection.
      </p>
      <Link
        href="/"
        className="btn-gold mt-8 rounded-xl px-8 py-3 font-bold"
      >
        Try again
      </Link>
    </div>
  );
}
