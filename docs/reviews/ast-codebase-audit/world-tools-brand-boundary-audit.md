# Brand and type-boundary audit — production first tranche

The production package denominator is closed over six native TypeScript programs. The initial synthetic whole-workspace project OOMed at about 4.1 GB and produced no verdict; the successful runs used each package's own tsconfig and merged physical sites. ast-grep independently scanned 6,446 TS and 1,409 TSX files.

## Confirmed findings

1. **High — inference class-2 brand migration is incomplete.** Seven model/provider columns are still bare text, and the writer contracts are still bare strings. The ST import path copies foreign model/provider values at chat-input.ts:39-40,61-62,75-76 and import-write.ts:338-339. A .$type edit alone would launder those bytes. Fix the seven columns together with producer validation, foreign-provider fallback, writer/read contracts, and per-column negative tests.
2. **Medium — fake disabled IDs bypass the castId-only gate.** Empty branded sentinels exist in use-display-scripts.ts:63, use-plugin-display-text.ts:44 (two brands), use-prompt-macro-suggestions.ts:51, and chat-documents-section.tsx:89. They are currently guarded, but the semantic control does not see direct assertions.
3. **Low — BroadcastChannel parsing casts any string to Handle.** session-channel.ts:73 checks only typeof string. The consumer compares it and hard reloads on mismatch, so no takeover path was confirmed, but the returned SessionMessage type is stronger than the runtime check.
4. **Medium coverage gap — AppRouter outputs are type-only across JSON.** The transport has 365 input parsers and 425 procedures, but zero output parsers. This needs a semantic output-truth inventory before adding schemas selectively; blanket output-schema duplication would be the wrong fix.

## Measured populations

- 75 canonical concrete brands (78 brand-bearing aliases including Branded, TypeIdOf, and one conditional alias)
- 116 selected production assertions; 44 nonbrand-to-brand assertions
- 350 Drizzle .$type calls; 254 carry a brand or branded member
- 563 checker-confirmed Zod operator sites; 347 have different checker input/output types
- 29 Zod-returning generic wrappers
- 153 type predicates; 10 mention branded/named-id shapes
- zero production @ts directives and zero brand-bearing non-null assertions in the six package programs

## Work to build

The report marks five concrete programs: finish the §5.3c class-2 migration; add a checker-backed brand manufacture/erase/tunnel lens; add a checker-backed Zod input/output lens; inventory AppRouter output truth; and build a table-symbol producer/read graph for branded Drizzle columns.

## Explicit remainder

The full per-site facts are in the JSON. Tests/tooling/scripts/playwright were structurally corroborated but not checker-adjudicated after the synthetic project OOM. Existing branded Drizzle columns have a complete column denominator but not yet a complete producer/read graph. The 332 default/prefault/catch/coerce Zod sites have checker facts but still need business-intent adjudication.
