// Native child commands execute; in-process verdicts borrow pinned historical SQLite observations.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { NativeTypeRequest } from "../../../../tooling/src/verify/contract/project-context.ts";
import { gate as enums } from "../../../../tooling/src/verify/gates/db-enum-from-tuple.ts";
import { gate as nullable } from "../../../../tooling/src/verify/gates/nullable-column-inequality.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

const POLICIES = [enums, nullable];
const SCHEMA = "packages/db/src/schema/rows.ts";
const READS = "packages/server/src/domain/example/persistence/reads.ts";

function fixture(root: string, repoRoot: string, browser: boolean): void {
  const write = (path: string, source: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const sources = {
    [SCHEMA]:
      "import {sqliteTable,text} from 'drizzle-orm/sqlite-core';import {ne} from 'drizzle-orm';import {config} from '#config';export const rows=sqliteTable('rows',{id:text('id').primaryKey(),value:text('value',config)});export const local=ne(rows.value,'two');",
    "packages/contracts/src/kinds.ts": "export const KINDS=['one','two'] as const;",
    "packages/db/src/schema/config-node.ts": "import {KINDS} from '@orb/contracts/kinds';export const config={enum:KINDS};",
    "packages/db/src/schema/config-browser.ts": "export const config={enum:['one','two'] as const};",
    "foreign.ts": "import {sql} from 'drizzle-orm';export const rows={value:sql`'foreign'`};",
    [READS]: "import {ne} from 'drizzle-orm';import {rows} from '#table';export const predicate=ne(rows.value,'one');",
  };
  for (const [path, source] of Object.entries(sources)) {
    write(path, source);
  }
  const compilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    skipLibCheck: true,
    types: [],
    paths: { "@orb/contracts/kinds": [join(root, "packages/contracts/src/kinds.ts")] },
    ...(browser ? { customConditions: ["browser"] } : {}),
  };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(sources) }));
  write(
    "package.json",
    JSON.stringify({
      type: "module",
      imports: {
        "#config": { browser: "./packages/db/src/schema/config-browser.ts", default: "./packages/db/src/schema/config-node.ts" },
        "#table": { browser: "./foreign.ts", default: `./${SCHEMA}` },
      },
    }),
  );
  for (const pkg of ["db", "server"]) {
    write(
      `packages/${pkg}/tsconfig.json`,
      JSON.stringify({
        compilerOptions,
        files: Object.keys(sources)
          .filter((path) => path.startsWith(`packages/${pkg}/`))
          .map((path) => path.slice(`packages/${pkg}/`.length)),
      }),
    );
  }
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => vi.restoreAllMocks());

function poisonSyntax(project: Project): Disposable {
  const symbolFor = Node.prototype.getSymbol;
  const typeFor = Node.prototype.getType;
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax mixed-schema Symbol read");
    }
    return symbolFor.call(this);
  });
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax mixed-schema Type read");
    }
    return typeFor.call(this);
  });
  return {
    [Symbol.dispose]: (): void => {
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

test.for([false, true])(
  "native enum and nullable commands preserve importing-world browser=$0 judgments without syntax Type/Symbol",
  { timeout: scaledBudget(90_000) },
  async (browser, { scratch, repoRoot }) => {
    fixture(scratch, repoRoot, browser);
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const exits: number[] = [];
    const syntaxReads: number[] = [];
    const workers: string[] = [];
    for (const { id } of POLICIES) {
      exits.push(await nativeVerifyFixture(scratch, "structure", [`--check=${id}`], { forbidSyntax: true, syntaxReads, workers }));
    }
    expect.soft(exits).toEqual(browser ? [1, 1] : [0, 1]);
    expect(syntaxReads).toEqual([0, 0]);
    expect(workers.length).toBeGreaterThan(0);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: POLICIES,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.policies.find(({ id }) => id === nullable.id)?.receipts).toEqual([
      expect.objectContaining({ kind: "population", source: "drizzle-schema", members: 3 }),
    ]);
    expect(result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, token }) => ({ file, token })) }))).toEqual([
      { id: enums.id, findings: browser ? [{ file: "packages/db/src/schema/config-browser.ts", token: "'one'" }] : [] },
      { id: nullable.id, findings: [{ file: SCHEMA, token: "rows.value" }, ...(browser ? [] : [{ file: READS, token: "rows.value" }])] },
    ]);
    const acquire = context.nativeTypeFacts;
    if (acquire === undefined) {
      throw new Error("native column admission factory is unavailable");
    }
    const schemas = context.files.filter((file) => file.getFilePath().startsWith(`${join(scratch, "packages/db/src/schema")}/`));
    const source = context.project.getSourceFileOrThrow(join(scratch, READS));
    const argument = source.getVariableDeclarationOrThrow("predicate").getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression).getArguments()[0];
    if (argument === undefined) {
      throw new Error("native column admission fixture lost its operand");
    }
    const badRequests: readonly { readonly requests: readonly NativeTypeRequest[]; readonly message: string }[] = [
      { requests: [{ kind: "schema-identities", nodes: schemas }], message: "native column demand requires an explicit full schema roster" },
      {
        requests: [
          { kind: "schema-data", nodes: schemas },
          { kind: "schema-identities", nodes: [] },
        ],
        message: "native column identity and full schema rosters disagree",
      },
      {
        requests: [
          { kind: "schema-data", nodes: schemas },
          { kind: "schema-identities", nodes: schemas.slice(0, 1) },
        ],
        message: "native column identity and full schema rosters disagree",
      },
      {
        requests: [
          { kind: "schema-data", nodes: schemas },
          { kind: "schema-identities", nodes: [source] },
        ],
        message: "native column identity and full schema rosters disagree",
      },
    ];
    const owner = "column-admission-control";
    {
      using facts = acquire();
      facts.request(owner, { kind: "schema-data", nodes: schemas });
      facts.request("foreign-projection", { kind: "schema-data", nodes: schemas, projection: { builderConfig: true } });
      facts.seal(new Set([owner, "foreign-projection"]));
      expect(() => facts.schemaData(owner, schemas, { builderConfig: true })).toThrow("builder configuration was not registered by this owner");
    }
    for (const bad of badRequests) {
      using facts = acquire();
      facts.request(owner, { kind: "drizzle-identities", nodes: [argument], mode: "column" });
      for (const request of bad.requests) {
        facts.request(owner, request);
      }
      facts.seal(new Set([owner]));
      expect(() => facts.drizzleEvidence(owner, [argument], "column")).toThrow(bad.message);
    }
  },
);
