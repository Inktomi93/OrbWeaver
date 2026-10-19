import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as compose } from "../../../../tooling/src/verify/gates/compose-wiring-only.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
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

const COMPOSE = "packages/server/src/entry/compose/x.ts";
const NODE_HELPER = "packages/server/src/entry/auth/node-helper.ts";
const BROWSER_HELPER = "packages/server/src/entry/auth/browser-helper.ts";
const SEAM = "packages/server/src/entry/auth/seam.ts";
const IDS = "packages/kit/src/ids/index.ts";
const IDENTITY = "packages/contracts/src/identity/index.ts";
const FIELDS = "packages/server/src/domain/sessions/contract/results.ts";
const ROLE_DATA = "packages/server/src/primitives/role-data/index.ts";
const MINT = "packages/server/src/entry/auth/principal-mint.ts";
const ENTRY = "packages/server/src/entry";
const DECIDES = "decides per call";
const PICK = "export function pick(n: number): number { return n > 1 ? n : 0; }\n";
const PURE = "export function pick(n: number): number { return n; }\n";
const SIZES = "export const sizes: readonly number[] = [3, 1];\n";

// The seam reaches its id vocabulary through a configured alias the syntax carrier cannot resolve.
const SEAM_SOURCE = `import type { Principal } from "../../../../contracts/src/identity/index.ts";
import type { UserId, Handle } from "@ids";
import { castId } from "@ids";
import { captureUserRole } from "../../primitives/role-data/index.ts";
import { mintPrincipal } from "./principal-mint.ts";
import type { UserPrincipalFields } from "../../domain/sessions/contract/results.ts";
function principalFromRow(userId: UserId, fields: UserPrincipalFields | null): Principal {
  return mintPrincipal({ userId, role: fields?.role ?? captureUserRole("user"), handle: fields?.handle ?? castId<Handle>(userId), externalId: fields?.externalId ?? null, via: "fallback" });
}
export function bridge(userId: UserId, fields: UserPrincipalFields | null): Principal { return principalFromRow(userId, fields); }
`;

