export const SITE_URL = "https://sortes.resonantatlas.com";
export const APP_NAME = "Sortes by Resonant Atlas";
export const APP_SHORT = "Sortes";
export const TAGLINE = "Cast the lots. Read your story.";
export const CONTACT_EMAIL = "support@resonantatlas.com";

export interface CreditPack {
  id: string;
  name: string;
  readings: number;
  price: number;
  popular?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "pack-5", name: "First Light", readings: 5, price: 3.99 },
  { id: "pack-12", name: "Constellation", readings: 12, price: 7.99, popular: true },
  { id: "pack-30", name: "Celestial Treasury", readings: 30, price: 14.99 },
];

export function perReadingPrice(pack: CreditPack): string {
  return (pack.price / pack.readings).toFixed(2);
}
