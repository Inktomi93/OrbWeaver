// The shapes the CODE-config static reader speaks (lib/config-static-read.ts) — the extractor behind the
// `eslint-grant-liveness` / `depcruise-grant-liveness` gates, which must resolve a file-exact row out of
// JS/CJS (consts, arrays, spreads, template literals) or REFUSE LOUDLY. Homed in contract/ per the
// five-slot type law (docs/law/Core-Tooling-Law.md §2.5): contract/ owns the shapes, lib/ owns the
// behavior. `no-inline-types` enforces it — a `lib/` module exporting a type alias is RED.
import type { SourceFile } from "ts-morph";
import type { ExactRow } from "../lib/grant-liveness.ts";

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
