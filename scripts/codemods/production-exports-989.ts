// Apply only adjudicated barrel edges; native Knip and the existing AST collectors own candidate evidence.

import { readFileSync } from "node:fs";
import process from "node:process";
import { absolutePath, assert, getFlag, removeReExport, repoRelative, runCodemod } from "@orb/tooling/codemod";
import { resolveExportedDeclarations } from "@orb/tooling/floor/code-facts/reference-fact";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { z } from "zod";

const PACKAGE_SOURCE_PREFIX = "packages/";
const originSchema = z.object({ file: z.string().startsWith(PACKAGE_SOURCE_PREFIX), start: z.number().int().nonnegative() }).strict();
const selectionSchema = z
  .object({
    name: z.string().min(1),
    exportedName: z.string().min(1),
    isTypeOnly: z.boolean(),
    origins: z.array(originSchema).min(1),
  })
  .strict();
const worksetSchema = z
  .array(
    z
      .object({
        file: z.string().startsWith(PACKAGE_SOURCE_PREFIX),
        moduleSpecifier: z.string().min(1),
        exports: z.array(selectionSchema).min(1),
        preserveModuleEvaluation: z.boolean(),
        reason: z.string().min(1),
      })
      .strict(),
  )
  .min(1);

const argv = process.argv.slice(2);
const worksetPath = getFlag("workset", argv);
assert(worksetPath !== undefined, "Pass --workset=<adjudicated JSON>; this recipe never chooses deletions from candidate counts.");
const workset = worksetSchema.parse(JSON.parse(readFileSync(worksetPath, "utf8")));
assert(
  readCompilerPrograms(process.cwd()).every((program) => program.commandLine.options.verbatimModuleSyntax === true),
  "Empty re-export preservation requires verbatimModuleSyntax in every native compiler world; re-adjudicate emission before applying.",
);

await runCodemod(
  "production-exports-989",
  (ctx) => {
    const corpus = ctx.semantic().sourceCorpus();
    // Validate every frozen origin before any mutation can shift declaration offsets.
    for (const row of workset) {
      const source = corpus.getSourceFile(absolutePath(row.file, ctx.repoRoot));
      assert(source !== undefined, `Adjudicated barrel is absent: ${row.file}`);
      for (const selection of row.exports) {
        const fact = resolveExportedDeclarations(source, selection.exportedName);
        assert(fact.kind === "resolved", `Unresolved adjudicated export: ${row.file}:${selection.exportedName}`);
        assert(
          fact.value.length === selection.origins.length &&
            fact.value.every((declaration) =>
              selection.origins.some(
                (origin) => repoRelative(declaration.getSourceFile().getFilePath(), ctx.repoRoot) === origin.file && declaration.getStart() === origin.start,
              ),
            ) &&
            selection.origins.every((origin) =>
              fact.value.some(
                (declaration) =>
                  repoRelative(declaration.getSourceFile().getFilePath(), ctx.repoRoot) === origin.file && declaration.getStart() === origin.start,
              ),
            ),
          `Adjudicated origin changed: ${row.file}:${selection.exportedName}; rebuild the workset on the landed source tree.`,
        );
      }
    }
    for (const row of workset) {
      ctx.plan(
        removeReExport(
          ctx,
          row.file,
          { moduleSpecifier: row.moduleSpecifier, exports: row.exports },
          {
            preserveModuleEvaluation: row.preserveModuleEvaluation,
            verbatimModuleSyntax: true,
            note: row.reason,
          },
        ),
      );
    }
  },
  { argv },
);
