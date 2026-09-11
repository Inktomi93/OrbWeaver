// The perf ARM: the navigation-timing + `window.__orb` read taken on every settled page. Split out of the
// former ops/evidence.ts by NATURE when the arm registry landed (contract/arms.ts).
//
// THE ONE ARM WITH NO FLAG. It is always on, because it costs one `page.evaluate` and it is the only
// record of what the run's page actually did; there is nothing to turn on and nothing to scope. It still
// carries a registry row — a nameless capability with no help line and no declared owner is exactly the
// thing that goes missing in a refactor (`--no-deadcss` had no help row for its whole life until this
// registry made one mandatory).
import type { Page } from "@playwright/test";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds } from "../../contract/arms.ts";
import type { PerfEvidence } from "../../contract/types.ts";
import type { SnapRatePosture } from "../../lib/rate-posture.ts";
import { ratePostureDisposition } from "../../lib/rate-posture.ts";
import { perfEvidence } from "../page-validate.ts";
import { writeArmEvidenceFile } from "./evidence-file.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export async function capturePerfEvidence(page: Pick<Page, "evaluate">, ratePosture: SnapRatePosture): Promise<PerfEvidence | null> {
  const disposition = ratePostureDisposition(ratePosture, "Snap's navigation timing rate");
  if (disposition.disposition === "withheld") {
    // NO NUMBER EXISTS — an unproven/software browser. The load arm no longer reaches here (#1616).
    print(`WITHHELD (${disposition.reason})`);
    return { rate: { status: "withheld", reason: disposition.reason }, acceleration: ratePosture.acceleration, navigation: null, orb: null };
  }
  if (disposition.disposition === "load-suspect") {
    // MEASURE ANYWAY, LABEL THE NUMBER (#1616). The read below is identical; only the status it lands
    // under changes, and `app-snapshot=load-suspect` is what the RESULT line then carries.
    print(`LOAD-SUSPECT (${disposition.reason})`);
  }
  const status = disposition.disposition === "load-suspect" ? ("load-suspect" as const) : ("measured" as const);
  // @orb-waive caught-failure-ownership(catch): optional-read-as-absent — perf evidence is a nice-to-have from window.__orb, null on any failure (old build, dev-only bridge absent) and the caller treats null as "no perf evidence", never a failure. Ends if a caller starts requiring perf evidence to be present.
  try {
    // #1004 — validated so a malformed payload reaches the `catch → null` arm below (optional read,
    // absent is fine) instead of landing in the report as fabricated navigation numbers.
    return {
      rate: { status, reason: disposition.reason },
      acceleration: ratePosture.acceleration,
      ...perfEvidence(
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
      ),
    };
  } catch {
    return null;
  }
}

/** The actual RESULT member for this arm — THE ONE CLOSED VOCABULARY, straight through (#1616): an
 *  unproven browser is `withheld` (no number), a loaded box is `load-suspect` (a number, unpromotable),
 *  a quiet one is `measured`, and an absent optional bridge stays distinct from all three. Neither
 *  non-`measured` member changes any other arm's pass/fail contribution. */
export function appSnapshotResultPair(evidence: readonly (PerfEvidence | null)[]): ResultPair {
  if (evidence.some((entry) => entry?.rate.status === "withheld")) {
    return ["app-snapshot", "withheld"];
  }
  if (evidence.some((entry) => entry?.rate.status === "load-suspect")) {
    return ["app-snapshot", "load-suspect"];
  }
  return ["app-snapshot", evidence.some((entry) => entry?.rate.status === "measured") ? "measured" : "absent"];
}

export const APP_SNAPSHOT_ARM = {
  flags: [],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Record<string, never> => ({}),
  help: `  app-snapshot (attempted) cheap navigation timing + window.__orb.snap() overview attempted on EVERY
                          settled page (coarse perf/render/console counts, not the selective --perf verdict).
                          Plain/static pages have no __orb overview (N/A); if navigation timing also cannot
                          be measured, app-snapshot reports absent rather than a page failure;
                          load/software rendering withholds only this rate arm`,
  result: {
    schema: "snap-arm-app-snapshot-v1",
    source: "window.__orb.snap() + Navigation Timing",
    lifetime: "settled page capture",
    enabled: (): true => true,
  },
  lifecycle: {
    at: "page",
    enabled: (): boolean => true,
    run: async ({ page, outcome, ratePosture }): Promise<void> => {
      outcome.perf = await capturePerfEvidence(page, ratePosture);
    },
    // The pair states whether the RATE was measured or withheld. It never contributes a failure count:
    // navigation timing has no snap threshold, and the other arms keep their independent verdicts.
    pairs: ({ outcomes }): readonly ResultPair[] => [appSnapshotResultPair(outcomes.map((outcome) => outcome.perf))],
    // #1342: the app snapshot's own bytes are filed by `writeCoreCaptureEvidence` (ops/manifest.ts) under
    // this same arm, so the fact already carries a reference — but the PERF READ it prints (navigation
    // timing + the `window.__orb` snapshot) is in neither. It goes here.
    evidence: async ({ outcomes }, slug): Promise<void> => {
      const rows = outcomes.filter((outcome) => outcome.perf !== null).map((outcome) => ({ page: outcome.pageIndex, perf: outcome.perf }));
      await writeArmEvidenceFile({
        arm: "app-snapshot",
        name: "app-snapshot-perf",
        slug,
        schema: "snap-app-snapshot-perf-v1",
        records: rows.length,
        completeness: "complete",
        completenessDetail: "the navigation timing, acceleration posture and window.__orb snapshot this run printed, per page",
        body: { v: 1, pages: rows },
      });
    },
    facts: ({ outcomes }): readonly ArmFactEmission<"app-snapshot">[] => {
      // A load-suspect page DID take a snapshot, so it counts as one; what it must never do is read as a
      // clean `passed` (#1616 — the no-promotion rule at the FACT).
      const snapshots = outcomes.filter((outcome) => outcome.perf?.rate.status === "measured" || outcome.perf?.rate.status === "load-suspect").length;
      const withheld = outcomes.some((outcome) => outcome.perf?.rate.status === "withheld");
      const suspect = outcomes.some((outcome) => outcome.perf?.rate.status === "load-suspect");
      const unavailable = outcomes.length - snapshots;
      let state: "withheld" | "load-suspect" | "passed" | "absent" = "absent";
      if (withheld) {
        state = "withheld";
      } else if (suspect) {
        state = "load-suspect";
      } else if (snapshots > 0) {
        state = "passed";
      }
      return [{ scope: aggregateScope(), data: { state, detail: null, snapshots, unavailable } }];
    },
    failures: (): ArmFailureCounts => ({}),
    exit: (_input, code): number => code,
  },
} satisfies ArmDef<"app-snapshot">;
