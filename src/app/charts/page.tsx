import ChartsClient from "./ChartsClient";

export const metadata = {
  title: "Birth Charts",
  description: "Calculate a Ziwei or Western birth chart. Calculation only, no interpretation, no credit charge.",
};

export default function ChartsPage() {
  return <ChartsClient />;
}
