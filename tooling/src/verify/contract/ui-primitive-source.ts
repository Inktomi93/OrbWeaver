// The per-file source evidence the UI primitive fact collects and its structure reader judges.
import type { ExportDeclaration, Node, SourceFile, VariableDeclaration } from "ts-morph";

export interface SourceEvidence {
  readonly source: SourceFile;
  readonly code: string;
  readonly colorText: string;
  readonly tvExports: readonly VariableDeclaration[];
  readonly exports: readonly ExportDeclaration[];
  readonly jsx: readonly { readonly tag: string; readonly line: number; readonly node: Node }[];
}
