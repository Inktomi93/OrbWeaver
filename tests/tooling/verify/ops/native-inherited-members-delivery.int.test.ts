// Native inherited denominators retain importing-world meaning through public verifier entrypoints.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as verbs } from "../../../../tooling/src/verify/gates/contract-verb-presence.ts";
import { gate as knobs } from "../../../../tooling/src/verify/gates/knob-wire-coverage.ts";
import { gate as axes } from "../../../../tooling/src/verify/gates/message-kind-policy-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const POLICIES = [verbs, knobs, axes];
const SERVICE = "packages/server/src/domain/hub/contract/service.ts";
const SETTINGS = "packages/contracts/src/settings/index.ts";
const HOME = "packages/contracts/src/chat/participants.ts";
const CLIENT = "packages/client/src/native-inherited.ts";
const SOURCES = {
  "packages/server/src/domain/hub/contract/node.ts": "export interface ServiceBase {nodeVerb():void}",
  "packages/server/src/domain/hub/contract/browser.ts": "export interface ServiceBase {browserVerb():void}",
  [SERVICE]: 'import type {ServiceBase} from "#native-service-base"; export interface HubService extends ServiceBase {local():void}',
  [SETTINGS]: 'import type {ConfigBase} from "#native-base"; export interface EffectiveAppConfig extends ConfigBase {localConfig:number}',
  [HOME]:
    'import type {PolicyBase} from "#native-base"; export interface MessageKindPolicy extends PolicyBase {prompt:"yes"|"no"} export const MESSAGE_KIND_POLICY={standard:{prompt:"yes",sharedAxis:"yes",nodeAxis:"yes",browserAxis:"yes"}};',
  "packages/server/src/domain/hub/read.ts":
    'import type {EffectiveAppConfig} from "../../../../contracts/src/settings/index.ts"; import{MESSAGE_KIND_POLICY}from"../../../../contracts/src/chat/participants.ts";declare const config:EffectiveAppConfig;export const used=config.localConfig;export const p=MESSAGE_KIND_POLICY.standard.prompt;export const s=MESSAGE_KIND_POLICY.standard.sharedAxis;',
  "tests/server/domain/hub/inherited.test.ts":
    'declare function createHubService():import("../../../../packages/server/src/domain/hub/contract/service.ts").HubService;createHubService().local();',
  [CLIENT]:
    'export type{HubService}from"../../server/src/domain/hub/contract/service.ts";export type{EffectiveAppConfig}from"../../contracts/src/settings/index.ts";export type{MessageKindPolicy}from"../../contracts/src/chat/participants.ts";',
  "packages/contracts/src/native/node.ts":
    'export interface ConfigBase {nodeConfig:number} export interface PolicyBase {nodeAxis:"yes"|"no"} export interface PolicyBase {sharedAxis:"yes"|"no"}',
  "packages/contracts/src/native/browser.ts":
    'export interface ConfigBase {browserConfig:number} export interface PolicyBase {browserAxis:"yes"|"no"} export interface PolicyBase {sharedAxis:"yes"|"no"}',
};
function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [], lib: ["ES2022"] };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(SOURCES).filter((path) => path !== CLIENT) }));
  write(
    "tsconfig.tests-dom.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["ES2022", "DOM"], customConditions: ["browser"] }, files: [CLIENT] }),
  );
  write(
    "packages/client/tsconfig.json",
    JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["ES2022", "DOM"], customConditions: ["browser"] }, files: ["src/native-inherited.ts"] }),
  );
  write(
    "package.json",
    JSON.stringify({
      name: "native-inherited-fixture",
      type: "module",
      imports: {
        "#native-base": { browser: "./packages/contracts/src/native/browser.ts", default: "./packages/contracts/src/native/node.ts" },
        "#native-service-base": {
          browser: "./packages/server/src/domain/hub/contract/browser.ts",
          default: "./packages/server/src/domain/hub/contract/node.ts",
        },
      },
    }),
  );
  for (const [path, text] of Object.entries(SOURCES)) {
    write(path, text);
  }
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    write(`tooling/src/verify/gates/${id}.ts`, `export{gate}from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`);
  }
  execFixtureGit(root, ["init", "-q"]);
}
function poisonSyntax(project: Project): Disposable {
  const type = Node.prototype.getType;
  const symbol = Node.prototype.getSymbol;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary inherited Type read");
    }
    return type.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary inherited Symbol read");
    }
    return symbol.call(this);
  });
  const imports = project
    .getSourceFiles()
    .flatMap((source) => source.getImportDeclarations())
    .map((declaration) =>
      vi.spyOn(declaration, "getModuleSpecifierSourceFile").mockImplementation(() => {
        throw new Error("ordinary inherited module read");
      }),
    );
  const checker = vi.spyOn(project, "getTypeChecker").mockImplementation(() => {
    throw new Error("ordinary inherited checker read");
  });
  return {
    [Symbol.dispose]: (): void => {
      checker.mockRestore();
      for (const spy of imports) {
        spy.mockRestore();
      }
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

test(
  "inherited service, config and policy members retain actual Node and browser denominators",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const workspace = createSemanticWorkspace({ root: scratch });
    for (const [config, prefix] of [
      ["tsconfig.json", "node"],
      ["tsconfig.tests-dom.json", "browser"],
    ] as const) {
      const source = workspace.program(config)?.sourceFile(HOME);
      if (source === undefined) {
        throw new Error("native inherited fixture owner missing");
      }
      const project = source.getProject();
      const result = runPolicyPass({
        root: scratch,
        project,
        nativeTypeFacts: () => isolatedTypeFacts(project),
        knownPolicies: POLICIES,
        policies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.factErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      const expected = [
        [verbs.id, `${prefix}Verb`],
        [knobs.id, `${prefix}Config`],
        [axes.id, `${prefix}Axis`],
      ];
      if (config === "tsconfig.tests-dom.json") {
        expected.push([verbs.id, "local"], [knobs.id, "localConfig"], [axes.id, "prompt"], [axes.id, "sharedAxis"]);
      }
      expect(
        result.authority.effectiveFindings.map(({ policyId, token }) => [policyId, token]).toSorted((left, right) => left.join().localeCompare(right.join())),
      ).toEqual(expected.toSorted((left, right) => left.join().localeCompare(right.join())));
      expect(result.policies.find(({ id }) => id === verbs.id)?.receipts).toContainEqual({
        kind: "population",
        source: "service-verbs[interfaces=1;local=1;inherited=1]",
        members: 2,
        unresolved: 0,
      });
      expect(result.policies.find(({ id }) => id === axes.id)?.receipts).toContainEqual({
        kind: "population",
        source: "MessageKindPolicy axis",
        members: 3,
        unresolved: 0,
      });
    }
  },
  scaledBudget(60_000),
);

test(
  "inherited members use native evidence at public structure and scoped doors with syntax semantics poisoned",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const run = (): ReturnType<typeof runPolicyPass> =>
      runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
    const baseline = run();
    expect(baseline.toolErrors).toEqual([]);
    expect(baseline.factErrors).toEqual([]);
    const contextSpy = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const structure = await runStructure(
        scratch,
        POLICIES.map(({ id }) => `--check=${id}`),
      );
      const scoped = await runScopedCli(scratch, ["--scope", "packages,tests"]);
      const result = run();
      expect({ structure, scoped, errors: result.toolErrors, factErrors: result.factErrors, withheld: result.authority.withheldPolicyIds }).toEqual({
        structure: 1,
        scoped: 1,
        errors: [],
        factErrors: [],
        withheld: [],
      });
      expect(result.authority.effectiveFindings).toEqual(baseline.authority.effectiveFindings);
    } finally {
      contextSpy.mockRestore();
    }
  },
  scaledBudget(60_000),
);
