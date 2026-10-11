// Deterministic pairwise planning shared by verdict tools. This module is deliberately policy-neutral:
// callers own their axes, legality, mandatory risk rows, and verdicts. It never builds a Cartesian product.

import { createHash } from "node:crypto";
import type { VariantAssignment, VariantAxis, VariantMatrixPlan, VariantMatrixSpec } from "./variant-matrix-contract.ts";
import { variantCellId as buildCellId, planVariantMatrix as plan } from "./variant-matrix-engine.ts";

const ARTIFACT_DIGEST_LENGTH = 12;

export type {
  VariantAssignment,
  VariantAxis,
  VariantCell,
  VariantMatrixPlan,
  VariantMatrixReceipt,
  VariantMatrixSpec,
  VariantRequiredRow,
  VariantRequiredTwin,
  VariantValue,
} from "./variant-matrix-contract.ts";

export function variantCellId(axes: readonly VariantAxis[], assignment: VariantAssignment): string {
  return buildCellId(axes, assignment);
}

/** Filesystem-safe deterministic handle for one full receipt identity. The receipt keeps every axis/value;
 *  artifacts use this bounded digest so a 42-axis cell never exceeds the host filename limit. */
export function variantArtifactId(identity: string, index: number): string {
  return `v${String(index + 1).padStart(2, "0")}-${createHash("sha256").update(identity).digest("hex").slice(0, ARTIFACT_DIGEST_LENGTH)}`;
}

export function planVariantMatrix(spec: VariantMatrixSpec): VariantMatrixPlan {
  return plan(spec);
}
