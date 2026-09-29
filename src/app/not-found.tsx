import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-display text-8xl text-gold/40">✦</p>
      <h1 className="mt-6 font-display text-5xl text-goldbright">
        Lost in the stars
      </h1>
      <p className="mt-4 text-cream/75">
        The page you are looking for drifted out of the spread.
      </p>
      <Link
        href="/"
        className="btn-gold mt-8 rounded-xl px-8 py-3 font-bold"
      >
        Return home
      </Link>
    </div>
  );
}
