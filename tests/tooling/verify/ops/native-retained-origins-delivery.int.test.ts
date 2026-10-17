import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { beforeEach, vi } from "vitest";
import { declaredByPackage, resolveTypeMemberOrigin } from "../../../../tooling/src/floor/code-facts/type-member-origin.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as egress } from "../../../../tooling/src/verify/gates/no-raw-egress.ts";
import { gate as history } from "../../../../tooling/src/verify/gates/no-raw-history-writes.ts";
import { gate as persistence } from "../../../../tooling/src/verify/gates/persistence-boundary.ts";
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

const POLICIES = [egress, history, persistence];
const NODE = "packages/server/src/domain/x/verbs/realm.ts";
const BROWSER = "packages/client/src/features/x/surfaces/realm.tsx";
const AMBIENT = "packages/client/src/features/x/surfaces/ambient.tsx";
const LOCAL = "packages/client/src/features/x/surfaces/local.tsx";
const FETCH = "packages/server/src/domain/x/verbs/fetch.ts";

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(".gitignore", "node_modules\n.cache\nreports\n");
  const options = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write("tsconfig.json", JSON.stringify({ compilerOptions: { ...options, lib: ["ES2022"] }, files: [NODE, FETCH, "node-door.ts"] }));
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({
      compilerOptions: { ...options, lib: ["ES2022", "DOM"], customConditions: ["browser"] },
      files: [BROWSER, AMBIENT, LOCAL, "browser-door.ts"],
    }),
  );
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions: options, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  write("package.json", JSON.stringify({ type: "module", imports: { "#realm": { browser: "./browser-door.ts", default: "./node-door.ts" } } }));
  write("node-door.ts", "class Local {setQueryData(key:readonly string[],value:number):void{}} export function make():Local{return new Local();}\n");
  write("browser-door.ts", 'export {useQueryClient as make} from "@tanstack/react-query";\n');
  const realm = 'import {make} from "#realm"; export function run():void{make().setQueryData(["k"],1);}\n';
  write(NODE, realm);
  write(BROWSER, realm);
  write(
    AMBIENT,
    'const globals=globalThis as {Intl:typeof Intl;history:History;localStorage:Storage}; export function run(d:Date):void{new globals.Intl.DateTimeFormat("en"); (d as {toLocaleString():string}).toLocaleString(); const {replaceState:replace}=globals.history; replace(null,"","/"); globals["localStorage"].getItem("k");}\n',
  );
  write(
    LOCAL,
    "const cache={setQueryData():void{}}; const history={replaceState():void{}}; const globals={localStorage:{getItem():void{}}}; export function run():void{cache.setQueryData(); history.replaceState(); globals.localStorage.getItem();}\n",
  );
  write(
    FETCH,
    'const globals=globalThis as {fetch:(url:string)=>Promise<unknown>}; export async function run():Promise<unknown>{return await globals.fetch("https://example.invalid");}\n',
  );
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const spies = [
    vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary retained-origin Type read");
      }
      return readType.call(this);
    }),
    vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary retained-origin Symbol read");
      }
      return readSymbol.call(this);
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

test("retained origins follow actual Node and browser package conditions rather than the syntax carrier", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const workspace = createSemanticWorkspace({ root: scratch });
  const owners = [NODE, BROWSER].map((path) => workspace.primaryOwner(join(scratch, path))?.sourceFile(join(scratch, path)));
  expect(
    owners.map((source) => {
      const read = source?.getDescendants().find((node) => Node.isPropertyAccessExpression(node) && node.getName() === "setQueryData");
      if (read === undefined) {
        throw new Error("native origin fixture member is absent");
      }
      const origin = resolveTypeMemberOrigin(read);
      return origin.kind === "resolved" && declaredByPackage(origin.value.declarations, "@tanstack/query-core");
    }),
  ).toEqual([false, true]);
});

test(
  "public structure and scoped retained consumers refuse ordinary semantic reads",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      expect([
        await nativeVerifyFixture(scratch, "structure", [`--check=${egress.id}`], { forbidSyntax: true }),
        await nativeVerifyFixture(scratch, "scoped", ["--scope", [NODE, BROWSER, AMBIENT, LOCAL, FETCH].join(",")], { forbidSyntax: true }),
      ]).toEqual([1, 1]);
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
      expect(result.authority.authorityAlarms).toEqual([]);
      expect(
        result.policies.map(({ id, findings }) => ({
          id,
          sites: findings.map(({ file, token, operation }) => ({ file, token, operation: operation ?? null })),
        })),
      ).toEqual(
        [
          { id: egress.id, sites: [{ file: FETCH, token: "fetch", operation: "raw-fetch" }] },
          { id: history.id, sites: [{ file: AMBIENT, token: "replaceState", operation: null }] },
          { id: persistence.id, sites: [{ file: AMBIENT, token: "localStorage", operation: "raw-storage:localStorage" }] },
        ].toSorted((left, right) => left.id.localeCompare(right.id)),
      );
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "the retained cohort preserves its complete declared proof and authority population",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  scaledBudget(180_000),
);
