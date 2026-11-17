import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// All-pages fix 4 (Top 10 fix 4): URL state sync. The audit found
// only /deck and /oracles synced state to the URL; the pricing
// toggle, /spreads selection, /charts system, /horoscope sign,
// /reports type, and /spreads/[slug] step were all useState-only.
// The pattern is the one /deck already uses and this repo proved
// in production: the server page reads searchParams, validates the
// value, and passes it in as an initial prop (SSR-correct first
// paint, no hydration mismatch); the client writes the param back
// on change and reads it back in an effect so Back/forward
// restores the state. Defaults are omitted, so the URL stays clean.
// Most pages write with router.replace (replace, not push, so Back
// leaves the page instead of stepping through states). Two pages
// are exceptions and use window.history.replaceState instead: the
// pricing toggle and /horoscope. A router navigation would
// re-render the page mid-interaction there (the pricing pill
// flickered, the horoscope client remounts on key={sign}), so
// replaceState writes the URL with no navigation and no re-render;
// Back/forward still navigates, so the effect still corrects the
// state then. /oracles is untouched: it already syncs
// (purchase=success), and its checkout return must keep working
// exactly as it does.
//
// Deliberately NOT synced, with reasons (audit: "sync ... or
// document why not"):
// - /spreads/[slug] has no step state to sync: it is a gate screen
//   only (ReadingFlow renders GateScreen and routes into
//   /intake/[slug]). The multi-step flow lives in /intake/[slug]
//   (useIntakeFlow: category -> form -> confirm -> impression ->
//   processing), and its step is derived from the answers given so
//   far: a deep link to ?step=confirm with no category, question,
//   or drawn cards would land on an invalid state, and nothing is
//   spent until generation, so a refresh safely restarts at the
//   category step.
// - /horoscope date and reveal state: the date is a transient
//   picker value that resets the reveal, and a shared link should
//   open today's reflection for the shared sign, not someone's
//   picked date.
// - /charts birth form, /reports birth form, /spreads free/Oracle
//   gating: form inputs and auth/balance state, not view state;
//   syncing them would put personal data and spend-adjacent state
//   in a shareable URL.

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("url-state-sync: pricing toggle (?billing=annual)", () => {
  const page = () => src("src/app/pricing/page.tsx");
  const client = () => src("src/components/PricingClient.tsx");
  it("server page reads ?billing= and passes Annual only for annual", () => {
    expect(page()).toContain('searchParams');
    expect(page()).toContain('raw === "annual"');
    expect(page()).toContain("initialBilling={initialBilling}");
  });
  it("client initialises billing from the prop, not hardcoded monthly", () => {
    expect(client()).toContain("initialBilling?: Billing");
    expect(client()).toContain("useState<Billing>(initialBilling)");
  });
  it("toggling writes ?billing=annual and omits the param for Monthly", () => {
    // PR #152 fix: syncBilling uses window.history.replaceState,
    // NOT router.replace. A router navigation re-rendered the page
    // mid-toggle and the searchParams effect read the stale param
    // and flipped billing back to Monthly, so the pill flickered
    // instead of sliding. replaceState writes the URL with no
    // navigation; Back/forward still navigates, so the effect
    // below still corrects billing then.
    expect(client()).toContain('"?billing=annual"');
    expect(client()).toContain("window.history.replaceState");
    expect(client()).not.toContain("router.replace(");
    expect(client()).toContain('onClick={() => syncBilling("monthly")}');
    expect(client()).toContain('onClick={() => syncBilling("annual")}');
  });
  it("back/forward reads the param back into state", () => {
    expect(client()).toContain('searchParams.get("billing")');
    expect(client()).toContain('if (next !== billing) queueMicrotask(() => setBilling(next))');
  });
});

describe("url-state-sync: /spreads pick (?spread=<slug>)", () => {
  const page = () => src("src/app/spreads/page.tsx");
  const client = () => src("src/app/spreads/SpreadsClient.tsx");
  it("server page validates the slug against SPREADS and passes it in", () => {
    expect(page()).toContain("SPREADS.some((s) => s.slug === raw)");
    expect(page()).toContain("initialPickedSlug={initialPickedSlug}");
  });
  it("client initialises the pick from the prop", () => {
    expect(client()).toContain("initialPickedSlug?: string | null");
    expect(client()).toContain("useState<string | null>(initialPickedSlug)");
  });
  it("picking writes ?spread=<slug> with replace and still scrolls to the card", () => {
    expect(client()).toContain("`/spreads?spread=${slug}`");
    expect(client()).toContain("router.replace(");
    expect(client()).toContain("scrollIntoView");
  });
  it("back/forward reads the param back, with no scroll on restore", () => {
    expect(client()).toContain('searchParams.get("spread")');
    expect(client()).toContain("if (next !== pickedSlug) queueMicrotask(() => setPickedSlug(next))");
  });
});

