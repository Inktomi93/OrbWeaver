import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/zod-modern-spellings.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

function findings(source: string): readonly Finding[] {
  const { project, root } = ctxFor({ "packages/server/src/domain/probe/verbs/refuse.ts": source });
  return (
    runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    }).gates[0]?.findings ?? []
  );
}

test("issues destructured through a one-hop error alias are flagged", () => {
  expect(
    findings(
      "export function refuse(parsed: { error: { issues: readonly { message: string }[] } }): string {\n" +
        "  const failure = parsed.error;\n" +
        "  const { issues } = failure;\n" +
        '  return issues.map((issue) => issue.message).join("; ");\n' +
        "}\n",
    ),
  ).toHaveLength(1);
});

test("issues destructured through a non-error alias are not flagged", () => {
  expect(
    findings(
      "export function summarize(first: { issues: readonly string[] }): string {\n" +
        "  const failure = first;\n" +
        "  const { issues } = failure;\n" +
        '  return issues.join("; ");\n' +
        "}\n",
    ),
  ).toEqual([]);
});
