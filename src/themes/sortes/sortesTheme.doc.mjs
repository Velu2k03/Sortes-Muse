// The Astryx CLI statically parses this descriptor: it must be a
// static default-exported ThemeDoc object literal. A named const
// breaks `npx astryx theme list`, so the anonymous-default-export
// warning is disabled on the export line for that reason.
/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */
// eslint-disable-next-line import/no-anonymous-default-export -- CLI requires a static default-exported object literal
export default {
  type: "theme",
  name: "sortes",
  displayName: "Sortes",
  description: "Sortes navy+gold theme for the Astryx pricing-page pilot.",
  maintained: false,
};
