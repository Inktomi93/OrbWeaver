// Snap's policy projection over the shared representative-matrix planner. The carrier rows arrive from
// the live browser bridge; this file deliberately owns no Appearance-key roster and imports no client code.

import type { BackgroundCapability } from "../../_shared/appearance-matrix.ts";
import { appearanceArmValueId, appearancePatchForAssignment, deriveAppearanceContract, representativeMatrixThemes } from "../../_shared/appearance-matrix.ts";
import { MOBILE_DEVICE } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { instrumentRefusal } from "../../_shared/page-validate.ts";
import type { ThemeEntry } from "../../_shared/theme.ts";
import type { VariantAssignment, VariantAxis, VariantMatrixPlan, VariantRequiredRow, VariantRequiredTwin } from "../../_shared/variant-matrix.ts";
import { planVariantMatrix, variantArtifactId } from "../../_shared/variant-matrix.ts";
import type { SnapAppearanceContract, SnapAppearanceMatrix, SnapMatrixVariant } from "../contract/matrix.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

const RISK_LARGE_FONT_SCALE = 1.25;
const SHORT_MESSAGE_BODY_SCALE = 0.8;
/** The root scale at which a phone still renders one ordinary (non-sticky) transcript row — the schema's
 *  born `fontScale` (#2437, measured; the twin's `where` states the receipt). */
const ORDINARY_ROW_FONT_SCALE = 1;
const SHORT_MESSAGE_LINE_HEIGHT = 1.2;
const REQUIREMENT_DIRECTION_SEPARATOR = "::";
const ENVIRONMENT_AXIS = {
  theme: "theme",
  device: "device",
  colorScheme: "os-color",
  motion: "os-motion",
  contrast: "contrast",
  transparency: "transparency",
} as const;

