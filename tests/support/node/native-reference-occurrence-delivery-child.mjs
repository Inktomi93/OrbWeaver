// The observed native child owns publication; callers receive only its completed assertion data.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

await test("native indexed occurrence delivery", async () => {
  const root = process.argv[2];
  const resultPath = process.argv[3];
  if (root === undefined || resultPath === undefined) {
    throw new Error("native occurrence fixture requires root and result paths");
  }
  const { Project, SyntaxKind, ts } = await import("ts-morph");
  const { createSemanticInventory } = await import("../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { inventoryFileSystem } = await import("../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts");
  const { latestInventoryGeneration, openInventoryDatabase, readInventoryGeneration } = await import(
    "../../../tooling/src/floor/code-facts/semantic-inventory-database.ts"
  );
  const { readInventoryReferences } = await import("../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts");
  const options = { root, families: ["references", "bindings", "exports"] };
  const dependency = join(root, "vendor/index.ts");
  const original = readFileSync(dependency, "utf8");
  const changed = "export {Item} from './b';\n";
  function observe(inventory) {
    const source = inventory.sourceCorpus().getSourceFile(join(root, "consumer.ts"));
    if (source === undefined) {
      throw new Error("native occurrence source missing");
    }
    const local = source
      .getFunctionOrThrow("read")
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((node) => node.getName() === "local");
    const unused = source
      .getFunctionOrThrow("read")
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((node) => node.getName() === "unused");
    const type = local?.getTypeNode()?.getFirstDescendantByKind(SyntaxKind.Identifier);
    if (local === undefined || unused === undefined || type === undefined) {
      throw new Error("native occurrence reader subjects missing");
    }
    return {
      references: inventory
        .references(local.getNameNode())
        .map((node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() })),
      zero: inventory.references(unused.getNameNode()),
      origins: inventory.symbols(type).origins.map((span) => span.file),
      dependency: inventory.sourceCorpus().getSourceFile(dependency)?.getFullText(),
    };
  }
  using previous = createSemanticInventory(options);
  const before = observe(previous);
  const sourcePath = join(root, "consumer.ts");
  const sourceText = readFileSync(sourcePath, "utf8");
  const shorthandStart = sourceText.indexOf("{local}") + 1;
  const returnStart = sourceText.indexOf("[local,") + 1;
  assert.deepEqual(
    before.references,
    [shorthandStart, returnStart].map((start) => ({ file: sourcePath, start, end: start + "local".length, kind: SyntaxKind.Identifier })),
  );
  assert.deepEqual(before.zero, []);
  using facts = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
  const partition = readInventoryGeneration(facts, previous.generation)[0];
  assert.ok(partition);
  const nameStart = sourceText.indexOf("local:Item");
  const rows = [
    ...readInventoryReferences(facts, partition.id, { file: sourcePath, start: nameStart, end: nameStart + "local".length, kind: SyntaxKind.Identifier }),
  ];
  assert.deepEqual(
    rows.map(({ reference, consumerClass }) => [reference.file, reference.start, reference.end, reference.kind, consumerClass]),
    [shorthandStart, returnStart].map((start) => [sourcePath, start, start + "local".length, SyntaxKind.Identifier, "tooling"]),
  );
  using warm = createSemanticInventory(options);
  assert.equal(warm.generation, previous.generation);
  assert.deepEqual(observe(warm), before);
  writeFileSync(dependency, changed);
  using current = createSemanticInventory(options);
  assert.notEqual(current.generation, previous.generation);
  assert.deepEqual(observe(previous), before);
  const now = observe(current);
  assert.notDeepEqual(now, before);
  const projection = { root, files: [{ path: dependency, text: original }], deleted: [] };
  const base = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
  const projected = createSemanticInventory({
    ...options,
    fileSystem: inventoryFileSystem(base, projection),
    projectedPaths: [dependency],
  });
  const transaction = observe(projected);
  assert.deepEqual(transaction, before);
  assert.equal(readFileSync(dependency, "utf8"), changed);
  assert.deepEqual(observe(current), now);
  assert.deepEqual(observe(previous), before);
  projected[Symbol.dispose]();
  assert.throws(() => observe(projected), /disposed/u);
  const compilerPath = ts.sys.getExecutingFilePath();
  assert.ok(compilerPath.startsWith(join(fileURLToPath(new URL("../../../", import.meta.url)), "native-modules/")));
  const compilerBytes = readFileSync(compilerPath);
  let refusal = "";
  let accepted = -1;
  try {
    writeFileSync(compilerPath, Buffer.concat([compilerBytes, Buffer.from("\n")]));
    try {
      using unexpected = createSemanticInventory(options);
      accepted = unexpected.generation;
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      refusal = error.message;
    }
  } finally {
    writeFileSync(compilerPath, compilerBytes);
  }
  assert.equal(accepted, -1);
  assert.match(refusal, /implementation.*stale|implementation.*changed/u);
  using db = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
  assert.equal(latestInventoryGeneration(db), current.generation);
  assert.deepEqual(observe(previous), before);
  assert.deepEqual(observe(current), now);
  const coverage = readFileSync(join(root, ".cache/occurrence-coverage.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(coverage.length, 3);
  writeFileSync(
    resultPath,
    JSON.stringify({
      before,
      now,
      transaction,
      warmReused: warm.generation === previous.generation,
      dependencyInvalidated: current.generation !== previous.generation,
      historicalPinsUnchanged: true,
      physicalDependency: readFileSync(dependency, "utf8"),
      disposed: true,
      refusal,
      publicationUnchanged: true,
      coverage,
      compilerPath,
      implementation: fileURLToPath(new URL("../../../", import.meta.url)),
    }),
  );
});
