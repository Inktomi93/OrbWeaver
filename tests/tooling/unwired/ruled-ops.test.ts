// The census reads its ruled joint-batch ops from one tuple; D337's table, owners included, and its D259 citation
// are what it must equal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { JOINT_BATCH_RULINGS, jointBatchRulingOf } from "../../../tooling/src/eslint/index.ts";

const ADR = join(import.meta.dirname, "../../../docs/adr/0337-owner-built-statements-join-another-domains-batch.md");

const decisionOf = (markdown: string): string => markdown.slice(markdown.indexOf("## Decision"), markdown.indexOf("## Consequences"));

// Each table row's backticked ops in its first cell, paired in order with the owners its second cell lists; one
// owner builds every op of its row.
function tableOps(decision: string): string[] {
  return decision
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("| Op") && !line.startsWith("| -"))
    .flatMap((line) => {
      const [, opCell = "", ownerCell = ""] = line.split("|");
      const ops = [...opCell.matchAll(/`([A-Za-z]+)`/gu)].map((match) => match[1] ?? "");
      const owners = ownerCell
        .replace(/(?<!\()\([^)]*\)/gu, "")
        .split(",")
        .map((owner) => owner.trim());
      return ops.map((op, index) => `${owners.length === 1 ? owners[0] : owners[index]}|${op}`);
    });
}

const opsOf = (ruling: (typeof JOINT_BATCH_RULINGS)[number]["ruling"]): readonly string[] =>
  (JOINT_BATCH_RULINGS.find((group) => group.ruling === ruling)?.ops ?? []).map(({ owner, op }) => `${owner}|${op}`);

test("the D337 group equals D337's table with its owners, and the D259 group is the citation D337 leaves its signup statements under", () => {
  const decision = decisionOf(readFileSync(ADR, "utf8"));
  const ops = tableOps(decision);
  expect(ops.length).toBeGreaterThan(0);
  expect([...opsOf("D337")].toSorted()).toEqual(ops.toSorted());
  expect(decision).toMatch(/signup statements stay under D259/u);
  expect(opsOf("D259").filter((op) => opsOf("D337").includes(op))).toEqual([]);
});

test("a ruling needs the op's owner among the crossed domains, by any name of the op", () => {
  expect(jointBatchRulingOf(["SessionsService.revokeAllForUserStatement"], ["sessions", "admin"])).toMatch(/^D337 /u);
  expect(jointBatchRulingOf(["chatStats", "StatsBatchWiring"], ["chat", "stats"])).toMatch(/^D337 /u);
  expect(jointBatchRulingOf(["PendingSignupPlan.statements", "PendingSignupStatements"], ["chat", "sessions"])).toMatch(/^D259 /u);
  // The same op name between two domains that do not build it is no ruled batch.
  expect(jointBatchRulingOf(["AlphaOps.claimStatement"], ["alpha", "beta"])).toBeNull();
  expect(jointBatchRulingOf(["SessionsService.revokeOneSessionStatement", "RevokeOneStatement"], ["sessions", "admin"])).toBeNull();
});
