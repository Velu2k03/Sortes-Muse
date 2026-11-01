"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// One place for reduced-motion handling: "user" makes every
// framer-motion animation in the app respect prefers-reduced-motion,
// instead of each page remembering to check useReducedMotion.
// CSS animations are already covered by the reduce rule in globals.css.
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
