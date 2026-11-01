import { redirect } from "next/navigation";

// Navigation label is "Readings", route is /spreads. Typed /readings
// used to 404, so it redirects here instead of breaking.
export default function ReadingsRedirect() {
  redirect("/spreads");
}
