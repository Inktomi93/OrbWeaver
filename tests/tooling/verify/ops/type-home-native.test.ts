import { resolve } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import {
  nativeTypeHomeAdmission,
  packageTypeHome,
  SERVER_FACTORY_TIER_REFERENCE_POLICY_ID,
  TYPE_HOME_NATIVE_POLICY_ID,
} from "@orb/tooling/floor/code-facts/type-home";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import tseslint from "typescript-eslint";
import { gate as domainInterfaces } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as packageInterfaces } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as inlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as wireInterfaces } from "../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { affectsTypedNativePolicy, TYPED_NATIVE_POLICIES } from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";

const RULE = `orb/${TYPE_HOME_NATIVE_POLICY_ID}`;
const ZOD_DECLARATION = [
  "node_modules/zod/index.d.ts",
  "export declare function object(shape: object): object;\nexport declare function strictObject(shape: object): object;\nexport declare function looseObject(shape: object): object;\nexport declare function string(): object;\nexport declare const z: { object: typeof object; strictObject: typeof strictObject; looseObject: typeof looseObject; string: typeof string; enum: (values: readonly string[]) => object };\n",
] as const;
const ZOD_OBJECT = "export declare function object(shape: object): object;";

async function nativeFindings(
  eslint: ESLint,
  path: string,
  source: string,
  installed: readonly (readonly [string, string])[] = [],
): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(path);
  expect(config, path).toBeDefined();
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { noLib: true, types: [] } });
  for (const [installedPath, text] of installed) {
    project.createSourceFile(resolve(installedPath), text);
  }
  const file = project.createSourceFile(resolve(path), source);
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [project.getProgram().compilerObject], projectService: false } },
      plugins: config.plugins.orb === undefined ? {} : { orb: config.plugins.orb },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: file.getFilePath() },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    path,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

test("the native placement pilot flags every direct alias/interface form only outside its canonical contract homes", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const name of ["default-content", "plugin-toolchain", "inference"] as const) {
    const implementation = `packages/${name}/src/probe.ts`;
    for (const source of [
      "export type Scalar = string;",
      "export type ObjectShape = { readonly n: number };",
      "export type Derived<T> = Readonly<T>;",
      "export interface View { readonly n: number; }",
      "export interface PacketProps { readonly run: () => void; }",
      "export default interface Default { readonly n: number; }",
      "export declare interface Ambient { readonly n: number; }",
    ]) {
      expect(await nativeFindings(eslint, implementation, source), source).toHaveLength(1);
      expect(await nativeFindings(eslint, `packages/${name}/src/contract/probe.ts`, source), source).toEqual([]);
    }
    expect(await nativeFindings(eslint, `packages/${name}/src/contractual/probe.ts`, "export interface Row {};")).toHaveLength(1);
    expect(await nativeFindings(eslint, `packages/${name}/src/probe.tsx`, "export interface Row {};")).toHaveLength(1);
    expect(await nativeFindings(eslint, `packages/${name}/src/probe.d.ts`, "export interface Row {};")).toHaveLength(1);
    expect(await nativeFindings(eslint, `packages/${name}/src/contract/probe.tsx`, "export interface Row {};")).toEqual([]);
    expect(packageTypeHome(implementation)).toMatchObject({ category: "package-contract", home: false, nativePilot: true });
    expect(packageTypeHome(`packages/${name}/src/contract/probe.ts`)).toMatchObject({ home: true });
  }
}, 15_000);

test("export lists are native placement; reexports, unbound factories and other package populations are not activated", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const source of ["interface Local { readonly n: number; } export { Local };", "type Local = string; export type { Local as Public };"]) {
    expect(await nativeFindings(eslint, "packages/plugin-toolchain/src/probe.ts", source), source).toHaveLength(1);
  }
  for (const source of [
    "export const Schema = z.object({});",
    "export type { Owner } from './owner.ts';",
    "type Local = string; interface View {}",
    "// export interface Row {}\nexport const value = 1;",
  ]) {
    expect(await nativeFindings(eslint, "packages/plugin-toolchain/src/probe.ts", source), source).toEqual([]);
  }
  for (const path of ["packages/ui/src/probe.tsx", "packages/client/src/probe.ts", "tooling/src/probe.ts", "tests/support/node/probe.ts"]) {
    expect(await nativeFindings(eslint, path, "export interface Probe {};")).toEqual([]);
  }
  expect(packageTypeHome("packages/ui/src/primitives/probe.tsx")).toMatchObject({ category: "component", home: null, nativePilot: false, world: "browser" });
  expect(packageTypeHome("packages/plugin-sdk/frame.d.ts")).toMatchObject({ home: null, world: "browser" });
  expect(packageTypeHome("packages/inference/src/contract/probe.ts")).toMatchObject({ home: true, nativePilot: true });
  expect(packageTypeHome("packages/default-content-other/src/contract/probe.ts")).toBeUndefined();
});

