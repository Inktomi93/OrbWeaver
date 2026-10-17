// @subject tooling/src/router-types/index.ts
// @subject tooling/src/router-types/cli.ts
// @subject tooling/src/floor/compiler/router-declarations.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { scaledBudget } from "../_load-budget.ts";
import { copyNativeInventoryImplementation } from "../floor/compiler/native-inventory-tree.ts";

const COLD_PRODUCER_TIMEOUT = scaledBudget(30_000);

const TREE = {
  "implementation/packages/server/package.json": '{"type":"module"}',
  "implementation/packages/server/tsconfig.json": JSON.stringify({
    compilerOptions: { target: "ES2025", module: "NodeNext", strict: true, skipLibCheck: true, types: [] },
    files: ["src/index.ts"],
  }),
  "implementation/packages/server/src/index.ts": 'export interface AppRouter { readonly mode: "first" }',
};

function entryText(): string {
  return `import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import { fileURLToPath } from "node:url";
    const root = fileURLToPath(new URL("./", import.meta.url));
    const mode = process.argv[2];
    const { buildRouterDeclarations } = await import("./tooling/src/router-types/index.ts");
    await import("./tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const helper = fileURLToPath(new URL("./tooling/src/floor/compiler/router-declaration-inputs.ts", import.meta.url));
    const entry = root + "packages/server/dist/router-types/index.d.ts";
    let previous;
    if (mode === "during-publication") {
      await buildRouterDeclarations(root, [import.meta.url]);
      previous = fs.readFileSync(entry, "utf8");
      fs.writeFileSync(root + "packages/server/src/index.ts", 'export interface AppRouter { readonly mode: "second" }');
    }
    const rename = fs.renameSync;
    let changed = false;
    if (mode === "loaded-helper") {
      fs.writeFileSync(helper, fs.readFileSync(helper, "utf8") + "\\n"); changed = true;
    }
    fs.renameSync = (from, to) => {
      if (mode === "during-publication" && !changed && String(from).includes("/.entry-") && to === entry) {
        fs.writeFileSync(helper, fs.readFileSync(helper, "utf8") + "\\n"); changed = true;
      }
      return rename(from, to);
    };
    syncBuiltinESMExports();
    try {
      const declarations = await buildRouterDeclarations(root, [import.meta.url]);
      console.log(JSON.stringify({ outcome: "accepted", declarations, changed }));
    } catch (error) {
      console.log(JSON.stringify({ outcome: "refused", message: error.message, changed,
        previousPreserved: previous === undefined || fs.readFileSync(entry, "utf8") === previous }));
    } finally { fs.renameSync = rename; syncBuiltinESMExports(); }
  `;
}

test("the real cold CLI emits from its observed native producer entry", { timeout: COLD_PRODUCER_TIMEOUT }, async ({ plantedTree, repoRoot }) => {
  const implementation = copyNativeInventoryImplementation(await plantedTree(TREE), repoRoot);
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  const cli = join(implementation, "tooling/src/router-types/cli.ts");
  const result = await spawnNiced(process.execPath, ["--import", bootstrap, cli]);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("emitted 1 native server declarations");
  expect(existsSync(join(implementation, "packages/server/dist/router-types/index.d.ts"))).toBe(true);
});

test("an emitter cached before observation cannot claim a current public build", { timeout: COLD_PRODUCER_TIMEOUT }, async ({ plantedTree, repoRoot }) => {
  const implementation = copyNativeInventoryImplementation(await plantedTree(TREE), repoRoot);
  const entry = join(implementation, "entry.mjs");
  writeFileSync(entry, entryText());
  const result = await spawnNiced(process.execPath, [entry, "cached"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('"outcome":"refused"');
  expect(result.stdout).toMatch(/observation|loaded before|startup/);
  expect(existsSync(join(implementation, "packages/server/dist/router-types/index.d.ts"))).toBe(false);
});

test("a real loaded producer helper cannot borrow its changed disk bytes", { timeout: COLD_PRODUCER_TIMEOUT }, async ({ plantedTree, repoRoot }) => {
  const implementation = copyNativeInventoryImplementation(await plantedTree(TREE), repoRoot);
  const entry = join(implementation, "entry.mjs");
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  writeFileSync(entry, entryText());
  const result = await spawnNiced(process.execPath, ["--import", bootstrap, entry, "loaded-helper"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('"outcome":"refused"');
  expect(result.stdout).toContain('"changed":true');
  expect(result.stdout).toContain("Router declaration executing implementation changed");
  expect(existsSync(join(implementation, "packages/server/dist/router-types/index.d.ts"))).toBe(false);
});

test("runtime mutation at the actual forwarding rename rolls back before releasing publication", { timeout: COLD_PRODUCER_TIMEOUT }, async ({
  plantedTree,
  repoRoot,
}) => {
  const implementation = copyNativeInventoryImplementation(await plantedTree(TREE), repoRoot);
  const entry = join(implementation, "entry.mjs");
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  writeFileSync(entry, entryText());
  const result = await spawnNiced(process.execPath, ["--import", bootstrap, entry, "during-publication"]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('"outcome":"refused"');
  expect(result.stdout).toContain('"changed":true');
  expect(result.stdout).toContain('"previousPreserved":true');
  expect(result.stdout).toContain("Router declaration executing implementation changed");
  expect(readFileSync(join(implementation, "packages/server/src/index.ts"), "utf8")).toContain('"second"');
  const recovered = await spawnNiced(process.execPath, ["--import", bootstrap, join(implementation, "tooling/src/router-types/cli.ts")]);
  expect(recovered.code).toBe(0);
  expect(recovered.stdout).toContain("emitted 1 native server declarations");
});

test("an observed batch context retains its original real producer and compiler execution", { timeout: COLD_PRODUCER_TIMEOUT }, async ({
  plantedTree,
  repoRoot,
}) => {
  const implementation = copyNativeInventoryImplementation(await plantedTree(TREE), repoRoot);
  const entry = join(implementation, "entry.mjs");
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  writeFileSync(
    entry,
    `import fs from "node:fs";
    import { fileURLToPath } from "node:url";
    const owner = new URL("./tooling/src/floor/compiler/router-declarations.ts", import.meta.url).href;
    const { prepareRouterDeclarations } = await import(owner);
    const { captureInventoryRuntime } = await import("./tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const { default: ts } = await import("typescript");
    const prepared = await prepareRouterDeclarations(fileURLToPath(new URL("./", import.meta.url)), [import.meta.url]);
    prepared.assertCurrent();
    const runtime = captureInventoryRuntime([owner, import.meta.url]);
    const producer = runtime.sources.some(source => source.url === owner);
    const compiler = runtime.sources.some(source => fs.realpathSync(source.path) === fs.realpathSync(ts.sys.getExecutingFilePath()));
    const helper = fileURLToPath(new URL("./tooling/src/floor/compiler/router-declaration-inputs.ts", import.meta.url));
    fs.writeFileSync(helper, fs.readFileSync(helper, "utf8") + "\\n");
    let refused = false;
    try { prepared.assertCurrent(); } catch { refused = true; }
    console.log(JSON.stringify({ producer, compiler, refused, sourceCount: runtime.sources.length, resolutionCount: runtime.resolutions.length }));
  `,
  );
  const result = await spawnNiced(process.execPath, ["--import", bootstrap, entry]);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('"producer":true');
  expect(result.stdout).toContain('"compiler":true');
  expect(result.stdout).toContain('"refused":true');
  expect(result.stdout).toMatch(/"sourceCount":[1-9]\d*/);
  expect(result.stdout).toMatch(/"resolutionCount":[1-9]\d*/);
});
