import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { ImportDeclaration, Node, SourceFile } from "ts-morph";
import { beforeEach, vi } from "vitest";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as bound } from "../../../../tooling/src/verify/gates/bound-field-via-hook.ts";
import { gate as stream } from "../../../../tooling/src/verify/gates/chat-stream-writes-in-bus-only.ts";
import { gate as query } from "../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { gate as assembly } from "../../../../tooling/src/verify/gates/registry-assembly-at-door-only.ts";
import { gate as selection } from "../../../../tooling/src/verify/gates/selection-store-via-factory.ts";
import { gate as artifacts } from "../../../../tooling/src/verify/gates/tooling-artifact-run-slot.ts";
import { gate as browser } from "../../../../tooling/src/verify/gates/tooling-browser-door.ts";
import { gate as child } from "../../../../tooling/src/verify/gates/tooling-child-process-door.ts";
import { gate as cli } from "../../../../tooling/src/verify/gates/tooling-cli-entry.ts";
import { gate as ops } from "../../../../tooling/src/verify/gates/tooling-ops-direct-invocation.ts";
import { gate as projectDoor } from "../../../../tooling/src/verify/gates/tooling-project-home.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

// These adapter verdicts borrow a real child-produced pinned generation, not Vite execution authority.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const producer = vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
  return (): void => {
    producer.mockRestore();
  };
});

const POLICIES = [projectDoor, browser, selection, query];
const NODE = "tests/tooling/native/node.test.ts";
const BROWSER = "tests/tooling/native/browser.dom.test.ts";
const STORE = "packages/client/src/state/x-selection-store.ts";
const HOME = "packages/client/src/state/create-gated-store.ts";
const SEAM = "packages/client/src/data/invalidation.ts";
const SIBLING = "packages/client/src/data/invalidation-extra.ts";
const READS = "packages/client/src/data/reads.ts";
const LOADER = "tooling/src/example/ops/load.ts";