/** The compose cases whose verdict depends on the importing world's options, conditions and libraries. */
const CASES = {
  "conditional helper": 'import { pick } from "#helper";\nexport function build() { return { op: (n: number) => pick(n) }; }\n',
  "native disposal stack":
    'export function build(active: () => boolean) { const stack = new AsyncDisposableStack(); stack.defer(async () => { if (active()) throw new Error("busy"); }); return stack; }\n',
  "native disposal key": "export function build(active: () => boolean) { return { [Symbol.asyncDispose]: () => (active() ? 1 : 0) }; }\n",
  "forwarded symbol member":
    "export function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]: () => (active() ? 1 : 0) }; const stack = new AsyncDisposableStack(); stack.defer(owner[Symbol.asyncDispose]); return stack; }\n",
  "escaped symbol member":
    "export function build(active: () => boolean) { const owner = { [Symbol.asyncDispose]: () => (active() ? 1 : 0) }; return { op: owner[Symbol.asyncDispose] }; }\n",
  "eager library callback":
    'import { sizes } from "#helper";\nexport function build() { const sorted = sizes.toSorted((a, b) => (a > b ? 1 : -1)); return { op: () => sorted }; }\n',
  "aliased principal mint": 'import { bridge } from "../auth/seam.ts";\nexport function build() { return { principal: bridge }; }\n',
} as const;
type ComposeCase = keyof typeof CASES;

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function fixture(root: string, repoRoot: string, helpers: { readonly node: string; readonly browser: string }): void {
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(root, ".gitignore", "node_modules\n.cache\nreports\n");
  const options = { target: "ES2022", strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true, types: [] };
  const bundler = { ...options, module: "ESNext", moduleResolution: "Bundler" };
  const roots = [COMPOSE, NODE_HELPER, BROWSER_HELPER, SEAM, MINT, IDS, IDENTITY, FIELDS, ROLE_DATA];
  // The server world resolves `node` package conditions; the browser world's bundler resolution does not.
  write(
    root,
    "packages/server/tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        ...options,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2023", "ESNext.Disposable"],
        paths: { "@ids": [`../../${IDS}`] },
      },
      files: roots.map((path) => `../../${path}`),
    }),
  );
  write(root, "tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...bundler, lib: ["ES2022", "DOM"] }, files: [COMPOSE] }));
  write(root, "tooling/tsconfig.json", JSON.stringify({ compilerOptions: bundler, files: [`src/verify/gates/${compose.id}.ts`] }));
  write(
    root,
    `tooling/src/verify/gates/${compose.id}.ts`,
    `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${compose.id}.ts`, import.meta.url).href)};`,
  );
  write(root, "package.json", JSON.stringify({ type: "module", imports: { "#helper": { node: `./${NODE_HELPER}`, default: `./${BROWSER_HELPER}` } } }));
  write(root, NODE_HELPER, helpers.node);
  write(root, BROWSER_HELPER, helpers.browser);
  write(
    root,
    IDS,
    'declare const brand: unique symbol;\nexport type UserId = string & { readonly [brand]: "UserId" };\nexport type Handle = string & { readonly [brand]: "Handle" };\nexport type ExternalId = string & { readonly [brand]: "ExternalId" };\nexport declare function castId<T extends string>(raw: string): T;\n',
  );
  write(
    root,
    IDENTITY,
    'import type { UserId, Handle, ExternalId } from "../../../kit/src/ids/index.ts";\nexport type UserRole = "owner" | "admin" | "user";\ndeclare const userRoleState: unique symbol;\nexport interface UserRoleState { readonly [userRoleState]: true; }\nexport interface Principal { userId: UserId; role: UserRoleState; handle: Handle; externalId: ExternalId | null; via: "cookie" | "header" | "fallback"; }\n',
  );
  write(
    root,
    FIELDS,
    'import type { Handle, ExternalId } from "../../../../../kit/src/ids/index.ts";\nimport type { UserRoleState } from "../../../../../contracts/src/identity/index.ts";\nexport interface UserPrincipalFields { role: UserRoleState; handle: Handle; externalId: ExternalId | null; enabled: boolean; }\n',
  );
  write(
    root,
    ROLE_DATA,
    'import type { UserRole, UserRoleState } from "../../../../contracts/src/identity/index.ts";\nexport declare function captureUserRole(code: UserRole): UserRoleState;\n',
  );
  write(
    root,
    MINT,
    'import type { Principal } from "../../../../contracts/src/identity/index.ts";\nexport declare function mintPrincipal(fields: Principal): Principal;\n',
  );
  write(root, SEAM, SEAM_SOURCE);
  write(root, COMPOSE, CASES["aliased principal mint"]);
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const spies = [
    vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary compose Type read");
      }
      return readType.call(this);
    }),
    vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === project) {
        throw new Error("ordinary compose Symbol read");
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

/** One in-process pass over the written case, with every syntax-carrier Type and Symbol read poisoned. */
function findings(root: string, source: string): readonly { readonly file: string; readonly token: string | undefined; readonly decides: boolean }[] {
  write(root, COMPOSE, source);
  const context = projectCtx(root);
  using _poison = poisonSyntax(context.project);
  const result = runPolicyPass({
    root,
    project: context.project,
    ...nativeTypeFactOptions(context),
    policies: [compose],
    knownPolicies: [compose],
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  return result.authority.effectiveFindings.map(({ file, token, message }) => ({ file, token, decides: message?.includes(DECIDES) === true }));
}

test(
  "compose reach follows the Node world's package conditions, never the browser world or the syntax carrier",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, { node: PICK, browser: PURE });
    expect(findings(scratch, CASES["conditional helper"])).toEqual([{ file: NODE_HELPER, token: "pick", decides: true }]);
    write(scratch, NODE_HELPER, PURE);
    write(scratch, BROWSER_HELPER, PICK);
    expect(findings(scratch, CASES["conditional helper"])).toEqual([]);
  },
  scaledBudget(120_000),
);

test(
  "lifetime, eager-callback and mint judgments read the importing world's libraries and aliases",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, { node: `${PURE}${SIZES}`, browser: PURE });
    const verdicts = Object.fromEntries(
      (Object.keys(CASES) as ComposeCase[]).filter((name) => name !== "conditional helper").map((name) => [name, findings(scratch, CASES[name])]),
    );
    expect(verdicts).toEqual({
      "native disposal stack": [],
      "native disposal key": [],
      "forwarded symbol member": [],
      "escaped symbol member": [{ file: COMPOSE, token: expect.any(String), decides: true }],
      "eager library callback": [],
      "aliased principal mint": [],
    });
  },
  scaledBudget(180_000),
);

test(
  "structure and scoped doors deliver compose verdicts without one syntax-carrier semantic read",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, { node: PICK, browser: PURE });
    write(scratch, COMPOSE, CASES["conditional helper"]);
    const syntaxReads: number[] = [];
    const options = { forbidSyntax: true, syntaxReads };
    expect([
      await nativeVerifyFixture(scratch, "structure", [`--check=${compose.id}`], options),
      await nativeVerifyFixture(scratch, "scoped", ["--scope", ENTRY], options),
    ]).toEqual([1, 1]);
    write(scratch, COMPOSE, CASES["native disposal stack"]);
    expect([
      await nativeVerifyFixture(scratch, "structure", [`--check=${compose.id}`], options),
      await nativeVerifyFixture(scratch, "scoped", ["--scope", ENTRY], options),
    ]).toEqual([0, 0]);
    expect(syntaxReads).toEqual([0, 0, 0, 0]);
  },
  scaledBudget(180_000),
);

test(
  "missing native facts or a failed native worker withhold the compose verdict",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, { node: PICK, browser: PURE });
    write(scratch, COMPOSE, CASES["conditional helper"]);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const original = contexts.projectCtx;
    const missing = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
      const { nativeTypeFacts: omitted, ...context } = original(root);
      expect(omitted).toBeDefined();
      return context;
    });
    try {
      expect(await runStructure(scratch, [`--check=${compose.id}`])).toBe(2);
      expect(await runScopedCli(scratch, ["--scope", ENTRY])).toBe(2);
    } finally {
      missing.mockRestore();
    }
    const workers: string[] = [];
    expect(await nativeVerifyFixture(scratch, "structure", [`--check=${compose.id}`], { failWorker: true, workers })).toBe(2);
    expect(await nativeVerifyFixture(scratch, "scoped", ["--scope", ENTRY], { failWorker: true, workers })).toBe(2);
    expect(workers.length).toBeGreaterThan(0);
  },
  scaledBudget(180_000),
);
