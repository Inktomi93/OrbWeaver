// The static config reader resolves runner selector values or returns each unreadable shape. Homed in contract/ per the
// five-slot type law (docs/law/Core-Tooling-Law.md §2.5): contract/ owns the shapes, lib/ owns the
// behavior. `orb/type-home-direct-export` enforces it (D331).
import type { SourceFile } from "ts-morph";

/** One classified file-exact row: the config FILE it was declared in (findings anchor there — a registry may
 *  span several config files, e.g. tsconfig.json + tsconfig.tests-dom.json), the literal path, and the
 *  1-based source line it sits on (0 when the line scan can't place it — the finding still stands, it just
 *  anchors file-level). */
export interface ExactRow {
  readonly file: string;
  readonly path: string;
  readonly line: number;
}

/** One shape the evaluator refused to read, for the caller's fail-loud arm.
 *  @public knip type-face false positive — a structural field of `StaticRead`/`RowExtraction`, never
 *  referenced by its own name at any call site. */
export interface UnresolvedShape {
  /** The ts-morph SyntaxKind name — what the reader hit (`CallExpression`, `ConditionalExpression`, …). */
  readonly kind: string;
  /** The offending source text, for the diagnostic. */
  readonly text: string;
  /** 1-based line in the config file. */
  readonly line: number;
}

/** What a static evaluation produced: the ordered strings it could prove, AND every shape it could not.
 *  A caller that ignores `unresolved` is printing a clean zero over rows it never read.
 *  @public knip type-face false positive — the return type of `readValue` and of the row extractor `createRowExtractor` returns, never referenced
 *  by its own name at any call site. */
export interface StaticRead {
  readonly values: readonly string[];
  readonly unresolved: readonly UnresolvedShape[];
}

/** The three outcomes of reading a config off disk. `missing` and `unparseable` are BOTH loud: a
 *  silently-defaulted lint/import config would make every verdict downstream of it a lie. */
export type ConfigRead =
  | { readonly kind: "missing" }
  | { readonly kind: "unparseable"; readonly detail: string }
  | { readonly kind: "ok"; readonly sf: SourceFile; readonly text: string };

/** Classify one derived config value: the repo-relative path when it names ONE file, or `undefined` when it
 *  is a pattern (a declared skip). Registry-specific — glob syntax (eslint) vs regex source (dep-cruiser).
 *  @public knip type-face false positive — a structural field of `ExtractRequest`, never referenced by its
 *  own name at any call site. */
export type PathClassifier = (value: string) => string | undefined;

export interface ExtractRequest {
  readonly sf: SourceFile;
  /** Repo-relative path of the config — every emitted row anchors here. */
  readonly rel: string;
  readonly text: string;
  /** The property names whose values are judged (`files`/`ignores`, `path`/`pathNot`). */
  readonly keys: readonly string[];
  readonly classify: PathClassifier;
}

export interface RowExtraction {
  /** Every value derived from a judged key — the honest denominator. */
  readonly candidates: number;
  readonly exact: readonly ExactRow[];
  /** Values that are patterns, not single files (declared skips). */
  readonly skipped: number;
  /** The same values, ANCHORED (#973). A skip used to be a bare count, which is how 298 pattern grants
   *  became invisible permanent authority: the pattern-liveness half judges these rows, so the extractor
   *  must hand them out rather than tallying them away. */
  readonly skippedRows: readonly ExactRow[];
  readonly unresolved: readonly UnresolvedShape[];
}
