import { once } from "node:events";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { prepareRouterDeclarations } from "@orb/tooling/floor/compiler/router-declarations";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import ts from "typescript";
import { vi } from "vitest";

const SOURCE = "packages/server/src";
const CONFIG = "packages/server/tsconfig.json";
const OPTIONS = { target: "ES2025", module: "NodeNext", strict: true, skipLibCheck: true, types: [] };
const ROUTER = 'export interface AppRouter { readonly mode: "first" }';

function fixtureFiles(): Readonly<Record<string, string>> {
  return {
    "package.json": '{ "type": "module" }',
    "packages/server/package.json": '{ "type": "module" }',
    [CONFIG]: JSON.stringify({ compilerOptions: OPTIONS, include: ["src"] }),
    [`${SOURCE}/index.ts`]: ROUTER,
  };
}

test("unchanged declaration bytes share a family but never grant the previous source epoch currentness", async ({ plantedTree }) => {
  const root = await plantedTree(fixtureFiles());
  const first = prepareRouterDeclarations(root);
  writeFileSync(join(root, SOURCE, "index.ts"), `${ROUTER}\nconst implementation = 1;`);
  expect(() => first.assertSubjectCurrent()).toThrow("inputs changed");
  const second = prepareRouterDeclarations(root);
  expect(second.generation).toBe(first.generation);
  second.assertSubjectCurrent();
  expect(() => first.assertSubjectCurrent()).toThrow("inputs changed");
});

test("cold preparation shares equal bytes, repairs missing transitive output in a new family, and retains failed predecessors", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...fixtureFiles(),
    [`${SOURCE}/index.ts`]: 'export type { AppRouter } from "./router.js";',
    [`${SOURCE}/router.ts`]: ROUTER,
  });
  const first = prepareRouterDeclarations(root);
  first.assertSubjectCurrent();
  const equal = prepareRouterDeclarations(root);
  expect(equal.generation).toBe(first.generation);
  first.assertSubjectCurrent();
  rmSync(join(first.generation, SOURCE, "router.d.ts"));
  expect(() => first.assertSubjectCurrent()).toThrow("changed");
  const repaired = prepareRouterDeclarations(root);
  expect(repaired.generation).not.toBe(first.generation);
  expect(readFileSync(join(repaired.generation, SOURCE, "router.d.ts"), "utf8")).toContain('"first"');
  expect(prepareRouterDeclarations(root).generation).toBe(repaired.generation);
  writeFileSync(repaired.entry, 'export type AppRouter = "replacement";');
  expect(() => repaired.assertSubjectCurrent()).toThrow("entry or immutable family changed");
  expect(prepareRouterDeclarations(root).generation).toBe(repaired.generation);
  writeFileSync(join(root, SOURCE, "router.ts"), "export type AppRouter = Missing;");
  const entry = readFileSync(repaired.entry, "utf8");
  expect(() => prepareRouterDeclarations(root)).toThrow("Cannot find name 'Missing'");
  expect(readFileSync(repaired.entry, "utf8")).toBe(entry);
  expect(readFileSync(join(repaired.generation, SOURCE, "router.d.ts"), "utf8")).toContain('"first"');
  expect(readdirSync(join(root, "packages/server/dist/router-types/generations")).every((path) => !path.startsWith(".pending-"))).toBe(true);
});

