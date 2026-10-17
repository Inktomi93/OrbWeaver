import childProcess from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

function refusal(action: () => void): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return String(error);
  }
}

async function run(mode: string, root: string): Promise<object> {
  if (mode === "policy-ambiguous") {
    const { gate } = await import("../../../../tooling/src/verify/gates/contract-structural-copy.ts");
    const { projectCtx, nativeTypeFactOptions } = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const { runPolicyPass } = await import("../../../../tooling/src/verify/lib/policy-pass.ts");
    const context = projectCtx(root);
    const result = runPolicyPass({
      root,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: [gate],
      knownPolicies: [gate],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    return { toolErrors: result.toolErrors, withheld: result.authority.withheldPolicyIds };
  }
  const { Project } = await import("ts-morph");
  if (mode === "foreign-source") {
    let workers = 0;
    const spawn = childProcess.spawnSync;
    Object.defineProperty(childProcess, "spawnSync", {
      value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
        if (args[1]?.some((value) => value.endsWith("semantic-inventory-worker.ts")) === true) {
          workers++;
          throw new Error("foreign shape demand must refuse before workers");
        }
        return spawn(...args);
      },
    });
    syncBuiltinESMExports();
    try {
      const { createSemanticInventory } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
      const project = new Project({ useInMemoryFileSystem: true });
      const source = project.createSourceFile("/isolated/packages/server/src/domain/chat/contract/rows.ts", "export interface Copy {a:string}");
      const error = refusal(() => {
        using _inventory = createSemanticInventory({ root, shapePlan: { sources: [source], prepare: () => [] } });
      });
      return { workers, refusal: error };
    } finally {
      Object.defineProperty(childProcess, "spawnSync", { value: spawn });
    }
  }
  const { parseFlags } = await import("../../../../tooling/src/ast/lib/emit.ts");
  const { respellNearCandidatesFor } = await import("../../../../tooling/src/ast/lib/respell-near-analysis.ts");
  const { assignabilityChecker, respellHitsFor, shapesUnder } = await import("../../../../tooling/src/ast/lib/respell-shapes.ts");
  const { cmdRespell, prepareRespellInventory } = await import("../../../../tooling/src/ast/ops/respell.ts");
  const { installOutputSink } = await import("../../../../tooling/src/floor/cli/log.ts");
  const { bindShapeInventory } = await import("../../../../tooling/src/floor/code-facts/shape-inventory-scope.ts");
  const { readShapeFields } = await import("../../../../tooling/src/floor/code-facts/shape-facts.ts");
  const contract = "packages/contracts/src/chat/rows.ts";
  const domain = "packages/server/src/domain/chat/contract/rows.ts";
  if (mode === "respell-mapped") {
    const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
    const contracts = project.createSourceFile(join(root, contract), readFileSync(join(root, contract), "utf8"));
    const server = project.createSourceFile(join(root, domain), readFileSync(join(root, domain), "utf8"));
    let checkerReads = 0;
    Object.defineProperty(project, "getTypeChecker", {
      value: () => {
        checkerReads++;
        throw new Error("syntax checker forbidden");
      },
    });
    using inventory = prepareRespellInventory(root, project, "chat", parseFlags(["--near", "60"]));
    if (inventory === undefined) {
      throw new Error("native mapped shape witness missing");
    }
    using _binding = bindShapeInventory([contracts, server], inventory);
    const fields = readShapeFields(contracts.getTypeAliasOrThrow("Mapped"), "respell")?.map(({ name }) => name);
    const exact = respellHitsFor(project, undefined, "chat").map(({ text }) => text);
    const near = respellNearCandidatesFor(project, undefined, "chat", 60).map(({ domainName, contractsName, diff }) => ({
      domainName,
      contractsName,
      renamed: diff.renamed,
    }));
    cmdRespell(project, "chat", parseFlags(["--near", "60"]));
    server.insertText(0, "// changed\n");
    const stale = refusal(() => {
      respellHitsFor(project, undefined, "chat");
    });
    inventory[Symbol.dispose]();
    const disposed = refusal(() => {
      readShapeFields(server.getInterfaceOrThrow("Exact"), "copy");
    });
    return { fields, exact, near, checkerReads, stale, disposed };
  }
  const { createSemanticWorkspace } = await import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
  const owner = createSemanticWorkspace({ root }).program("tsconfig.json");
  if (owner === undefined) {
    throw new Error("native shape binding owner missing");
  }
  const project = owner.project();
  const sources = [project.getSourceFileOrThrow(join(root, contract)), project.getSourceFileOrThrow(join(root, domain))];
  const catalog = (): Pick<ReturnType<typeof shapesUnder>[number], "name" | "fields">[] =>
    shapesUnder(project, "/packages/contracts/src/chat/").map(({ name, fields }) => ({ name, fields }));
  const nativeCatalog = catalog();
  const checker = assignabilityChecker(project);
  const nativeExact = respellHitsFor(project, checker, "chat").map(({ text }) => text);
  const nativeNear = respellNearCandidatesFor(project, checker, "chat", 60).map(({ domainName, contractsName, diff }) => ({ domainName, contractsName, diff }));
  const { openInventoryDatabase, publishInventoryGeneration, readInventoryGeneration } = await import(
    "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts"
  );
  const { extractInventoryPartition } = await import("../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts");
  const { inventoryReader } = await import("../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts");
  let storedCatalogSame = false;
  const nonObjects: object[] = [];
  {
    using db = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
    const partition = extractInventoryPartition({
      root,
      descriptor: owner.descriptor,
      destination: join(root, "unused.sqlite"),
      families: ["exports", "shape-catalog"],
    });
    const generation = publishInventoryGeneration(db, [partition]);
    using stored = inventoryReader(root, generation, readInventoryGeneration(db, generation), {
      db,
      shapeOwners: new Map(sources.map((source) => [source, owner.descriptor.id])),
      dispose: () => undefined,
    });
    using _binding = bindShapeInventory(sources, stored);
    storedCatalogSame = isDeepStrictEqual(catalog(), nativeCatalog);
    for (const source of sources) {
      const scalar = source.getExportedDeclarations().get("scalar")?.[0];
      if (scalar === undefined) {
        throw new Error("native non-object binding missing");
      }
      const shape = stored.shape(scalar);
      nonObjects.push({ copy: shape.copy, respell: shape.respell });
    }
  }
  using inventory = prepareRespellInventory(root, project, "chat", parseFlags(["--near", "60"]));
  if (inventory === undefined) {
    throw new Error("native exported shape witness missing");
  }
  using _binding = bindShapeInventory(sources, inventory);
  const exactSame = isDeepStrictEqual(
    respellHitsFor(project, undefined, "chat").map(({ text }) => text),
    nativeExact,
  );
  const nearSame = isDeepStrictEqual(
    respellNearCandidatesFor(project, undefined, "chat", 60).map(({ domainName, contractsName, diff }) => ({ domainName, contractsName, diff })),
    nativeNear,
  );
  const lines: string[] = [];
  const release = installOutputSink({ line: (line) => lines.push(line), warn: () => undefined });
  try {
    cmdRespell(project, "chat", parseFlags(["--near", "60", "--json"]));
  } finally {
    release();
  }
  const { z } = await import("zod");
  const exactLine = z.object({ hits: z.array(z.object({ text: z.string() })) }).parse(JSON.parse(lines[0] ?? "null"));
  return {
    names: nativeCatalog.map(({ name }) => name),
    exactCount: nativeExact.length,
    nearCount: nativeNear.length,
    storedCatalogSame,
    nonObjects,
    exactSame,
    nearSame,
    lines: lines.map((line) => JSON.parse(line)),
    exactLineSame: isDeepStrictEqual(
      exactLine.hits,
      nativeExact.map((text) => ({ text })),
    ),
  };
}

if (process.argv[1] === import.meta.filename) {
  const mode = process.argv[2];
  const root = process.argv[3];
  const result = process.argv[4];
  if (
    (mode !== "foreign-source" && mode !== "respell-mapped" && mode !== "respell-exported" && mode !== "policy-ambiguous") ||
    root === undefined ||
    result === undefined
  ) {
    throw new Error("native shape case requires its closed mode and subject paths");
  }
  writeFileSync(result, JSON.stringify(await run(mode, root)));
}
