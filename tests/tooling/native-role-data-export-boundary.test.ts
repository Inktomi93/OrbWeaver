// The effective native configuration seals the few modules allowed to decode role data.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: ROOT });

test.for([
  "primitives/role-data/index.ts",
  "primitives/role-data/registry.ts",
  "primitives/role-data/decode/index.ts",
  "domain/admin/guard.ts",
  "domain/chat/substrate/participants-host.ts",
  "domain/chat/substrate/member-visibility.ts",
  "domain/chat/persistence/role-encoding.ts",
  "entry/http/auth-meta.ts",
  "transport/trpc/role-output.ts",
  "domain/databank/persistence/scope.ts",
  "domain/admin/persistence/queries.ts",
  "entry/compose/chat.ts",
  "domain/sessions/verbs/validate.ts",
  "domain/sessions/verbs/load-user-by-id.ts",
  "domain/sessions/verbs/provision-identity.ts",
  "entry/auth/seam.ts",
  "domain/automation/persistence/canon-reads.ts",
  "domain/chat/persistence/queries.ts",
  "domain/chat/persistence/participants-read.ts",
  "domain/chat/verbs/edit.ts",
  "domain/chat/verbs/read.ts",
  "domain/chat/verbs/participants.ts",
])("native export restrictions seal the role codec owner %s", async (owner) => {
  const path = `packages/server/src/${owner}`;
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const ids = Object.keys(config.rules).filter((id) => id.startsWith("orb/role-data-export-surface-"));
  const rules = Object.fromEntries(ids.map((id) => [id, config.rules[id]]));
  const judge = (source: string): readonly string[] => {
    const messages = new Linter().verify(
      source,
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
        plugins: config.plugins,
        rules,
      },
      { filename: path },
    );
    expect(
      messages.filter(({ fatal }) => fatal),
      source,
    ).toEqual([]);
    return messages.map(({ message }) => message);
  };
  for (const source of [
    'import { captureUserRole } from "#primitives/role-data"; export { captureUserRole as mint };',
    "export { userRoleValue as leak };",
    'export { userRoleValue as "leak" };',
    'export { userRoleValue as can } from "./decode/index.ts";',
    'export * from "./decode/index.ts";',
    'export * as data from "./decode/index.ts";',
    "export default userRoleValue;",
    "export import leak = data;",
    "export const leak = userRoleValue;",
    "export const { userRoleValue: leak } = data;",
    "export function leak() { return userRoleValue; }",
    "export class Leak {}",
    "export namespace Leak { export const captureUserRole = mint; }",
    "export declare function captureUserRole(): void;",
  ]) {
    expect(judge(source), source).not.toEqual([]);
  }
  expect(ids).toHaveLength(1);
  expect(judge("const data = { userRoleValue: 'foreign' }; const { userRoleValue: local } = data;")).toEqual([]);
  expect(judge("export interface Data { readonly role: object; }")).toEqual([]);
  expect(judge('export type { Data } from "./contract/data.ts";')).toEqual([]);
  expect(judge('export { type Data } from "./contract/data.ts";')).toEqual([]);
  expect(judge('export type * from "./contract/data.ts";')).toEqual([]);
});

test("foreign modules keep their own exported role vocabulary", async () => {
  const config = await eslint.calculateConfigForFile(join(ROOT, "packages/server/src/domain/chat/contract/foreign-role.ts"));
  expect(Object.keys(config.rules).filter((id) => id.startsWith("orb/role-data-export-surface-"))).toEqual([]);
});
