// The `kit` convenience bundle — everything in one importable object (`import { kit } from
// "@orb/tooling/codemod"`). The named exports still work; this is purely an ergonomics nod.
import { MANIFEST } from "../ops/manifest.ts";
import { printHelp, printList, printRecipe, printRecipes, RECIPES, searchHelpers } from "../ops/recipes.ts";
import { printDiagnostics } from "./diagnostics.ts";
import { CodemodError } from "./errors.ts";
import { addReExport, dedupeReExports, removeReExport } from "./exports.ts";
import { copyFile, createSourceFile, deleteFiles, moveFiles } from "./files.ts";
import { retypeIdAnnotations } from "./id-branding.ts";
import { castIdInComparisons, castIdInObjectLiterals, castStringLiteralsByDiagnostic } from "./id-casts.ts";
import {
  addNamedImport,
  findAllReferencersOfFile,
  findImporters,
  findImportersOfFile,
  makeImportTypeOnly,
  moduleStringArg,
  removeNamedImport,
  renameNamedImport,
  repointAliasPaths,
  repointImports,
  routeSymbolsByMap,
} from "./imports.ts";
import { findJsxAttributes, findJsxByTag, renameJsxTag } from "./jsx.ts";
import { absolutePath, assert, assertPathString, composePlans, isTestFile, isUnderSrc, repoRelative, siblingTestPath } from "./plans.ts";
import { createCodemodProject } from "./project.ts";
import { runCodemod } from "./run.ts";
import { findCallSites, findExportedDeclaration, findReferencesByName, listExports, renameExportedSymbol } from "./symbols.ts";
import { applyTextReplacements, replacementsForNodes } from "./text.ts";

export const kit = {
  // biome-ignore lint/style/useNamingConvention: the class + registry constants keep their own exported casing inside the bundle.
  CodemodError,
  runCodemod,
  createCodemodProject,
  composePlans,
  assert,
  assertPathString,
  absolutePath,
  repoRelative,
  isUnderSrc,
  isTestFile,
  siblingTestPath,
  moveFiles,
  deleteFiles,
  createSourceFile,
  copyFile,
  findImporters,
  findImportersOfFile,
  findAllReferencersOfFile,
  repointImports,
  repointAliasPaths,
  moduleStringArg,
  addNamedImport,
  removeNamedImport,
  renameNamedImport,
  makeImportTypeOnly,
  routeSymbolsByMap,
  addReExport,
  removeReExport,
  dedupeReExports,
  findReferencesByName,
  findExportedDeclaration,
  listExports,
  findCallSites,
  renameExportedSymbol,
  applyTextReplacements,
  replacementsForNodes,
  retypeIdAnnotations,
  castIdInObjectLiterals,
  castIdInComparisons,
  castStringLiteralsByDiagnostic,
  findJsxByTag,
  renameJsxTag,
  findJsxAttributes,
  printDiagnostics,
  printHelp,
  printList,
  printRecipes,
  printRecipe,
  searchHelpers,
  // biome-ignore lint/style/useNamingConvention: MANIFEST is the registry constant's own exported name.
  MANIFEST,
  // biome-ignore lint/style/useNamingConvention: RECIPES is the registry constant's own exported name.
  RECIPES,
} as const;
