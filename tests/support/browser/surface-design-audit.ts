import type { EvidenceGap } from "@orb/tooling/floor/verdict/evidence";
import type { collectAudit as collectAuditSamples, PixelPass, RawSamples } from "@orb/tooling/ui-audit";
import type { Page } from "@playwright/test";

/** Read the maintained design engine's static census and resolve pending backdrops with its native pixel pass. */
export async function readSurfaceDesignAudit(page: Page): Promise<{
  readonly samples: RawSamples;
  readonly pixels: PixelPass;
  readonly audit: ReturnType<typeof collectAuditSamples>;
  readonly gaps: readonly EvidenceGap[];
}> {
  const {
    COLLECT_SAMPLES_JS,
    collectAudit,
    rawSamples,
    resolvePixelBackdrops,
    censusTotal,
    censusGap,
    censusThinGap,
    censusCapGap,
    reachGap,
    populationEvidenceGap,
    viewportFrameGap,
  } = await import("@orb/tooling/ui-audit");
  const samples = rawSamples(await page.evaluate(COLLECT_SAMPLES_JS));
  const pixels = await resolvePixelBackdrops(page, samples);
  const audit = collectAudit(pixels.samples);
  const accounting = samples.subjectAccounting;
  const gaps = [
    censusTotal(samples) === 0 ? censusGap(page.url()) : null,
    censusThinGap({ duringWalk: accounting.settled, settled: accounting.observed, stabilized: accounting.stabilized, accounting }),
    censusCapGap(samples),
    reachGap(samples),
    viewportFrameGap(samples),
    populationEvidenceGap(audit.populationAccounting),
  ].filter((gap) => gap !== null);
  return { samples, pixels, audit, gaps };
}
