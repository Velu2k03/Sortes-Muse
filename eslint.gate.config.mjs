// Gate-only ESLint config for the Sortes PR lint gate (scripts/lint-gate.sh).
// Inert unless passed via --config. Imports the repo config and adds the jsx-a11y components
// mapping (so motion.* elements are checked as their DOM tags) plus the 7
// explicit rules that `npm run lint` does not enable.
import repoConfig from "./eslint.config.mjs";

const gateConfig = [
  ...repoConfig,
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    settings: {
      "jsx-a11y": {
        components: {
          "motion.div": "div",
          "motion.section": "section",
          "motion.span": "span",
          "motion.ul": "ul",
          "motion.li": "li",
          "motion.output": "output",
        },
      },
    },
    rules: {
      "jsx-a11y/prefer-tag-over-role": "warn",
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "warn",
    },
  },
];

export default gateConfig;
