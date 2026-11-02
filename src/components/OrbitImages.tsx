import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { getCard } from "@/lib/cards";
import "./OrbitImages.css";

const ORBIT_CARD_IDS = [
  "major-00",
  "major-01",
  "major-02",
  "major-18",
  "major-19",
  "major-17",
];
const ORBIT_CARDS = ORBIT_CARD_IDS.map(getCard);

export default function OrbitImages() {
  return (
    <section className="border-y border-gold/10 bg-navydeep/40 py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="font-display text-4xl text-goldbright sm:text-5xl">
            Explore the deck
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-cream/75">
            Meet a few of the cards and explore the stories held in the deck.
          </p>
        </div>

        <div
          className="orbit-gallery mt-8"
          role="group"
          aria-label="Explore six Major Arcana cards"
        >
          {ORBIT_CARDS.map((card, index) => (
            <div
              key={card.id}
              className="orbit-gallery__track"
              style={{ "--orbit-angle": `${index * 60}deg` } as CSSProperties}
            >
              <Link
                href={`/deck?card=${encodeURIComponent(card.id)}`}
                className="orbit-gallery__link"
                aria-label={`Explore ${card.name} in the deck`}
              >
                <span className="orbit-gallery__image">
                  <Image
                    src={card.image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 18vw, 104px"
                    className="object-cover"
                  />
                </span>
              </Link>
            </div>
          ))}
          <div className="orbit-gallery__centre" aria-hidden="true">
            <Image
              src="/orbit-centre-moon-400.jpg"
              alt=""
              fill
              sizes="(max-width: 640px) 36vw, 144px"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
