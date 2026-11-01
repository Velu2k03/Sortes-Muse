import { redirect } from "next/navigation";

// Footer label is "Card Meanings", route is /deck. Typed
// /card-meanings used to 404, so it redirects here instead of breaking.
export default function CardMeaningsRedirect() {
  redirect("/deck");
}
