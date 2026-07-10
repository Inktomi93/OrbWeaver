// Self-test for the DORMANT `infra-auth-no-userid` gate (scripts/check/gates/infra-auth-no-userid.ts —
// D40 identity-resolution invariant; held out of ALL_CHECKS pending doc reconciliation). Proves: a
// `userId` code identifier under infra/auth fires, the same identifier OUTSIDE infra/auth passes, and a
// `userId` mention in a COMMENT / string literal (the many `// NO userId` invariant notes) is exempt.
import { Project } from "ts-morph";
import { infraAuthNoUserId } from "../../scripts/check/gates/infra-auth-no-userid.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

const AUTH = "packages/server/src/infra/auth/modes/thing.ts";

function ctxFor(files: Record<string, string>, root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
  return { root, project };
}

test("fires on a `userId` identifier under infra/auth", () => {
  const v = infraAuthNoUserId.run(ctxFor({ [AUTH]: "export function f(userId: string) {}\n" }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D40");
});

test("passes the same identifier OUTSIDE infra/auth (a domain sessions.validate)", () => {
  const other = "packages/server/src/domain/sessions/verbs/validate.ts";
  const v = infraAuthNoUserId.run(ctxFor({ [other]: "export function f(userId: string) {}\n" }));
  expect(v).toEqual([]);
});

test("exempts a `userId` mention in a comment (the `// NO userId` invariant notes)", () => {
  const src = "// resolves NO userId here (invariant #3)\nexport const x = 1;\n";
  expect(infraAuthNoUserId.run(ctxFor({ [AUTH]: src }))).toEqual([]);
});

test("exempts a `userId` mention in a string literal", () => {
  const src = 'export const doc = "the seam resolves the userId";\n';
  expect(infraAuthNoUserId.run(ctxFor({ [AUTH]: src }))).toEqual([]);
});
