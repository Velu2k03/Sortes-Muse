import { createHash } from "node:crypto";

/** Deterministic v4-shaped UUID per label, so tests keep readable ids. */
export function tu(label: string): string {
  const h = createHash("sha1").update(label).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
