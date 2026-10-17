import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { prepareRouterDeclarations } from "@orb/tooling/floor/compiler/router-declarations";
import ts from "typescript";

const SERVER_SOURCE = "packages/server/src";
const DECLARATIONS = "packages/server/src";
const CONTRACT = 'export interface Payload { readonly version: "first"; }';
const COMPILER_OPTIONS = {
  target: "ES2025",
  module: "NodeNext",
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  types: [],
};

test("native emission follows private aliases without reopening implementation, and regenerates missing and transitive outputs", async ({ plantedTree }) => {
  const root = await plantedTree({
    "package.json": JSON.stringify({ type: "module" }),
    "packages/server/package.json": JSON.stringify({
      type: "module",
      imports: { "#payload": { import: "./src/payload.ts", require: "./src/wrong.ts" } },
    }),
    "packages/server/tsconfig.json": JSON.stringify({
      compilerOptions: COMPILER_OPTIONS,
      files: ["src/index.ts"],
    }),
    [`${SERVER_SOURCE}/index.ts`]: 'export type { AppRouter } from "./router.ts";',
    [`${SERVER_SOURCE}/router.ts`]:
      'import type { Payload } from "#payload"; export declare function observe(input: Payload): Payload; export type AppRouter = typeof observe;',
    [`${SERVER_SOURCE}/payload.ts`]: CONTRACT,
    [`${SERVER_SOURCE}/wrong.ts`]: CONTRACT.replace('"first"', '"wrong-resolution-mode"'),
  });
  const first = prepareRouterDeclarations(root);
  expect(first.declarations).toBe(3);
  const entry = first.entry;
  const router = join(first.generation, DECLARATIONS, "router.d.ts");
  const payload = join(first.generation, DECLARATIONS, "payload.d.ts");
  expect(readFileSync(router, "utf8")).toContain('from "./payload.ts"');
  const program = ts.createProgram([entry], { module: ts.ModuleKind.NodeNext, noEmit: true, skipLibCheck: true, types: [] });
  expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
  const serverFiles = program.getSourceFiles().filter((file) => file.fileName.startsWith(join(root, "packages/server")));
  expect(serverFiles).toHaveLength(4);
  expect(serverFiles.every((file) => file.isDeclarationFile && file.fileName.startsWith(join(root, "packages/server/dist/router-types")))).toBe(true);

  rmSync(payload);
  writeFileSync(join(first.generation, DECLARATIONS, "obsolete.d.ts"), "export type Obsolete = true;");
  writeFileSync(join(root, SERVER_SOURCE, "payload.ts"), CONTRACT.replace('"first"', '"second"'));
  const second = prepareRouterDeclarations(root);
  expect(second.declarations).toBe(3);
  expect(readFileSync(join(second.generation, DECLARATIONS, "payload.d.ts"), "utf8")).toContain('"second"');
  expect(existsSync(join(second.generation, DECLARATIONS, "obsolete.d.ts"))).toBe(false);
  expect(() => first.assertSubjectCurrent()).toThrow("changed");

  writeFileSync(join(root, SERVER_SOURCE, "alternate.ts"), CONTRACT.replace('"first"', '"resolved"'));
  writeFileSync(join(root, "packages/server/package.json"), JSON.stringify({ type: "module", imports: { "#payload": "./src/alternate.ts" } }));
  const third = prepareRouterDeclarations(root);
  expect(third.declarations).toBe(3);
  expect(readFileSync(join(third.generation, DECLARATIONS, "router.d.ts"), "utf8")).toContain('from "./alternate.ts"');
  expect(existsSync(join(third.generation, DECLARATIONS, "payload.d.ts"))).toBe(false);

  writeFileSync(join(root, SERVER_SOURCE, "alternate.ts"), "export interface Payload { readonly version: Missing; }");
  expect(() => prepareRouterDeclarations(root)).toThrow("Cannot find name 'Missing'");
  expect(existsSync(entry)).toBe(true);
  expect(existsSync(join(third.generation, DECLARATIONS, "alternate.d.ts"))).toBe(true);

  writeFileSync(join(root, SERVER_SOURCE, "alternate.ts"), CONTRACT);
  writeFileSync(join(root, SERVER_SOURCE, "router.ts"), `${readFileSync(join(root, SERVER_SOURCE, "router.ts"), "utf8")}\nconst unused = 1;`);
  expect(prepareRouterDeclarations(root).declarations).toBe(3);
  writeFileSync(
    join(root, "packages/server/tsconfig.json"),
    JSON.stringify({ compilerOptions: { ...COMPILER_OPTIONS, noUnusedLocals: true }, files: ["src/index.ts"] }),
  );
  expect(() => prepareRouterDeclarations(root)).toThrow("'unused' is declared but its value is never read");
  expect(existsSync(entry)).toBe(true);
});

test("the CLI refuses unused arguments before emitting", async ({ runCli }) => {
  await expect(await runCli("router-types", ["--stale"])).toExitWith(3);
});

test("explicit native resolution modes survive import types, type imports and type re-exports", async ({ plantedTree }) => {
  for (const mode of ["require", "import"] as const) {
    const otherMode = mode === "require" ? "import" : "require";
    const packageType = mode === "require" ? "module" : "commonjs";
    const root = await plantedTree({
      "package.json": JSON.stringify({ type: packageType }),
      "packages/server/package.json": JSON.stringify({
        type: packageType,
        imports: { "#payload": { import: "./src/import.ts", require: "./src/require.ts" } },
      }),
      "packages/server/tsconfig.json": JSON.stringify({ compilerOptions: COMPILER_OPTIONS, files: ["src/index.ts"] }),
      [`${SERVER_SOURCE}/import.ts`]: 'export interface Payload { mode: "import" }',
      [`${SERVER_SOURCE}/require.ts`]: 'export interface Payload { mode: "require" }',
      [`${SERVER_SOURCE}/index.ts`]: [
        `import type { Payload } from "#payload" with { "resolution-mode": "${mode}" };`,
        `export type { Payload as ExportedPayload } from "#payload" with { "resolution-mode": "${mode}" };`,
        `export type AppRouter = import("#payload", { with: { "resolution-mode": "${mode}" } }).Payload;`,
        "export type ImportedPayload = Payload;",
      ].join("\n"),
    });
    const prepared = prepareRouterDeclarations(root);
    expect(prepared.declarations).toBe(2);
    const emitted = readFileSync(join(prepared.generation, DECLARATIONS, "index.d.ts"), "utf8");
    expect(emitted).not.toContain("#payload");
    expect(emitted).not.toContain(`"./${otherMode}.ts"`);
    const proof = join(root, "proof.ts");
    writeFileSync(
      proof,
      [
        `import type { AppRouter, ImportedPayload, ExportedPayload } from ${JSON.stringify(join(prepared.generation, DECLARATIONS, "index.d.ts"))};`,
        `export const router: AppRouter["mode"] = "${mode}";`,
        `export const imported: ImportedPayload["mode"] = "${mode}";`,
        `export const reexported: ExportedPayload["mode"] = "${mode}";`,
      ].join("\n"),
    );
    const program = ts.createProgram([proof], { module: ts.ModuleKind.NodeNext, noEmit: true, skipLibCheck: true, types: [] });
    expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
  }
});
