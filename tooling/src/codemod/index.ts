// codemod's programmatic front door — the master ts-morph toolkit (ts-morph v28; verify with
// `cat node_modules/ts-morph/package.json`). One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5).
//
// Why this tool exists: every fresh agent that touches ts-morph re-derives the basics — project
// bootstrap, the stale-node footgun, the alias-path gap, callers vs importers, clean import surgery,
// "what if". This surface is the answer; `pnpm codemod` prints the manifest/recipes. Design rules
// (owner brief, load-bearing): RIGHT THE FIRST TIME · VALIDATE (impossible states throw CodemodError
// with a remediation hint) · NO SHORTCUTS · GUARD RAILS (destructive ops confirm; deletes stay in-repo;
// the runner refuses to save on a wedged project) · PREVIEW/WHAT-IF (dry-run default; `--apply` commits).
//
// Re-exporting ts-morph essentials is load-bearing: a codemod imports THIS surface and never names
// ts-morph directly — one version-pin home, no drift in downstream codemods.
export type {
  CallExpression,
  ExportDeclaration,
  ExportSpecifier,
  ImportDeclaration,
  ImportSpecifier,
  JsxAttribute,
  JsxElement,
  JsxOpeningElement,
  JsxSelfClosingElement,
  ProjectOptions,
  SourceFile,
  SourceFileReferencingNodes,
  Statement,
  StringLiteral,
} from "ts-morph";
export { Node, Project, SyntaxKind } from "ts-morph";
export type { CodemodContext, CodemodResult, CreateProjectOptions, Plan, RunCodemodOptions } from "./contract/types.ts";
export { printDiagnostics } from "./lib/diagnostics.ts";
export { CodemodError } from "./lib/errors.ts";
export { assertDirectoryExists, exampleRestructureCodemod, getFlag, readFileText, removeEmptyDirectory } from "./lib/example.ts";
export { addReExport, dedupeReExports, removeReExport } from "./lib/exports.ts";
export { copyFile, createSourceFile, deleteFiles, moveFiles } from "./lib/files.ts";
export { retypeIdAnnotations } from "./lib/id-branding.ts";
export { castIdInComparisons, castIdInObjectLiterals, castStringLiteralsByDiagnostic } from "./lib/id-casts.ts";
export {
  addNamedImport,
  findAllReferencersOfFile,
  findImporters,
  findImportersOfFile,
  makeImportTypeOnly,
  moduleStringArg,
  removeNamedImport,
  removeNamedImportBinding,
  renameNamedImport,
  repointAliasPaths,
  repointImports,
  routeSymbolsByMap,
} from "./lib/imports.ts";
export { findJsxAttributes, findJsxByTag, renameJsxTag } from "./lib/jsx.ts";
export { kit } from "./lib/kit.ts";
export { absolutePath, assert, assertPathString, composePlans, isTestFile, isUnderSrc, repoRelative, siblingTestPath } from "./lib/plans.ts";
export { createCodemodProject, DEFAULT_GLOBS } from "./lib/project.ts";
export { runCodemod } from "./lib/run.ts";
export { findCallSites, findExportedDeclaration, findReferencesByName, listExports, renameExportedSymbol } from "./lib/symbols.ts";
export { applyTextReplacements, replacementsForNodes } from "./lib/text.ts";
export { MANIFEST } from "./ops/manifest.ts";
export { migrateMacroBlocks, migrateMacroBlocksOp } from "./ops/migrate-macro-blocks.ts";
export { printHelp, printList, printRecipe, printRecipes, RECIPES, searchHelpers } from "./ops/recipes.ts";
