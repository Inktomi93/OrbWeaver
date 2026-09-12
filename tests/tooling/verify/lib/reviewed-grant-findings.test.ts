// Finding granularity must EQUAL grant granularity. A reviewed grant is keyed on
// `(policyId, subject, operation)` and central reconciliation calls a row matching more than one finding
// OVER-BROAD — it then licenses nothing — so a home performing the same licensed operation three times must
// still produce exactly ONE finding, with its sites named in the message.
import type { Node } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicyFileFindingDetails, GatePolicyNodeFindingDetails, GatePolicyReportSink } from "../../../../tooling/src/verify/contract/policy.ts";
import type { ReviewedGrantCandidate, ReviewedGrantFileCandidate } from "../../../../tooling/src/verify/lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates, reportReviewedGrantFileCandidates } from "../../../../tooling/src/verify/lib/reviewed-grant-findings.ts";
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
// ---------------------------------------------------------------------------------------------------
// THE FILE DOOR. The same law over occurrences with no node to anchor on — a comment directive, a
// resource row. It had FIVE specs above it and ZERO of its own (#2135): every test in this file drove
// `reportReviewedGrantCandidates`, so the file door's grouping, ordering, `note` rendering and unreadable
// arm shipped unpinned, and its site-ordering defect survived a conversion because nothing here looked.
// ---------------------------------------------------------------------------------------------------

interface FileReported {
  readonly file: string;
  readonly details: GatePolicyFileFindingDetails | undefined;
}

function fileSinkOf(reported: FileReported[]): GatePolicyReportSink {
  return {
    node: (): never => {
      throw new Error("this reader reports file findings only");
    },
    file: (file, details): void => {
      reported.push({ file, details });
    },
  };
}

const grant = (file: string, line: number, note?: string): ReviewedGrantFileCandidate => ({
  file,
  line,
  subject: "lint/style/useConst",
  operation: "source",
  ...(note === undefined ? {} : { note }),
});

test("file sites are named in NUMERIC line order, never in rendered-string order", () => {
  const reported: FileReported[] = [];

  // The regression this pins (#2135): the list used to sort the RENDERED `file:line` strings with
  // `localeCompare`, under which "…:10" sorts BEFORE "…:2" — so a class with sites at lines 2 and 10 in
  // one file named them backwards. Re-introduce that sort and this assertion is the one that dies.
  reportReviewedGrantFileCandidates(
    fileSinkOf(reported),
    [grant("packages/kit/src/sitesort.ts", 10, "biome-ignore"), grant("packages/kit/src/sitesort.ts", 2, "biome-ignore")],
    TEXT,
  );

  expect(reported).toHaveLength(1);
  expect(reported[0]?.details?.message).toContain("site(s): packages/kit/src/sitesort.ts:2 (biome-ignore), packages/kit/src/sitesort.ts:10 (biome-ignore).");
});

test("one licensed class spanning MANY files is ONE finding, anchored at the first site in path/line order", () => {
  const reported: FileReported[] = [];

  reportReviewedGrantFileCandidates(
    fileSinkOf(reported),
    [grant("packages/kit/src/zulu.ts", 4), grant("packages/kit/src/alpha.ts", 9), grant("packages/kit/src/alpha.ts", 1)],
    TEXT,
  );

  expect(reported, "grant granularity: one row licenses the class, so the class is one finding").toHaveLength(1);
  expect(reported[0]?.file, "the anchor is the first site in PATH order, then line").toBe("packages/kit/src/alpha.ts");
  expect(reported[0]?.details?.line).toBe(1);
  expect(reported[0]?.details?.message).toContain("site(s): packages/kit/src/alpha.ts:1, packages/kit/src/alpha.ts:9, packages/kit/src/zulu.ts:4.");
});

test("two subjects are two findings, in stable subject order", () => {
  const reported: FileReported[] = [];

  reportReviewedGrantFileCandidates(
    fileSinkOf(reported),
    [
      { ...grant("packages/kit/src/b.ts", 1), subject: "lint/suspicious/noExplicitAny" },
      { ...grant("packages/kit/src/a.ts", 1), subject: "lint/style/useConst" },
    ],
    TEXT,
  );

  expect(reported.map(({ details }) => details?.subject)).toEqual(["lint/style/useConst", "lint/suspicious/noExplicitAny"]);
});

test("an all-unreadable group says so, and a partly-readable one anchors on a PROVEN site", () => {
  const blind: FileReported[] = [];
  reportReviewedGrantFileCandidates(fileSinkOf(blind), [{ ...grant("packages/kit/src/x.ts", 3), unreadable: true }], TEXT);
  expect(blind[0]?.details?.message).toContain("unreadable");

  const mixed: FileReported[] = [];
  reportReviewedGrantFileCandidates(fileSinkOf(mixed), [{ ...grant("packages/kit/src/a.ts", 1), unreadable: true }, grant("packages/kit/src/b.ts", 7)], TEXT);
  expect(mixed[0]?.details?.message, "a group with one proven site asserts the law, not the refusal").toContain("the law");
  expect(mixed[0]?.file, "and anchors on the site it could actually read").toBe("packages/kit/src/b.ts");
});
