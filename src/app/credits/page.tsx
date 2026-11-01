import { Suspense } from "react";
import CreditsPage from "./CreditsClient";
import Icon from "@/components/Icon";

export const metadata = {
  title: "Credits",
  description: "Top up your Sortes reading credits. 1 credit = 1 full reading.",
};

export default function Credits() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Lightsite fix V13: this header renders on the server, so
          the H1 is in the initial HTML. It used to live in the
          client component, which suspends on useSearchParams, so
          crawlers saw no H1 at all. */}
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.35em] text-gold"><Icon name="coin" size={18} />Credits</p>
        <h1 className="mt-3 font-display text-5xl text-goldbright sm:text-6xl">
          Your balance
        </h1>
      </div>
      <Suspense fallback={null}>
        <CreditsPage />
      </Suspense>
    </div>
  );
}
