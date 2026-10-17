import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Node, Project } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { vi } from "vitest";
import type { InventoryInvocationPlan, InventorySpan } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../../../tooling/src/floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../../../tooling/src/floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../../../tooling/src/floor/code-facts/type-observations-read.ts";
import { captureTypeOriginProjection } from "../../../../tooling/src/floor/code-facts/type-origin-projection.ts";
import { encodeTypeOriginProjection, replayTypeOriginProjection } from "../../../../tooling/src/floor/code-facts/type-origin-projection-codec.ts";
import { inventoryQueryNode } from "../../../../tooling/src/floor/compiler/drizzle-inventory-extract.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as unionAlias } from "../../../../tooling/src/verify/gates/no-inline-union-alias.ts";
import { gate as unions } from "../../../../tooling/src/verify/gates/no-inline-union-redecl.ts";
import { gate as owner } from "../../../../tooling/src/verify/gates/owner-role-split.ts";

import { gate as participant } from "../../../../tooling/src/verify/gates/two-class-role-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { readAxisVerdict } from "../../../../tooling/src/verify/lib/role-vocabulary.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const POLICIES = [unions, owner, participant];
const KNOWN = [...POLICIES, unionAlias];
const HOME = "packages/client/src/state/create-gated-store.ts";
const ROLE = "packages/server/src/domain/x/roles.ts";
const HOOK = "packages/client/src/components/hook.tsx";
const UNION = "packages/contracts/src/axis.ts";

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  write(".gitignore", "node_modules\n.cache\nreports\n");
  const options = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { ...options, lib: ["ES2022"] },
      files: [ROLE, UNION, "node-realm.ts", "packages/contracts/src/identity/index.ts"],
    }),
  );
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({
      compilerOptions: { ...options, lib: ["ES2022", "DOM"], customConditions: ["browser"] },
      files: [HOOK, HOME, "browser-realm.ts"],
    }),
  );
  write("package.json", JSON.stringify({ type: "module", imports: { "#realm": { browser: "./browser-realm.ts", default: "./node-realm.ts" } } }));
  write("node-realm.ts", "export interface Database {read():void} export type RealmHook<T> = {():T;<U>(selector:(state:T)=>U):U};");
  write("browser-realm.ts", `export type Database = string; export type {GatedStoreHook as RealmHook} from "./${HOME}";`);
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions: options, files: KNOWN.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  write(
    "packages/contracts/src/identity/index.ts",
    'export const USER_ROLES=["owner","admin","user"] as const; export const PARTICIPANT_ROLES=["host","member"] as const;',
  );
  write(
    ROLE,
    'const OWNER="owner";const HOST="host";const ROLE="role";const FIELD="canWrite";export function a(r:{role:"owner"|"admin"|"user"|null}){return r[ROLE] === OWNER;} export function b(role:"host"|"member"|undefined){if(role !== HOST)throw new Error("denied");} export function sink(role:"host"|"member"){return {[FIELD]:role===HOST};} export function foreign(role:"host"|"guest"){if(role !== HOST)throw new Error("denied");}',
  );
  write(HOME, "export type GatedStoreHook<T> = {():T;<U>(selector:(state:T)=>U):U};");
  write(
    HOOK,
    'import type {RealmHook} from "#realm"; type First<T>=RealmHook<T>; type Second=First<{value:string}>; declare const read:Second; export const a=()=>read(s=>({value:s.value})); declare function other<T>(select:(s:string)=>T):T; export const b=()=>other(s=>({value:s})); declare const opaque:unknown; export const c=()=>opaque((s:unknown)=>({value:s})); declare const erased:any; export const d=()=>erased((s:any)=>({value:s}));',
  );
  write(
    UNION,
    'export interface Config {mode:"left"|"right"} export const MODES=["left","right"] as const satisfies readonly Config["mode"][]; export interface Copy {mode:"left"|"right"}',
  );
  for (const { id } of KNOWN) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function poison(project: Project): Disposable {
  const original = Node.prototype.getType;
  const originalSymbol = Node.prototype.getSymbol;
  const spy = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary finite-type read");
    }
    return original.call(this);
  });
  const symbol = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary finite-symbol read");
    }
    return originalSymbol.call(this);
  });
  return {
    [Symbol.dispose]: (): void => {
      spy.mockRestore();
      symbol.mockRestore();
    },
  };
}

