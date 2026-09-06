// Finding granularity must EQUAL grant granularity. A reviewed grant is keyed on
// `(policyId, subject, operation)` and central reconciliation calls a row matching more than one finding
// OVER-BROAD — it then licenses nothing — so a home performing the same licensed operation three times must
// still produce exactly ONE finding, with its sites named in the message.
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicyNodeFindingDetails, GatePolicyReportSink } from "../../../../tooling/src/verify/contract/policy.ts";
import type { ReviewedGrantCandidate } from "../../../../tooling/src/verify/lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../../../../tooling/src/verify/lib/reviewed-grant-findings.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TEXT = { message: "the law", fix: "the fix", unreadableMessage: "unreadable" };

interface Reported {
  readonly node: Node;
  readonly details: GatePolicyNodeFindingDetails | undefined;
}

function sinkOf(reported: Reported[]): GatePolicyReportSink {
  return {
    node: (node, details): void => {
      reported.push({ node, details });
    },
    file: (): never => {
      throw new Error("this reader reports node findings only");
    },
  };
}

function callsIn(source: string): readonly Node[] {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("/repo/x.ts", source).getDescendantsOfKind(SyntaxKind.CallExpression);
}

test("three occurrences of ONE licensed operation are ONE finding that names every site", () => {
  const [first, second, third] = callsIn("declare const a: { go: () => void };\na.go();\na.go();\na.go();\n");
  const candidates = [first, second, third]
    .filter((node): node is Node => node !== undefined)
    .map((node): ReviewedGrantCandidate => ({ node, subject: "packages/client/src/home.ts", operation: "go" }));
  const reported: Reported[] = [];

  reportReviewedGrantCandidates(sinkOf(reported), candidates, TEXT);

  expect(reported).toHaveLength(1);
  expect(reported[0]?.details).toMatchObject({ subject: "packages/client/src/home.ts", operation: "go", fix: "the fix" });
  expect(reported[0]?.details?.message).toContain("line(s): 2, 3, 4");
});

test("two DIFFERENT operations in one subject stay two findings, because they are two grant rows", () => {
  const [go, stop] = callsIn("declare const a: { go: () => void; stop: () => void };\na.go();\na.stop();\n");
  const candidates = [
    { node: go as Node, subject: "packages/client/src/home.ts", operation: "go" },
    { node: stop as Node, subject: "packages/client/src/home.ts", operation: "stop" },
  ];
  const reported: Reported[] = [];

  reportReviewedGrantCandidates(sinkOf(reported), candidates, TEXT);

  expect(reported.map(({ details }) => details?.operation)).toEqual(["go", "stop"]);
});

test("a group with any PROVEN candidate carries the law's message and anchors on the proven site", () => {
  const [unreadable, proven] = callsIn("declare const a: { go: () => void };\na.go();\na.go();\n");
  const candidates = [
    { node: unreadable as Node, subject: "packages/client/src/home.ts", operation: "go", unreadable: true },
    { node: proven as Node, subject: "packages/client/src/home.ts", operation: "go" },
  ];
  const reported: Reported[] = [];

  reportReviewedGrantCandidates(sinkOf(reported), candidates, TEXT);

  expect(reported).toHaveLength(1);
  expect(reported[0]?.details?.message).toContain("the law");
  expect(reported.map(({ node }) => node.getStartLineNumber())).toEqual([3]);
});

test("a group whose every candidate is unreadable says so instead of asserting the law", () => {
  const [only] = callsIn("declare const a: { go: () => void };\na.go();\n");
  const reported: Reported[] = [];

  reportReviewedGrantCandidates(sinkOf(reported), [{ node: only as Node, subject: "packages/client/src/home.ts", operation: "go", unreadable: true }], TEXT);

  expect(reported[0]?.details?.message).toContain("unreadable");
});

test("groups report in stable subject/operation order regardless of walk order", () => {
  const [first, second] = callsIn("declare const a: { go: () => void };\na.go();\na.go();\n");
  const candidates = [
    { node: second as Node, subject: "packages/client/src/zulu.ts", operation: "go" },
    { node: first as Node, subject: "packages/client/src/alpha.ts", operation: "go" },
  ];
  const reported: Reported[] = [];

  reportReviewedGrantCandidates(sinkOf(reported), candidates, TEXT);

  expect(reported.map(({ details }) => details?.subject)).toEqual(["packages/client/src/alpha.ts", "packages/client/src/zulu.ts"]);
});
