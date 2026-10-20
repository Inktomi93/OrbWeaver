// @subject tooling/src/ast/cli.ts
// @subject tooling/src/ast/lib/emit.ts
import { cpSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, fixturePath, test } from "@orb/testkit/node/tool-fixtures.ts";
import { INVENTORY_VERBS } from "@orb/tooling/ast";
import { DEFAULT_INVENTORY_FAMILIES } from "@orb/tooling/floor/code-facts/semantic-inventory-contract";
import {
  inventoryGenerationPrograms,
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";

const closeEvent = z.object({ path: z.string().nullable(), open: z.boolean() });

function write(root: string, path: string, text: string): void {
  const absolute = fixturePath(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, text);
}

function fixture(root: string, repoRoot: string, detached: boolean): void {
  write(root, ".gitignore", "node_modules\ntooling/\n.cache/\n");
  write(root, "package.json", JSON.stringify({ type: "module", scripts: {} }));
  write(
    root,
    "tsconfig.json",
    JSON.stringify({
      files: ["packages/kit/src/a.ts", "scripts/tool.ts"],
      compilerOptions: { noLib: true, types: [], target: "ES2022", module: "ESNext", moduleResolution: "Bundler" },
    }),
  );
  write(root, "packages/kit/src/a.ts", "export const value=1; export const unused=2;\n");
  write(
    root,
    "scripts/tool.ts",
    `const witness='value' satisfies keyof typeof import('../packages/kit/src/a'); export const checked=${detached ? "'detached'" : "witness"};\n`,
  );
  // Relocate unchanged CLI bytes so its existing root discovery names this tiny native repository.
  cpSync(join(repoRoot, "tooling/src/ast"), fixturePath(root, "tooling/src/ast"), { recursive: true });
  for (const entry of readdirSync(join(repoRoot, "tooling/src"), { withFileTypes: true })) {
    if (entry.name !== "ast") {
      symlinkSync(join(repoRoot, "tooling/src", entry.name), fixturePath(root, "tooling/src", entry.name));
    }
  }
  symlinkSync(join(repoRoot, "node_modules"), fixturePath(root, "node_modules"));
  execFixtureGit(root, ["init", "-q"]);
}

test("the actual inventory CLI closes its pinned database before process cleanup on success and consumer failure", { tags: ["slow"] }, async ({
  scratch,
  repoRoot,
}) => {
  for (const detached of [false, true]) {
    const root = fixturePath(scratch, detached ? "failure" : "success");
    fixture(root, repoRoot, detached);
    expect(readCompilerPrograms(root).map(({ id, files }) => ({ id, files }))).toEqual([
      { id: "tsconfig.json", files: ["packages/kit/src/a.ts", "scripts/tool.ts"] },
    ]);
    const trace = join(root, ".cache/close.jsonl");
    const preload = join(root, ".cache/observe-close.mjs");
    write(
      root,
      ".cache/observe-close.mjs",
      `import {appendFileSync,writeFileSync} from 'node:fs';
      import {DatabaseSync} from 'node:sqlite';
      const trace=${JSON.stringify(trace)};writeFileSync(trace,'');
      const close=DatabaseSync.prototype.close;
      DatabaseSync.prototype.close=function(){const path=this.location();close.call(this);appendFileSync(trace,JSON.stringify({path,open:this.isOpen})+'\\n');};\n`,
    );
    const cli = join(root, "tooling/src/ast/cli.ts");
    const imports = 'const { CodemodError } = await import("../codemod/index.ts");';
    writeFileSync(cli, readFileSync(cli, "utf8").replace(imports, `await import(${JSON.stringify(pathToFileURL(preload).href)});\n${imports}`));
    const result = await spawnNiced(process.execPath, [cli, "orphans", "packages/kit/src", "--json"], {
      cwd: root,
      timeoutMs: budget(30_000),
    });
    expect(result.code, result.stderr).toBe(detached ? 2 : 0);
    expect(result.stdout.length > 0, result.stderr).toBe(!detached);
    // A refused witness names itself; an exit code alone gives the reader nothing to fix.
    expect(result.stderr.includes("detached external-consumption witness"), result.stderr).toBe(detached);
    const closed = readFileSync(trace, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => closeEvent.parse(JSON.parse(line)));
    expect(closed.filter((event) => event.path === join(root, ".cache/semantic-inventory.sqlite"))).toEqual([
      { path: join(root, ".cache/semantic-inventory.sqlite"), open: false },
    ]);
    using database = openInventoryDatabase(join(root, ".cache/semantic-inventory.sqlite"));
    const generation = latestInventoryGeneration(database);
    expect(inventoryGenerationPrograms(database, generation)).toEqual(["tsconfig.json"]);
    expect(readInventoryGeneration(database, generation)[0]?.roots).toHaveLength(2);
  }
});

const DEMAND_VERBS = ["dead", "orphans", "testonly", "swallowed", "typeonly-alive", "chains", "apisurface", "rot"] as const;

function demandFixture(root: string, repoRoot: string): void {
  fixture(root, repoRoot, false);
  write(
    root,
    "tsconfig.json",
    JSON.stringify({
      files: ["packages/kit/src/a.ts", "packages/kit/src/barrel.ts", "packages/client/src/use.ts", "scripts/tool.ts"],
      compilerOptions: {
        noLib: true,
        types: [],
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        paths: { "@fixture/api": ["./packages/kit/src/barrel.ts"] },
      },
    }),
  );
  write(root, "packages/kit/src/a.ts", "export const shaped={n:1};export const runtime={n:2};export const witnessed=3;export const unused=4;\n");
  write(root, "packages/kit/src/barrel.ts", "export {shaped as Renamed,runtime} from './a';\n");
  write(
    root,
    "packages/client/src/use.ts",
    "import {Renamed,runtime} from '@fixture/api';import {missing} from './absent';export type Shape=typeof Renamed;export const used=runtime;export const unresolved=missing;\n",
  );
  write(root, "scripts/tool.ts", "const witness='witnessed' satisfies keyof typeof import('../packages/kit/src/a');export const checked=witness;\n");
}

const typeOnlyPayload = z.object({ label: z.string(), hits: z.array(z.object({ kind: z.string(), text: z.string() })) });

test("every inventory verb has an explicit maintained demand control", () => {
  expect([...INVENTORY_VERBS].toSorted()).toEqual([...DEMAND_VERBS].toSorted());
});

test.for(DEMAND_VERBS)("actual %s CLI preserves output and requests only its required families", { tags: ["slow"] }, async (verb, { scratch, repoRoot }) => {
  demandFixture(scratch, repoRoot);
  const argument = verb === "dead" ? "shaped" : "kit";
  const flags = verb === "typeonly-alive" ? ["--json"] : [];
  const result = await spawnNiced(process.execPath, [join(scratch, "tooling/src/ast/cli.ts"), verb, argument, ...flags], {
    cwd: scratch,
    timeoutMs: budget(30_000),
  });
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const generation = latestInventoryGeneration(database);
  const partitions = readInventoryGeneration(database, generation);
  expect(partitions).toHaveLength(1);
  const partition = partitions[0];
  const expected = verb === "typeonly-alive" ? ["exports", "references"] : DEFAULT_INVENTORY_FAMILIES;
  expect(partition?.families).toEqual([...expected].toSorted());
  expect(partition?.roots.map((path) => relative(scratch, path)).toSorted()).toEqual(readCompilerPrograms(scratch)[0]?.files);
  expect(partition?.referenceMode).toBe("complete");
  expect(result.code, result.stdout + result.stderr).toBe(0);
  expect(result.stderr).toContain("status=complete");
  if (verb !== "typeonly-alive") {
    return;
  }
  const payload = typeOnlyPayload.parse(JSON.parse(result.stdout));
  expect(payload.hits.map((hit) => hit.kind)).toEqual(["typeonly-alive"]);
  expect(payload.hits.map((hit) => hit.text.split("  ←")[0])).toEqual(["shaped"]);
});

const LEGACY_OPTIONS = {
  noLib: true,
  types: [],
  target: "ES2022",
  module: "ESNext",
  moduleResolution: "Bundler",
  allowImportingTsExtensions: true,
  noEmit: true,
};
const NODE_NEXT_OPTIONS = { ...LEGACY_OPTIONS, module: "NodeNext", moduleResolution: "NodeNext" };
const LEGACY_TEST = "tests/legacy/kit/a.test.ts";
const LEGACY_BARREL = "tests/legacy/kit/_support.ts";

interface LegacyReachCase {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly options?: object;
  readonly roots?: readonly string[];
  readonly code: number;
  readonly hits: readonly (readonly [string, string])[];
  readonly stderr: string;
}

const LEGACY_REACH_CASES: readonly LegacyReachCase[] = [
  {
    name: "a direct legacy import",
    files: { [LEGACY_TEST]: "import {unused} from '../../../packages/kit/src/a';export const held=unused;\n" },
    code: 0,
    stderr: "status=complete",
    hits: [["packages/kit/src/a.ts", "unused"]],
  },
  {
    name: "a named re-export in a legacy barrel",
    files: {
      [LEGACY_BARREL]: "export { unused as viaBarrel } from '../../../packages/kit/src/a';\n",
      [LEGACY_TEST]: "import {viaBarrel} from './_support';export const held=viaBarrel;\n",
    },
    code: 0,
    stderr: "status=complete",
    hits: [["packages/kit/src/a.ts", "unused"]],
  },
  {
    name: "an `export *` of a legacy barrel that re-exports the origin",
    files: {
      "tests/legacy/kit/_inner.ts": "export { unused as local } from '../../../packages/kit/src/a';\n",
      [LEGACY_BARREL]: "export * from './_inner';\n",
      [LEGACY_TEST]: "import {local} from './_support';export const held=local;\n",
    },
    code: 0,
    stderr: "status=complete",
    hits: [["packages/kit/src/a.ts", "unused"]],
  },
  {
    name: "a legacy barrel that does not export the imported name",
    files: { [LEGACY_BARREL]: "export const other=1;\n", [LEGACY_TEST]: "import {missing} from './_support';export const held=missing;\n" },
    code: 2,
    hits: [],
    stderr: "exports no missing",
  },
  {
    name: "an asset import the legacy program types through an ambient module",
    files: {
      "ambient.d.ts": 'declare module "*.css";\n',
      "packages/kit/src/x.module.css": ".a{color:red}\n",
      [LEGACY_TEST]:
        "import styles from '../../../packages/kit/src/x.module.css';import {unused} from '../../../packages/kit/src/a';export const held=[styles,unused];\n",
    },
    code: 0,
    stderr: "status=complete",
    hits: [["packages/kit/src/a.ts", "unused"]],
  },
  {
    name: "a conditional import resolved under the importing file's ESM mode",
    files: {
      "package.json": JSON.stringify({
        type: "module",
        scripts: {},
        imports: { "#cond": { import: "./packages/kit/src/esm.ts", default: "./packages/kit/src/cjs.ts" } },
      }),
      "packages/kit/src/esm.ts": "export const picked=1;\n",
      "packages/kit/src/cjs.ts": "export const picked=2;\n",
      [LEGACY_TEST]: "import {picked} from '#cond';export const held=picked;\n",
    },
    options: NODE_NEXT_OPTIONS,
    roots: ["packages/kit/src/esm.ts", "packages/kit/src/cjs.ts"],
    code: 0,
    stderr: "status=complete",
    hits: [["packages/kit/src/esm.ts", "picked"]],
  },
];

const hitsPayload = z.object({ hits: z.array(z.object({ file: z.string(), kind: z.string(), text: z.string() })) });

test.for(LEGACY_REACH_CASES)("actual testonly CLI counts legacy reach through $name", { tags: ["slow"] }, async (row, { scratch, repoRoot }) => {
  demandFixture(scratch, repoRoot);
  write(
    scratch,
    "tsconfig.tests-legacy.json",
    JSON.stringify({ include: ["tests/legacy/**/*.ts", "ambient.d.ts"], compilerOptions: row.options ?? LEGACY_OPTIONS }),
  );
  for (const [path, text] of Object.entries(row.files)) {
    write(scratch, path, text);
  }
  if (row.roots !== undefined) {
    const config = z.looseObject({ files: z.array(z.string()) }).parse(JSON.parse(readFileSync(join(scratch, "tsconfig.json"), "utf8")));
    write(scratch, "tsconfig.json", JSON.stringify({ ...config, files: [...config.files, ...row.roots] }));
  }
  const result = await spawnNiced(process.execPath, [join(scratch, "tooling/src/ast/cli.ts"), "testonly", "kit", "--json"], {
    cwd: scratch,
    timeoutMs: budget(30_000),
  });
  expect(result.code, result.stdout + result.stderr).toBe(row.code);
  expect(result.stderr).toContain(row.stderr);
  // A refused run prints no payload; its expected hits are empty.
  const hits = result.code === 0 ? hitsPayload.parse(JSON.parse(result.stdout)).hits : [];
  expect(hits.map((hit) => [hit.kind, hit.file, hit.text.split("  —")[0]])).toEqual(row.hits.map(([file, name]) => ["test-only-export", file, name]));
});

test("the real AST factory retains references but refuses each omitted type-only family", { tags: ["slow"] }, async ({ scratch, repoRoot }) => {
  demandFixture(scratch, repoRoot);
  const entry = join(scratch, ".cache/factory.mjs");
  write(
    scratch,
    ".cache/factory.mjs",
    `const {loadInventoryProject}=await import('../tooling/src/ast/index.ts');
const {semanticInventoryOf}=await import('../tooling/src/floor/code-facts/semantic-inventory-reader.ts');
const {SyntaxKind}=await import('ts-morph');
const corpus=loadInventoryProject(['exports','references']);using inventory=semanticInventoryOf(corpus);
const source=corpus.getSourceFiles().find(source=>source.getFilePath().endsWith('/packages/kit/src/a.ts'));
const client=corpus.getSourceFiles().find(source=>source.getFilePath().endsWith('/packages/client/src/use.ts'));
const script=corpus.getSourceFiles().find(source=>source.getFilePath().endsWith('/scripts/tool.ts'));
const declaration=source.getVariableDeclarationOrThrow('shaped');
const refused={};for(const [family,read] of [['bindings',()=>inventory.symbols(declaration.getNameNode())],['modules',()=>inventory.moduleTarget(client.getImportDeclarations()[0])],['witnesses',()=>inventory.witnessOrigins(script.getDescendantsOfKind(SyntaxKind.SatisfiesExpression)[0])]]){try{read();refused[family]='accepted';}catch(error){refused[family]=String(error);}}
let references=[];let referenceError=null;try{references=inventory.references(declaration).map(node=>node.getSourceFile().getFilePath());}catch(error){referenceError=error.stack??String(error);}
console.log(JSON.stringify({refused,references,referenceError}));`,
  );
  const result = await spawnNiced(process.execPath, ["--import", join(repoRoot, "tooling/src/floor/compiler/semantic-inventory-runtime.ts"), entry], {
    cwd: scratch,
    timeoutMs: budget(30_000),
  });
  expect(result.code, result.stderr).toBe(0);
  const payload = z
    .object({ refused: z.record(z.string(), z.string()), references: z.array(z.string()), referenceError: z.string().nullable() })
    .parse(JSON.parse(result.stdout));
  for (const family of ["bindings", "modules", "witnesses"]) {
    expect(payload.refused[family]).toContain(`family unavailable: ${family}`);
  }
  expect(payload.referenceError).toBeNull();
  expect(payload.references).toContain(join(scratch, "packages/client/src/use.ts"));
});
