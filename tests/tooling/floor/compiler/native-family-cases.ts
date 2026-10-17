import childProcess from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import type { InventoryBuildRequest, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

async function run(mode: string, root: string): Promise<object> {
  const spawn = childProcess.spawnSync;
  let active = false;
  let interventions = 0;
  Object.defineProperty(childProcess, "spawnSync", {
    value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
      const completed = spawn(...args);
      const worker = args[1]?.findIndex((value) => value.endsWith("semantic-inventory-worker.ts")) ?? -1;
      const requestPath = worker < 0 ? undefined : args[1]?.[worker + 1];
      if (active && completed.status === 0 && requestPath !== undefined) {
        interventions++;
        if (mode === "scalar-drift") {
          writeFileSync(join(root, "source.ts"), "export const changed=1;");
        } else {
          const request = JSON.parse(readFileSync(requestPath, "utf8")) as InventoryBuildRequest;
          using staging = new DatabaseSync(request.destination);
          staging.exec("DELETE FROM inventory_callable_trace;DELETE FROM inventory_callable_declaration;");
        }
      }
      return completed;
    },
  });
  syncBuiltinESMExports();
  const { createSemanticInventory } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { openInventoryDatabase, latestInventoryGeneration } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
  try {
    if (mode === "scalar-drift") {
      using previous = createSemanticInventory({ root, families: ["cast-relations"] });
      writeFileSync(join(root, "source.ts"), "declare const original:string; export const value=original as number;");
      active = true;
      let refusal: string | null = null;
      try {
        using _next = createSemanticInventory({ root, families: ["cast-relations"] });
      } catch (error) {
        refusal = String(error);
      }
      using database = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
      return {
        refusal,
        interventions,
        latestUnchanged: latestInventoryGeneration(database) === previous.generation,
        pinnedText: previous.sourceCorpus().getSourceFile("source.ts")?.getFullText(),
      };
    }
    const { Project, SyntaxKind } = await import("ts-morph");
    const { readCompilerPrograms } = await import("../../../../tooling/src/floor/compiler/compiler-programs.ts");
    const { createSemanticWorkspace } = await import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
    const { inventoryFileSystem } = await import("../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts");
    const descriptor = readCompilerPrograms(root).find(({ id }) => id === "tsconfig.json");
    const path = "tests/server/callable.test.ts";
    const source = createSemanticWorkspace({ root }).program("tsconfig.json")?.sourceFile(path);
    const call = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getExpression().getText() === "alias");
    if (descriptor === undefined || source === undefined || call === undefined) {
      throw new Error("native callable boundary input missing");
    }
    const node: InventorySpan = { file: source.getFilePath(), start: call.getStart(), end: call.getEnd(), kind: call.getKind() };
    const first = { program: descriptor.id, node };
    const options = { root, programs: [descriptor], families: ["callable-declarations"] as const };
    using previous = createSemanticInventory({ ...options, callableQueries: [first] });
    const text = source.getFullText();
    const changed = text.replace("return 1;", "return 9;");
    if (changed === text) {
      throw new Error("native callable overlay intervention did not change its input");
    }
    const fileSystem = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), {
      root,
      files: [{ path: join(root, path), text: changed }],
      deleted: [],
    });
    using overlay = createSemanticInventory({ ...options, callableQueries: [first], fileSystem, overlay: { addedPaths: [], deletedPaths: [] } });
    const overlaySource = overlay.sourceCorpus().getSourceFile(path);
    const overlayCall = overlaySource?.getDescendantsOfKind(SyntaxKind.CallExpression).find((candidate) => candidate.getStart() === node.start);
    if (overlayCall === undefined) {
      throw new Error("native callable overlay query missing");
    }
    const result = overlay.callableDeclaration(overlayCall, descriptor.id);
    const original = previous.callableDeclaration(call, descriptor.id);
    const refuse = (queries?: readonly { readonly program: string; readonly node: InventorySpan }[]): string | null => {
      try {
        using _invalid = createSemanticInventory({ ...options, ...(queries === undefined ? {} : { callableQueries: queries }) });
        return null;
      } catch (error) {
        return String(error);
      }
    };
    using database = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
    const latestUnchanged = latestInventoryGeneration(database) === previous.generation;
    const missing = refuse();
    const foreign = refuse([{ ...first, program: "foreign" }]);
    const incompletePath = join(root, "incomplete.sqlite");
    active = true;
    let incomplete: string | null = null;
    try {
      using _incomplete = createSemanticInventory({ ...options, databasePath: incompletePath, callableQueries: [first] });
    } catch (error) {
      incomplete = String(error);
    }
    using refused = openInventoryDatabase(incompletePath);
    return {
      overlayBody: result.kind === "resolved" ? result.value.body?.getText() : result.kind,
      pinnedBody: original.kind === "resolved" ? original.value.body?.getText() : original.kind,
      overlayIdentity: result.kind === "resolved" && result.value.sourceFile === overlaySource,
      latestUnchanged,
      missing,
      foreign,
      incomplete,
      interventions,
      incompleteGeneration: latestInventoryGeneration(refused),
    };
  } finally {
    Object.defineProperty(childProcess, "spawnSync", { value: spawn });
  }
}

if (process.argv[1] === import.meta.filename) {
  const mode = process.argv[2];
  const root = process.argv[3];
  const result = process.argv[4];
  if ((mode !== "scalar-drift" && mode !== "callable-boundaries") || root === undefined || result === undefined) {
    throw new Error("native family case requires its closed mode and fixture paths");
  }
  writeFileSync(result, JSON.stringify(await run(mode, root)));
}
