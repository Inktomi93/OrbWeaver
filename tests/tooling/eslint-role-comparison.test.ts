// `orb/no-role-comparison` through the repository's resolved config: a comparison, switch, membership test or keyed
// lookup whose operand the checker types as a role is refused in the server and the client whatever the operand is
// named, and the identity contracts that encode a role's meaning are the one home (Spine-Identity-and-Auth.md
// invariant 6). A value that only spells a role literal, or a different vocabulary over the same words, is not a role.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";
import { programForSource } from "./_typescript-program.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-role-comparison";
const PROBES = [
  { path: "packages/server/src/domain/chat/substrate/role-probe.ts", tsconfig: "packages/server/tsconfig.json" },
  { path: "packages/client/src/features/chat/lib/role-probe.ts", tsconfig: "packages/client/tsconfig.json" },
] as const;
// The meaning home and the account role chip, each named in eslint.config.ts with its ruling.
const HOMES = ["packages/contracts/src/identity/index.ts", "packages/client/src/components/user-role-status.ts"] as const;
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, PROBES[0].path));
}, 120_000);

const DECLARATIONS = [
  'import type { GlobalAction, UserRole } from "@orb/contracts/identity";',
  'import { USER_ROLES, isHostRole, userRoleSatisfies, userRoleSchema } from "@orb/contracts/identity";',
  'import type { ParticipantRole, RoomStanding } from "@orb/kit/message-author";',
  'import { standingOf } from "@orb/kit/message-author";',
  'import type { z } from "zod";',
  "declare const principal: { readonly role: UserRole };",
  "declare const other: { readonly role: UserRole };",
  "declare const seat: { readonly role: ParticipantRole };",
  "declare const room: RoomStanding;",
  "declare const renamed: { readonly standing: UserRole };",
  "type Rank = UserRole;",
  "declare const rank: Rank;",
  "declare const branded: UserRole & { readonly brand: unique symbol };",
  "declare const maybe: { readonly role?: UserRole } | undefined;",
  "declare const nullable: UserRole | null;",
  "declare const wire: z.infer<typeof userRoleSchema>;",
  "declare const action: GlobalAction;",
  'declare const message: { readonly role: "user" | "assistant" | "system" };',
  "declare const named: { readonly role: string };",
  "declare const text: string;",
  "declare const admins: readonly UserRole[];",
  "declare const roleSet: ReadonlySet<UserRole>;",
  "declare const byRole: ReadonlyMap<UserRole, number>;",
  "declare const labels: Readonly<Record<UserRole, string>>;",
  'const OWNER = "owner" as const;',
  "export const keep = [USER_ROLES, isHostRole, userRoleSatisfies, OWNER, admins, roleSet, byRole, labels, text] as const;",
].join("\n");

async function findings(probe: (typeof PROBES)[number], body: string): Promise<number> {
  const fileName = join(ROOT, probe.path);
  const source = `${DECLARATIONS}\n${body}\n`;
  const config = await resolvedConfig(eslint, fileName);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: config.plugins,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: false, projectService: false, programs: [programForSource(ROOT, probe.tsconfig, fileName, source)] },
      },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: fileName },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    body,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE).length;
}

test.for([
  ["a strict equality against a literal", 'export const f = (): boolean => principal.role === "owner";', 1],
  ["a literal on the left of an inequality", 'export const f = (): boolean => "admin" !== principal.role;', 1],
  ["a loose equality", 'export const f = (): boolean => principal.role == "user";', 1],
  ["a loose inequality", 'export const f = (): boolean => principal.role != "owner";', 1],
  ["a named constant", "export const f = (): boolean => principal.role === OWNER;", 1],
  ["an imported constant", "export const f = (): boolean => principal.role === USER_ROLES[0];", 1],
  ["another role value", "export const f = (): boolean => principal.role === other.role;", 1],
  ["a renamed field", 'export const f = (): boolean => renamed.standing === "admin";', 1],
  ["an alias", 'export const f = (): boolean => rank === "owner";', 1],
  ["a branded role", 'export const f = (): boolean => branded === "owner";', 1],
  ["an optional role", 'export const f = (): boolean => maybe?.role === "owner";', 1],
  ["a nullable role", 'export const f = (): boolean => nullable === "admin";', 1],
  ["a role inferred from the wire schema", 'export const f = (): boolean => wire === "owner";', 1],
  ["a room role", 'export const f = (): boolean => seat.role === "host";', 1],
  [
    "a room role the kit standing read returns",
    'export const f = (authorUserId: Parameters<typeof standingOf>[0]["authorUserId"]): boolean => standingOf({ authorUserId }, room) === "host";',
    1,
  ],
  ["a role-constrained type parameter", 'export const f = <R extends UserRole>(role: R): boolean => role === "owner";', 1],
  ["a narrowed role", 'export function f(role: UserRole): boolean {\n  if (role !== "user") {\n    return false;\n  }\n  return role === "user";\n}', 2],
  [
    "a switch on a role",
    'export function f(): number {\n  switch (principal.role) {\n    case "owner":\n      return 2;\n    case "admin":\n      return 1;\n    default:\n      return 0;\n  }\n}',
    1,
  ],
  [
    "a role-typed case label",
    "export function f(): number {\n  switch (text) {\n    case principal.role:\n      return 1;\n    default:\n      return 0;\n  }\n}",
    1,
  ],
  ["an array includes", "export const f = (): boolean => admins.includes(principal.role);", 1],
  ["a literal array includes", 'export const f = (): boolean => ["owner", "admin"].includes(rank);', 1],
  ["an indexOf", "export const f = (): number => admins.indexOf(renamed.standing);", 1],
  ["a set membership", "export const f = (): boolean => roleSet.has(principal.role);", 1],
  ["a map membership", "export const f = (): boolean => byRole.has(principal.role);", 1],
  ["a map read keyed by role", "export const f = (): number | undefined => byRole.get(principal.role);", 1],
  ["a record lookup keyed by role", "export const f = (): string => labels[principal.role];", 1],
  ["an in test", "export const f = (): boolean => principal.role in labels;", 1],
  ["a restated copy of the role tuple", 'type MyRole = "owner" | "admin" | "user";\nexport const f = (role: MyRole): boolean => role === "owner";', 1],
] as const)("refuses %s", async ([, body, count]) => {
  for (const probe of PROBES) {
    expect(await findings(probe, body), probe.path).toBe(count);
  }
});

test.for([
  ["a message role compared with user", 'export const f = (): boolean => message.role === "user";'],
  ["a plain string that is only named role", 'export const f = (): boolean => named.role === "owner";'],
  ["a global action, a narrower vocabulary over role words", 'export const f = (): boolean => action === "owner";'],
  ["a presence test against undefined", "export const f = (): boolean => maybe?.role === undefined;"],
  ["a presence test against null", "export const f = (): boolean => nullable !== null;"],
  ["the user role predicate", 'export const f = (): boolean => userRoleSatisfies(principal.role, "admin");'],
  ["the room role predicate", "export const f = (): boolean => isHostRole(seat.role);"],
  ["a role passed through unread", "export const f = (): UserRole => principal.role;"],
] as const)("passes %s", async ([, body]) => {
  for (const probe of PROBES) {
    expect(await findings(probe, body), probe.path).toBe(0);
  }
});

test("only the named homes may compare a role", async () => {
  for (const home of HOMES) {
    expect((await resolvedConfig(eslint, join(ROOT, home))).rules[RULE], home).toBeUndefined();
  }
  for (const probe of PROBES) {
    expect((await resolvedConfig(eslint, join(ROOT, probe.path))).rules[RULE]).toEqual([2]);
  }
});