function fixture(
  root: string,
  repoRoot: string,
): {
  readonly write: (path: string, text: string) => void;
  readonly compilerOptions: {
    readonly target: string;
    readonly module: string;
    readonly moduleResolution: string;
    readonly strict: boolean;
    readonly skipLibCheck: boolean;
    readonly types: readonly string[];
  };
} {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: [NODE, "node-door.ts", "browser-door.ts", "foreign.ts"] }));
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"] }, files: [BROWSER, STORE, HOME, SEAM, SIBLING, READS] }),
  );
  write(
    "package.json",
    JSON.stringify({
      name: "native-origin-fixture",
      type: "module",
      imports: { "#fixture": { browser: "./browser-door.ts", default: "./node-door.ts" }, "#mint": { browser: "./foreign.ts", default: `./${HOME}` } },
    }),
  );
  write("node-door.ts", "export const test = 1;\n");
  write("browser-door.ts", "export const test = {addSnapshotSerializer():void{}};\ntest.addSnapshotSerializer();\n");
  write(NODE, 'import {test} from "#fixture";\nexport const result=test;\n');
  write(BROWSER, 'import {test} from "#fixture";\nexport const result=test;\n');
  write(HOME, "export function createGatedStore():number{return 1;}\n");
  write("foreign.ts", "export function createGatedStore():number{return 2;}\n");
  write(STORE, 'import {createGatedStore} from "#mint";\nexport const useX=createGatedStore();\n');
  write(
    SEAM,
    'import {rows as sibling} from "./invalidation-extra.ts";\nexport interface Invalidation {readonly invalidate:()=>void}\nexport function createInvalidation(){return sibling();}\n',
  );
  write(
    SIBLING,
    "declare const trpc:any;\nexport function rows(){return [trpc.chat.list.pathFilter()];}\nexport function unused(){return [trpc.chat.stale.pathFilter()];}\n",
  );
  write(READS, "declare const trpc:any;\nexport const live=trpc.chat.list.queryOptions({});\nexport const stale=trpc.chat.stale.queryOptions({});\n");
  write(
    LOADER,
    'import {Project as Loader} from "ts-morph";\nimport {chromium as engine} from "@playwright/test";\nexport const p=new Loader({});\nexport const b=engine.launch();\n',
  );
  write(
    "tooling/tsconfig.json",
    JSON.stringify({ compilerOptions, files: ["src/example/ops/load.ts", ...POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`)] }),
  );
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
  return { write, compilerOptions };
}

function poisonSyntax(project: Project): Disposable {
  const type = Node.prototype.getType;
  const symbol = Node.prototype.getSymbol;
  const exports = SourceFile.prototype.getExportSymbols;
  const module = ImportDeclaration.prototype.getModuleSpecifierSourceFile;
  const spies = [
    vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary origin Type read");
      }
      return type.call(this);
    }),
    vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary origin Symbol read");
      }
      return symbol.call(this);
    }),
    vi.spyOn(SourceFile.prototype, "getExportSymbols").mockImplementation(function (this: SourceFile) {
      if (this.getProject() === project) {
        throw new Error("ordinary origin exports read");
      }
      return exports.call(this);
    }),
    vi.spyOn(ImportDeclaration.prototype, "getModuleSpecifierSourceFile").mockImplementation(function (this: ImportDeclaration) {
      if (this.getProject() === project) {
        throw new Error("ordinary origin module read");
      }
      return module.call(this);
    }),
  ];
  return {
    [Symbol.dispose]: (): void => {
      for (const spy of spies) {
        spy.mockRestore();
      }
    },
  };
}

test("independent native Node and browser programs resolve different authored doors and canonical mint origins", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const workspace = createSemanticWorkspace({ root: scratch });
  const node = workspace.primaryOwner(join(scratch, NODE))?.sourceFile(join(scratch, NODE));
  const browserSource = workspace.primaryOwner(join(scratch, BROWSER))?.sourceFile(join(scratch, BROWSER));
  const store = workspace.primaryOwner(join(scratch, STORE))?.sourceFile(join(scratch, STORE));
  expect(node?.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()?.getBaseName()).toBe("node-door.ts");
  expect(browserSource?.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()?.getBaseName()).toBe("browser-door.ts");
  expect(store?.getImportDeclarations()[0]?.getModuleSpecifierSourceFile()?.getBaseName()).toBe("foreign.ts");
});

test(
  "actual structure and scoped origin/query consumers never consult syntax-carrier meaning",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const exits = [
        await nativeVerifyFixture(scratch, "structure", [`--check=${projectDoor.id}`], { forbidSyntax: true }),
        await nativeVerifyFixture(scratch, "scoped", ["--scope", [NODE, BROWSER, STORE, HOME, SEAM, SIBLING, READS, LOADER].join(",")], { forbidSyntax: true }),
      ];
      expect(exits).toEqual([1, 1]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies: POLICIES,
        knownPolicies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.policies.map(({ id, findings }) => ({ id, sites: findings.map(({ file, token }) => ({ file, token })) }))).toEqual(
        [
          { id: projectDoor.id, sites: [{ file: LOADER, token: "new Loader" }] },
          { id: browser.id, sites: [{ file: LOADER, token: "engine.launch" }] },
          { id: selection.id, sites: [] },
          { id: query.id, sites: [{ file: READS, token: "chat.stale" }] },
        ].toSorted((left, right) => left.id.localeCompare(right.id)),
      );
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "migrated origin and query policies retain every declared verdict and authority witness",
  () => {
    expect(verifyPolicyProofs([...POLICIES, bound, stream, assembly, cli, ops, child, artifacts])).toEqual([]);
  },
  scaledBudget(180_000),
);

test(
  "native home consumers preserve separate receipts, canonical cross-world identities and grant operations with poisoned syntax",
  ({ scratch, repoRoot }) => {
    const { write, compilerOptions } = fixture(scratch, repoRoot);
    const runner = "tooling/src/floor/cli/run-tool.ts";
    const guard = "tooling/src/floor/cli/entrypoint.ts";
    const proc = "tooling/src/floor/process/proc.ts";
    const artifact = "tooling/src/floor/artifacts/artifact-out.ts";
    const cliSource = "tooling/src/example/cli.ts";
    const opsSource = "tooling/src/example/ops/guarded.ts";
    const fieldHome = "packages/client/src/forms/editor/contexts.ts";
    const field = "packages/client/src/forms/editor/bound-fields/x-field.ts";
    const streamHome = "packages/client/src/state/chat-stream.ts";
    const nodeHandle = "packages/server/src/domain/chat/handle.ts";
    const browserHandle = "packages/client/src/data/handle.ts";
    const registry = "packages/client/src/lib/registry.ts";
    const assemblySource = "packages/client/src/features/x/assembly.ts";
    write(runner, "export function runTool(run:()=>void):void{run();}\n");
    write(guard, "export function refuseDirectInvocation():void{}\n");
    write(proc, "export function spawnFullPrioritySync():void{}\nexport function spawnFullPriorityChild():void{}\n");
    write(
      artifact,
      "export function artifactFile():void{}\nexport function artifactDir():void{}\nexport function withInstrumentRun(run:()=>void):void{run();}\n",
    );
    write(
      cliSource,
      'import {runTool as run} from "../floor/cli/run-tool.ts";\nimport {withInstrumentRun as slot} from "../floor/artifacts/artifact-out.ts";\nrun(()=>slot(()=>{}));\n',
    );
    write(
      opsSource,
      'import {refuseDirectInvocation as guard} from "../../floor/cli/entrypoint.ts";\nimport {spawnFullPriorityChild as spawn} from "../../floor/process/proc.ts";\nimport {artifactFile as file} from "../../floor/artifacts/artifact-out.ts";\nguard();\nspawn();\nfile();\n',
    );
    write(fieldHome, "export function useFieldContext():number{return 1;}\n");
    write(field, 'import {useFieldContext} from "../contexts.ts";\nexport const value=useFieldContext();\n');
    write(streamHome, "export const chatStream={push():void{}};\n");
    write("foreign-stream.ts", "export const chatStream={push():void{}};\n");
    write(nodeHandle, 'import {chatStream as handle} from "#stream";\nexport const value=handle;\n');
    write(browserHandle, 'import {chatStream as handle} from "#stream";\nexport const value=handle;\n');
    write(registry, "export function createRegistry():void{}\nexport function createContributorRegistry():void{}\n");
    write(assemblySource, 'import {createRegistry as assemble} from "../../lib/registry.ts";\nassemble();\n');
    write(
      "package.json",
      JSON.stringify({
        name: "native-origin-fixture",
        type: "module",
        imports: {
          "#fixture": { browser: "./browser-door.ts", default: "./node-door.ts" },
          "#mint": { browser: "./foreign.ts", default: `./${HOME}` },
          "#stream": { browser: "./foreign-stream.ts", default: `./${streamHome}` },
        },
      }),
    );
    write(
      "tsconfig.json",
      JSON.stringify({ compilerOptions, files: [NODE, "node-door.ts", "browser-door.ts", "foreign.ts", "foreign-stream.ts", nodeHandle] }),
    );
    write(
      "tsconfig.tests-dom.json",
      JSON.stringify({
        compilerOptions: { ...compilerOptions, customConditions: ["browser"] },
        files: [BROWSER, STORE, HOME, SEAM, SIBLING, READS, fieldHome, field, streamHome, browserHandle, registry, assemblySource],
      }),
    );
    write(
      "tooling/tsconfig.json",
      JSON.stringify({
        compilerOptions,
        files: [
          ...POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`),
          "src/example/ops/load.ts",
          ...[runner, guard, proc, artifact, cliSource, opsSource].map((path) => path.slice("tooling/".length)),
        ],
      }),
    );
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const policies = [bound, stream, assembly, cli, ops, child, artifacts];
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies,
      knownPolicies: policies,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(
      result.policies.map(({ id, findings }) => ({ id, sites: findings.map(({ file, token, operation }) => ({ file, token, operation: operation ?? null })) })),
    ).toEqual(
      [
        { id: bound.id, sites: [{ file: field, token: "useFieldContext", operation: "raw-field-context-read" }] },
        { id: stream.id, sites: [{ file: nodeHandle, token: "chatStream", operation: "chat-stream-write-handle" }] },
        { id: assembly.id, sites: [{ file: assemblySource, token: "assemble", operation: null }] },
        { id: cli.id, sites: [] },
        { id: ops.id, sites: [{ file: LOADER, token: undefined, operation: null }] },
        { id: child.id, sites: [{ file: opsSource, token: "spawn", operation: "full-priority-spawn" }] },
        { id: artifacts.id, sites: [] },
      ].toSorted((left, right) => left.id.localeCompare(right.id)),
    );
  },
  scaledBudget(60_000),
);
