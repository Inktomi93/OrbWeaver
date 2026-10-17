// @subject tooling/src/floor/compiler/semantic-inventory-extract.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ts } from "ts-morph";
import { vi } from "vitest";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import type { InventoryBuildRequest, InventoryPartition } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { openInventoryDatabase, publishInventoryGeneration } from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inputsCurrent, inputVersion, inventoryAuthoredFiles } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";

test("private callable implementation drift refuses native inventory publication", ({ scratch }) => {
  writeFileSync(join(scratch, ".gitignore"), ".cache/\n");
  writeFileSync(join(scratch, "tsconfig.json"), JSON.stringify({ files: ["base.ts"], compilerOptions: { noLib: true, types: [] } }));
  const file = join(scratch, "base.ts");
  const text = "export function chosen(){return 1;}export const value=chosen();\n";
  writeFileSync(file, text);
  execFixtureGit(scratch, ["init", "-q"]);
  const descriptor = readCompilerPrograms(scratch)[0];
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(ts.isVariableStatement)?.declarationList.declarations[0];
  const call = declaration?.initializer;
  if (descriptor === undefined || call === undefined || !ts.isCallExpression(call)) {
    throw new Error("the actual native invocation query is missing");
  }
  const helper = fileURLToPath(new URL("../../../../tooling/src/floor/code-facts/call-supplied-private.ts", import.meta.url));
  const fileSystem = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
  const read = fileSystem.readFileSync.bind(fileSystem);
  let drift = false;
  let inject = false;
  const captured: InventoryPartition[] = [];
  const observedRead = vi.spyOn(fileSystem, "readFileSync").mockImplementation((path, encoding) => {
    const value = read(path, encoding);
    return drift && path === helper ? `${value}\n` : value;
  });
  const stage = (request: InventoryBuildRequest): void => {
    const partition = extractInventoryPartition(request);
    captured.push(partition);
    using staging = openInventoryDatabase(request.destination);
    publishInventoryGeneration(staging, [partition]);
    drift = inject;
  };
  const options = {
    root: scratch,
    fileSystem,
    buildPartition: stage,
    families: ["invocation-evidence", "global-origins", "computed-names"] as const,
    invocationQueries: [
      {
        program: descriptor.id,
        query: {
          node: { file, start: call.getStart(parsed), end: call.end, kind: call.kind },
          mode: "invocation" as const,
          facets: ["module" as const],
          arguments: [],
        },
      },
    ],
    globalOriginQueries: [],
    globalBindingQueries: [],
    computedNameQueries: [],
  };
  try {
    using previous = createSemanticInventory(options);
    const prior = captured[0];
    if (prior === undefined) {
      throw new Error("the initial native partition was not captured");
    }
    expect(prior.invocationEvidence.map((item) => item.query.node)).toEqual([{ file, start: call.getStart(parsed), end: call.end, kind: call.kind }]);
    expect(previous.sourceCorpus().getSourceFile(file)?.getFullText()).toBe(text);
    inject = true;
    expect((): number => {
      using current = createSemanticInventory(options);
      return current.generation;
    }).toThrow("inputs changed during extraction");
    const candidate = captured[1];
    if (candidate === undefined) {
      throw new Error("the changed implementation candidate was not extracted");
    }
    const context = { fileSystem, authored: inventoryAuthoredFiles(scratch) };
    expect(inputsCurrent(candidate.inputs, context)).toBe(false);
    drift = false;
    expect(inputsCurrent(candidate.inputs, context)).toBe(true);
    expect(candidate.inputs).toContainEqual({ path: helper, kind: "file", version: inputVersion(helper, "file") });
    expect(previous.sourceCorpus().getSourceFile(file)?.getFullText()).toBe(text);
  } finally {
    observedRead.mockRestore();
  }
});
