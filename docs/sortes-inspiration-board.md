# Sortes Inspiration Board

Local docs file. Design intent only, not a build plan. Sources read first: STYLE.md,
docs/vercel-web-interface-guidelines.md, and the palette in src/app/globals.css.
We take patterns, we do not copy pages.

## 1. The five references

1. Stripe pricing
   Takes: clear price hierarchy (big number, small unit, one line of what you get),
   equal-sized plan cards with aligned content, one highlighted plan.
   Does NOT copy: Stripe's feature comparison tables, enterprise "contact sales"
   rows, or its gradient look. Sortes pricing is fixed (Spark $9.99 for 1,000
   Oracles a month, Star $19.99 for 2,500, Moon $39.99 for 6,000, Star
   highlighted; top-ups 1,000 for $9.99 and 3,000 for $24.99, never expire;
   packs retired 2026-11-16), so there is no pack grid.

2. Linear
   Takes: calm dark UI, tight type scale, restrained use of one accent (gold plays
   the role of Linear's accent), quiet motion.
   Does NOT copy: dense app chrome, keyboard-first command menus, or the cool
   grey/purple palette. Sortes is a ritual, not a work tool.

3. Vercel
   Takes: the Web Interface Guidelines we keep locally (visible focus states,
   prefers-reduced-motion, animate transform/opacity only, curly quotes and
   ellipsis, safe areas, color-scheme and theme-color matching the page), plus
   generous spacing and plain hierarchy.
   Does NOT copy: the black-and-white look, geometric sans type, or developer
   copy tone.

4. shadcn/ui
   Takes: component pattern. Composable primitives (button, card, dialog, input)
   with tokens driving colour, so cards and buttons share one radius, padding and
   border rule.
   Does NOT copy: default neutral grey theme or default fonts. Everything is
   re-tokenised to the Sortes palette.

5. Apple Human Interface Guidelines
   Takes: responsive behaviour and touch rules (44pt-ish tap targets, safe-area
   insets, one primary action per screen, clear back/escape paths), and respect
   for reduced motion and contrast (AA).
   Does NOT copy: iOS visual chrome, system fonts, or glass/blur surfaces.

## 2. Breaking the center on the current layout

Design intent for the CURRENT homepage layout, summarised from the five videos.
This is not a Figma build (Velu skipped Figma Option B on 2026-11-17).

- Do not run everything straight down the center. A single centered column reads
  as a template.
- Break out with an asymmetric or bento-style layout: mixed block sizes, one
  dominant block and smaller supporting blocks.
- One focal point per screen. Each viewport has one thing the eye lands on first.
- Left-align the editorial sections (explainer copy, how-it-works, FAQ) where the
  page currently centers everything. Keep centering only for the hero and
  short single-line moments.
- Move the question box lower, after the focal moment, instead of leading with it.
- Put one large card centre stage with a huge gold moon behind it as the
  signature focal point.

Constraint: this changes layout intent only. Copy stays Voice C Quiet and pricing
is untouched.

## 3. Locked Sortes facts

Palette:
- navy #141b2e
- gold #d4af37
- cream #ede6d6
- ink #0a0e1a
- navydeep #0f1424
- panel #1a1f2e
- goldbright #f4d03f
- dark gold #7c5e00 (gold text on cream in light mode, about 4.9:1)
- mist #9ca3af

Note: in the light theme, globals.css remaps ink, navy, navydeep and panel to
cream-side values. The hex list above is the dark-theme base.

Fonts: Cormorant Garamond for headlines, Manrope for body. No Inter.

Voice: Voice C Quiet.

Hero: "Ask one honest question. Draw one clear card."
