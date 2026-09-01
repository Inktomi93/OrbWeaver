// Snap's policy projection over the shared representative-matrix planner. The carrier rows arrive from
// the live browser bridge; this file deliberately owns no Appearance-key roster and imports no client code.

import { appearanceArmValueId, appearancePatchForAssignment, deriveAppearanceContract, representativeMatrixThemes } from "../../_shared/appearance-matrix.ts";
import { MOBILE_DEVICE } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ThemeEntry } from "../../_shared/theme.ts";
import type { VariantAssignment, VariantAxis, VariantMatrixPlan, VariantRequiredRow, VariantRequiredTwin } from "../../_shared/variant-matrix.ts";
import { planVariantMatrix, variantArtifactId } from "../../_shared/variant-matrix.ts";
import type { SnapAppearanceContract, SnapAppearanceMatrix, SnapMatrixVariant } from "../contract/matrix.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

const RISK_LARGE_FONT_SCALE = 1.25;
const SHORT_MESSAGE_BODY_SCALE = 0.8;
const SHORT_MESSAGE_LINE_HEIGHT = 1.2;
const REQUIREMENT_DIRECTION_SEPARATOR = "::";

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

function environmentAxes(themes: Readonly<Record<string, ThemeEntry>>): readonly VariantAxis[] {
  return [
    { id: "theme", values: Object.entries(themes).map(([id, payload]) => ({ id, payload })) },
    {
      id: "device",
      values: [
        { id: "desktop-fine-hover", payload: null },
        { id: "mobile-coarse-none", payload: MOBILE_DEVICE },
      ],
    },
    {
      id: "os-color",
      values: [
        { id: "light", payload: "light" },
        { id: "dark", payload: "dark" },
      ],
    },
    {
      id: "os-motion",
      values: [
        { id: "full", payload: false },
        { id: "reduced", payload: true },
      ],
    },
    {
      id: "contrast",
      values: [
        { id: "no-preference", payload: "no-preference" },
        { id: "more", payload: "more" },
      ],
    },
    {
      id: "transparency",
      values: [
        { id: "full", payload: false },
        { id: "reduced", payload: true },
      ],
    },
  ];
}