test("native inherited config, unimported global roots and new nested ambient roots retain their meanings", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...fixtureFiles(),
    "base.json": JSON.stringify({ compilerOptions: OPTIONS }),
    [CONFIG]: JSON.stringify({ extends: "../../base.json", include: ["src"] }),
    [`${SOURCE}/index.ts`]: "export type AppRouter = NativeGlobal;",
    [`${SOURCE}/globals.ts`]: 'export {}; declare global { interface NativeGlobal { readonly mode: "first" } }',
  });
  const first = prepareRouterDeclarations(root);
  const proof = join(root, "proof.ts");
  writeFileSync(
    proof,
    `import type { AppRouter } from "./packages/server/dist/router-types/index.d.ts"; export const value: AppRouter["mode"] = "first";\n// @ts-expect-error The native ambient literal must not widen or disappear.\nexport const wrong: AppRouter["mode"] = "wrong";`,
  );
  const program = ts.createProgram([proof], { module: ts.ModuleKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true, types: [] });
  expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
  expect(program.getSourceFiles().some((source) => source.fileName === join(first.generation, SOURCE, "globals.d.ts"))).toBe(true);
  expect(program.getSourceFiles().filter((source) => source.fileName.startsWith(join(root, "packages/server/src")))).toEqual([]);
  writeFileSync(join(root, "base.json"), JSON.stringify({ compilerOptions: { ...OPTIONS, noUnusedLocals: true } }));
  expect(() => first.assertSubjectCurrent()).toThrow("inputs changed");
  const second = prepareRouterDeclarations(root);
  mkdirSync(join(root, SOURCE, "empty/nested"), { recursive: true });
  writeFileSync(join(root, SOURCE, "empty/nested/new-global.d.ts"), "interface NewlyIncluded { value: string }");
  expect(() => second.assertSubjectCurrent()).toThrow("inputs changed");
  const third = prepareRouterDeclarations(root);
  expect(third.inputs.some((input) => input.path.endsWith("new-global.d.ts") && input.kind === "file")).toBe(true);
});

test("a native negative resolution lookup and ambient type directory query invalidate the original epoch", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...fixtureFiles(),
    [CONFIG]: JSON.stringify({ compilerOptions: { ...OPTIONS, types: ["*"], typeRoots: ["./types"] }, files: ["src/index.ts"] }),
    [`${SOURCE}/index.ts`]: 'export type { AppRouter } from "./dependency.js";',
    [`${SOURCE}/dependency.d.ts`]: ROUTER,
    "packages/server/types/existing/index.d.ts": "interface AmbientExisting { value: string }",
  });
  const first = prepareRouterDeclarations(root);
  expect(first.inputs.some((input) => input.path.endsWith("dependency.ts") && input.kind === "exists" && input.version === "false")).toBe(true);
  const declarationProgram = ts.createProgram([first.entry], { module: ts.ModuleKind.NodeNext, noEmit: true, types: [] });
  expect(ts.getPreEmitDiagnostics(declarationProgram)).toEqual([]);
  expect(declarationProgram.getSourceFile(join(root, SOURCE, "dependency.d.ts"))).toBeDefined();
  writeFileSync(join(root, SOURCE, "dependency.ts"), ROUTER.replace('"first"', '"second"'));
  expect(() => first.assertSubjectCurrent()).toThrow("inputs changed");
  const second = prepareRouterDeclarations(root);
  mkdirSync(join(root, "packages/server/types/new-package"));
  writeFileSync(join(root, "packages/server/types/new-package/index.d.ts"), "interface AmbientNew { value: string }");
  expect(() => second.assertSubjectCurrent()).toThrow("inputs changed");
});

test("native project-reference output requirements are preserved instead of reopening referenced source", async ({ plantedTree }) => {
  const root = await plantedTree({
    ...fixtureFiles(),
    [CONFIG]: JSON.stringify({ compilerOptions: OPTIONS, include: ["src"], references: [{ path: "../../referenced" }] }),
    [`${SOURCE}/index.ts`]: 'export type { AppRouter } from "../../../referenced/src/index.js";',
    "referenced/tsconfig.json": JSON.stringify({ compilerOptions: { ...OPTIONS, composite: true, declaration: true, outDir: "dist" }, include: ["src"] }),
    "referenced/src/index.ts": ROUTER,
  });
  expect(() => prepareRouterDeclarations(root)).toThrow("has not been built from source file");
  const parsed = ts.getParsedCommandLineOfConfigFile(join(root, "referenced/tsconfig.json"), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic): never => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  if (parsed === undefined) {
    throw new Error("Native reference config did not parse");
  }
  const reference = ts.createProgram(parsed.fileNames, parsed.options);
  expect(ts.getPreEmitDiagnostics(reference)).toEqual([]);
  expect(reference.emit().emitSkipped).toBe(false);
  const prepared = prepareRouterDeclarations(root);
  prepared.assertSubjectCurrent();
  expect(prepared.inputs.some((input) => input.path === join(root, "referenced/dist/src/index.d.ts") && input.kind === "file")).toBe(true);
  const downstream = ts.createProgram([prepared.entry], { module: ts.ModuleKind.NodeNext, noEmit: true, types: [] });
  expect(ts.getPreEmitDiagnostics(downstream)).toEqual([]);
  expect(downstream.getSourceFile(join(root, "referenced/src/index.ts"))).toBeUndefined();
});

