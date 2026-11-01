import { redirect } from "next/navigation";

// Journal is the header label, /history is the route. Typed or shared
// /journal used to 404, so it redirects here instead of breaking.
// Per the Next.js docs in node_modules/next/dist/docs, redirect()
// throws NEXT_REDIRECT and terminates rendering of this segment.
export default function JournalRedirect() {
  redirect("/history");
}
