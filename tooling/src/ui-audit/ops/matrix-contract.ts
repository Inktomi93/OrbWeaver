// design-audit's thin projection over the shared representative planner. Appearance arms and theme ids
// come from the live bridge/catalog; this file owns only the audit's theme + full-device axis set.

import type { RuntimeAppearanceContract, RuntimeAppearanceContractRow } from "../../_shared/appearance-matrix.ts";
import { appearanceArmValueId, appearancePatchForAssignment, deriveAppearanceContract, representativeMatrixThemes } from "../../_shared/appearance-matrix.ts";
import { MOBILE_DEVICE } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { instrumentRefusal } from "../../_shared/page-validate.ts";
import type { ThemeEntry } from "../../_shared/theme.ts";
import type { VariantAssignment, VariantAxis, VariantMatrixPlan, VariantRequiredRow, VariantRequiredTwin } from "../../_shared/variant-matrix.ts";
import { planVariantMatrix, variantArtifactId } from "../../_shared/variant-matrix.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit --matrix");

const RISK_LARGE_FONT_SCALE = 1.25;

export interface UiAuditAppearanceMatrix {
  readonly plan: VariantMatrixPlan;
  readonly appearanceAxes: readonly VariantAxis[];
  readonly dependencies: readonly RuntimeAppearanceContractRow[];
  readonly themes: Readonly<Record<string, ThemeEntry>>;
}

export interface UiAuditMatrixVariant {
  readonly id: string;
  readonly appearance: Readonly<Record<string, unknown>>;
  readonly theme: string;
  readonly device: string | null;
}

function auditEnvironmentAxes(themes: Readonly<Record<string, ThemeEntry>>): readonly VariantAxis[] {
  return [
    { id: "theme", values: Object.entries(themes).map(([id, payload]) => ({ id, payload })) },
    {
      id: "device",
      values: [
        { id: "desktop-fine-hover", payload: null },
        { id: "mobile-coarse-none", payload: MOBILE_DEVICE },
      ],
    },
  ];
}

function legalAssignment(_assignment: VariantAssignment): boolean {
  return true;
}

function auditRiskRows(axes: readonly VariantAxis[]): readonly VariantRequiredRow[] {
  return [
    {
      id: "compact-portal-carried",
      assignment: { "appearance.density": appearanceArmValueId(axes, "density", "compact"), theme: "custom-dark" },
    },
    {
      id: "light-art-scrim-glass-elevation",
      assignment: {
        theme: "custom-light",
        "appearance.backgroundImageKind": appearanceArmValueId(axes, "backgroundImageKind", "seeded"),
        "appearance.blurSurfaces": appearanceArmValueId(axes, "blurSurfaces", ["panels"]),
        "appearance.elevation": appearanceArmValueId(axes, "elevation", "ramp"),
      },
    },
    {
      id: "mobile-compact-large-document",
      assignment: {
        device: "mobile-coarse-none",
        "appearance.density": appearanceArmValueId(axes, "density", "compact"),
        "appearance.fontScale": appearanceArmValueId(axes, "fontScale", RISK_LARGE_FONT_SCALE),
        "appearance.chatStyle": appearanceArmValueId(axes, "chatStyle", "document"),
      },
    },
  ];
}

function auditRiskTwins(axes: readonly VariantAxis[]): readonly VariantRequiredTwin[] {
  return [
    {
      id: "hover-pointer",
      axis: "device",
      left: "desktop-fine-hover",
      right: "mobile-coarse-none",
      where: {
        "appearance.messageActions": appearanceArmValueId(axes, "messageActions", "hover"),
        "appearance.chatStyle": appearanceArmValueId(axes, "chatStyle", "bubble"),
      },
    },
    {
      id: "density-preview",
      axis: "appearance.density",
      left: appearanceArmValueId(axes, "density", "comfortable"),
      right: appearanceArmValueId(axes, "density", "compact"),
      where: { device: "desktop-fine-hover", "appearance.elevation": appearanceArmValueId(axes, "elevation", "ramp") },
    },
  ];
}

export function planUiAuditAppearanceMatrix(
  contract: RuntimeAppearanceContract,
  entries: readonly ThemeEntry[],
  preferredCustom: readonly [ThemeEntry, ThemeEntry] | null = null,
): UiAuditAppearanceMatrix {
  const appearance = deriveAppearanceContract(contract);
  const themes = representativeMatrixThemes(entries, preferredCustom);
  const axes = [...appearance.axes, ...auditEnvironmentAxes(themes)];
  const plan = planVariantMatrix({ axes, isLegal: legalAssignment, requiredRows: auditRiskRows(axes), requiredTwins: auditRiskTwins(axes) });
  return { plan, appearanceAxes: appearance.axes, dependencies: appearance.dependencies, themes };
}

function payloadForCell<T>(axes: readonly VariantAxis[], assignment: VariantAssignment, axisId: string): T {
  const axis = axes.find((candidate) => candidate.id === axisId);
  const value = axis?.values.find((candidate) => candidate.id === assignment[axisId]);
  if (value === undefined) {
    return instrumentRefusal(`cell is missing ${axisId}`);
  }
  // NOT a page-boundary cast (ops/page-validate.ts's discipline does not apply): `axes` is built in NODE
  // by this file's own planner and the payload was put there by `auditEnvironmentAxes` — the value never
  // crossed into the browser, so the only thing unproven is the per-axis payload type, which the two call
  // sites below pin by axis id.
  return value.payload as T;
}

export function uiAuditMatrixVariant(matrix: UiAuditAppearanceMatrix, cell: VariantMatrixPlan["cells"][number], index = 0): UiAuditMatrixVariant {
  const axes = [...matrix.appearanceAxes, ...auditEnvironmentAxes(matrix.themes)];
  const theme = payloadForCell<ThemeEntry>(axes, cell.assignment, "theme");
  return {
    id: variantArtifactId(cell.id, index),
    appearance: appearancePatchForAssignment(matrix.appearanceAxes, cell.assignment),
    theme: theme.id,
    device: payloadForCell<string | null>(axes, cell.assignment, "device"),
  };
}
