// One-shot codemod for #2358: promote the `reference-fact` family from `tooling/src/verify/lib/`
// (+ its contract) to `tooling/src/_shared/` — the tier both `verify` and `ast` read down into.
//
// WHY: `tooling/src/ast/ops/registry-candidates.ts` imports `verify/lib/reference-fact.ts`, and the
// `tooling-internal-direction` dep-cruiser rule forbids a cross-tool import into a sibling's `lib/`.
// `verify` already imports `ast` (`verify/ops/orphan-export-ratchet.ts`), so `ast → verify/lib` is a
// direction reversal. The owner ruled (issue #2358, 2026-09-14): move the family to `_shared/`, the
// floor both tools already read from, per `docs/history/type-worlds-program-2026-09-10.md`.
//
// Preview:  pnpm codemod:run scripts/codemods/reference-fact-to-shared.ts
// Apply:    pnpm codemod:run scripts/codemods/reference-fact-to-shared.ts --apply

import process from "node:process";
import type { CodemodContext, Plan } from "@orb/tooling/codemod";
import { findImportersOfFile, moveFiles, printDiagnostics, runCodemod } from "@orb/tooling/codemod";

const LIB = "tooling/src/verify/lib";
const CONTRACT = "tooling/src/verify/contract";
const SHARED = "tooling/src/_shared";
const TESTS_LIB = "tests/tooling/verify/lib";
const TESTS_SHARED = "tests/tooling/_shared";

/** Source + contract moves. `moveFiles` rewrites every importer's relative specifier; the alias-repoint
 *  pass below then re-points the importers whose HOME TIER convention is alias, not relative. */
const SOURCE_MOVES: ReadonlyArray<readonly [from: string, to: string]> = [
  [`${LIB}/reference-fact.ts`, `${SHARED}/reference-fact.ts`],
  [`${LIB}/reference-fact-binding-name.ts`, `${SHARED}/reference-fact-binding-name.ts`],
  [`${LIB}/reference-fact-call.ts`, `${SHARED}/reference-fact-call.ts`],
  [`${LIB}/reference-fact-global.ts`, `${SHARED}/reference-fact-global.ts`],
  [`${LIB}/reference-fact-member.ts`, `${SHARED}/reference-fact-member.ts`],
  [`${LIB}/reference-fact-module.ts`, `${SHARED}/reference-fact-module.ts`],
  [`${LIB}/reference-fact-overload.ts`, `${SHARED}/reference-fact-overload.ts`],
  [`${LIB}/reference-fact-state.ts`, `${SHARED}/reference-fact-state.ts`],
  [`${LIB}/reference-fact-writes.ts`, `${SHARED}/reference-fact-writes.ts`],
  [`${CONTRACT}/reference-fact.ts`, `${SHARED}/reference-fact-contract.ts`],
];

/** The central test mirror moves in the same commit (`test-layout` gate). */
const TEST_MOVES: ReadonlyArray<readonly [from: string, to: string]> = [
  [`${TESTS_LIB}/reference-fact.test.ts`, `${TESTS_SHARED}/reference-fact.test.ts`],
  [`${TESTS_LIB}/reference-fact-call.test.ts`, `${TESTS_SHARED}/reference-fact-call.test.ts`],
  [`${TESTS_LIB}/reference-fact-module.test.ts`, `${TESTS_SHARED}/reference-fact-module.test.ts`],
  [`${TESTS_LIB}/reference-fact-origin.suite.test.ts`, `${TESTS_SHARED}/reference-fact-origin.suite.test.ts`],
  [`${TESTS_LIB}/reference-fact-writes.test.ts`, `${TESTS_SHARED}/reference-fact-writes.test.ts`],
];

/** New module specifier each moved file answers to when imported from an ALIAS-preferring tier
 *  (measured: `verify/lib/**` and `tests/tooling/{_shared,verify/lib}/**` import `_shared` by alias —
 *  41 alias vs 10 relative in `verify/lib`, 7 alias vs 0 relative in `tests/tooling/verify/lib`).
 *  `gates/`, `contract/`, and `ast/ops/` import `_shared` by RELATIVE path (0 alias in each, measured
 *  the same way) — those importers are left at whatever `moveFiles`'s own relative rewrite produced. */
