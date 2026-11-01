import ChartsClient from "./ChartsClient";

export const metadata = {
  title: "Birth Charts",
  description: "Calculate a Ziwei, Western, or Vedic birth chart. Calculation is free and unsaved; interpretation is 1 credit, first chart per system free.",
};

export default function ChartsPage() {
  return <ChartsClient />;
}
