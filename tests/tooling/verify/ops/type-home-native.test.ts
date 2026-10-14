import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { packageTypeHome, TYPE_HOME_NATIVE_POLICY_ID } from "@orb/tooling/floor/code-facts/type-home";
import { ESLint, Linter } from "eslint";
import { Project } from "ts-morph";
import tseslint from "typescript-eslint";
import { gate as domainInterfaces } from "../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as packageInterfaces } from "../../../../tooling/src/verify/gates/no-inline-package-interface.ts";
import { gate as inlineTypes } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { gate as wireInterfaces } from "../../../../tooling/src/verify/gates/no-inline-wire-interface.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const RULE = `orb/${TYPE_HOME_NATIVE_POLICY_ID}`;

async function nativeFindings(eslint: ESLint, path: string, source: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(path);
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      plugins: { orb: config.plugins.orb },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    path,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

test("the native placement pilot flags every direct alias/interface form only outside its canonical contract homes", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const name of ["default-content", "plugin-toolchain"] as const) {
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
});

test("export lists and schema origins remain explicit semantic remainders; other package populations are not activated", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const source of [
    "interface Local { readonly n: number; } export { Local };",
    "type Local = string; export type { Local as Public };",
    "export const Schema = z.object({});",
    "export type { Owner } from './owner.ts';",
    "type Local = string; interface View {}",
    "// export interface Row {}\nexport const value = 1;",
  ]) {
    expect(await nativeFindings(eslint, "packages/plugin-toolchain/src/probe.ts", source), source).toEqual([]);
  }
  for (const path of [
    "packages/inference/src/probe.ts",
    "packages/ui/src/probe.tsx",
    "packages/client/src/probe.ts",
    "tooling/src/probe.ts",
    "tests/support/node/probe.ts",
  ]) {
    expect(await nativeFindings(eslint, path, "export interface Probe {};")).toEqual([]);
  }
  expect(packageTypeHome("packages/ui/src/primitives/probe.tsx")).toMatchObject({ category: "component", home: null, nativePilot: false, world: "browser" });
  expect(packageTypeHome("packages/plugin-sdk/frame.d.ts")).toMatchObject({ home: null, world: "browser" });
  expect(packageTypeHome("packages/inference/src/contract/probe.ts")).toMatchObject({ home: true, nativePilot: false });
  expect(packageTypeHome("packages/default-content-other/src/contract/probe.ts")).toBeUndefined();
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
