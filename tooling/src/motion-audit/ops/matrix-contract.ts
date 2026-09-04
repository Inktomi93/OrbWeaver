// motion-audit's thin projection over the shared representative planner. The application arm comes from
// the live Appearance carrier, the measured interaction comes from the existing selector contract, and
// the browser arms use the shared full device descriptor.

import type { RuntimeAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { deriveAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { MOBILE_DEVICE } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { instrumentRefusal } from "../../_shared/page-validate.ts";
import type { VariantAssignment, VariantAxis, VariantMatrixPlan, VariantRequiredTwin } from "../../_shared/variant-matrix.ts";
import { planVariantMatrix, variantArtifactId } from "../../_shared/variant-matrix.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit --matrix");

const APP_MOTION_AXIS = "appearance.reducedMotion";
const SCENARIO_AXIS = "scenario";
const OS_MOTION_AXIS = "os-motion";
const DEVICE_AXIS = "device";

export interface MotionAppearanceMatrix {
  readonly plan: VariantMatrixPlan;
  readonly axes: readonly VariantAxis[];
  readonly staticExpected: MotionStaticExpectedLink;
}

export interface MotionStaticExpectedLink {
  readonly candidateId: string;
  readonly controlId: string;
}

export interface MotionMatrixVariant {
  readonly id: string;
  readonly selector: string | null;
  readonly appReducedMotion: boolean;
  readonly osReducedMotion: boolean;
  readonly device: string | null;
}

function motionAxes(contract: RuntimeAppearanceContract, selector: string): readonly VariantAxis[] {
  const appearance = deriveAppearanceContract(contract);
  const applicationMotion = appearance.axes.find((axis) => axis.id === APP_MOTION_AXIS);
  if (applicationMotion === undefined) {
    return instrumentRefusal("live Appearance contract has no reducedMotion axis");
  }
  return [
    {
      id: SCENARIO_AXIS,
      values: [
        { id: "entry", payload: null },
        { id: "interaction", payload: selector },
      ],
    },
    applicationMotion,
    {
      id: OS_MOTION_AXIS,
      values: [
        { id: "full", payload: false },
        { id: "reduced", payload: true },
      ],
    },
    {
      id: DEVICE_AXIS,
      values: [
        { id: "desktop-fine-hover", payload: null },
        { id: "mobile-coarse-none", payload: MOBILE_DEVICE },
      ],
    },
  ];
}

function valueId(axes: readonly VariantAxis[], axisId: string, payload: unknown): string {
  const value = axes.find((axis) => axis.id === axisId)?.values.find((candidate) => Object.is(candidate.payload, payload));
  return value?.id ?? instrumentRefusal(`motion matrix cannot resolve ${axisId}=${JSON.stringify(payload)}`);
}

function motionTwins(axes: readonly VariantAxis[]): readonly VariantRequiredTwin[] {
  const appFull = valueId(axes, APP_MOTION_AXIS, false);
  const appReduced = valueId(axes, APP_MOTION_AXIS, true);
  return [
    {
      id: "application-reduced-motion",
      axis: APP_MOTION_AXIS,
      left: appFull,
      right: appReduced,
      where: { scenario: "interaction", "os-motion": "full", device: "desktop-fine-hover" },
    },
    {
      id: "os-reduced-motion",
      axis: OS_MOTION_AXIS,
      left: "full",
      right: "reduced",
      where: { scenario: "interaction", [APP_MOTION_AXIS]: appFull, device: "desktop-fine-hover" },
    },
    {
      id: "full-device-descriptor",
      axis: DEVICE_AXIS,
      left: "desktop-fine-hover",
      right: "mobile-coarse-none",
      where: { scenario: "interaction", [APP_MOTION_AXIS]: appFull, "os-motion": "full" },
    },
  ];
}

export function planMotionAppearanceMatrix(contract: RuntimeAppearanceContract, selector: string | null): MotionAppearanceMatrix {
  if (selector === null || selector.trim() === "") {
    return instrumentRefusal("motion matrix requires --selector so both entry and interaction scenarios are executable");
  }
  const axes = motionAxes(contract, selector);
  const plan = planVariantMatrix({ axes, isLegal: () => true, requiredTwins: motionTwins(axes) });
  const provisional = { axes, plan };
  const variants = plan.cells.map((cell, index) => motionMatrixVariant(provisional, cell, index));
  const candidate = variants.find(
    (variant) => variant.selector === null && variant.appReducedMotion && variant.osReducedMotion && variant.device === MOBILE_DEVICE,
  );
  const control = variants.find(
    (variant) => variant.selector === selector && !variant.appReducedMotion && !variant.osReducedMotion && variant.device === MOBILE_DEVICE,
  );
  if (candidate === undefined || control === undefined) {
    return instrumentRefusal("motion matrix did not retain the reduced-static candidate and full-motion mobile control");
  }
  return { ...provisional, staticExpected: { candidateId: candidate.id, controlId: control.id } };
}

function payloadFor<T>(matrix: Pick<MotionAppearanceMatrix, "axes">, assignment: VariantAssignment, axisId: string): T {
  const axis = matrix.axes.find((candidate) => candidate.id === axisId);
  const value = axis?.values.find((candidate) => candidate.id === assignment[axisId]);
  return value === undefined ? instrumentRefusal(`motion cell is missing ${axisId}`) : (value.payload as T);
}

export function motionMatrixVariant(matrix: Pick<MotionAppearanceMatrix, "axes">, cell: VariantMatrixPlan["cells"][number], index = 0): MotionMatrixVariant {
  return {
    id: variantArtifactId(cell.id, index),
    selector: payloadFor<string | null>(matrix, cell.assignment, SCENARIO_AXIS),
    appReducedMotion: payloadFor<boolean>(matrix, cell.assignment, APP_MOTION_AXIS),
    osReducedMotion: payloadFor<boolean>(matrix, cell.assignment, OS_MOTION_AXIS),
    device: payloadFor<string | null>(matrix, cell.assignment, DEVICE_AXIS),
  };
}