test("proven zod shape schemas exported directly or by list are native placement in every admitted population", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const installed = [ZOD_DECLARATION];
  const cases = [
    ['import { z } from "zod"; export const Schema = z.object({});', 1],
    ['import { object as shape } from "zod"; export const First = shape({}), Second = shape({});', 2],
    ['import * as zod from "zod"; const Listed = zod.z["enum"](["a"]); export { Listed as Public };', 1],
    ['import { z } from "zod"; export const Strict = z.strictObject({});', 1],
    ['import { looseObject } from "zod"; const Loose = looseObject({}); export { Loose };', 1],
    ['import { z } from "zod"; export const Scalar = z.string();', 0],
    ['import { z } from "zod"; const Local = z.object({}); export const use = (): object => Local;', 0],
    ["const z = { object: (value: object): object => value }; export const Shadow = z.object({});", 0],
    ["export const Opaque = makeSchema.object({});", 0],
  ] as const;
  for (const [root, home] of [
    ["packages/inference/src", "packages/inference/src/contract/probe.ts"],
    ["packages/default-content/src", "packages/default-content/src/contract/probe.ts"],
    ["packages/plugin-toolchain/src", "packages/plugin-toolchain/src/contract/probe.ts"],
    ["packages/server/src/domain/probe", "packages/server/src/domain/probe/contract/probe.ts"],
    ["packages/server/src/foundation/observability", "packages/server/src/foundation/observability/contract/probe.ts"],
    ["packages/server/src/entry", "packages/server/src/foundation/env/contract.ts"],
    ["packages/server/src/transport", "packages/server/src/transport/trpc/contract/probe.ts"],
    ["packages/server/src/infra", "packages/server/src/infra/probe/contract/probe.ts"],
  ] as const) {
    for (const [source, count] of cases) {
      expect(await nativeFindings(eslint, `${root}/verbs/probe.ts`, source, installed), `${root}: ${source}`).toHaveLength(count);
    }
    expect(await nativeFindings(eslint, home, cases[0][0], installed), home).toEqual([]);
  }
  for (const path of ["packages/server/src/domain/probe/probe.gen.ts", "packages/client/src/features/probe/lib/probe.ts", "tooling/src/snap/ops/probe.ts"]) {
    expect(await nativeFindings(eslint, path, cases[0][0], installed), path).toEqual([]);
  }
}, 30_000);

test("D329 admits its exact files while their folders and other contract-named files stay findings", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const source = "export interface Data {}; export type Scalar = string;";
  for (const path of [
    "packages/server/src/foundation/data-layout/contract.ts",
    "packages/server/src/entry/contract/portability.ts",
    "packages/server/src/entry/http/contract/request-env.ts",
    "packages/server/src/transport/trpc/router.ts",
  ]) {
    expect(await nativeFindings(eslint, path, source), path).toEqual([]);
    expect(nativeTypeHomeAdmission(path), path).toBe(false);
  }
  for (const path of [
    "packages/server/src/foundation/data-layout/layout.ts",
    "packages/server/src/foundation/data-layout/contract/probe.ts",
    "packages/server/src/foundation/arbitrary/contract.ts",
    "packages/server/src/entry/contract/wrong.ts",
    "packages/server/src/entry/http/contract/assets.ts",
    "packages/server/src/entry/http/blob.ts",
    "packages/server/src/transport/trpc/routers/chat.ts",
    "packages/server/src/transport/trpc/router-probe.ts",
  ]) {
    expect(await nativeFindings(eslint, path, source), path).toHaveLength(2);
    expect(nativeTypeHomeAdmission(path), path).toBe(true);
  }
});

