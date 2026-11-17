import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Sonner migration (2026-11-17): the hand-built SwipeToast is gone; one
// Sonner <Toaster> is mounted from the root layout and each of the four
// failure paths fires a toast with the same title and a Retry action.

const toastMock = vi.fn();
const successMock = vi.fn();
const dismissMock = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => toastMock(...a), {
    success: (...a: unknown[]) => successMock(...a),
    dismiss: (...a: unknown[]) => dismissMock(...a),
  }),
}));

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("Sonner toaster mount", () => {
  const toaster = () => src("src/components/SonnerToaster.tsx");

  it("is a client component mounted once from the root layout", () => {
    expect(toaster()).toMatch(/^['"]use client['"]/);
    const layout = src("src/app/layout.tsx");
    expect(layout).toContain("SonnerToaster");
    expect(layout.match(/<SonnerToaster/g)).toHaveLength(1);
  });

  it("uses the brand tokens, not raw hex", () => {
    const c = toaster();
    expect(c).toContain("var(--color-panel)");
    expect(c).toContain("var(--color-cream)");
    expect(c).toContain("var(--color-gold)");
    expect(c).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it("is bottom-right, 4000ms, close button on, richColors off", () => {
    const c = toaster();
    expect(c).toContain('position="bottom-right"');
    expect(c).toContain("duration={4000}");
    expect(c).toContain("closeButton");
    expect(c).not.toContain("richColors");
  });
});

describe("SwipeToast is gone", () => {
  it("the file is deleted and nothing imports it", () => {
    expect(existsSync(path.resolve(process.cwd(), "src/components/SwipeToast.tsx"))).toBe(false);
    for (const f of [
      "src/app/reading/[id]/ReadingSections.tsx",
      "src/app/reading/[id]/useReadingDetail.ts",
      "src/app/intake/[slug]/IntakeSteps.tsx",
      "src/app/intake/[slug]/useIntakeFlow.ts",
      "src/app/charts/ChartSections.tsx",
      "src/app/charts/useChartsClient.ts",
      "src/app/reports/ReportsClient.tsx",
    ]) {
      const c = src(f);
      expect(c, f).not.toContain("SwipeToast");
      expect(c, f).not.toMatch(/ToastOpen|setToastOpen/);
    }
  });
});

describe("showFailureToast", () => {
  beforeEach(() => {
    toastMock.mockClear();
    successMock.mockClear();
    dismissMock.mockClear();
  });

  it("fires the title with a Retry action that runs the retry call", async () => {
    const { showFailureToast } = await import("@/lib/failure-toast");
    const retry = vi.fn();
    showFailureToast("Report failed", retry);
    expect(toastMock).toHaveBeenCalledTimes(1);
    const [title, opts] = toastMock.mock.calls[0];
    expect(title).toBe("Report failed");
    expect(opts.action.label).toBe("Retry");
    opts.action.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("dismisses by the same id when a new attempt starts", async () => {
    const { showFailureToast, dismissFailureToast } = await import("@/lib/failure-toast");
    showFailureToast("Report failed", () => {});
    dismissFailureToast("Report failed");
    expect(dismissMock).toHaveBeenCalledWith(toastMock.mock.calls[0][1].id);
  });
});

describe("showSuccessToast", () => {
  beforeEach(() => {
    toastMock.mockClear();
    successMock.mockClear();
    dismissMock.mockClear();
  });

  // Sonner full use (2026-11-17): success toasts exist only where
  // success is otherwise silent (the two image exports). They use
  // toast.success with the title as id, the same dedupe rule as the
  // failure toast, and no richColors (the Toaster's brand styling).
  it("fires toast.success with the title as id", async () => {
    const { showSuccessToast } = await import("@/lib/failure-toast");
    showSuccessToast("Chart image saved");
    expect(successMock).toHaveBeenCalledTimes(1);
    const [title, opts] = successMock.mock.calls[0];
    expect(title).toBe("Chart image saved");
    expect(opts.id).toBe("Chart image saved");
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe("new toast paths (Sonner full use)", () => {
  // Checkout failure: PricingClient only set inline error text.
  it("Checkout failed: PricingClient fires a Retry toast and dismisses on a new attempt", () => {
    const c = src("src/components/PricingClient.tsx");
    expect(c).toContain('"Checkout failed"');
    expect(c).toContain("showFailureToast(");
    expect(c).toContain("dismissFailureToast(");
    expect(c).toContain("checkout(kind, key)");
  });

  // Chart image export: silent on success, swallowed on failure.
  it("Chart image saved / failed: useChartsClient toasts both outcomes", () => {
    const c = src("src/app/charts/useChartsClient.ts");
    expect(c).toContain('"Chart image saved"');
    expect(c).toContain('"Chart image failed"');
    expect(c).toContain("showSuccessToast(");
    expect(c).toContain("showFailureToast(");
    expect(c).toContain("onShareChart()");
  });

  // Story image export: silent on success, unhandled throw on failure.
  it("Story image saved / failed: ShareReading toasts both outcomes", () => {
    const c = src("src/components/ShareReading.tsx");
    expect(c).toContain('"Story image saved"');
    expect(c).toContain('"Story image failed"');
    expect(c).toContain("showSuccessToast(");
    expect(c).toContain("showFailureToast(");
    expect(c).toContain("void share()");
  });

  // Dismissing the native share sheet is not a failure: the inner
  // catch still swallows it, the download already happened.
  it("ShareReading still treats a dismissed share sheet as success", () => {
    const c = src("src/components/ShareReading.tsx");
    expect(c).toContain("user dismissed the share sheet; download already happened");
  });
});

describe("each failure path surfaces its title with a Retry action", () => {
  const cases: Array<[string, string, string]> = [
    ["src/app/reading/[id]/useReadingDetail.ts", "Follow-up failed", "askFollowUp"],
    ["src/app/intake/[slug]/useIntakeFlow.ts", "Reading failed", "retryGeneration"],
    ["src/app/charts/useChartsClient.ts", "Interpretation failed", "onInterpret"],
    ["src/app/reports/ReportsClient.tsx", "Report failed", "generate"],
  ];
  for (const [file, title, retryFn] of cases) {
    it(`${title}: ${path.basename(file)}`, () => {
      const c = src(file);
      expect(c).toContain(`"${title}"`);
      expect(c).toContain("showFailureToast(");
      expect(c).toContain("dismissFailureToast(");
      expect(c).toContain(retryFn);
    });
  }
});
