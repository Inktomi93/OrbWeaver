// The census reads its ruled joint-batch ops from one tuple; D337's table is the registry it must equal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { isRuledJointBatchOp, RULED_JOINT_BATCH_OPS } from "../../../tooling/src/unwired/ruled-ops.ts";

const ADR = join(import.meta.dirname, "../../../docs/adr/0337-owner-built-statements-join-another-domains-batch.md");

// The backticked names in the first cell of each table row under the ADR's Decision heading.
function tableOps(markdown: string): string[] {
  const decision = markdown.slice(markdown.indexOf("## Decision"), markdown.indexOf("## Consequences"));
  return decision
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("| Op") && !line.startsWith("| -"))
    .flatMap((line) => [...(line.split("|")[1] ?? "").matchAll(/`([A-Za-z]+)`/gu)].map((match) => match[1] ?? ""));
}

test("the ruled-op tuple equals D337's table", () => {
  const ops = tableOps(readFileSync(ADR, "utf8"));
  expect(ops.length).toBeGreaterThan(0);
  expect([...RULED_JOINT_BATCH_OPS].toSorted()).toEqual(ops.toSorted());
});

test("a census key is ruled by its op name, qualified or not, and an unlisted op is not", () => {
  expect(isRuledJointBatchOp("SessionsService.revokeAllForUserStatement")).toBe(true);
  expect(isRuledJointBatchOp("StatsBatchWiring")).toBe(true);
  expect(isRuledJointBatchOp("SessionsService.signupUserStatement")).toBe(false);
});