const ALIAS_TARGET: ReadonlyArray<readonly [toRepoRel: string, alias: string]> = [
  [`${SHARED}/reference-fact.ts`, "@orb/tooling/_shared/reference-fact"],
  [`${SHARED}/reference-fact-binding-name.ts`, "@orb/tooling/_shared/reference-fact-binding-name"],
  [`${SHARED}/reference-fact-call.ts`, "@orb/tooling/_shared/reference-fact-call"],
  [`${SHARED}/reference-fact-global.ts`, "@orb/tooling/_shared/reference-fact-global"],
  [`${SHARED}/reference-fact-member.ts`, "@orb/tooling/_shared/reference-fact-member"],
  [`${SHARED}/reference-fact-module.ts`, "@orb/tooling/_shared/reference-fact-module"],
  [`${SHARED}/reference-fact-overload.ts`, "@orb/tooling/_shared/reference-fact-overload"],
  [`${SHARED}/reference-fact-state.ts`, "@orb/tooling/_shared/reference-fact-state"],
  [`${SHARED}/reference-fact-writes.ts`, "@orb/tooling/_shared/reference-fact-writes"],
  [`${SHARED}/reference-fact-contract.ts`, "@orb/tooling/_shared/reference-fact-contract"],
];

/** Importer directories whose established convention for reaching `_shared` is the alias form.
 *  Everything else (gates/, contract/, ast/ops/, and any other test dir) keeps the relative form
 *  `moveFiles` already computed. */
const ALIAS_TIER_PREFIXES = [`${LIB}/`, `${TESTS_LIB}/`, `${TESTS_SHARED}/`, `${SHARED}/`];

function isAliasTierImporter(repoRelativePath: string): boolean {
  return ALIAS_TIER_PREFIXES.some((prefix) => repoRelativePath.startsWith(prefix));
}

/** Repoint every importer in an alias-preferring tier from the relative specifier `moveFiles` left it
 *  with, to that tier's alias convention — using the kit's own `findImportersOfFile` (relative-aware:
 *  it resolves the CURRENT specifier text back to the target SourceFile, so it finds the import
 *  regardless of what relative depth `moveFiles` computed). Same-directory moved-family siblings (e.g.
 *  `reference-fact.ts` importing `./reference-fact-global.ts`, or the moved test files importing each
 *  other) are UNCHANGED — `isAliasTierImporter` still matches them, but the loop below excludes a moved
 *  file re-pointing at a sibling it moved alongside. */
function repointAliasTierImporters(ctx: CodemodContext): Plan {
  const touchedFiles = new Set<string>();
  const edits: Array<() => void> = [];
  let editCount = 0;

  for (const [toRepoRel, alias] of ALIAS_TARGET) {
    const toAbs = `${ctx.repoRoot}/${toRepoRel}`;
    const targetSf = ctx.project.getSourceFile(toAbs);
    if (targetSf === undefined) {
      continue;
    }
    for (const decl of findImportersOfFile(targetSf)) {
      const importerSf = decl.getSourceFile();
      const importerAbs = importerSf.getFilePath();
      if (importerAbs === toAbs) {
        continue;
      }
      const importerRepoRel = importerAbs.startsWith(`${ctx.repoRoot}/`) ? importerAbs.slice(ctx.repoRoot.length + 1) : importerAbs;
      const isMovedSibling = ALIAS_TARGET.some(([siblingRepoRel]) => `${ctx.repoRoot}/${siblingRepoRel}` === importerAbs);
      if (isMovedSibling || !isAliasTierImporter(importerRepoRel)) {
        continue;
      }
      touchedFiles.add(importerAbs);
      editCount += 1;
      edits.push(() => decl.setModuleSpecifier(alias));
    }
  }

  return {
    description: `Re-point ${editCount} alias-tier import declaration(s) at the new @orb/tooling/_shared/reference-fact* specifiers`,
    touchedFiles: [...touchedFiles],
    transform(): void {
      for (const edit of edits) {
        edit();
      }
    },
  };
}

await runCodemod(
  "reference-fact-to-shared",
  (ctx) => {
    ctx.plan(moveFiles(ctx, [...SOURCE_MOVES, ...TEST_MOVES]));
    ctx.plan(repointAliasTierImporters(ctx));
    if (process.argv.slice(2).includes("--diagnose")) {
      printDiagnostics(ctx.project);
    }
  },
  {
    argv: process.argv.slice(2),
    // The default globs are packages/scripts/tests-only (#…); this codemod's whole population is
    // under tooling/ + tests/tooling/, so the project must be widened explicitly.
    setup: { replaceGlobs: ["tooling/src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"].map((g) => `${process.cwd()}/${g}`) },
  },
);
