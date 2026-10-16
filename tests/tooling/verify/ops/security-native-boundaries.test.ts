// Exercise the effective native security boundary, not a duplicated selector or compiler model.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT });
const INFRA_AUTH_RULE = "orb/infra-auth-no-userid";
const INFRA_AUTHORITY_RULE = "orb/infra-auth-pre-row-imports";

async function findings(path: string, source: string, ruleId: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: { [ruleId]: config.rules[ruleId] ?? "off" },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return messages.map(({ message }) => message);
}

test("infra verification rejects every userId identifier position without claiming string-key analysis", async () => {
  for (const path of [
    "packages/server/src/infra/auth/modes/probe.ts",
    "packages/server/src/infra/auth/probe.tsx",
    "packages/server/src/infra/auth/probe.d.ts",
  ]) {
    for (const source of [
      "export function resolve(userId: string) {}",
      "const { userId: resolved } = identity;",
      "const identity = { userId: value };",
      "identity.userId;",
      "identity?.userId;",
      "identity[userId];",
      "declare const userId: unique symbol;",
      "class Auth { get userId(): string { return ''; } }",
      "class Auth { set userId(value: string) {} }",
      "class Auth { @userId accessor identity!: string; }",
      "export function resolve(user\\u0049d: string) {}",
      "// @orb-waive infra-auth-no-userid(userId): obsolete marker cannot excuse native syntax.\nconst userId = value;",
    ]) {
      expect(await findings(path, source, INFRA_AUTH_RULE), source).toHaveLength(1);
    }
    for (const source of [
      "// resolves NO userId here\nconst doc = 'the seam resolves userId';",
      "const identity = { externalId, handle, groups, email };",
      'const identity = { "userId": "documented", ["userId"]: "computed" }; identity["userId"];',
    ]) {
      expect(await findings(path, source, INFRA_AUTH_RULE), source).toEqual([]);
    }
  }
  for (const source of ["const node = <userId />;", "const node = <div userId />;"]) {
    expect(await findings("packages/server/src/infra/auth/probe.tsx", source, INFRA_AUTH_RULE), source).toHaveLength(1);
  }
  for (const path of [
    "packages/server/src/domain/sessions/verbs/validate.ts",
    "packages/server/src/entry/auth/seam.ts",
    "packages/server/src/infra/network/probe.ts",
    "packages/inference/src/probe.ts",
    "tests/server/infra/auth/probe.test.ts",
  ]) {
    expect(await findings(path, "const userId = value;", INFRA_AUTH_RULE), path).toEqual([]);
  }
});

test("infra verification cannot import or reexport the canonical post-row authority API", async () => {
  const path = "packages/server/src/infra/auth/modes/probe.ts";
  for (const source of [
    'import type { Principal } from "@orb/contracts/identity";',
    'import type { Principal as Caller } from "@orb/contracts/identity";',
    'import type { "Principal" as Caller } from "@orb/contracts/identity";',
    'export type { Principal as Caller } from "@orb/contracts/identity";',
    'export type { "Principal" as Caller } from "@orb/contracts/identity";',
    'import type { Can } from "@orb/contracts/identity";',
    'import { USER_ROLES } from "@orb/contracts/identity";',
    'import type * as Identity from "@orb/contracts/identity";',
    'export * from "@orb/contracts/identity";',
  ]) {
    expect(await findings(path, source, INFRA_AUTHORITY_RULE), source).toHaveLength(1);
  }
  for (const source of [
    'import type { ResolvedIdentity, AuthMode } from "@orb/contracts/identity";',
    'export type { ResolvedIdentity } from "@orb/contracts/identity";',
    'import { CSRF_HEADER } from "@orb/contracts/identity";',
    'import type { Principal as Foreign } from "foreign";',
    'import type { "Principal" as Foreign } from "foreign";',
    'export type { "Principal" as Foreign } from "foreign";',
  ]) {
    expect(await findings(path, source, INFRA_AUTHORITY_RULE), source).toEqual([]);
  }
  expect(await findings("packages/server/src/entry/auth/seam.ts", 'import type { Principal } from "@orb/contracts/identity";', INFRA_AUTHORITY_RULE)).toEqual(
    [],
  );
});

test("generated verification source retains both infra restrictions without activating unrelated rules", async () => {
  for (const path of ["packages/server/src/infra/auth/probe.gen.ts", "packages/server/src/infra/auth/modes/probe.gen.ts"]) {
    expect(await findings(path, "const userId = value;", INFRA_AUTH_RULE), path).toHaveLength(1);
    expect(await findings(path, 'import type { Principal as Caller } from "@orb/contracts/identity";', INFRA_AUTHORITY_RULE), path).toHaveLength(1);
    const config = await eslint.calculateConfigForFile(join(ROOT, path));
    expect(
      Object.keys(config.rules)
        .filter((id) => id.startsWith("orb/"))
        .toSorted(),
    ).toEqual([INFRA_AUTH_RULE, INFRA_AUTHORITY_RULE].toSorted());
    expect(config.rules["@typescript-eslint/no-floating-promises"]).toBeUndefined();
    expect(config.languageOptions.parserOptions).toMatchObject({ project: false, projectService: false });
  }
  expect(await findings("packages/server/src/infra/network/probe.gen.ts", "const userId = value;", INFRA_AUTH_RULE)).toEqual([]);
});
