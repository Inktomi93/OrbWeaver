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
  const { inventoryReader } = await import("../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts");
  const { inventoryString } = await import("../../../tooling/src/floor/code-facts/semantic-inventory-records.ts");
  const options = { root, families: ["references", "bindings", "exports"] };
  const dependency = join(root, "vendor/index.ts");
  const original = readFileSync(dependency, "utf8");
  const changed = "export {Item} from './b';export type {Extra} from './missing';\n";
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
    const extra = source.getTypeAliasOrThrow("ExtraAlias").getTypeNode().getFirstDescendantByKind(SyntaxKind.Identifier);
    if (local === undefined || unused === undefined || type === undefined || extra === undefined) {
      throw new Error("native occurrence reader subjects missing");
    }
    const property = inventory.sourceCorpus().getSourceFile(join(root, "contracts.ts"))?.getInterfaceOrThrow("Local").getPropertyOrThrow("value");
    if (property === undefined) {
      throw new Error("native member occurrence subject missing");
    }
    const aliasOrigin = inventory.sourceCorpus().getSourceFile(join(root, "packages/kit/src/a.ts"))?.getVariableDeclarationOrThrow("shaped");
    if (aliasOrigin === undefined) {
      throw new Error("native alias occurrence subject missing");
    }
    return {
      references: inventory
        .references(local.getNameNode())
        .map((node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() })),
      zero: inventory.references(unused.getNameNode()),
      members: inventory
        .references(property.getNameNode())
        .map((node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() })),
      origins: inventory.symbols(type).origins.map((span) => span.file),
      extraOrigins: inventory.symbols(extra).origins.map((span) => span.file),
      aliases: inventory
        .references(aliasOrigin)
        .map((node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind(), text: node.getText() })),
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
  assert.ok(
    before.aliases.some(
      (node) =>
        node.file === join(root, "packages/client/src/use.ts") &&
        node.start === 8 &&
        node.end === 23 &&
        node.kind === SyntaxKind.SyntaxList &&
        node.text === "Renamed,runtime",
    ),
  );
  const memberStarts = [sourceText.indexOf("{value:seed") + 1, sourceText.indexOf("record.value") + "record.".length];
  assert.deepEqual(
    before.members,
    memberStarts.map((start) => ({ file: sourcePath, start, end: start + "value".length, kind: SyntaxKind.Identifier })),
  );
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
  const missing = join(root, "vendor/missing.ts");
  writeFileSync(missing, "export interface Extra {added:true}\n");
  using resolved = createSemanticInventory(options);
  assert.notEqual(resolved.generation, current.generation);
  const afterNegative = observe(resolved);
  assert.deepEqual(afterNegative.extraOrigins, [missing]);
  assert.notDeepEqual(afterNegative.extraOrigins, now.extraOrigins);
  assert.deepEqual(observe(previous), before);
  assert.deepEqual(observe(current), now);
  assert.equal(readFileSync(dependency, "utf8"), changed);
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
  assert.equal(latestInventoryGeneration(db), resolved.generation);
  assert.deepEqual(observe(previous), before);
  assert.deepEqual(observe(current), now);
  const coverage = readFileSync(join(root, ".cache/occurrence-coverage.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(observe(resolved), afterNegative);
  assert.equal(coverage.length, 4);
  using corruption = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
  const captured = readInventoryGeneration(corruption, resolved.generation);
  const owner = captured[0];
  assert.ok(owner);
  const aliasFile = join(root, "packages/client/src/use.ts");
  const aliasSpan = corruption
    .prepare("SELECT ordinal FROM inventory_span WHERE partition=? AND file=? AND start=8 AND end=23 AND kind=?")
    .get(owner.id, inventoryString(aliasFile), SyntaxKind.SyntaxList);
  assert.ok(aliasSpan);
  for (const fault of [
    { statement: "UPDATE inventory_span SET kind=? WHERE partition=? AND ordinal=?", value: SyntaxKind.Identifier },
    { statement: "UPDATE inventory_span SET end=? WHERE partition=? AND ordinal=?", value: 24 },
    { statement: "UPDATE inventory_span SET file=? WHERE partition=? AND ordinal=?", value: inventoryString(join(root, "absent.ts")) },
  ]) {
    try {
      assert.equal(corruption.prepare(fault.statement).run(fault.value, owner.id, aliasSpan["ordinal"]).changes, 1);
      assert.deepEqual(observe(resolved), afterNegative);
      using fresh = inventoryReader(root, resolved.generation, captured, { db: corruption, dispose: () => undefined });
      const origin = fresh.sourceCorpus().getSourceFile(join(root, "packages/kit/src/a.ts"))?.getVariableDeclarationOrThrow("shaped");
      assert.ok(origin);
      assert.throws(() => fresh.references(origin), /cannot materialize span/u);
    } finally {
      corruption
        .prepare("UPDATE inventory_span SET kind=?,end=23,file=? WHERE partition=? AND ordinal=?")
        .run(SyntaxKind.SyntaxList, inventoryString(aliasFile), owner.id, aliasSpan["ordinal"]);
    }
  }
  using stale = inventoryReader(root, resolved.generation, captured, { db: corruption, dispose: () => undefined });
  const staleSource = stale.sourceCorpus().getSourceFile(join(root, "packages/kit/src/a.ts"));
  assert.ok(staleSource);
  const staleOrigin = staleSource.getVariableDeclarationOrThrow("shaped");
  staleSource.insertText(0, "/* changed */");
  assert.throws(() => stale.references(staleOrigin), /source\/epoch/u);
  assert.deepEqual(observe(resolved), afterNegative);
  writeFileSync(
    resultPath,
    JSON.stringify({
      before,
      now,
      transaction,
      warmReused: warm.generation === previous.generation,
      dependencyInvalidated: current.generation !== previous.generation,
      negativeInvalidated: resolved.generation !== current.generation,
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
