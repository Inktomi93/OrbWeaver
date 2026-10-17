import childProcess from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import type { InventoryBuildRequest, SemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

const mode = process.argv[2];
const root = process.argv[3];
const resultPath = process.argv[4];
const log = process.argv[5];
if ((mode !== "writer" && mode !== "codemod-refusal") || root === undefined || resultPath === undefined || (mode === "writer" && log === undefined)) {
  throw new Error("native inventory command case requires its closed mode and fixture paths");
}
if (mode === "writer") {
  const path = log;
  if (path === undefined) {
    throw new Error("native competing writer log missing");
  }
  mkdirSync(dirname(path), { recursive: true });
  const spawn = childProcess.spawnSync;
  Object.defineProperty(childProcess, "spawnSync", {
    value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
      const index = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
      const requestPath = index < 0 ? undefined : args[1]?.[index + 1];
      if (requestPath !== undefined) {
        const request = JSON.parse(readFileSync(requestPath, "utf8")) as InventoryBuildRequest;
        appendFileSync(path, `${JSON.stringify(request.descriptor.id)}\n`);
      }
      return spawn(...args);
    },
  });
  syncBuiltinESMExports();
  try {
    const { createSemanticInventory } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
    using inventory = createSemanticInventory({ root });
    writeFileSync(resultPath, JSON.stringify({ generation: inventory.generation, programs: inventory.programs }));
  } finally {
    Object.defineProperty(childProcess, "spawnSync", { value: spawn });
  }
} else {
  const { createSemanticInventory } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { runCodemod } = await import("../../../../tooling/src/codemod/index.ts");
  const { openInventoryDatabase, latestInventoryGeneration } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
  using committed = createSemanticInventory({ root });
  const basePath = join(root, "packages/kit/src/base.ts");
  const original = readFileSync(basePath, "utf8");
  const observations: object[] = [];
  let captured: SemanticInventory | undefined;
  let refusal: string | null = null;
  try {
    await runCodemod(
      "inventory transaction",
      (context) => {
        const added = join(root, "packages/client/src/absent.ts");
        const deleted = join(root, "tests/consumer.ts");
        context.plan({
          description: "Change transaction bytes and membership",
          touchedFiles: [basePath, added, deleted],
          transform: (ctx) => {
            ctx.project.getSourceFileOrThrow(basePath).replaceWithText(original.replace("alive=1", "alive=101"));
            ctx.project.createSourceFile(added, "export const absent=7;\n");
            ctx.project.getSourceFileOrThrow(deleted).delete();
          },
        });
        const workspace = context.semantic();
        {
          using inventory = workspace.inventory();
          captured = inventory;
          const missing = inventory.sourceCorpus().getSourceFile("packages/client/src/missing.ts")?.getImportDeclarations()[0];
          const browser = inventory.sourceCorpus().getSourceFile("packages/client/src/browser.ts");
          const alias = browser?.getImportDeclarations()[0];
          const platform = browser?.getImportDeclarations().find((entry) => entry.getModuleSpecifierValue() === "fixture-platform");
          if (missing === undefined || alias === undefined || platform === undefined) {
            throw new Error("native codemod transaction source missing");
          }
          const target = inventory.moduleTarget(alias);
          if (target === undefined) {
            throw new Error("native codemod transaction alias target missing");
          }
          observations.push({
            lookup: inventory.moduleTarget(missing)?.getFilePath(),
            alias: inventory.exports(target, alias).get("renamed")?.[0]?.getSourceFile().getFilePath(),
            platform: inventory.moduleTarget(platform)?.getFilePath(),
            text: inventory.sourceCorpus().getSourceFile(basePath)?.getFullText(),
            absentDeleted: !inventory
              .sourceCorpus()
              .getSourceFiles()
              .some((file) => file.getFilePath() === deleted),
          });
        }
        using fresh = workspace.inventory();
        observations.push({ text: fresh.sourceCorpus().getSourceFile(basePath)?.getFullText() });
        throw new Error("refuse transaction after extraction");
      },
      {
        argv: [],
        repoRoot: root,
        setup: {
          tsConfigFilePath: join(root, "packages/kit/tsconfig.json"),
          replaceGlobs: [`${root}/packages/*/src/*.ts`, `${root}/scripts/*.ts`, `${root}/tests/*.ts`],
        },
        skipDiagnosticsCheck: true,
      },
    );
  } catch (error) {
    refusal = String(error);
  }
  let disposed: string | null = null;
  try {
    captured?.sourceCorpus().getSourceFiles();
  } catch (error) {
    disposed = String(error);
  }
  using db = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
  writeFileSync(
    resultPath,
    JSON.stringify({
      refusal,
      disposed,
      observations,
      physicalUnchanged: readFileSync(basePath, "utf8") === original,
      latestUnchanged: latestInventoryGeneration(db) === committed.generation,
      pinnedUnchanged: committed.sourceCorpus().getSourceFile(basePath)?.getFullText() === original,
    }),
  );
}
