// What a privilege role means is encoded once, in `@orb/contracts/identity` (`isHostRole`, `userRoleSatisfies`): the
// server, its `can()` kernel included, and the client refuse a role literal tested against an operand named for a role,
// in an equality, a `switch` case, an array literal's `includes` or an `in` over an object literal
// (Spine-Identity-and-Auth.md invariant 6). A message role is not a privilege role.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const FINDING = "isHostRole or userRoleSatisfies";
// Where a stray comparison could land: a server domain, the kernel's own file, the transport and the client.
const REFUSING_PATHS = [
  "packages/server/src/domain/chat/substrate/probe.ts",
  "packages/server/src/domain/admin/guard.ts",
  "packages/server/src/transport/trpc/routers/probe.ts",
  "packages/client/src/features/chat/lib/probe.ts",
] as const;
const HOME_PATH = "packages/contracts/src/identity/probe.ts";
const ROLE_LITERALS = ["host", "member", "owner", "admin"] as const;
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, REFUSING_PATHS[0]));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId, message }) => ruleId === RULE && message.includes(FINDING));
}

const forms = (role: string): readonly (readonly [string, string])[] => [
  ["a role field, literal on the right", `export const f = (p: { role: string }): boolean => p.role === "${role}";`],
  ["a role field, literal on the left", `export const f = (p: { role: string }): boolean => "${role}" !== p.role;`],
  ["an optional role field", `export const f = (d?: { globalRole: string }): boolean => d?.globalRole === "${role}";`],
  ["a role variable", `export const f = (derivedRole: string): boolean => derivedRole !== "${role}";`],
  [
    "a decoded role",
    `declare function participantRoleValue(x: string): string;\nexport const f = (x: string): boolean => participantRoleValue(x) === "${role}";`,
  ],
  [
    "a switch case",
    `export function f(p: { viewerRole: string }): number {\n  switch (p.viewerRole) {\n    case "${role}":\n      return 1;\n    default:\n      return 0;\n  }\n}`,
  ],
  ["an array literal's includes", `export const f = (role: string): boolean => ["${role}", "other"].includes(role);`],
  ["an in over an object literal", `export const f = (role: string): boolean => role in { ${role}: true };`],
];

const REFUSED = ROLE_LITERALS.flatMap((role) => forms(role).map(([form, source]) => [`${form} against ${role}`, source] as const));

test.for(REFUSED)("%s is a finding in a server domain, the kernel, the transport and the client", async ([, source]) => {
  for (const path of REFUSING_PATHS) {
    expect(await findings(source, path), path).toHaveLength(1);
  }
});

test.for([
  ["a message role compared with user", 'export const f = (m: { role: string }): boolean => m.role === "user";'],
  [
    "a message role switch",
    'export function f(m: { role: string }): number {\n  switch (m.role) {\n    case "assistant":\n      return 1;\n    default:\n      return 0;\n  }\n}',
  ],
  ["message roles in an includes", 'export const f = (m: { role: string }): boolean => ["user", "assistant"].includes(m.role);'],
  ["a network host kind", 'export const f = (one: { kind: string }): boolean => one.kind === "host";'],
  [
    "the named predicate",
    'import { isHostRole } from "@orb/contracts/identity";\nexport const f = (p: { role: "host" | "member" }): boolean => isHostRole(p.role);',
  ],
] as const)("%s is not a finding", async ([, source]) => {
  for (const path of REFUSING_PATHS) {
    expect(await findings(source, path), path).toEqual([]);
  }
});

test("the contracts home of the predicates is the one place a role literal is tested", async () => {
  for (const [, source] of REFUSED) {
    expect(await findings(source, HOME_PATH)).toEqual([]);
  }
});