test(
  "finite typed consumers reach their native importing owners through the public structure door",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const spy = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    const baseline = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: POLICIES,
      knownPolicies: KNOWN,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(baseline.toolErrors).toEqual([]);
    expect(baseline.authority.withheldPolicyIds).toEqual([]);
    using _poison = poison(context.project);
    try {
      expect(await runStructure(scratch, [`--check=${owner.id}`, `--check=${participant.id}`, `--check=${unions.id}`])).toBe(1);
      expect(await runScopedCli(scratch, ["--scope", "packages,tooling"])).toBe(1);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies: POLICIES,
        knownPolicies: KNOWN,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.policies.some((policy) => policy.owner.status === "not-applicable")).toBe(false);
      expect(result.authority.effectiveFindings).toEqual(baseline.authority.effectiveFindings);
      expect(result.policies.map(({ id, findings }) => ({ id, files: findings.map(({ file }) => file) }))).toEqual(
        [
          { id: unions.id, files: [UNION, ROLE] },
          { id: owner.id, files: [ROLE] },

          { id: participant.id, files: [ROLE] },
        ].toSorted((a, b) => a.id.localeCompare(b.id)),
      );
    } finally {
      spy.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test("role observations bind the exact registered native source and lifetime", () => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strictNullChecks: true } });
  const source = project.createSourceFile("/finite/role.ts", 'export function check(role:"host"|"member"|null){return role === "host";}');
  const read = source.getFunctionOrThrow("check").getParameters()[0];
  if (read === undefined) {
    throw new Error("role fixture parameter is missing");
  }
  const plan: InventoryInvocationPlan = {
    mode: "types",
    facets: [],
    arguments: [],
    typeObservations: mapTypeObservationDemand<Node, InventorySpan>(
      { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [], questions: [{ kind: "node-types", nodes: [read] }] },
      (node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
    ),
  };
  using facts = isolatedTypeFacts(project);
  facts.request("role", { kind: "invocation-evidence", nodes: [read], plan });
  expect(() => facts.invocationEvidence("role", [read], plan)).toThrow("sealed");
  facts.seal(new Set(["role"]));
  const capture = facts.invocationEvidence("role", [read], plan).get(read)?.typeObservations;
  if (capture === undefined) {
    throw new Error("role observations are missing");
  }
  expect(readAxisVerdict(read, new Set(["host", "member"]), readTypeObservations(capture))).toBe("on-axis");
  expect(() => facts.invocationEvidence("foreign-owner", [read], plan)).toThrow("registered");
  const foreign = new Project({ useInMemoryFileSystem: true })
    .createSourceFile("/finite/role.ts", source.getFullText())
    .getFunctionOrThrow("check")
    .getParameters()[0];
  if (foreign === undefined) {
    throw new Error("foreign role fixture parameter is missing");
  }
  expect(() => facts.invocationEvidence("role", [foreign], plan)).toThrow();
  source.replaceWithText(source.getFullText());
  expect(() => facts.invocationEvidence("role", [read], plan)).toThrow();
  facts[Symbol.dispose]();
  expect(() => facts.invocationEvidence("role", [read], plan)).toThrow("disposed");
});

test("origin replay admits native keyword annotations and refuses a foreign type node", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const source = project.createSourceFile("/finite/origin.ts", "declare const opaque:unknown; export const read=opaque;type Foreign='a'|'b';");
  const root = source.getVariableDeclarationOrThrow("read").getInitializerOrThrow();
  const span = (node: Node): InventorySpan => ({ file: source.getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() });
  const wire = encodeTypeOriginProjection(captureTypeOriginProjection(root), span);
  const replay = (value: InventorySpan): Node => inventoryQueryNode(source, value);
  expect(replayTypeOriginProjection(wire, replay).annotations.map(({ annotation }) => annotation.getText())).toContain("unknown");
  const foreign = source.getTypeAliasOrThrow("Foreign").getTypeNodeOrThrow();
  expect(() =>
    replayTypeOriginProjection({ ...wire, annotations: wire.annotations.map((value) => ({ ...value, annotation: span(foreign) })) }, replay),
  ).toThrow("not an admitted type node");
});

test.each([
  ['"host"|"member"|null|undefined', "on-axis"],
  ['"host"|"guest"', "foreign"],
  ['"host"', "foreign"],
  ['"host"|"member"|"observer"', "unreadable"],
  ['"host"|"member"|1', "unreadable"],
  ["any", "unreadable"],
  ["unknown", "unreadable"],
  ["string", "unreadable"],
] as const)("native role axis preserves the exact %s verdict", (annotation, expected) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strictNullChecks: true } });
  const source = project.createSourceFile("/finite/axis.ts", `export function check(role:${annotation}){return role === "host";}`);
  const read = source.getFunctionOrThrow("check").getParameters()[0];
  if (read === undefined) {
    throw new Error("role axis parameter is missing");
  }
  const plan: InventoryInvocationPlan = {
    mode: "types",
    facets: [],
    arguments: [],
    typeObservations: mapTypeObservationDemand<Node, InventorySpan>(
      { profile: TYPE_OBSERVATION_PROFILE, sources: [source], nodes: [], questions: [{ kind: "node-types", nodes: [read] }] },
      (node) => ({ file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
    ),
  };
  using facts = isolatedTypeFacts(project);
  facts.request("role", { kind: "invocation-evidence", nodes: [source], plan });
  facts.seal(new Set(["role"]));
  const capture = facts.invocationEvidence("role", [source], plan).get(source)?.typeObservations;
  if (capture === undefined) {
    throw new Error("role axis capture is missing");
  }
  const vocabulary = new Set(["host", "member"]);
  expect(readAxisVerdict(read, vocabulary)).toBe(expected);
  expect(readAxisVerdict(read, vocabulary, readTypeObservations(capture))).toBe(expected);
});