test("a source mutation during native emission refuses publication and leaves the old forwarding entry intact", async ({ plantedTree }) => {
  const root = await plantedTree(fixtureFiles());
  const first = prepareRouterDeclarations(root);
  const entry = readFileSync(first.entry, "utf8");
  const originalRead = ts.sys.readFile;
  let mutated = false;
  const spy = vi.spyOn(ts.sys, "readFile").mockImplementation((path, encoding) => {
    const text = originalRead(path, encoding);
    if (path === join(root, SOURCE, "index.ts") && !mutated) {
      mutated = true;
      writeFileSync(path, ROUTER.replace('"first"', '"second"'));
    }
    return text;
  });
  try {
    expect(() => prepareRouterDeclarations(root)).toThrow("inputs changed");
    expect(mutated).toBe(true);
    expect(readFileSync(first.entry, "utf8")).toBe(entry);
  } finally {
    spy.mockRestore();
  }
});

test("an old native reader retains its immutable family while a fresh reader follows the new entry", async ({ plantedTree }) => {
  const root = await plantedTree(fixtureFiles());
  const first = prepareRouterDeclarations(root);
  const oldHost = ts.createCompilerHost({ module: ts.ModuleKind.NodeNext, noEmit: true, types: [] });
  const read = oldHost.readFile;
  let second: typeof first | undefined;
  oldHost.readFile = (path): string | undefined => {
    const text = read(path);
    if (path === first.entry && second === undefined) {
      writeFileSync(join(root, SOURCE, "index.ts"), ROUTER.replace('"first"', '"second"'));
      second = prepareRouterDeclarations(root);
    }
    return text;
  };
  const oldProgram = ts.createProgram([first.entry], { module: ts.ModuleKind.NodeNext, noEmit: true, types: [] }, oldHost);
  const next = second;
  expect(next).toBeDefined();
  if (next === undefined) {
    throw new Error("Native forwarding entry was not read");
  }
  const fresh = ts.createProgram([next.entry], { module: ts.ModuleKind.NodeNext, noEmit: true, types: [] });
  expect(ts.getPreEmitDiagnostics(oldProgram)).toEqual([]);
  expect(ts.getPreEmitDiagnostics(fresh)).toEqual([]);
  expect(oldProgram.getSourceFile(join(first.generation, SOURCE, "index.d.ts"))?.text).toContain('"first"');
  expect(oldProgram.getSourceFile(join(next.generation, SOURCE, "index.d.ts"))).toBeUndefined();
  expect(fresh.getSourceFile(join(next.generation, SOURCE, "index.d.ts"))?.text).toContain('"second"');
  expect(() => first.assertSubjectCurrent()).toThrow("inputs changed");
  next.assertSubjectCurrent();
});

test("independent concurrent equal producers share one complete family", async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree(fixtureFiles());
  const producer = pathToFileURL(join(repoRoot, "tooling/src/floor/compiler/router-declarations.ts")).href;
  const source = `import { prepareRouterDeclarations } from ${JSON.stringify(producer)}; const result = prepareRouterDeclarations(${JSON.stringify(root)}); console.log(result.generation);`;
  const results = await Promise.all([
    spawnNiced(process.execPath, ["--input-type=module", "--eval", source]),
    spawnNiced(process.execPath, ["--input-type=module", "--eval", source]),
  ]);
  for (const result of results) {
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
  }
  expect(results[0].stdout).toBe(results[1].stdout);
  const family = prepareRouterDeclarations(root);
  family.assertSubjectCurrent();
  expect(readdirSync(join(root, "packages/server/dist/router-types/generations"))).toEqual([family.generation.split("/").at(-1)]);
});

