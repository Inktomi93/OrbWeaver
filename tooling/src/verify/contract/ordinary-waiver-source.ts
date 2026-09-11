// Closed syntax/text carriers admitted to final ordinary-waiver reconciliation.
import type { SourceFile } from "ts-morph";

export const ORDINARY_WAIVER_RESOURCE_FORMATS = ["css", "markdown", "jsonc", "json", "sql"] as const;
export type OrdinaryWaiverResourceFormat = (typeof ORDINARY_WAIVER_RESOURCE_FORMATS)[number];

export type OrdinaryWaiverSource =
  | { readonly kind: "typescript"; readonly path: string; readonly sourceFile: SourceFile }
  | { readonly kind: "resource"; readonly path: string; readonly format: OrdinaryWaiverResourceFormat; readonly text: string };

/** A demanded carrier the reader would not produce. A receipted skip, never a silent absence. */
export interface OrdinaryWaiverCarrierRefusal {
  readonly path: string;
  readonly format: OrdinaryWaiverResourceFormat;
  /** `unacquired` is the host's own status: the path never came through a declared resource door. */
  readonly status: "missing" | "empty" | "unresolved" | "malformed" | "unacquired";
  readonly reason: string;
}

/** A TOTAL partition of the demanded waiver-format paths: each is one carrier or one refusal, never neither. */
export interface OrdinaryWaiverCarriers {
  readonly sources: readonly OrdinaryWaiverSource[];
  readonly refusals: readonly OrdinaryWaiverCarrierRefusal[];
}
