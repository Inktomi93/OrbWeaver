import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as assets } from "../../../../tooling/src/verify/gates/assets-single-writer.ts";
import { gate as ownership } from "../../../../tooling/src/verify/gates/own-tables-only.ts";
import { gate as schemaSibling } from "../../../../tooling/src/verify/gates/schema-branding.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

// Local callbacks judge native-child historical facts and consumer leases, not current producer authority.
beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const POLICIES = [assets, ownership];
const CORPUS = [...POLICIES, schemaSibling];
const STORE = "packages/server/src/domain/hub/persistence/store.ts";
const RAW = "packages/server/src/domain/hub/persistence/raw.ts";
const BOUND = "packages/server/src/domain/hub/persistence/bound.ts";
const PREFIX = "packages/server/src/domain/hub/persistence/prefix.ts";
const ASSET_SCHEMA = "packages/db/src/schema/assets.ts";
const VECTOR_SCHEMA = "packages/db/src/schema/embeddings.ts";

function fixture(root: string, repoRoot: string, browser = false): void {
  const write = (path: string, source: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const sources = {
    [ASSET_SCHEMA]: "import {sqliteTable,text} from 'drizzle-orm/sqlite-core';export const assets=sqliteTable('assets',{id:text('id').primaryKey()});",
    [VECTOR_SCHEMA]:
      "import {sqliteTable,text} from 'drizzle-orm/sqlite-core';export const chatDigests=sqliteTable('chat_digests',{id:text('id').primaryKey()});",
    "packages/db/src/index.ts": "export * from './schema/assets.ts';export * from './schema/embeddings.ts';",
    "packages/server/src/domain/assets/persistence/queries.ts": "export function storeBlob():void{}",
    "packages/server/src/domain/embeddings/persistence/owner.ts": "export const owner=true;",
    "native-handle.ts":
      "export type {BaseSQLiteDatabase as NativeDatabase} from 'drizzle-orm/sqlite-core';export type Handle=import('drizzle-orm/sqlite-core').BaseSQLiteDatabase<'async',void>;",
    "foreign.ts": "export function storeBlob():void{};export const chatDigests={};export class Handle{insert(_table:object):void{}}",
    [STORE]: "import {storeBlob} from '#store';\nstoreBlob();\n",
    [RAW]: "import type {Handle} from '#handle';\nimport * as schema from '@orb/db';\ndeclare const db:Handle;\ndb.insert(schema.assets);\n",
    [PREFIX]:
      "import type {Handle} from '#handle';\nimport {assets} from '@orb/db';\ndeclare const db:Handle;\nexport const insert=db.insert.bind(db,assets);\n",
    [BOUND]: "import {insert} from './prefix.ts';\ninsert();\n",
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
    paths: { "@orb/db": [join(root, "packages/db/src/index.ts")] },
    ...(browser ? { customConditions: ["browser"] } : {}),
  };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(sources) }));
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
  write(
    "package.json",
    JSON.stringify({
      name: "native-drizzle-policies-fixture",
      type: "module",
      imports: {
        "#handle": { browser: "./foreign.ts", default: "./native-handle.ts" },
        "#store": { browser: "./foreign.ts", default: "./packages/server/src/domain/assets/persistence/queries.ts" },
      },
    }),
  );
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: CORPUS.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of CORPUS) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const symbolFor = Node.prototype.getSymbol;
  const typeFor = Node.prototype.getType;
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax Drizzle Symbol read");
    }
    return symbolFor.call(this);
  });
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax Drizzle Type read");
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
  "native Drizzle command policies preserve importing-world browser=$0 meaning without syntax Type/Symbol",
  { timeout: scaledBudget(90_000) },
  async (browser, { scratch, repoRoot }) => {
    const nativeSyntaxReads: number[] = [];
    fixture(scratch, repoRoot, browser);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const useContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const exits: number[] = [];
      for (const { id } of POLICIES) {
        exits.push(await nativeVerifyFixture(scratch, "structure", [`--check=${id}`], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }));
      }
      expect.soft(exits).toEqual(browser ? [1, 0] : [1, 1]);
      expect
        .soft(await nativeVerifyFixture(scratch, "scoped", ["--scope", "packages/server/src/domain"], { forbidSyntax: true, syntaxReads: nativeSyntaxReads }))
        .toBe(browser ? 0 : 1);
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
      expect(result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, token }) => ({ file, token })) }))).toEqual([
        {
          id: assets.id,
          findings: browser
            ? []
            : [
                { file: RAW, token: "insert" },
                { file: STORE, token: "storeBlob" },
              ],
        },
        {
          id: ownership.id,
          findings: browser
            ? []
            : [
                { file: PREFIX, token: "assets" },
                { file: RAW, token: "schema" },
              ],
        },
      ]);
    } finally {
      useContext.mockRestore();
    }

    expect(nativeSyntaxReads).toEqual([...POLICIES.map(() => 0), 0]);
  },
);