describe("url-state-sync: /charts system (?system=vedic|ziwei)", () => {
  const page = () => src("src/app/charts/page.tsx");
  const hook = () => src("src/app/charts/useChartsClient.ts");
  const shell = () => src("src/app/charts/ChartsClient.tsx");
  it("server page validates the system and passes it through the shell", () => {
    expect(page()).toContain('raw === "vedic" || raw === "ziwei"');
    expect(page()).toContain("initialSystem={initialSystem}");
    expect(shell()).toContain("initialSystem?: ChartSystem");
    expect(shell()).toContain("useChartSession(form, prefs, initialSystem)");
  });
  it("session initialises the system from the prop, not hardcoded western", () => {
    expect(hook()).toContain("initialSystem: ChartSystem = \"western\"");
    expect(hook()).toContain("useState<ChartSystem>(initialSystem)");
  });
  it("selecting writes ?system= and omits the param for Western", () => {
    expect(hook()).toContain("`/charts?system=${s}`");
    expect(hook()).toContain("router.replace(");
    expect(hook()).toContain("const selectSystem = (s: ChartSystem) => {");
  });
  it("back/forward restores the system without scrolling or rewriting the URL", () => {
    expect(hook()).toContain('searchParams.get("system")');
    expect(hook()).toContain("if (next !== system) queueMicrotask(() => applySystem(next, false))");
    expect(hook()).toContain("const applySystem = (s: ChartSystem, scroll: boolean) => {");
  });
});

describe("url-state-sync: /horoscope sign and view (?sign=, ?view=weekly)", () => {
  const page = () => src("src/app/horoscope/page.tsx");
  const client = () => src("src/app/horoscope/HoroscopeClient.tsx");
  it("server page already read ?sign= and now also reads ?view=", () => {
    expect(page()).toContain('isSunSign(q) ? q : "Aries"');
    expect(page()).toContain('v === "weekly" ? "weekly" : "daily"');
    expect(page()).toContain("initialView={view}");
  });
  it("client initialises the view from the prop", () => {
    expect(client()).toContain("initialView?: \"daily\" | \"weekly\"");
    expect(client()).toContain('useState<"daily" | "weekly">(initialView)');
  });
  it("sign and view changes mirror into the URL, defaults omitted", () => {
    expect(client()).toContain('params.set("sign", nextSign)');
    expect(client()).toContain('params.set("view", "weekly")');
    expect(client()).toContain("window.history.replaceState");
    expect(client()).toContain('onChange={(e) => changeSign(e.target.value as SunSign)}');
    expect(client()).toContain("onChange={(v) => changeView(v as \"daily\" | \"weekly\")}");
  });
  it("the picked date is deliberately not synced", () => {
    expect(client()).not.toContain('params.set("date"');
  });
});

describe("url-state-sync: /reports type (?type=year-ahead|comparison)", () => {
  const page = () => src("src/app/reports/page.tsx");
  const client = () => src("src/app/reports/ReportsClient.tsx");
  it("server page validates the type and passes it in", () => {
    expect(page()).toContain('raw === "year-ahead" || raw === "comparison"');
    expect(page()).toContain("initialType={initialType}");
  });
  it("client initialises the type from the prop, not hardcoded transit", () => {
    expect(client()).toContain("initialType?: ReportType");
    expect(client()).toContain("useState<ReportType>(initialType)");
  });
  it("switching writes ?type= and omits the param for Transit", () => {
    expect(client()).toContain("`/reports?type=${next}`");
    expect(client()).toContain("router.replace(");
    expect(client()).toContain("onChange={(v) => syncType(v as ReportType)}");
  });
  it("back/forward reads the param back into state", () => {
    expect(client()).toContain('searchParams.get("type")');
    expect(client()).toContain("if (next !== type) {");
  });
});

describe("url-state-sync: /spreads/[slug] step, deliberately not synced", () => {
  it("ReadingFlow has no step state: it is a gate screen only", () => {
    const flow = src("src/components/ReadingFlow.tsx");
    expect(flow).not.toMatch(/useState<[^>]*Step>/);
    expect(flow).not.toContain("?step=");
    expect(flow).toContain("GateScreen");
    expect(flow).toContain("/intake/${spread.slug}");
  });
  it("the intake step is derived from answers, so no URL step exists there either", () => {
    const intake = src("src/app/intake/[slug]/useIntakeFlow.ts");
    expect(intake).toContain('useState<Step>("category")');
    expect(intake).not.toContain("?step=");
  });
  it("/oracles is untouched: it already syncs purchase=success", () => {
    const credits = src("src/app/oracles/CreditsClient.tsx");
    expect(credits).toContain('searchParams.get("purchase") === "success"');
  });
});
