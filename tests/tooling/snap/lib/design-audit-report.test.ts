// A RESULT-line value is ONE whitespace-free token: every reader of that line splits on whitespace, so a theme
// named "Pale paper" printed raw reads as `theme-request=Pale` plus a stray `paper` token.

import { expect, test } from "@orb/testkit/tooling";
import { designAuditPairs } from "../../../../tooling/src/snap/lib/design-audit-report.ts";
import type { DesignAuditMeasurement } from "../../../../tooling/src/snap/ops/design-audit-walk.ts";

/** A walk that reached its verdict with nothing to report, so only the theme request varies between cases. */
function measurementFor(request: string | null): DesignAuditMeasurement {
  return {
    url: "http://127.0.0.1:0/",
    environment: null,
    terminalGap: null,
    findings: [],
    // biome-ignore lint/style/useNamingConvention: P0-P3 ARE the Severity union's members, so the counts map is keyed by the domain vocabulary.
    counts: { P0: 0, P1: 0, P2: 0, P3: 0 },
    populationAccounting: {},
    familyScans: null,
    census: 0,
    reach: undefined,
    samples: null,
    pixelSampled: 0,
    backdropRefusals: [],
    hover: null,
    shellState: null,
    surfaceState: null,
    drive: "rest",
    population: null,
    themeEvidence: { request, applied: null, resolution: null, rendered: null },
    navError: null,
    actionsFailed: 0,
    gaps: [],
    verdicts: { viewportFrame: null, population: null, censusCap: null, hover: null, force: null, instrumentPageError: null },
    selectorProof: [],
    selectorsUnproven: 0,
  };
}

function themeRequest(request: string | null): string | number | undefined {
  return designAuditPairs(true, measurementFor(request), "P1").find(([key]) => key === "theme-request")?.[1];
}

test("a multi-word theme request prints as one token carrying the whole name", () => {
  const value = themeRequest("Pale paper");

  expect(value).toBe("Pale-paper");
  expect(`theme-request=${String(value)}`.split(/\s+/u)).toHaveLength(1);
});

test("a one-word theme request and an absent one print unchanged", () => {
  // The controls: the fix must not rewrite names that were already one token.
  expect(themeRequest("Light")).toBe("Light");
  expect(themeRequest(null)).toBe("account");
});