test("a concurrent different-epoch producer cannot overwrite the newer successful publication", async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree(fixtureFiles());
  const producer = pathToFileURL(join(repoRoot, "tooling/src/floor/compiler/router-declarations.ts")).href;
  const compiler = pathToFileURL(join(repoRoot, "node_modules/typescript/lib/typescript.js")).href;
  const gate = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const worker = new Worker(
    `const { parentPort, workerData } = require("node:worker_threads");
     (async () => {
       const { prepareRouterDeclarations } = await import(${JSON.stringify(producer)});
       const { default: ts } = await import(${JSON.stringify(compiler)});
       const read = ts.sys.readFile;
       let captured = false;
       ts.sys.readFile = (path, encoding) => {
         const text = read(path, encoding);
         if (path === ${JSON.stringify(join(root, SOURCE, "index.ts"))} && !captured) {
           captured = true;
           parentPort.postMessage("captured");
           Atomics.wait(workerData, 0, 0);
         }
         return text;
       };
       try {
         prepareRouterDeclarations(${JSON.stringify(root)});
         parentPort.postMessage("unexpected publication");
       } catch (error) {
         parentPort.postMessage(error.message);
       }
       parentPort.close();
     })();`,
    { eval: true, workerData: gate },
  );
  try {
    expect(await once(worker, "message")).toEqual(["captured"]);
    writeFileSync(join(root, SOURCE, "index.ts"), ROUTER.replace('"first"', '"second"'));
    const newer = prepareRouterDeclarations(root);
    const entry = readFileSync(newer.entry, "utf8");
    const outcome = once(worker, "message");
    Atomics.store(gate, 0, 1);
    Atomics.notify(gate, 0);
    expect(await outcome).toEqual(["Router declaration subject inputs changed; no current verdict is available."]);
    newer.assertSubjectCurrent();
    expect(readFileSync(newer.entry, "utf8")).toBe(entry);
    expect(readFileSync(join(newer.generation, SOURCE, "index.d.ts"), "utf8")).toContain('"second"');
  } finally {
    Atomics.store(gate, 0, 1);
    Atomics.notify(gate, 0);
    await worker.terminate();
  }
});

test("consumed native text cannot be certified against restored bytes, including native BOM encodings", async ({ plantedTree }) => {
  const root = await plantedTree(fixtureFiles());
  const first = prepareRouterDeclarations(root);
  const entry = readFileSync(first.entry, "utf8");
  const source = join(root, SOURCE, "index.ts");
  const read = ts.sys.readFile;
  let reads = 0;
  const spy = vi.spyOn(ts.sys, "readFile").mockImplementation((path, encoding) => {
    if (path !== source) {
      return read(path, encoding);
    }
    reads += 1;
    writeFileSync(source, ROUTER.replace('"first"', '"second"'));
    try {
      return read(path, encoding);
    } finally {
      writeFileSync(source, ROUTER);
    }
  });
  try {
    expect(() => prepareRouterDeclarations(root)).toThrow("inputs changed");
    expect(reads).toBe(1);
    expect(readFileSync(first.entry, "utf8")).toBe(entry);
  } finally {
    spy.mockRestore();
  }
  for (const bytes of [
    Buffer.from(ROUTER),
    Buffer.from(`\uFEFF${ROUTER}`),
    Buffer.from(`\uFEFF${ROUTER}`, "utf16le"),
    Buffer.from(`\uFEFF${ROUTER}`, "utf16le").swap16(),
  ]) {
    writeFileSync(source, bytes);
    const prepared = prepareRouterDeclarations(root);
    prepared.assertSubjectCurrent();
    expect(readFileSync(join(prepared.generation, SOURCE, "index.d.ts"), "utf8")).toContain('"first"');
  }
});

