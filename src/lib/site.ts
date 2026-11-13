export const SITE_URL = "https://sortes.resonantatlas.com";
export const APP_NAME = "Sortes by Resonant Atlas";
export const APP_SHORT = "Sortes";
export const TAGLINE = "Cast the lots. Read your story.";
// Title-tag fix (Velu, 2026-11-14, Fable's suggestion): the <title>
// must say "tarot" — the old default ("Sortes by Resonant Atlas |
// Cast the lots. Read your story.") had no "tarot" in it, so the
// title, H1 and hero all lacked the word. TAGLINE stays the
// footer/share brand line; it is NOT the title any more.
export const TITLE_DEFAULT = "Sortes | AI Tarot Reading Online";
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

// UI pack ids (pack-5, pack-12, pack-30) vs the checkout API ids
// (pack5, pack12, pack30). The modal used to pass the UI id straight
// to the API, which only accepts the API ids, so a real checkout
// always failed with "Invalid pack." Map in one place, use it in
// both the direct credits checkout and the modal.
export function apiPackId(uiPackId: string): string {
  const map: Record<string, string> = {
    "pack-5": "pack5",
    "pack-12": "pack12",
    "pack-30": "pack30",
  };
  return map[uiPackId] ?? uiPackId;
}
