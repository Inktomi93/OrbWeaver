import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { SyntaxKind } from "ts-morph";
import { beforeEach, vi } from "vitest";
import { resolveTypeMemberOrigin } from "../../../../tooling/src/floor/code-facts/type-member-origin.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as membership } from "../../../../tooling/src/verify/gates/membership-write-fan.ts";
import { gate as plugin } from "../../../../tooling/src/verify/gates/plugin-dump-guard.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
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

const MEMBRANE = "packages/server/src/infra/plugin-host/membrane.ts";
const WRITE = "packages/server/src/domain/databank/persistence/scope.ts";
const SERVICE = "packages/server/src/domain/databank/contract/service.ts";
const SCHEMA = "packages/db/src/schema/databank.ts";
const POLICIES = [plugin, membership];

function fixture(root: string, repoRoot: string, browser: boolean): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    skipLibCheck: true,
    lib: browser ? ["es2022", "dom"] : ["es2022"],
    types: browser ? [] : ["node"],
  };
  write(
    "tsconfig.json",
    JSON.stringify({ compilerOptions, files: [MEMBRANE, WRITE, SERVICE, SCHEMA, "packages/server/src/domain/databank/contract/alias.ts"] }),
  );
  write(
    "tooling/tsconfig.json",
    JSON.stringify({ compilerOptions, files: [...POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`), "src/verify/gates/table-scoping-class.ts"] }),
  );
  for (const id of [...POLICIES.map((policy) => policy.id), "table-scoping-class"]) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  write(
    MEMBRANE,
    `import type {QuickJSContext,QuickJSHandle} from 'quickjs-emscripten-core';
interface Foreign {dump(handle:QuickJSHandle):object}
type Selected=ReturnType<typeof setTimeout> extends number ? QuickJSContext : Foreign;
function handleSafeToDump(ctx:QuickJSContext,handle:QuickJSHandle):boolean{return ctx.alive && handle.alive;}
export function tryDumpGuestValue(ctx:QuickJSContext,handle:QuickJSHandle):object {
  if(!handleSafeToDump(ctx,handle)){return {};}
  return ctx.dump(handle);
}
export function bypass(ctx:Selected,handle:QuickJSHandle):object{return ctx['dump'](handle);}
`,
  );
  write(SERVICE, "export interface DatabankOps {readonly fanDatabankRoomsForDocument:(documentId:string)=>Promise<void>}");
  write("packages/server/src/domain/databank/contract/alias.ts", "export type {DatabankOps as RoomOps} from './service';");
  write(SCHEMA, "import {sqliteTable,text} from 'drizzle-orm/sqlite-core'; export const chatDocuments=sqliteTable('chat_documents',{chatId:text('chat_id')});");
  write(
    WRITE,
    `import {chatDocuments} from '../../../../../db/src/schema/databank';
import type {RoomOps as Ops} from '../contract/alias';
interface Foreign {readonly fanDatabankRoomsForDocument:(documentId:string)=>Promise<void>}
type Selected=ReturnType<typeof setTimeout> extends number ? Ops : Foreign;
declare const ctx: ((Selected & {side:'a'}) | (Selected & {side:'b'})) & {
  db:{insert(table:object):{values(row:object):Promise<void>}};
  emitUserEvent(userId:string,event:object):void;
};
export async function write():Promise<void>{
  await ctx.db.insert(chatDocuments).values({});
  await (ctx['fanDatabankRoomsForDocument']('doc'));
  ctx['emitUserEvent']('owner',{});
}
`,
  );
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "native command doors distinguish installed QuickJS and canonical DatabankOps from same-spelled foreign members",
  async ({ scratch, repoRoot }) => {
    const exits: number[] = [];
    for (const browser of [false, true]) {
      const root = join(scratch, browser ? "browser" : "node");
      fixture(root, repoRoot, browser);
      const native = createSemanticWorkspace({ root }).program("tsconfig.json");
      for (const [path, expression, home] of [
        [MEMBRANE, "ctx['dump']", "/node_modules/quickjs-emscripten-core/"],
        [WRITE, "ctx['fanDatabankRoomsForDocument']", `/${SERVICE}`],
      ] as const) {
        const source = native?.sourceFile(path);
        if (source === undefined) {
          throw new Error("native consumer fixture source is missing");
        }
        expect(source.getPreEmitDiagnostics()).toEqual([]);
        const call = source.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getExpression().getText() === expression);
        if (call === undefined) {
          throw new Error("native consumer fixture call is missing");
        }
        const origin = resolveTypeMemberOrigin(call.getExpression());
        expect(origin.kind).toBe("resolved");
        expect(origin.kind === "resolved" && origin.value.declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes(home))).toBe(
          browser,
        );
      }
      for (const [policy, scope] of [
        [plugin, "packages/server/src/infra/plugin-host"],
        [membership, "packages/server/src/domain"],
      ] as const) {
        exits.push(await nativeVerifyFixture(root, "structure", [`--check=${policy.id}`], { forbidSyntax: true }));
        exits.push(await nativeVerifyFixture(root, "scoped", ["--scope", scope], { forbidSyntax: true }));
      }
    }
    expect(exits).toEqual([0, 0, 1, 1, 1, 1, 0, 0]);
  },
  scaledBudget(60_000),
);

test(
  "member consumer migration preserves every declared gate verdict and grant witness",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  scaledBudget(60_000),
);

test("both native consumers refuse absent native services through both command doors", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, true);
  const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
  const original = contexts.projectCtx;
  const missing = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
    const { nativeTypeFacts: omitted, ...context } = original(root);
    expect(omitted).toBeDefined();
    return context;
  });
  try {
    expect(await runStructure(scratch, [`--check=${plugin.id}`])).toBe(2);
    expect(await runScopedCli(scratch, ["--scope", "packages/server/src/infra/plugin-host"])).toBe(2);
    expect(await runStructure(scratch, [`--check=${membership.id}`])).toBe(2);
    expect(await runScopedCli(scratch, ["--scope", "packages/server/src/domain"])).toBe(2);
  } finally {
    missing.mockRestore();
  }
});

test(
  "native membership findings keep authored anchors and exact grant authority",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    const context = projectCtx(scratch);
    const grant = {
      id: "native-membership-consumer",
      policyId: membership.id,
      subject: `${WRITE}#chatDocuments`,
      operation: "membership-write-per-person-emit",
      why: "native consumer authority control",
      endsWhen: "this fixture stops producing its actor-only write",
    };
    for (const selected of [grant, { ...grant, operation: "different" }]) {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: [membership],
        reviewedGrants: [selected],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies[0]?.findings).toMatchObject([{ file: WRITE, token: "'emitUserEvent'", subject: grant.subject, operation: grant.operation }]);
      expect(result.authority.grantedFindings).toHaveLength(selected === grant ? 1 : 0);
      expect(result.authority.effectiveFindings).toHaveLength(selected === grant ? 0 : 1);
      expect(result.authority.authorityAlarms).toHaveLength(selected === grant ? 0 : 1);
    }
  },
  scaledBudget(60_000),
);

