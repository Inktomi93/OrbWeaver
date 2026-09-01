import { MOBILE_DEVICE } from "../../../../tooling/src/_shared/browser-environment.ts";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import type { AuditData } from "../../../../tooling/src/motion-audit/contract/types.ts";
import type { MotionMatrixVariant, MotionStaticExpectedLink } from "../../../../tooling/src/motion-audit/ops/matrix-contract.ts";
import type { MotionMatrixCellEvidence } from "../../../../tooling/src/motion-audit/ops/matrix-verdict.ts";
import { evaluateMotionStaticExpected } from "../../../../tooling/src/motion-audit/ops/matrix-verdict.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const candidateVariant: MotionMatrixVariant = {
  id: "candidate",
  selector: null,
  appReducedMotion: true,
  osReducedMotion: true,
  device: MOBILE_DEVICE,
};
const controlVariant: MotionMatrixVariant = {
  id: "control",
  selector: '[data-slot="collapsible-trigger"]',
  appReducedMotion: false,
  osReducedMotion: false,
  device: MOBILE_DEVICE,
};
const link: MotionStaticExpectedLink = { candidateId: candidateVariant.id, controlId: controlVariant.id };

function data(reduced: boolean, frames: number, app: boolean): AuditData {
  const viewport = { width: 430, height: 932 };
  return {
    environment: {
      requested: { device: MOBILE_DEVICE, viewport, colorScheme: null, reducedMotion: reduced, contrast: null, reducedTransparency: false },
      applied: {
        device: MOBILE_DEVICE,
        viewport,
        colorScheme: null,
        reducedMotion: reduced,
        contrast: null,
        reducedTransparency: false,
        screen: viewport,
        userAgent: "mobile",
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      actual: {
        device: MOBILE_DEVICE,
        viewport,
        innerViewport: viewport,
        screen: viewport,
        userAgent: "mobile",
        deviceScaleFactor: 3,
        maxTouchPoints: 1,
        hasTouch: true,
        pointer: "coarse",
        hover: "none",
        colorScheme: "no-preference",
        reducedMotion: reduced,
        contrast: "no-preference",
        reducedTransparency: false,
        isMobile: true,
      },
      mismatches: [],
    },
    applicationMotion: { requested: app, applied: true, reached: 1, samples: [String(app)] },
    motion: { loafs: [], cls: 0, virtualizedCls: 0, nonVirtualizedCls: 0, worstBlocking: 0, worstShift: 0 },
    animations: [],
    frames: {
      raw: { total: frames, dropped: 0, pct: frames === 0 ? null : 0 },
      classified: { total: 0, dropped: 0 },
      budgeted: { total: frames, dropped: 0, pct: frames === 0 ? null : 0 },
    },
    pageErrors: [],
    traceEventCount: 12,
    stepFailed: false,
    reachFailures: 0,
  };
}

function cell(variant: MotionMatrixVariant, receipt: AuditData, code: number): MotionMatrixCellEvidence {
  return { id: variant.id, code, variant, data: receipt, route: "/", windowMs: 1000, throttle: true };
}

test("the ruled reduced mobile entry is STATIC-EXPECTED only beside a real full-motion interaction control", () => {
  const verdict = evaluateMotionStaticExpected(link, [
    cell(candidateVariant, data(true, 0, true), EXIT.toolError),
    cell(controlVariant, data(false, 8, false), EXIT.clean),
  ]);
  expect(verdict).toMatchObject({ status: "static-expected", candidateCode: EXIT.clean });
});

test("counterfeit carrier identity, a zero-frame control, and a candidate budget breach fail loud", () => {
  const candidateData = data(true, 0, true);
  const candidate = cell(candidateVariant, candidateData, EXIT.toolError);
  const control = cell(controlVariant, data(false, 8, false), EXIT.clean);

  expect(
    evaluateMotionStaticExpected(link, [
      { ...candidate, data: { ...candidateData, applicationMotion: { requested: true, applied: true, reached: 1, samples: ["false"] } } },
      control,
    ]),
  ).toMatchObject({
    status: "instrument-error",
    candidateCode: EXIT.toolError,
  });
  expect(evaluateMotionStaticExpected(link, [candidate, { ...control, data: data(false, 0, false), code: EXIT.toolError }])).toMatchObject({
    status: "instrument-error",
    candidateCode: EXIT.toolError,
  });
  expect(evaluateMotionStaticExpected(link, [{ ...candidate, data: { ...candidateData, pageErrors: ["planted"] } }, control])).toMatchObject({
    status: "instrument-error",
    candidateCode: EXIT.toolError,
  });
});

test("a reduced candidate that produced frames keeps the ordinary verdict", () => {
  const verdict = evaluateMotionStaticExpected(link, [
    cell(candidateVariant, data(true, 2, true), EXIT.clean),
    cell(controlVariant, data(false, 8, false), EXIT.clean),
  ]);
  expect(verdict).toMatchObject({ status: "ordinary", candidateCode: EXIT.clean });
});