test("finite typed consumers withhold their verdict when native context is absent", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  const result = runPolicyPass({
    root: scratch,
    project: context.project,
    policies: POLICIES,
    knownPolicies: KNOWN,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.authority.withheldPolicyIds.toSorted()).toEqual(POLICIES.map(({ id }) => id).toSorted());
  expect(result.authority.effectiveFindings).toEqual([]);
});

test(
  "native tuple capture refuses foreign, stale and disposed source ownership",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    const source = context.project.getSourceFileOrThrow(join(scratch, "packages/contracts/src/identity/index.ts"));
    const initializer = source.getVariableDeclarationOrThrow("USER_ROLES").getInitializerOrThrow();
    const acquire = context.nativeTypeFacts;
    if (acquire === undefined) {
      throw new Error("native tuple owner is missing");
    }
    using native = acquire();
    const plan: InventoryInvocationPlan = { mode: "value", facets: ["authored-value"], arguments: [] };
    native.request("tuple", { kind: "invocation-evidence", nodes: [initializer], plan });
    native.seal(new Set(["tuple"]));
    expect(native.invocationEvidence("tuple", [initializer], plan).get(initializer)?.authoredValues.get(initializer)?.value).toMatchObject({
      kind: "resolved",
      value: { kind: "tuple" },
    });
    const foreign = new Project({ useInMemoryFileSystem: true })
      .createSourceFile(source.getFilePath(), source.getFullText())
      .getVariableDeclarationOrThrow("USER_ROLES")
      .getInitializerOrThrow();
    expect(() => native.invocationEvidence("tuple", [foreign], plan)).toThrow("registered");
    source.replaceWithText(source.getFullText());
    expect(() => native.invocationEvidence("tuple", [initializer], plan)).toThrow();
    native[Symbol.dispose]();
    expect(() => native.invocationEvidence("tuple", [initializer], plan)).toThrow("disposed");
  },
  scaledBudget(30_000),
);

test(
  "missing captured tuple bytes withhold both role consumers instead of resolving ordinary bindings",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    const acquire = context.nativeTypeFacts;
    if (acquire === undefined) {
      throw new Error("native tuple owner is missing");
    }
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      policies: POLICIES,
      knownPolicies: KNOWN,
      reviewedGrants: [],
      failOnWarnings: false,
      nativeTypeFacts: () => {
        const native = acquire();
        return {
          ...native,
          invocationEvidence: (ownerId, nodes, plan) => {
            const delivered = native.invocationEvidence(ownerId, nodes, plan);
            return plan.facets.includes("authored-value")
              ? new Map([...delivered].map(([node, evidence]) => [node, { ...evidence, authoredValues: new Map() }]))
              : delivered;
          },
        };
      },
    });
    expect(result.authority.withheldPolicyIds.toSorted()).toEqual([owner.id, participant.id].toSorted());
    expect(result.toolErrors.filter(({ policyId }) => policyId === owner.id || policyId === participant.id).map(({ message }) => message)).toEqual([
      "native invocation facet is unavailable for its requested value",
      "native invocation facet is unavailable for its requested value",
    ]);
  },
  scaledBudget(30_000),
);

test(
  "finite consumers retain every declared finding, near miss and authority case",
  () => {
    expect(verifyPolicyProofs(POLICIES)).toEqual([]);
  },
  scaledBudget(180_000),
);

test("native store hooks retain the importing browser condition, transitive aliases and separate erased-type refusals", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const configPath = join(scratch, "tsconfig.tests-dom.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, scratch, undefined, configPath);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const path = join(scratch, HOOK);
  const rule = "orb/zustand-selector-stability";
  const config = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, HOOK));
  const source = readFileSync(path, "utf8");
  const messages = new Linter({ cwd: scratch }).verify(
    source,
    {
      files: ["**/*.tsx"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: "error" },
    },
    { filename: path },
  );
  expect(
    messages.map(({ message, column, endColumn }) => ({
      token: source.slice(column - 1, (endColumn ?? column) - 1),
      unreadable: message.includes("CANNOT be established"),
    })),
  ).toEqual([
    { token: "read", unreadable: false },
    { token: "opaque", unreadable: true },
    { token: "erased", unreadable: true },
  ]);
});
