// Parsed authored DATA, split by GRAMMAR because the two grammars fail differently.
//
// STRICT JSON (`json`) has no comment syntax at all, so a `//` is a parse error rather than a nuance — and
// a config that silently fell back to a default runs a different tool than the repository asked for, which
// makes every verdict downstream of it a lie. JSONC (`jsonc`) is TypeScript's config grammar, where the
// EFFECTIVE shape is not in the literal file: it is spread across an `extends` chain and a project-reference
// graph, and a reader that stops at the first file reports a partial config as a complete one.
//
// MISSING AND UNPARSEABLE ARE SEPARATE FACTS AT BOTH DOORS, and neither ever becomes `{}`.
// `resource-gate-access-patterns.md:126` is the law: *"Missing and parse failure must be separate
// unresolved/tool-error facts… The host must never collapse missing/unparseable into `{}`. An empty row
// population is a refusal for the liveness family, not a clean result."* Today the consuming gates disagree
// — some return silently, some report a finding, some throw — and unifying that is part of this door, not a
// follow-up. It is the same shape as the ruled biome refusal (`0df3fa9d6`, #1245): checking ZERO files is a
// REFUSAL, never a clean lint, because an empty result and a broken reader are byte-identical.
//
// WHY `JsonValue` AND NOT A PER-ID SCHEMA. The access-patterns design sketches `JsonValueFor<I>`, a distinct
// static shape per id. That would put five consumers' data schemas inside the RESOURCE contract, where they
// would rot away from the gates that own them — and `packageMetadata` already sets the opposite precedent by
// shaping its own narrow view behind its own door. So the door's promise is exactly "this is JSON, and it
// parsed": a real recursive JSON type rather than `unknown`, with each consumer narrowing what it owns. That
// is the "typed JSON with a distinct parse-failure fact, not raw text" the design asks for; the part it does
// not buy is a shared home for five unrelated schemas, which is not a thing this door should own.

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Every strict-JSON resource, keyed by a closed id. A gate may not supply a path; adding an id is a
 *  contract edit with a named consumer, which is what keeps this from becoming `readFile(path)`. */
export const JSON_RESOURCE_PATHS = {
  /** `biome-grant-liveness`: the override rows whose `includes` are suppression grants. */
  biome: "biome.json",
  /** `baseline-single-migration`: the migration journal beside the squashed baseline. */
  "migration-journal": "packages/db/src/migrations/meta/_journal.json",
  /** `no-raw-z-index` and the token policies: the canonical token vault. */
  tokens: "packages/ui/src/tokens/tokens.json",
  /** `dangling-refs`: the catalog IS the census of living documents. */
  "doc-catalog": "docs/catalog/catalog.json",
  /** The Base UI family: the committed surface the installed package is adjudicated against. */
  "baseui-manifest": "tooling/src/verify/gates/baseui-surface.manifest.json",
} as const;

export type JsonResourceId = keyof typeof JSON_RESOURCE_PATHS;

export interface JsonResourceFacts {
  readonly id: JsonResourceId;
  readonly path: string;
  readonly value: JsonValue;
}