function environmentAxes(themes: Readonly<Record<string, ThemeEntry>>): readonly VariantAxis[] {
  return [
    { id: ENVIRONMENT_AXIS.theme, values: Object.entries(themes).map(([id, payload]) => ({ id, payload })) },
    {
      id: ENVIRONMENT_AXIS.device,
      values: [
        { id: "desktop-fine-hover", payload: null },
        { id: "mobile-coarse-none", payload: MOBILE_DEVICE },
      ],
    },
    {
      id: ENVIRONMENT_AXIS.colorScheme,
      values: [
        { id: "light", payload: "light" },
        { id: "dark", payload: "dark" },
      ],
    },
    {
      id: ENVIRONMENT_AXIS.motion,
      values: [
        { id: "full", payload: false },
        { id: "reduced", payload: true },
      ],
    },
    {
      id: ENVIRONMENT_AXIS.contrast,
      values: [
        { id: "no-preference", payload: "no-preference" },
        { id: "more", payload: "more" },
      ],
    },
    {
      id: ENVIRONMENT_AXIS.transparency,
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
        [ENVIRONMENT_AXIS.device]: "mobile-coarse-none",
        "appearance.density": appearanceArmValueId(axes, "density", "compact"),
        [ENVIRONMENT_AXIS.theme]: "custom-dark",
      },
    },
    {
      id: "dark-name-time-short-bubble",
      assignment: {
        [ENVIRONMENT_AXIS.theme]: "custom-dark",
        "appearance.showTimestamps": appearanceArmValueId(axes, "showTimestamps", true),
        "appearance.chatStyle": appearanceArmValueId(axes, "chatStyle", "bubble"),
        "appearance.chatWidthPct": appearanceArmValueId(axes, "chatWidthPct", 60),
      },
    },
    {
      id: "light-art-scrim-glass-elevation",
      assignment: {
        [ENVIRONMENT_AXIS.device]: "desktop-fine-hover",
        [ENVIRONMENT_AXIS.transparency]: "full",
        [ENVIRONMENT_AXIS.theme]: "custom-light",
        "appearance.backgroundImageKind": appearanceArmValueId(axes, "backgroundImageKind", "asset"),
        "appearance.blurSurfaces": appearanceArmValueId(axes, "blurSurfaces", ["panels"]),
        "appearance.elevation": appearanceArmValueId(axes, "elevation", "ramp"),
      },
    },
    {
      id: "mobile-compact-large-document",
      assignment: {
        [ENVIRONMENT_AXIS.device]: "mobile-coarse-none",
        "appearance.density": appearanceArmValueId(axes, "density", "compact"),
        "appearance.fontScale": appearanceArmValueId(axes, "fontScale", RISK_LARGE_FONT_SCALE),
        "appearance.chatStyle": appearanceArmValueId(axes, "chatStyle", "document"),
      },
    },
    {
      id: `opposite-os-app-prepaint${REQUIREMENT_DIRECTION_SEPARATOR}dark-on-light`,
      assignment: {
        [ENVIRONMENT_AXIS.theme]: "custom-dark",
        [ENVIRONMENT_AXIS.colorScheme]: "light",
        "appearance.fontScale": appearanceArmValueId(axes, "fontScale", RISK_LARGE_FONT_SCALE),
        "appearance.reducedMotion": appearanceArmValueId(axes, "reducedMotion", false),
      },
    },
    {
      id: `opposite-os-app-prepaint${REQUIREMENT_DIRECTION_SEPARATOR}light-on-dark`,
      assignment: {
        [ENVIRONMENT_AXIS.theme]: "custom-light",
        [ENVIRONMENT_AXIS.colorScheme]: "dark",
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
      axis: ENVIRONMENT_AXIS.device,
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
        // AND THE ROOT SCALE, which is the axis that actually emptied this twin (#2437). The two reading
        // pins above defend exactly this property and are not sufficient: the pairwise filler is free to
        // set every OTHER axis, and at `fontScale` 1.25 on the phone endpoint every visible header goes
        // sticky — so `:not([data-sticky])` (the row's own "one ordinary row" fence) matches nothing and
        // the cell's whole subject census reads population=0. It is not a broken probe: the rows are all
        // there, and the header this row judges is not.
        //
        // MEASURED on the v05 cell's own patch, replayed as three ordinary snap calls against an isolated
        // stage (2026-09-19, --mobile --dark, iPhone 14 Pro Max):
        //   fontScale 1.25 · readingNameScale 1.6 → sticky 3/3, action-row population 0, rows [235,1083,1076]
        //   fontScale 1.25 · readingNameScale 1   → sticky 3/3, action-row population 0  (so the name scale
        //                                           is NOT the axis — only this one is)
        //   fontScale 1    · readingNameScale 1.6 → sticky 2/3, action-row population 1, rows [159,662,701]
        // The born value is therefore pinned, the same way and for the same reason as the two above; the
        // 1.25 arm keeps its pairwise coverage in every other cell.
        "appearance.fontScale": appearanceArmValueId(axes, "fontScale", ORDINARY_ROW_FONT_SCALE),
      },
    },
    {
      id: "density-preview",
      axis: "appearance.density",
      left: appearanceArmValueId(axes, "density", "comfortable"),
      right: appearanceArmValueId(axes, "density", "compact"),
      where: {
        [ENVIRONMENT_AXIS.device]: "mobile-coarse-none",
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
  background: BackgroundCapability | null = null,
): SnapAppearanceMatrix {
  const appearance = deriveAppearanceContract(contract);
  const themes = representativeMatrixThemes(entries, preferredCustom);
  const axes = [...appearance.axes, ...environmentAxes(themes)];
  const plan = planVariantMatrix({ axes, isLegal: legalAssignment, requiredRows: riskRows(axes), requiredTwins: riskTwins(axes) });
  return { plan, appearanceAxes: appearance.axes, dependencies: appearance.dependencies, historicalRows: appearance.historicalRows, themes, background };
}

function appearancePatchForCell(matrix: SnapAppearanceMatrix, assignment: VariantAssignment): Readonly<Record<string, unknown>> {
  return appearancePatchForAssignment(matrix.appearanceAxes, assignment, matrix.background);
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
    return instrumentRefusal(`cell ${cellId} cannot resolve every required historical row`);
  }
  return rows;
}

function payloadForCell<T>(axes: readonly VariantAxis[], assignment: VariantAssignment, axisId: string, accepts: (value: unknown) => value is T): T {
  const axis = axes.find((candidate) => candidate.id === axisId);
  const valueIdForCell = assignment[axisId];
  const value = axis?.values.find((candidate) => candidate.id === valueIdForCell);
  if (value === undefined || !accepts(value.payload)) {
    return instrumentRefusal(`cell is missing or has malformed ${axisId}`);
  }
  return value.payload;
}

function isThemeEntry(value: unknown): value is ThemeEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const id = Reflect.get(value, "id");
  const name = Reflect.get(value, "name");
  const isSeed = Reflect.get(value, "isSeed");
  const background = Reflect.get(value, "background");
  const polarity = Reflect.get(value, "polarity");
  const hasCustomCss = Reflect.get(value, "hasCustomCss");
  return (
    typeof id === "string" &&
    typeof name === "string" &&
    (isSeed === null || typeof isSeed === "boolean") &&
    (background === null || typeof background === "string") &&
    (polarity === "light" || polarity === "dark" || polarity === "unknown") &&
    (hasCustomCss === null || typeof hasCustomCss === "boolean")
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isColorScheme(value: unknown): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

function isBrowserContrast(value: unknown): value is "more" | "no-preference" {
  return value === "more" || value === "no-preference";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Project one shared-planner assignment onto Snap's existing launch/settings inputs. The runtime loop
 *  consumes only this typed policy result; it owns no second axis roster or value spelling. */
export function snapMatrixVariant(matrix: SnapAppearanceMatrix, cell: VariantMatrixPlan["cells"][number], index = 0): SnapMatrixVariant {
  const allAxes = [...matrix.appearanceAxes, ...environmentAxes(matrix.themes)];
  const theme = payloadForCell(allAxes, cell.assignment, ENVIRONMENT_AXIS.theme, isThemeEntry);
  return {
    id: variantArtifactId(cell.id, index),
    appearance: appearancePatchForCell(matrix, cell.assignment),
    theme: theme.id,
    device: payloadForCell(allAxes, cell.assignment, ENVIRONMENT_AXIS.device, isNullableString),
    colorScheme: payloadForCell(allAxes, cell.assignment, ENVIRONMENT_AXIS.colorScheme, isColorScheme),
    reducedMotion: payloadForCell(allAxes, cell.assignment, ENVIRONMENT_AXIS.motion, isBoolean),
    browserContrast: payloadForCell(allAxes, cell.assignment, ENVIRONMENT_AXIS.contrast, isBrowserContrast),
    reducedTransparency: payloadForCell(allAxes, cell.assignment, ENVIRONMENT_AXIS.transparency, isBoolean),
  };
}
