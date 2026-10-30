// The census reads its ruled joint-batch ops from one tuple; D337's table and its D259 citation are what it must equal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { JOINT_BATCH_RULINGS, jointBatchRulingOf } from "../../../tooling/src/unwired/ruled-ops.ts";

const ADR = join(import.meta.dirname, "../../../docs/adr/0337-owner-built-statements-join-another-domains-batch.md");

const decisionOf = (markdown: string): string => markdown.slice(markdown.indexOf("## Decision"), markdown.indexOf("## Consequences"));

// The backticked names in the first cell of each table row under the ADR's Decision heading.
function tableOps(decision: string): string[] {
  return decision
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("| Op") && !line.startsWith("| -"))
    .flatMap((line) => [...(line.split("|")[1] ?? "").matchAll(/`([A-Za-z]+)`/gu)].map((match) => match[1] ?? ""));
}

const opsOf = (ruling: (typeof JOINT_BATCH_RULINGS)[number]["ruling"]): readonly string[] =>
  JOINT_BATCH_RULINGS.find((group) => group.ruling === ruling)?.ops ?? [];

test("the D337 group equals D337's table, and the D259 group is the citation D337 leaves its signup statements under", () => {
  const decision = decisionOf(readFileSync(ADR, "utf8"));
  const ops = tableOps(decision);
  expect(ops.length).toBeGreaterThan(0);
  expect([...opsOf("D337")].toSorted()).toEqual(ops.toSorted());
  expect(decision).toMatch(/signup statements stay under D259/u);
  expect(opsOf("D259").filter((op) => opsOf("D337").includes(op))).toEqual([]);
});

test("a ruling resolves from any name of the op, qualified or not, and an unlisted op has none", () => {
  expect(jointBatchRulingOf(["SessionsService.revokeAllForUserStatement"])).toMatch(/^D337 /u);
  expect(jointBatchRulingOf(["chatStats", "StatsBatchWiring"])).toMatch(/^D337 /u);
  expect(jointBatchRulingOf(["PendingSignupPlan.statements", "PendingSignupStatements"])).toMatch(/^D259 /u);
  expect(jointBatchRulingOf(["SessionsService.revokeOneSessionStatement", "RevokeOneStatement"])).toBeNull();
});