test.for(["bracket", "namespace"])(
  "asset $0 findings use actual authored member positions",
  { timeout: scaledBudget(60_000) },
  (shape, { scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(join(scratch, STORE), shape === "namespace" ? "import * as store from '#store';\nstore.storeBlob();\n" : "export {};\n");
    writeFileSync(
      join(scratch, RAW),
      shape === "bracket"
        ? "import type {Handle} from '#handle';\nimport * as schema from '../../../../../db/src/schema/assets.ts';\ndeclare const db:Handle;\ndb['insert'](schema.assets);\n"
        : "export {};\n",
    );
    const context = projectCtx(scratch);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: [assets],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.factErrors).toEqual([]);
    expect(result.toolErrors).toEqual([]);
    expect(
      result.policies[0]?.findings.map(({ file, line, column, token, subject, operation }) => ({ file, line, column, token, subject, operation })),
    ).toEqual([
      shape === "bracket"
        ? { file: RAW, line: 4, column: 5, token: "insert", subject: RAW, operation: "asset-write-site" }
        : { file: STORE, line: 2, column: 7, token: "storeBlob", subject: STORE, operation: "asset-write-site" },
    ]);
  },
);

test.for(POLICIES)("$id preserves its complete declared native subjects", { timeout: scaledBudget(120_000) }, (policy) => {
  expect(verifyPolicyProofs([policy])).toEqual([]);
});

test.for([
  { expression: "insertReceiver[((KEY))](schema.assets);", line: 5, column: 18, token: "KEY" },
  { expression: "insertReceiver[(('insert' as const) satisfies string)!](schema.assets);", line: 5, column: 19, token: "insert" },
  { expression: "insertReceiver[\n ((KEY as 'insert') satisfies string)!\n](schema.assets);", line: 6, column: 4, token: "KEY" },
])(
  "computed asset anchors retain authored $token at $line:$column and exact grant operation",
  { timeout: scaledBudget(60_000) },
  (shape, { scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    writeFileSync(join(scratch, STORE), "export {};\n");
    writeFileSync(
      join(scratch, RAW),
      "import type {Handle} from '#handle';\nimport * as schema from '@orb/db';\ndeclare const insertReceiver:Handle;\nconst KEY='insert';\n" +
        shape.expression +
        "\n",
    );
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const grant = {
      id: "native-assets-authored-key",
      policyId: assets.id,
      subject: RAW,
      operation: "asset-write-site",
      why: "native authored-position authority control",
      endsWhen: "this fixture stops naming the asset write",
    };
    for (const selected of [grant, { ...grant, operation: "different" }, { ...grant, subject: STORE }]) {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: [assets],
        reviewedGrants: [selected],
        failOnWarnings: false,
      });
      expect(result.factErrors).toEqual([]);
      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.findings).toMatchObject([
        { file: RAW, line: shape.line, column: shape.column, token: shape.token, subject: RAW, operation: grant.operation },
      ]);
      expect(result.authority.grantedFindings).toHaveLength(selected === grant ? 1 : 0);
      expect(result.authority.effectiveFindings).toHaveLength(selected === grant ? 0 : 1);
    }
  },
);
