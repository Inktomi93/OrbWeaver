// Native child commands execute; in-process verdicts borrow pinned historical SQLite observations.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as indexed } from "../../../../tooling/src/verify/gates/fk-columns-indexed.ts";
import { gate as onDelete } from "../../../../tooling/src/verify/gates/fk-ondelete-stated.ts";
import { gate as softRef } from "../../../../tooling/src/verify/gates/no-untyped-soft-ref.ts";
import { gate as banned } from "../../../../tooling/src/verify/gates/schema-banned-shapes.ts";
import { gate as branding } from "../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as primaryKey } from "../../../../tooling/src/verify/gates/table-explicit-primary-key.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

const POLICIES = [indexed, onDelete, softRef, banned, branding, primaryKey];
const REGISTERED_POLICY_IDS = POLICIES.map(({ id }) => id);
const SCHEMA = "packages/db/src/schema/relations.ts";
const IDS = "packages/kit/src/ids/index.ts";
const BRAND = 'declare const brand: unique symbol;export type ChatId=string & {readonly [brand]:"chat"};';

function fixture(root: string, repoRoot: string, browser: boolean): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const sources = {
    [IDS]: BRAND,
    "foreign.ts": BRAND,
    [SCHEMA]:
      "import {sqliteTable,text} from 'drizzle-orm/sqlite-core';\n" +
      "import type {ChatId} from '#identity';\n" +
      "export const chats=sqliteTable('chats',{id:text('id').primaryKey().$type<ChatId>()});\n" +
      "export const messages=sqliteTable('messages',{id:text('id').primaryKey(),chatId:text('chat_id').$type<ChatId>().references(()=>chats.id,{onDelete:'cascade'})});\n",
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
    ...(browser ? { customConditions: ["browser"] } : {}),
  };
  write("package.json", JSON.stringify({ type: "module", imports: { "#identity": { browser: "./foreign.ts", default: `./${IDS}` } } }));
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(sources) }));
  write("packages/db/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/schema/relations.ts"] }));
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: REGISTERED_POLICY_IDS.map((id) => `src/verify/gates/${id}.ts`) }));
  for (const id of REGISTERED_POLICY_IDS) {
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
      throw new Error("syntax full-schema Symbol read");
    }
    return symbolFor.call(this);
  });
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("syntax full-schema Type read");
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

test(
  "native full-schema command preserves sequential Node/browser identity without syntax Type/Symbol",
  async ({ scratch, repoRoot }) => {
    for (const browser of [false, true]) {
      const root = join(scratch, browser ? "browser" : "node");
      fixture(root, repoRoot, browser);
      const context = projectCtx(root);
      using _poison = poisonSyntax(context.project);
      const syntaxReads: number[] = [];
      const workers: string[] = [];
      expect.soft(await nativeVerifyFixture(root, "structure", ["--check=schema-branding"], { forbidSyntax: true, syntaxReads, workers })).toBe(1);
      expect(syntaxReads).toEqual([0]);
      expect(workers.length).toBeGreaterThan(0);
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
      expect.soft(result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, token }) => ({ file, token })) }))).toEqual([
        { id: indexed.id, findings: [{ file: SCHEMA, token: "chatId" }] },
        { id: onDelete.id, findings: [] },
        { id: softRef.id, findings: [] },
        { id: banned.id, findings: [] },
        { id: branding.id, findings: Array.from({ length: browser ? 2 : 1 }, () => ({ file: SCHEMA, token: "id" })) },
        { id: primaryKey.id, findings: [] },
      ]);
    }
  },
  scaledBudget(120_000),
);

test.for(POLICIES)("$id preserves its complete schema-only proof population", { timeout: scaledBudget(120_000) }, (policy) => {
  expect(verifyPolicyProofs([policy])).toEqual([]);
});

test(
  "historical native schema soft-reference grants retain the exact table/property pair and operation",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    writeFileSync(
      join(scratch, SCHEMA),
      "import{sqliteTable,text}from'drizzle-orm/sqlite-core';\nexport const audit=sqliteTable('audit_logs',{entityId:text('entity_id')});\n",
    );
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const grant = {
      id: "native-schema-soft-reference",
      policyId: softRef.id,
      subject: "audit_logs.entityId",
      operation: "soft-reference",
      why: "exact native schema authority control",
      endsWhen: "this fixture no longer declares the external reference",
    };
    for (const selected of [grant, { ...grant, subject: "audit_logs.entity_id" }, { ...grant, operation: "different" }]) {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: [softRef],
        reviewedGrants: [selected],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.policies[0]?.findings).toMatchObject([
        { file: SCHEMA, line: 2, column: 46, token: "entityId", subject: grant.subject, operation: grant.operation },
      ]);
      expect(result.authority.grantedFindings).toHaveLength(selected === grant ? 1 : 0);
      expect(result.authority.effectiveFindings).toHaveLength(selected === grant ? 0 : 1);
    }
  },
  scaledBudget(60_000),
);

test(
  "historical native schema branding retains ordinary waiver coordinates and does not widen the marker",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    writeFileSync(
      join(scratch, SCHEMA),
      "import{sqliteTable,text}from'drizzle-orm/sqlite-core';\n// @orb-waive schema-branding(id): native authored-position control; ends with this fixture.\nexport const rows=sqliteTable('rows',{id:text('id').primaryKey()});\n",
    );
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: POLICIES,
      policies: [branding],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.policies[0]?.findings).toMatchObject([{ file: SCHEMA, line: 3, column: 39, token: "id" }]);
    expect(result.authority.waivedFindings).toHaveLength(1);
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
  },
  scaledBudget(60_000),
);
