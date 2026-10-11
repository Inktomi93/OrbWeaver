// Type-only contract shared by the public matrix door and its private engine. Keeping these declarations
// out of the public implementation file prevents the engine/public-door dependency cycle.

export interface VariantValue {
  readonly id: string;
  readonly payload: unknown;
}

export interface VariantAxis {
  readonly id: string;
  readonly values: readonly VariantValue[];
}

export type VariantAssignment = Readonly<Record<string, string>>;

export interface VariantRequiredRow {
  readonly id: string;
  readonly assignment: VariantAssignment;
}

export interface VariantRequiredTwin {
  readonly id: string;
  readonly axis: string;
  readonly left: string;
  readonly right: string;
  readonly where: VariantAssignment;
}

export interface VariantMatrixSpec {
  readonly axes: readonly VariantAxis[];
  readonly isLegal: (assignment: VariantAssignment) => boolean;
  readonly requiredRows?: readonly VariantRequiredRow[];
  readonly requiredTwins?: readonly VariantRequiredTwin[];
}

export interface VariantCell {
  readonly id: string;
  readonly assignment: VariantAssignment;
}

export interface VariantMatrixReceipt {
  readonly axes: readonly { readonly id: string; readonly values: readonly string[] }[];
  readonly reachablePairs: readonly string[];
  readonly coveredPairs: readonly string[];
  readonly uncoveredPairs: readonly string[];
  readonly requiredRows: readonly { readonly id: string; readonly cellId: string }[];
  readonly requiredTwins: readonly { readonly id: string; readonly leftCellId: string; readonly rightCellId: string }[];
  readonly cellIds: readonly string[];
}

export interface VariantMatrixPlan {
  readonly cells: readonly VariantCell[];
  readonly receipt: VariantMatrixReceipt;
}
