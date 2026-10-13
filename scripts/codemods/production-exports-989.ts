// Apply only adjudicated barrel edges; native Knip and the existing AST collectors own candidate evidence.

import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import process from "node:process";
import { isWithinRoot } from "@orb/kit/path-containment";
import { absolutePath, assert, getFlag, removeReExport, repoRelative, runCodemod } from "@orb/tooling/codemod";
import { resolveExportedDeclarations } from "@orb/tooling/floor/code-facts/reference-fact";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { z } from "zod";

const PACKAGE_SOURCE_PREFIX = "packages/";
const DEPENDENCY_SOURCE_PREFIX = "node_modules/";
const targetPathSchema = z
  .string()
  .startsWith(PACKAGE_SOURCE_PREFIX)
  .refine((file) => {
    const parts = file.split("/");
    const [, , sourceDirectory, ...target] = parts;
    return !file.includes("\\") && sourceDirectory === "src" && target.length > 0 && parts.every((part) => part !== "" && part !== "." && part !== "..");
  }, "Editable target must be a canonical packages/<owner>/src path");
const originPathSchema = z
  .union([z.string().startsWith(PACKAGE_SOURCE_PREFIX), z.string().startsWith(DEPENDENCY_SOURCE_PREFIX)])
  .refine((file) => !file.includes("\\") && file.split("/").every((part) => part !== "." && part !== ".."));
const originSchema = z.object({ file: originPathSchema, start: z.number().int().nonnegative() }).strict();
const ownerManifestSchema = z.object({ dependencies: z.record(z.string(), z.string()).default({}) });
const dependencyManifestSchema = z.object({ name: z.string().min(1) });
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
        file: targetPathSchema,
        moduleSpecifier: z.string().min(1),
        exports: z.array(selectionSchema).min(1),
        preserveModuleEvaluation: z.boolean(),
        reason: z.string().min(1),
      })
      .strict(),
  )
  .min(1);

function validateDependencyOrigins(source: Parameters<typeof resolveExportedDeclarations>[0], row: z.infer<typeof worksetSchema>[number], root: string): void {
  const origins = row.exports.flatMap((selection) => selection.origins).filter((origin) => origin.file.startsWith(DEPENDENCY_SOURCE_PREFIX));
  if (origins.length === 0) {
    return;
  }
  const ownerPath = absolutePath(`${row.file.split("/").slice(0, 2).join("/")}/package.json`, root);
  const owner = ownerManifestSchema.parse(JSON.parse(readFileSync(ownerPath, "utf8")));
  const dependency = Object.keys(owner.dependencies).find((name) => row.moduleSpecifier === name || row.moduleSpecifier.startsWith(`${name}/`));
  assert(dependency !== undefined, `Adjudicated dependency is not declared by the editing package: ${row.moduleSpecifier}`);
  const manifestPath = createRequire(ownerPath).resolve(`${dependency}/package.json`);
  const manifest = dependencyManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  assert(manifest.name === dependency, `Installed dependency identity differs: ${row.moduleSpecifier}`);
  const dependencyRoot = dirname(realpathSync(manifestPath));
  const module = source.getExportDeclaration((declaration) => declaration.getModuleSpecifierValue() === row.moduleSpecifier)?.getModuleSpecifierSourceFile();
  assert(module !== undefined, `Adjudicated dependency module is not a resolved export request: ${row.moduleSpecifier}`);
  assert(
    isWithinRoot(dependencyRoot, realpathSync(module.getFilePath()), { sep }),
    `Resolved module is outside its declared dependency: ${row.moduleSpecifier}`,
  );
  // Installed dependency symlinks may leave a worktree; their resolved package, never an arbitrary path, owns these read-only origins.
  for (const origin of origins) {
    assert(isWithinRoot(dependencyRoot, realpathSync(resolve(root, origin.file)), { sep }), `Origin is outside its resolved dependency: ${origin.file}`);
  }
}

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
      validateDependencyOrigins(source, row, ctx.repoRoot);
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
