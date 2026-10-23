import { expectTypeOf, test } from "vitest";
import type { CssEvidenceReceipt } from "../../../../tooling/src/snap/contract/cascade.ts";
import type { ContrastEvidence } from "../../../../tooling/src/snap/contract/contrast.ts";
import type { ShotScale, SnapEvalValue } from "../../../../tooling/src/snap/contract/types.ts";
import type { terminalEvidence } from "../../../../tooling/src/snap/lib/contrast-verdict.ts";

test("eval evidence carries exactly one value or error without changing its wire fields", () => {
  expectTypeOf<{ page: number; expression: string; value: string; error: null }>().toExtend<SnapEvalValue>();
  expectTypeOf<{ page: number; expression: string; value: null; error: string }>().toExtend<SnapEvalValue>();
  expectTypeOf<{ page: number; expression: string; value: string; error: string }>().not.toExtend<SnapEvalValue>();
  expectTypeOf<{ page: number; expression: string; value: null; error: null }>().not.toExtend<SnapEvalValue>();
});

test("CSS receipt status selects only its outer error, not retained partial evidence", () => {
  const partial = {
    merge: { status: "instrument-error", enabled: true, calls: 0, conflictCalls: 0, deduplicatedConflictCalls: 0, receipts: [], error: "merge failed" },
    cascade: [],
    repositoryDeclarations: 1,
  } as const;
  expectTypeOf<{ status: "ok"; error: null } & typeof partial>().toExtend<CssEvidenceReceipt>();
  expectTypeOf<{ status: "instrument-error"; error: string } & typeof partial>().toExtend<CssEvidenceReceipt>();
  expectTypeOf<{ status: "ok"; error: string } & typeof partial>().not.toExtend<CssEvidenceReceipt>();
  expectTypeOf<{ status: "instrument-error"; error: null } & typeof partial>().not.toExtend<CssEvidenceReceipt>();
});

test("contrast success requires a measurement and retains partial edge diagnostics", () => {
  const ink = {
    selector: "#subject",
    status: "ok",
    candidates: 1,
    inViewport: 1,
    sampled: 1,
    matchIndex: 0,
    method: "css-resolve",
    fillChannel: null,
    ratio: 5,
    requiredRatio: 4.5,
    passed: true,
    foreground: { r: 0, g: 0, b: 0 },
    backdrop: { r: 255, g: 255, b: 255 },
    reason: null,
  } as const;
  const fill = { ...ink, method: "fill-sample", fillChannel: { kind: "fill", share: 0.8 } } as const;
  const edge = { ...ink, method: "edge-sample", passed: false, reason: "another side was refused" } as const;
  const terminal = {
    ...ink,
    status: "refused",
    method: null,
    sampled: 0,
    ratio: null,
    requiredRatio: null,
    passed: null,
    foreground: null,
    backdrop: null,
    reason: "offscreen",
  } as const;
  expectTypeOf(ink).toExtend<ContrastEvidence>();
  expectTypeOf(fill).toExtend<ContrastEvidence>();
  expectTypeOf(edge).toExtend<ContrastEvidence>();
  expectTypeOf(terminal).toExtend<ContrastEvidence>();
  const terminalThreshold = { ...terminal, requiredRatio: 3 };
  const terminalColors = { ...terminal, foreground: ink.foreground, backdrop: ink.backdrop };
  expectTypeOf(terminalThreshold).toExtend<ContrastEvidence>();
  expectTypeOf(terminalColors).toExtend<ContrastEvidence>();
  const missingRatio = { ...ink, ratio: null };
  const unmeasured = { ...terminal, status: "ok" } as const;
  const missingChannel = { ...fill, fillChannel: null };
  const foreignChannel = { ...ink, fillChannel: fill.fillChannel };
  const refusedMeasurement = { ...ink, status: "refused", reason: "refused" } as const;
  expectTypeOf(missingRatio).not.toExtend<ContrastEvidence>();
  expectTypeOf(unmeasured).not.toExtend<ContrastEvidence>();
  expectTypeOf(missingChannel).not.toExtend<ContrastEvidence>();
  expectTypeOf(foreignChannel).not.toExtend<ContrastEvidence>();
  expectTypeOf(refusedMeasurement).not.toExtend<ContrastEvidence>();
  expectTypeOf<"ok">().not.toExtend<Parameters<typeof terminalEvidence>[1]>();
});

test("only device scale can override the browser DPR", () => {
  expectTypeOf<{ mode: "css"; deviceScaleFactor: null }>().toExtend<ShotScale>();
  expectTypeOf<{ mode: "device"; deviceScaleFactor: null }>().toExtend<ShotScale>();
  expectTypeOf<{ mode: "device"; deviceScaleFactor: number }>().toExtend<ShotScale>();
  expectTypeOf<{ mode: "css"; deviceScaleFactor: number }>().not.toExtend<ShotScale>();
});
