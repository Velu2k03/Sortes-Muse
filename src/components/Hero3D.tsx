"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import type { Group, Mesh, MeshBasicMaterial } from "three";

/**
 * Phase 2 3D hero (Velu's choice 5): a fan of three real tarot
 * cards, slowly rotating and floating, with a gold moon behind.
 * Calm and slow (choice 6): the fan sways gently, never spins.
 * Full 3D on desktop, lighter on phones (choice 7): pixel ratio
 * is capped and the scene has no particles.
 *
 * The hero question box stays first and usable before this loads:
 * this component is lazy-loaded (ssr: false) with the static fan
 * as its loading fallback, and reduced-motion users never get the
 * 3D scene at all (see HeroScene).
 */

const FAN_CARDS = [
  { src: "/cards/major-00-fool.jpg", name: "The Fool", x: -1.25, y: -0.12, z: 0, rz: 0.3 },
  { src: "/cards/major-01-magician.jpg", name: "The Magician", x: 0, y: 0.05, z: 0.4, rz: 0 },
  { src: "/cards/major-02-high-priestess.jpg", name: "The High Priestess", x: 1.25, y: -0.12, z: 0, rz: -0.3 },
] as const;

const CARD_W = 1.2;
const CARD_H = 1.8;

function FanCard({ src, x, y, z, rz }: (typeof FAN_CARDS)[number]) {
  const texture = useTexture(src);
  return (
    <group position={[x, y, z]} rotation={[0, 0, rz]}>
      {/* Polished gold border: a slightly larger gold plane behind the card. */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[CARD_W + 0.08, CARD_H + 0.08]} />
        <meshBasicMaterial color="#b9975b" />
      </mesh>
      <mesh>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </group>
  );
}

function Moon() {
  const glowRef = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const mat = glowRef.current?.material as MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 0.18 + Math.sin(t * 0.3) * 0.05;
  });
  return (
    <group position={[0, 0.35, -1.2]}>
      {/* Soft glow halo behind the disc. */}
      <mesh ref={glowRef} position={[0, 0, -0.1]}>
        <circleGeometry args={[2.1, 64]} />
        <meshBasicMaterial color="#b9975b" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {/* The gold moon disc. */}
      <mesh>
        <circleGeometry args={[1.5, 64]} />
        <meshBasicMaterial color="#b9975b" />
      </mesh>
    </group>
  );
}

function Fan() {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!group.current) return;
    // Slow sway and gentle float. Calm, never a spin.
    group.current.rotation.y = Math.sin(t * 0.22) * 0.16;
    group.current.position.y = Math.sin(t * 0.45) * 0.07;
  });
  return (
    <group ref={group}>
      <Moon />
      {FAN_CARDS.map((card) => (
        <FanCard key={card.src} {...card} />
      ))}
    </group>
  );
}

export default function Hero3D() {
  return (
    <div
      className="relative mx-auto h-[320px] w-full max-w-3xl sm:h-[420px]"
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 6.5], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <Fan />
        </Suspense>
      </Canvas>
    </div>
  );
}
