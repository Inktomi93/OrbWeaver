// Closed syntax/text carriers admitted to final ordinary-waiver reconciliation.
import type { SourceFile } from "ts-morph";

export const ORDINARY_WAIVER_RESOURCE_FORMATS = ["css", "markdown", "jsonc", "json", "sql"] as const;
export type OrdinaryWaiverResourceFormat = (typeof ORDINARY_WAIVER_RESOURCE_FORMATS)[number];

export type OrdinaryWaiverSource =
  | { readonly kind: "typescript"; readonly path: string; readonly sourceFile: SourceFile }
  | { readonly kind: "resource"; readonly path: string; readonly format: OrdinaryWaiverResourceFormat; readonly text: string };
