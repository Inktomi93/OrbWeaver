# 957 codemod read census

## Outcome

Every read in `tooling/src/codemod/lib` (and the `ops/` read that feeds `lib/deep-imports.ts`) was classified against the floor readers. Five reads answered a question a floor reader already answers and are folded in this change. The rest either already call the floor, are native mutation/diagnostic/relation owners the item retains, or ask a question no floor reader answers.

## Method

- Read in full: every file in `tooling/src/codemod/lib`, `contract/types.ts`, `contract/deep-imports.ts`, `ops/deep-imports.ts`, `ops/test-subpaths.ts`; floor `drizzle-write-chain.ts`, `drizzle-operators.ts`, `drizzle-table-ref.ts` (head), `module-importers.ts`, `module-target.ts`, `module-specifier.ts`, `module-reach-contract.ts`, `package-module.ts`; gate `package-deep-import.ts`.
- `ast-grep` over a `git archive HEAD` extraction of `tooling/src/codemod`, both `--lang ts` (39 files scanned) and `--lang tsx` (0 files exist; 0 matches is absence, confirmed by the file count). Patterns: `$X.getModuleSpecifierValue()` (11), `$X.getImportDeclarations()` (7), `$X.getExportDeclarations()` (4), `$X.getReferencingNodesInOtherSourceFiles()` (2), `$X.getReferencingSourceFiles()` (2), `$X.getReferencingLiteralsInOtherSourceFiles()` (1), `$X.getImportStringLiterals()` (1), `$X.getDescendantsOfKind($K)` (10), `$X.getPreEmitDiagnostics()` (2), `$X.getType()` (1), `$X.getSymbol()` (0), `$X.getText() === $Y` (4), `$R.exec($P)` (4).
- Second method: literal `rg` counts of the same accessors on the same extraction agree per file; no optional-chain or bracket spelling of `getModuleSpecifierValue` exists. The one `ops/recipes.ts` hit is example code inside a string.
- `pnpm ast` verbs were listed; none answers "which codemod read duplicates a floor reader", so the classification rests on the reads above.

## Folded reads

| Site (HEAD) | Question | Floor reader now called |
| - | - | - |
| `lib/id-casts.ts` `insertTargetTable` | Which table does the enclosing `.values()`/`.set()` write chain name? | `readDrizzleWriteTable` (`floor/code-facts/drizzle-write-chain.ts`), in every `ctx.semantic().sourceViews` world, all worlds agreeing |
| `lib/id-casts.ts` `scanComparisonCastTargets` callee test | Is this call a drizzle `eq`/`inArray`/… operator? | `callsDrizzleOperator` (`floor/code-facts/drizzle-operators.ts`), in every world, all agreeing |
| `lib/imports.ts:143,200,208,260,303`, `lib/import-routing.ts:65` | Which import declarations in this file spell module M exactly? | `collectModuleImporters(…, "exact-import-spelling")` through one helper, `exactImportDeclarations` |
| `ops/deep-imports.ts:72` `respellFile` | Which literals in this file sit in a module position? | `modulePositionSpecifier` (`floor/code-facts/module-specifier.ts`), the reader the `package-deep-import` gate uses |
| `lib/deep-imports.ts:17`, `ops/test-subpaths.ts:21,26` | Which package `src/` file is this repo path? | `packageFileOf`, now exported from `floor/code-facts/module-specifier.ts` (its existing private regex), also used by `relativeClimb` |

The 953 lane's known site (`insertTargetTable` needs the checker while `CodemodContext.project` is syntax-only) is routed through `ctx.semantic().sourceViews`; see the version table for the cases.

## Reads already on the floor (unchanged)

- `lib/imports.ts` `findImporters` (exact-import admission), `isVitestModuleMethod` binding identity (`declarationBindingKeys`, `inventoryDeclarationKey`).
- `lib/symbols.ts` `findExportedDeclaration`/`listExports` (`inventoryExports`); `findReferencesByName`/`renameExportedSymbol` (native `SemanticWorkspace`).
- `lib/deep-imports.ts` door exports and origin identity (`inventoryExports`, `inventoryDeclarationKey`, `packageModuleOf`); `ops/deep-imports.ts` narrow closure (`moduleClosure`, `inventoryStaticTarget`).
- `lib/relocate-code.ts` `isModulePosition` (`nativeModulePositionSpecifier` with the relocation admission).
- `lib/plans.ts` `isTestFile` (`classifyTestFilename`).

## Reads retained, with the reason

| Site | Why it stays |
| - | - |
| `lib/move-relations.ts` (`getReferencingLiteralsInOtherSourceFiles`, `getImportStringLiterals`), `lib/files.ts:153`, `lib/program-diagnostics.ts:38` | Native compiler relation owners; the item keeps them. |
| `lib/program-consumers.ts` module literal grammar | Asks which literals TypeScript resolves (no `require`/`vi.mock`); the floor default admits those callees and has no exclusion admission, so folding would widen the diagnostic consumer census. Native relation owner. |
| `lib/diagnostics.ts:262`, `lib/id-casts.ts` `semanticDiagnostics` | Native diagnostic owners. |
| `lib/imports.ts` `findImportersOfFile`, `findAllReferencersOfFile` | Native relation queries; see the flag below. |
| `lib/exports.ts:38,90,125,169` | Exact export-declaration spelling. The floor exact-spelling admission is import-only; no floor reader answers it. Adding an export query to `module-importers.ts` is a floor change with no second caller. |
| `lib/imports.ts` `moduleStringArg` grammar | Its exact admission (binding-checked `vi`, no `require`, no `doUnmock`) was qualified as retained by the earlier 957 batch. |
| `lib/symbols.ts:80` `findCallSites`, `lib/jsx.ts:19,24,73`, `lib/id-branding.ts` name sweeps | Documented spelling-level helpers; no floor reader answers callee-text, JSX tag or declaration-name matching. |
| `lib/id-casts.ts` `castFn` already-wrapped test, column text match | Caller-option spelling contracts, not code facts. |
| `lib/workspace-specifiers.ts` package-map resolution | Resolves against the before and after trees of a relocation; the after tree is not on disk, so native resolution cannot answer it. |
| `lib/move-relations.ts:180` `MODULE_EXTENSION.exec` | Extension spelling of a specifier, not a code fact. |

## Flags for the orchestrator

- `tooling/src/verify/gates/package-deep-import.ts` keeps its own `PACKAGE_SOURCE` regex and a `nextSpelling` that repeats `planDeepImport`'s same/cross-module decision. Both could call `packageFileOf` and one shared spelling reader. Not changed: it is a hard gate outside this item's codemod read side.
- `findImportersOfFile`/`findAllReferencersOfFile` ask ts-morph relations on the syntax carrier (one tsconfig, `skipFileDependencyResolution`), not on the native worlds. They have no in-repo caller beyond the kit export and the manifest.
- `lib/jsx.ts` `findJsxByTag` documents that `<Foo.Bar />` matches `"Foo"`, but it compares the whole tag text, so it matches `"Foo.Bar"`. The doc or the code is wrong.
