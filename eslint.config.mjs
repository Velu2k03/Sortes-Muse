import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Astryx `theme build` artifacts (sortes.js/.css/.d.ts and kin):
    // generated, header says do not edit, and the emitted .d.ts
    // trips @typescript-eslint/triple-slash-reference. The authored
    // source (sortesTheme.ts, sortesTheme.doc.mjs) stays linted.
    "src/themes/sortes/sortes.*",
  ]),
]);

export default eslintConfig;