test("publication ownership closes the final-check/rename race and rolls back a failed old writer", async ({ plantedTree, repoRoot }) => {
  const root = await plantedTree(fixtureFiles());
  const initial = prepareRouterDeclarations(root);
  const initialEntry = readFileSync(initial.entry, "utf8");
  const gateA = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const gateB = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const producer = pathToFileURL(join(repoRoot, "tooling/src/floor/compiler/router-declarations.ts")).href;
  const entry = initial.entry;
  const source = `const { parentPort, workerData } = require("node:worker_threads");
    (async () => {
      const fs = require("node:fs"); const { syncBuiltinESMExports } = require("node:module");
      const { prepareRouterDeclarations } = await import(${JSON.stringify(producer)});
      const rename = fs.renameSync; const open = fs.openSync; const remove = fs.rmSync;
      let paused = false; let blocked = false; let rollbackEntry;
      fs.rmSync = (path, ...args) => {
        if (workerData.role === "a" && String(path).endsWith("/.publication.lock")) {
          rollbackEntry = fs.readFileSync(${JSON.stringify(entry)}, "utf8");
        }
        return remove(path, ...args);
      };
      fs.renameSync = (from, to) => {
        if (workerData.role === "a" && String(from).includes("/.entry-") && to === ${JSON.stringify(entry)} && !paused) {
          paused = true; parentPort.postMessage("at-rename"); Atomics.wait(workerData.gate, 0, 0);
        }
        return rename(from, to);
      };
      fs.openSync = (...args) => {
        try { return open(...args); } catch (error) {
          if (workerData.role === "b" && String(args[0]).endsWith("/.publication.lock") && error.code === "EEXIST" && !blocked) {
            blocked = true; parentPort.postMessage("blocked");
          }
          throw error;
        }
      };
      syncBuiltinESMExports();
      try {
        const prepared = prepareRouterDeclarations(${JSON.stringify(root)});
        parentPort.postMessage({ published: fs.readFileSync(prepared.entry, "utf8") });
        if (workerData.role === "b") {
          Atomics.wait(workerData.gate, 0, 0); prepared.assertSubjectCurrent(); parentPort.postMessage("current");
        }
      } catch (error) { parentPort.postMessage({ error: error.message, rollbackEntry }); }
      parentPort.close();
    })();`;
  // Ensure A selects a different family, so its actual forwarding rename is exercised.
  writeFileSync(join(root, SOURCE, "index.ts"), ROUTER.replace('"first"', '"older"'));
  const older = new Worker(source, { eval: true, workerData: { role: "a", gate: gateA } });
  let newer: Worker | undefined;
  try {
    expect(await once(older, "message")).toEqual(["at-rename"]);
    writeFileSync(join(root, SOURCE, "index.ts"), ROUTER.replace('"first"', '"newer"'));
    newer = new Worker(source, { eval: true, workerData: { role: "b", gate: gateB } });
    const [firstMessage] = await once(newer, "message");
    const published = firstMessage === "blocked" ? once(newer, "message") : Promise.resolve([firstMessage]);
    const oldResult = once(older, "message");
    Atomics.store(gateA, 0, 1);
    Atomics.notify(gateA, 0);
    expect(await oldResult).toEqual([{ error: "Router declaration subject inputs changed; no current verdict is available.", rollbackEntry: initialEntry }]);
    expect(await published).toEqual([{ published: readFileSync(entry, "utf8") }]);
    const current = once(newer, "message");
    Atomics.store(gateB, 0, 1);
    Atomics.notify(gateB, 0);
    expect(await current).toEqual(["current"]);
    expect(readdirSync(join(root, "packages/server/dist/router-types"))).not.toContain(".publication.lock");
  } finally {
    Atomics.store(gateA, 0, 1);
    Atomics.notify(gateA, 0);
    Atomics.store(gateB, 0, 1);
    Atomics.notify(gateB, 0);
    await older.terminate();
    await newer?.terminate();
  }
  const selected = readFileSync(entry, "utf8");
  const abandonedGuard = join(root, "packages/server/dist/router-types/.publication.lock");
  writeFileSync(abandonedGuard, "exited-producer", { flag: "wx" });
  expect(() => prepareRouterDeclarations(root)).toThrow(abandonedGuard);
  expect(readFileSync(abandonedGuard, "utf8")).toBe("exited-producer");
  expect(readFileSync(entry, "utf8")).toBe(selected);
});