test("the schema-path import closure invalidates both type-home native policies", () => {
  for (const id of [TYPE_HOME_NATIVE_POLICY_ID, SERVER_FACTORY_TIER_REFERENCE_POLICY_ID]) {
    const entry = TYPED_NATIVE_POLICIES.find((policy) => policy.id === id);
    expect(entry, id).toBeDefined();
    for (const path of [
      "tooling/src/floor/code-facts/zod-origin.ts",
      "tooling/src/floor/code-facts/call-supplied.ts",
      "tooling/src/floor/code-facts/schema-object.ts",
      "tooling/src/floor/code-facts/reference-fact-call.ts",
      "tooling/src/floor/code-facts/server-public-boundary-grammar.ts",
    ]) {
      expect(entry !== undefined && affectsTypedNativePolicy(entry, path), `${id}: ${path}`).toBe(true);
    }
    expect(entry !== undefined && affectsTypedNativePolicy(entry, "tooling/src/snap/ops/capture.ts"), id).toBe(false);
  }
});

test("the existing custom placement owners do not duplicate the pilot's native accusations", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const root = "/type-home-pilot";
  const project = new Project({ useInMemoryFileSystem: true });
  const source = "export interface Probe { readonly n: number; } export type Alias = string;";
  const file = "packages/default-content/src/probe.ts";
  for (const path of [
    file,
    "packages/server/src/domain/probe/anchor.ts",
    "packages/server/src/infra/anchor.ts",
    "packages/client/src/features/probe/anchor.ts",
  ]) {
    project.createSourceFile(`${root}/${path}`, path === file ? source : "export const anchor = 1;");
  }
  const policies = [inlineTypes, domainInterfaces, packageInterfaces, wireInterfaces];
  const result = runPolicyPass({ root, project, knownPolicies: policies, policies, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(await nativeFindings(eslint, file, source)).toHaveLength(2);
});

test("inference native placement owns every authored plane while generated declarations keep their custom owner", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const root = "/type-home-inference";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/node_modules/zod/index.d.ts`, "export declare function object(shape: object): object;");
  const cases = [
    ["direct.ts", "export interface Direct {} export default interface Default {} export type Alias = string;", 3],
    ["listed.ts", "interface Local {} type Alias = string; export { Local, Alias };", 2],
    ["generated.gen.ts", "export interface Generated {} export type GeneratedAlias = string;", 0],
    ["schema.ts", 'import { object } from "zod"; export const Schema = object({}); const ListedSchema = object({}); export { ListedSchema };', 2],
    ["shadow.ts", "const z = { object: (value: object): object => value }; export const Shadow = z.object({});", 0],
    ["barrel.ts", 'export type { Home } from "./contract/home.ts";', 0],
    ["contract/home.ts", "export interface Home {}", 0],
  ] as const;
  for (const [file, source, count] of cases) {
    const path = `packages/inference/src/${file}`;
    project.createSourceFile(`${root}/${path}`, source);
    expect(await nativeFindings(eslint, path, source, [["node_modules/zod/index.d.ts", ZOD_OBJECT]]), path).toHaveLength(count);
  }
  const policies = [inlineTypes, packageInterfaces];
  const result = runPolicyPass({ root, project, knownPolicies: policies, policies, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  const tokens = result.authority.effectiveFindings.map(({ token }) => {
    if (token === undefined) {
      throw new Error("Every fixture placement finding must carry its authored token.");
    }
    return token;
  });
  expect(tokens.toSorted((left, right) => left.localeCompare(right))).toEqual(["Generated", "GeneratedAlias"]);
});

test("server domains and D324 tiers own direct and listed exports without admitting neighboring packages", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const roots = [
    "packages/server/src/domain/probe",
    "packages/server/src/foundation/observability/debug/inspect",
    "packages/server/src/foundation/observability",
  ];
  for (const root of roots) {
    for (const suffix of ["ts", "tsx", "d.ts"]) {
      const path = `${root}/verbs/probe.${suffix}`;
      for (const source of [
        "export type Scalar = string;",
        "export type Derived<T> = Readonly<T>;",
        "export interface Data { readonly n: number; }",
        "export default interface Default { readonly n: number; }",
        "export declare interface Ambient { readonly n: number; }",
      ]) {
        expect(await nativeFindings(eslint, path, source), `${path}: ${source}`).toHaveLength(1);
        expect(nativeTypeHomeAdmission(path), path).toBe(true);
      }
    }
    for (const file of ["contract/probe.ts", "nested/contract/probe.tsx", "contract.ts", "probe.gen.ts"]) {
      const path = `${root}/${file}`;
      expect(await nativeFindings(eslint, path, "export interface Data {}; export type Scalar = string;"), path).toEqual([]);
      expect(nativeTypeHomeAdmission(path), path).toBe(false);
    }
    const implementation = `${root}/contractual/probe.ts`;
    expect(await nativeFindings(eslint, implementation, "interface Local {}; type Alias = string; export { Local, Alias };")).toHaveLength(2);
    expect(await nativeFindings(eslint, implementation, "export interface Data {};")).toHaveLength(1);
    for (const source of [
      "export const Schema = z.object({});",
      "export type { Home } from './contract/home.ts';",
      "// export interface Mention {}\nexport const text = 'export type Mention = string';",
    ]) {
      expect(await nativeFindings(eslint, implementation, source), source).toEqual([]);
    }
  }
  for (const file of ["audit.ts", "logger.ts", "memory-log.ts", "tracing.ts", "debug/routes.ts", "debug/wire-capture.ts", "debug/bug-report.ts"]) {
    const path = `packages/server/src/foundation/observability/${file}`;
    expect(await nativeFindings(eslint, path, "export interface Data {}; export type Scalar = string;"), path).toHaveLength(2);
    expect(nativeTypeHomeAdmission(path), path).toBe(true);
  }
  for (const path of [
    "packages/server/src/domain/regex/verbs/scripts/create.ts",
    "packages/server/src/foundation/observability-other/probe.ts",
    "packages/server/src/foundation/env/probe.ts",
    "packages/server/src/entry/probe.ts",
    "packages/server/src/transport/probe.ts",
    "packages/server/src/infra/probe.ts",
  ]) {
    expect(await nativeFindings(eslint, path, "export interface Data {}; export type Scalar = string;"), path).toHaveLength(2);
    expect(nativeTypeHomeAdmission(path), path).toBe(true);
  }
  for (const path of [
    "packages/server/src/domain/probe/verb.test.ts",
    "packages/server/src/primitives/probe.ts",
    "packages/ui/src/probe.tsx",
    "packages/client/src/probe.tsx",
    "tooling/src/probe.ts",
    "scripts/probes/probe.ts",
    "tests/server/probe.test.ts",
  ]) {
    expect(await nativeFindings(eslint, path, "export interface Data {}; export type Scalar = string;"), path).toEqual([]);
    expect(nativeTypeHomeAdmission(path), path).toBe(false);
  }
});

test("server native placement owns listed and schema planes while preserving generated custom remainders", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const root = "/type-home-server";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/node_modules/zod/index.d.ts`, "export declare function object(shape: object): object;");
  const cases = [
    ["direct.ts", "export interface Direct {} export type DirectAlias = string;", 2],
    ["listed.ts", "interface Local {} type ListedAlias = string; export { Local, ListedAlias };", 2],
    ["generated.gen.ts", "export interface Generated {} export type GeneratedAlias = string;", 0],
    ["schema.ts", 'import { object as shape } from "zod"; export const Schema = shape({}); const ListedSchema = shape({}); export { ListedSchema };', 2],
    ["shadow.ts", "const z = { object: (value: object): object => value }; export const Shadow = z.object({});", 0],
    ["barrel.ts", 'export type { Home } from "./contract/home.ts";', 0],
    ["contract/home.ts", "export interface Home {}", 0],
  ] as const;
  const roots = [
    "packages/server/src/domain/probe",
    "packages/server/src/foundation/observability/debug/inspect",
    "packages/server/src/foundation/observability",
  ];
  for (const prefix of roots) {
    for (const [file, source, count] of cases) {
      const path = `${prefix}/${file}`;
      project.createSourceFile(`${root}/${path}`, source);
      expect(await nativeFindings(eslint, path, source, [["node_modules/zod/index.d.ts", ZOD_OBJECT]]), path).toHaveLength(count);
    }
  }
  const policies = [inlineTypes, domainInterfaces, packageInterfaces];
  const result = runPolicyPass({ root, project, knownPolicies: policies, policies, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token }) => token).toSorted((left = "", right = "") => left.localeCompare(right))).toEqual(
    roots.flatMap(() => ["Generated", "GeneratedAlias"]).toSorted((left, right) => left.localeCompare(right)),
  );
});
