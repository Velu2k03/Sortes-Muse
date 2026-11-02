import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, getGuide } from "@/lib/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return { title: guide.title, description: guide.description };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/guides" className="text-sm font-semibold text-goldbright underline underline-offset-4">
        All guides
      </Link>
      <h1 className="mt-4 font-display text-5xl text-goldbright">{guide.title}</h1>
      <p className="mt-4 max-w-xl text-cream/75">{guide.description}</p>
      <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-cream/85">
        {guide.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-3xl text-goldbright">{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-3">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm text-mist">
        Readings in Sortes are for reflection and perspective only. They are
        never guaranteed predictions, and they never replace professional
        advice.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/spreads" className="btn-gold">
          Get a reading
        </Link>
        <Link href="/guides" className="btn-secondary">
          More guides
        </Link>
      </div>
    </div>
  );
}
