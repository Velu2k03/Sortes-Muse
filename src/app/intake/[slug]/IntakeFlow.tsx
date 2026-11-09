"use client";

import { AnimatePresence, motion } from "motion/react";
import ReadingWait from "@/components/ReadingWait";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useIntakeFlow } from "./useIntakeFlow";
import {
  CategoryStep,
  ConfirmStep,
  FormStep,
  ImpressionStep,
  StepDots,
} from "./IntakeSteps";

/**
 * F30 (2026-11-09): a thin shell. State and actions live in
 * useIntakeFlow.ts; each step's content is in IntakeSteps.tsx. The
 * AnimatePresence children (keyed motion.div wrappers) stay here so
 * the step transitions are unchanged.
 */
export default function IntakeFlow({ slug }: { slug: string }) {
  const f = useIntakeFlow(slug);
  const { spread, step, category, drawnCards, processingLine, processingComplete } = f;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      {/* Phase F: the flow sits under Readings, so the way back is visible. */}
      <Breadcrumbs
        trail={[
          { href: "/", label: "Home" },
          { href: "/spreads", label: "Spreads" },
          { label: spread.name },
        ]}
      />
      {/* The impression step is part of the reading phase in the dots. */}
      <StepDots step={step === "impression" ? "processing" : step} />

      <AnimatePresence mode="wait">
        {step === "category" && (
          <motion.div
            key="category"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="text-center"
          >
            <CategoryStep f={f} />
          </motion.div>
        )}

        {step === "form" && category && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <FormStep f={f} category={category} />
          </motion.div>
        )}

        {step === "confirm" && category && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="text-center"
          >
            <ConfirmStep f={f} category={category} />
          </motion.div>
        )}

        {step === "impression" && drawnCards && category && (
          <motion.div
            key="impression"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="text-center"
          >
            <ImpressionStep f={f} drawnCards={drawnCards} />
          </motion.div>
        )}

        {step === "processing" && (
          <div
            key="processing"
            className="flex min-h-[55vh] flex-col items-center justify-center text-center"
          >
            <ReadingWait
              activeStep={processingLine}
              complete={processingComplete}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