test(
  "native member consumers never ask syntax-carrier receivers for Type meaning",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    const context = projectCtx(scratch);
    const receivers = [MEMBRANE, WRITE].flatMap((path) =>
      context.project
        .getSourceFileOrThrow(join(scratch, path))
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter((node) => node.getText() === "ctx"),
    );
    expect(receivers.length).toBeGreaterThan(0);
    const spies = receivers.map((receiver) =>
      vi.spyOn(receiver, "getType").mockImplementation((): never => {
        throw new Error("syntax-carrier receiver Type meaning was requested");
      }),
    );
    try {
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
      expect(result.authority.effectiveFindings.map(({ policyId }) => policyId)).toEqual([membership.id]);
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  },
  scaledBudget(60_000),
);

test(
  "native membership admission still requires await and canonical declarations on every union arm",
  async ({ scratch, repoRoot }) => {
    for (const variant of ["unawaited", "foreign-union"] as const) {
      const root = join(scratch, variant);
      fixture(root, repoRoot, true);
      const original = readFileSync(join(root, WRITE), "utf8");
      const source =
        variant === "unawaited"
          ? original.replace("await (ctx['fanDatabankRoomsForDocument']", "void (ctx['fanDatabankRoomsForDocument']")
          : original.replace("(Selected & {side:'b'})", "(Foreign & {side:'b'})");
      expect(source).not.toBe(original);
      writeFileSync(join(root, WRITE), source);
      expect(await nativeVerifyFixture(root, "structure", [`--check=${membership.id}`], { forbidSyntax: true })).toBe(1);
      expect(await nativeVerifyFixture(root, "scoped", ["--scope", "packages/server/src/domain"], { forbidSyntax: true })).toBe(1);
    }
  },
  scaledBudget(60_000),
);