function riskRows(axes: readonly VariantAxis[]): readonly VariantRequiredRow[] {
  return [
    {
      id: "compact-portal-carried",
      assignment: {
        device: "mobile-coarse-none",
        "appearance.density": appearanceArmValueId(axes, "density", "compact"),
        theme: "custom-dark",
      },
    },
    {
      id: "dark-name-time-short-bubble",
      assignment: {
        theme: "custom-dark",
        "appearance.showTimestamps": appearanceArmValueId(axes, "showTimestamps", true),
        "appearance.chatStyle": appearanceArmValueId(axes, "chatStyle", "bubble"),
        "appearance.chatWidthPct": appearanceArmValueId(axes, "chatWidthPct", 60),
      },
    },
    {
      id: "light-art-scrim-glass-elevation",
      assignment: {
        device: "desktop-fine-hover",
        transparency: "full",
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
    {
      id: `opposite-os-app-prepaint${REQUIREMENT_DIRECTION_SEPARATOR}dark-on-light`,
      assignment: {
        theme: "custom-dark",
        "os-color": "light",
        "appearance.fontScale": appearanceArmValueId(axes, "fontScale", RISK_LARGE_FONT_SCALE),
        "appearance.reducedMotion": appearanceArmValueId(axes, "reducedMotion", false),
      },
    },
    {
      id: `opposite-os-app-prepaint${REQUIREMENT_DIRECTION_SEPARATOR}light-on-dark`,
      assignment: {
        theme: "custom-light",
        "os-color": "dark",
        "appearance.fontScale": appearanceArmValueId(axes, "fontScale", RISK_LARGE_FONT_SCALE),
        "appearance.reducedMotion": appearanceArmValueId(axes, "reducedMotion", false),
      },
    },
  ];
}

function riskTwins(axes: readonly VariantAxis[]): readonly VariantRequiredTwin[] {
  return [
    {
      id: "hover-pointer",
      axis: "device",
      left: "desktop-fine-hover",
      right: "mobile-coarse-none",
      where: {
        "appearance.messageActions": appearanceArmValueId(axes, "messageActions", "hover"),
        "appearance.chatStyle": appearanceArmValueId(axes, "chatStyle", "bubble"),
        // Both pointer arms judge the same ordinary short bubble. The large reading-body arm can make
        // every visible header sticky on a phone, while the tall line-height arm leaves no ordinary
        // action bubble in the mobile viewport; either changes the subject instead of testing the twin.
        "appearance.readingBodyScale": appearanceArmValueId(axes, "readingBodyScale", SHORT_MESSAGE_BODY_SCALE),
        "appearance.readingLineHeight": appearanceArmValueId(axes, "readingLineHeight", SHORT_MESSAGE_LINE_HEIGHT),
      },
    },
    {
      id: "density-preview",
      axis: "appearance.density",
      left: appearanceArmValueId(axes, "density", "comfortable"),
      right: appearanceArmValueId(axes, "density", "compact"),
      where: {
        device: "mobile-coarse-none",
        "appearance.elevation": appearanceArmValueId(axes, "elevation", "ramp"),
      },
    },
  ];
}

function legalAssignment(_assignment: VariantAssignment): boolean {
  return true;
}

export function planSnapAppearanceMatrix(
  contract: SnapAppearanceContract,
  entries: readonly ThemeEntry[],
  preferredCustom: readonly [ThemeEntry, ThemeEntry] | null = null,
): SnapAppearanceMatrix {
  const appearance = deriveAppearanceContract(contract);
  const themes = representativeMatrixThemes(entries, preferredCustom);
  const axes = [...appearance.axes, ...environmentAxes(themes)];
  const plan = planVariantMatrix({ axes, isLegal: legalAssignment, requiredRows: riskRows(axes), requiredTwins: riskTwins(axes) });
  return { plan, appearanceAxes: appearance.axes, dependencies: appearance.dependencies, historicalRows: appearance.historicalRows, themes };
}

function appearancePatchForCell(matrix: SnapAppearanceMatrix, assignment: VariantAssignment): Readonly<Record<string, unknown>> {
  return appearancePatchForAssignment(matrix.appearanceAxes, assignment);
}

export function appearancePolicyIdForRequirement(requirementId: string): string {
  return requirementId.split(REQUIREMENT_DIRECTION_SEPARATOR, 1)[0] ?? requirementId;
}

/** Join the planner's mandatory-row/twin receipt back to the client-owned literal policy. Pairwise-only
 *  cells carry no historical row; twin endpoints both carry the same row id and are judged separately. */
export function historicalRowsForCell(matrix: SnapAppearanceMatrix, cellId: string): SnapAppearanceMatrix["historicalRows"] {
  const ids = new Set([
    ...matrix.plan.receipt.requiredRows.filter((row) => row.cellId === cellId).map((row) => appearancePolicyIdForRequirement(row.id)),
    ...matrix.plan.receipt.requiredTwins
      .filter((row) => row.leftCellId === cellId || row.rightCellId === cellId)
      .map((row) => appearancePolicyIdForRequirement(row.id)),
  ]);
  const rows = matrix.historicalRows.filter((row) => ids.has(row.id));
  if (rows.length !== ids.size) {
    return instrumentError(`cell ${cellId} cannot resolve every required historical row`);
  }
  return rows;
}

function payloadForCell<T>(axes: readonly VariantAxis[], assignment: VariantAssignment, axisId: string): T {
  const axis = axes.find((candidate) => candidate.id === axisId);
  const valueIdForCell = assignment[axisId];
  const value = axis?.values.find((candidate) => candidate.id === valueIdForCell);
  if (value === undefined) {
    return instrumentError(`cell is missing ${axisId}`);
  }
  return value.payload as T;
}

/** Project one shared-planner assignment onto Snap's existing launch/settings inputs. The runtime loop
 *  consumes only this typed policy result; it owns no second axis roster or value spelling. */
export function snapMatrixVariant(matrix: SnapAppearanceMatrix, cell: VariantMatrixPlan["cells"][number], index = 0): SnapMatrixVariant {
  const allAxes = [...matrix.appearanceAxes, ...environmentAxes(matrix.themes)];
  const theme = payloadForCell<ThemeEntry>(allAxes, cell.assignment, "theme");
  return {
    id: variantArtifactId(cell.id, index),
    appearance: appearancePatchForCell(matrix, cell.assignment),
    theme: theme.id,
    device: payloadForCell<string | null>(allAxes, cell.assignment, "device"),
    colorScheme: payloadForCell<"light" | "dark">(allAxes, cell.assignment, "os-color"),
    reducedMotion: payloadForCell<boolean>(allAxes, cell.assignment, "os-motion"),
    browserContrast: payloadForCell<"more" | "no-preference">(allAxes, cell.assignment, "contrast"),
    reducedTransparency: payloadForCell<boolean>(allAxes, cell.assignment, "transparency"),
  };
}
