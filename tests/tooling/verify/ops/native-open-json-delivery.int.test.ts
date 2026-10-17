import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Identifier, Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { NativeTypeRequest } from "../../../../tooling/src/verify/contract/project-context.ts";
import { gate as occurrence } from "../../../../tooling/src/verify/gates/open-json-column-key-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const POLICIES = [occurrence];
const SCHEMA = "packages/db/src/schema/settings.ts";
const ENTRY = "packages/server/src/entry.ts";
function fixture(root: string, repoRoot: string, browser: boolean): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const files = {
    [SCHEMA]:
      "import{sqliteTable,text}from'drizzle-orm/sqlite-core';export const settings=sqliteTable('settings',{value:text('value',{mode:'json'}).$type<Record<string,unknown>>().notNull()});",
    [ENTRY]:
      "import type{BaseSQLiteDatabase}from'drizzle-orm/sqlite-core';import{settings}from'../../db/src/schema/settings.ts';import{payload}from'#stored';declare const db:BaseSQLiteDatabase<'async',void>;export function save(){return db.insert(settings).values({value:payload({theme:1})});}export function read(row:typeof settings.$inferSelect){return row.value['parameters'];}declare const opaque:(...args:unknown[])=>unknown;export function noLiteral(row:typeof settings.$inferSelect,key:string){return opaque(row.value,key);}function indexed(skip:number,blob:Record<string,unknown>,key:string){return blob[key];}export function helperRead(row:typeof settings.$inferSelect){return indexed(0,row.value,'theme');}",
    "packages/server/src/closed.ts": "export function payload(_input:Record<string,unknown>):{theme:number}{return {theme:1};}",
    "packages/server/src/opaque.ts": "export function payload(input:Record<string,unknown>):Record<string,unknown>{return input;}",
  };
  for (const [path, text] of Object.entries(files)) {
    write(path, text);
  }
  const compilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    skipLibCheck: true,
    types: [],
    ...(browser ? { customConditions: ["browser"] } : {}),
  };
  write(
    "package.json",
    JSON.stringify({ type: "module", imports: { "#stored": { browser: "./packages/server/src/opaque.ts", default: "./packages/server/src/closed.ts" } } }),
  );
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(files) }));
  write("packages/db/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/schema/settings.ts"] }));
  write("packages/server/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/entry.ts", "src/closed.ts", "src/opaque.ts"] }));
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "native open-JSON pair command retains Node/browser stored vocabulary without syntax checker meaning",
  async ({ scratch, repoRoot }) => {
    for (const browser of [false, true]) {
      const root = join(scratch, browser ? "browser" : "node");
      fixture(root, repoRoot, browser);
      const original = projectCtx(root);
      const acquire = original.nativeTypeFacts;
      if (acquire === undefined) {
        throw new Error("native pair session unavailable");
      }
      const requests: NativeTypeRequest[] = [];
      const context = {
        ...original,
        nativeTypeFacts: () => {
          const facts = acquire();
          return {
            ...facts,
            request: (owner: string, query: NativeTypeRequest): void => {
              requests.push(query);
              facts.request(owner, query);
            },
          };
        },
      };
      const symbols = Node.prototype.getSymbol;
      const types = Node.prototype.getType;
      const definitions = Identifier.prototype.getDefinitionNodes;
      const symbolPoison = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project) {
          throw new Error("syntax open-JSON Symbol read");
        }
        return symbols.call(this);
      });
      const typePoison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project) {
          throw new Error("syntax open-JSON Type read");
        }
        return types.call(this);
      });
      const definitionPoison = vi.spyOn(Identifier.prototype, "getDefinitionNodes").mockImplementation(function (this: Identifier) {
        if (this.getProject() === context.project) {
          throw new Error("syntax open-JSON definition read");
        }
        return definitions.call(this);
      });
      const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
      const useContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
      try {
        expect.soft(await runStructure(root, ["--check=open-json-column-key-parity"])).toBe(1);
        const result = runPolicyPass({
          root,
          project: context.project,
          ...nativeTypeFactOptions(context),
          knownPolicies: POLICIES,
          policies: POLICIES,
          reviewedGrants: [],
          failOnWarnings: false,
        });
        expect.soft(result.toolErrors).toEqual([]);
        expect.soft(result.factErrors).toEqual([]);
        expect.soft(result.authority.effectiveFindings).toMatchObject([
          {
            policyId: occurrence.id,
            file: ENTRY,
            token: "row",
            subject: browser ? "settings.value" : "settings.value:parameters",
            operation: "open-json-key-read",
          },
        ]);
        const indexedRequests = requests
          .filter((query) => query.kind === "invocation-evidence" && query.plan.facets.includes("indexed-parameters"))
          .flatMap((query) => [...query.nodes]);
        expect(indexedRequests.some((node) => Node.isCallExpression(node) && node.getExpression().getText() === "opaque")).toBe(false);
        expect(indexedRequests.some((node) => Node.isCallExpression(node) && node.getExpression().getText() === "indexed")).toBe(true);
      } finally {
        useContext.mockRestore();
        definitionPoison.mockRestore();
        typePoison.mockRestore();
        symbolPoison.mockRestore();
      }
    }
  },
  scaledBudget(120_000),
);

test(
  "native open-JSON grants retain exact subject, operation and first-reader coordinates",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    const context = projectCtx(scratch);
    const grant = {
      id: "native-open-json-key",
      policyId: occurrence.id,
      subject: "settings.value:parameters",
      operation: "open-json-key-read",
      why: "native exact subject control",
      endsWhen: "the controlled persisted reader is removed",
    };
    for (const selected of [grant, { ...grant, subject: "settings.value" }, { ...grant, operation: "different" }]) {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: POLICIES,
        reviewedGrants: [selected],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.policies.find(({ id }) => id === occurrence.id)?.findings).toMatchObject([
        { file: ENTRY, line: 1, column: 343, token: "row", subject: grant.subject, operation: grant.operation },
      ]);
      expect(result.authority.grantedFindings).toHaveLength(selected === grant ? 1 : 0);
      expect(result.authority.effectiveFindings).toHaveLength(selected === grant ? 0 : 1);
    }
  },
  scaledBudget(60_000),
);
