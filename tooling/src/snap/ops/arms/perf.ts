// The perf ARM: the navigation-timing + `window.__orb` read taken on every settled page. Split out of the
// former ops/evidence.ts by NATURE when the arm registry landed (contract/arms.ts).
//
// THE ONE ARM WITH NO FLAG. It is always on, because it costs one `page.evaluate` and it is the only
// record of what the run's page actually did; there is nothing to turn on and nothing to scope. It still
// carries a registry row — a nameless capability with no help line and no declared owner is exactly the
// thing that goes missing in a refactor (`--no-deadcss` had no help row for its whole life until this
// registry made one mandatory).
import type { Page } from "@playwright/test";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmDef, ArmFailureCounts, ArmNeeds } from "../../contract/arms.ts";
import type { PerfEvidence } from "../../contract/types.ts";
import { perfEvidence } from "../page-validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

async function capturePerfEvidence(page: Page): Promise<PerfEvidence | null> {
  // @orb-gate-ignore caught-failure-ownership(default:catch): optional-read-as-absent — perf evidence is a nice-to-have from window.__orb, null on any failure (old build, dev-only bridge absent) and the caller treats null as "no perf evidence", never a failure. Ends if a caller starts requiring perf evidence to be present.
  try {
    // #1004 — validated so a malformed payload reaches the `catch → null` arm below (optional read,
    // absent is fine) instead of landing in the report as fabricated navigation numbers.
    return perfEvidence(
      await page.evaluate(`(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        navigation: nav ? {
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadMs: Math.round(nav.loadEventEnd),
          responseMs: Math.round(nav.responseEnd),
        } : null,
        orb: window.__orb ? window.__orb.snap() : null,
      };
    })()`),
    );
  } catch {
    return null;
  }
}

export const PERF_ARM = {
  flags: [],
  level: "call",
  needs: (): ArmNeeds => ({}),
  defaults: (): Record<string, never> => ({}),
  help: `  (no flag)               navigation timing + the window.__orb snapshot are read on EVERY settled
                          page and filed in the --json manifest; absent evidence reports as absent`,
  lifecycle: {
    at: "page",
    enabled: (): boolean => true,
    run: async ({ page, outcome }): Promise<void> => {
      outcome.perf = await capturePerfEvidence(page);
    },
    // No RESULT pair and no verdict member: the perf read is REPORTED (report block + manifest), never
    // judged — a slow page is not a snap failure, and inventing a threshold here would duplicate the
    // motion/CPU instruments that own that question.
    pairs: (): readonly ResultPair[] => [],
    failures: (): ArmFailureCounts => ({}),
  },
} satisfies ArmDef;
