import Link from "next/link";

export const metadata = {
  title: "Offline",
  description: "You appear to be offline.",
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-6xl text-gold">✦</p>
      <h1 className="mt-4 font-display text-4xl text-goldbright">
        The mists are thick
      </h1>
      <p className="mt-3 text-cream/75">
        You appear to be offline. Pages you have already visited — including
        your card images — are saved on this device and will work without a
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
