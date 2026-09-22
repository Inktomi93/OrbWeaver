// THE `@orb-waive` POSITION GRAMMAR'S ONLY PIN (refutation-ledger row 531, #2157).
//
// WHY IT EXISTS. `lib/waivable-coordinate.ts` landed at `a54de0421` carrying three exports — `POSITION`,
// `isWaivablePosition`, `waivableCoordinate` — and the fence that arms the third of them,
// `assertWaivablePosition`, landed at `6cc09bab2` inside `lib/policy-pass-context.ts`. A literal sweep of
// `tests/` for all four names returned ZERO (positive control: the same sweep for `createOrdinaryWaiverEngine`,
// exported from the sibling module the grammar moved OUT of, finds `tests/tooling/verify/lib/ordinary-waiver.test.ts:6`,
// so the sweep can see test-side imports of this neighbourhood and the zero is a real zero). Delete any of the
// four and every suite plus `check:policy-conformance` stayed green: five gate modules and both report doors
// depend on behaviour nothing asserted. `.claude/rules/verify-and-gates.md` (the fix contract for a gate or
// instrument caught lying) forbids exactly that for new central behaviour.
//
// WHY THE FENCE ARMS RIDE HERE AND NOT IN `policy-pass.test.ts`. `assertWaivablePosition` is not exported; it
// is `isWaivablePosition` standing at the two report doors. What the arms below pin is not the pass's contract
// (`policy-pass.test.ts` owns that) but THIS module's grammar being binding at mint time — the property the
// grammar exists for. Splitting them across two files would let the predicate and its enforcement drift with
// each half still green.
//
// WHY A PROOF ROW CANNOT EXPRESS THE FENCE. A policy that mints an unwaivable position never produces a
// finding at all: the throw aborts `evaluate`, the owner is marked incomplete and the run surfaces a TOOL
// ERROR, which the conformance runner's `toolFailure` reports ahead of every arm verdict
// (`ops/policy-conformance.ts`). A `mustRefuse` row written for that state fails as a harness error instead of
// proving the refusal.
import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isWaivablePosition, POSITION, waivableCoordinate } from "../../../../tooling/src/verify/lib/waivable-coordinate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const PROOF_PATH = "packages/client/src/proof.ts";

test("POSITION is the character class the module documents — the fragment and the predicate cannot drift apart", () => {
  const fragment = new RegExp(`^${POSITION}$`, "u");

  // Every excluded character, one at a time, inside an otherwise ordinary token.
  for (const excluded of ["(", ")", "\r", "\n"]) {
    expect([excluded, fragment.test(`a${excluded}b`)]).toEqual([excluded, false]);
  }
  expect(fragment.test("oklch")).toBe(true);
  // The fragment is a PLUS, not a STAR: an empty position is not a position.
  expect(fragment.test("")).toBe(false);
});

test("isWaivablePosition accepts what a marker can hold and rejects blanks as the parser does", () => {
  const verdicts = ["oklch", "#ff0000", "[&:where", "dark:bg-card", " leading-space", "", "   ", "a(b", "a)b", "a\rb", "a\nb"].map(
    (position) => [position, isWaivablePosition(position)] as const,
  );

  expect(verdicts).toEqual([
    ["oklch", true],
    ["#ff0000", true],
    ["[&:where", true],
    ["dark:bg-card", true],
    [" leading-space", true],
    ["", false],
    ["   ", false],
    ["a(b", false],
    ["a)b", false],
    ["a\rb", false],
    ["a\nb", false],
  ]);
});

test("a value the grammar can already hold comes back unchanged — the split costs the paren-free case nothing", () => {
  for (const value of ["#ff0000", "dark:bg-card", "var--brand", " leading-space"]) {
    expect([value, waivableCoordinate(value)]).toEqual([value, value]);
  }
});

test("a value the grammar cannot hold narrows to its leading paren-free slice", () => {
  expect(
    ["oklch(0.5 0.2 30)", "[&:where(.x:y)]:dark:bg-card", "translate(1px, 2px)", "supports-[selector(:has(*))]:dark:bg-card", "process.cwd()"].map((value) =>
      waivableCoordinate(value),
    ),
  ).toEqual(["oklch", "[&:where", "translate", "supports-[selector", "process.cwd"]);
});

test("the scan uses the excluded SET, so a leading SPACE keeps its head instead of refusing", () => {
  // The module header states this as the reason the scan does not re-derive through `isWaivablePosition` one
  // character at a time: that alternative rejects the one-character head " " as blank and returns `undefined`
  // for a value the pre-move code accepted. This is the arm that fails if someone "simplifies" the scan.
  expect(waivableCoordinate(" oklch(1)")).toBe(" oklch");
});

test("no anchorable head is a REFUSAL, including the declared zero-argument-arrow limit", () => {
  const refusals = ["(abc)", ")x", "\nfoo", "", "   ", "(async (a) => a) as never", "() => x"].map((value) => [value, waivableCoordinate(value)] as const);

  // `undefined` for every one — never a silent empty string, which a caller's `?? raw` would read as a head.
  expect(refusals).toEqual([
    ["(abc)", undefined],
    [")x", undefined],
    ["\nfoo", undefined],
    ["", undefined],
    ["   ", undefined],
    ["(async (a) => a) as never", undefined],
    ["() => x", undefined],
  ]);
});

/** A throwaway policy that mints ONE finding at the requested door with the requested token, so the fence is
 *  asked the same question from both doors with everything else held equal. */
function tokenMintingPolicy(door: "node" | "file", token: string): GatePolicy {
  return defineGate({
    id: `waivable-coordinate-fence-${door}`,
    family: `waivable-coordinate-fence-${door}`,
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "fence probe",
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => {
            if (door === "node") {
              ctx.report.node(node, { token, offset: 0 });
              return;
            }
            ctx.report.file(PROOF_PATH, { token, line: 1, column: 1 });
          },
        },
      ],
    }),
    mustFlag: [{ mode: "source", files: { [PROOF_PATH]: "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { [PROOF_PATH]: "export const clean = 1;\n" }, why: "nearest legal shape" }],
    // @orb-waive no-test-fabrication(GatePolicy): partial fixture — only the fields the coordinate resolver exercises; no factory exists
  } as GatePolicy);
}

function fencePass(token: string, door: "node" | "file"): PolicyPassResult {
  const project = new Project({ useInMemoryFileSystem: true });
  // `offset: 0` anchors at the declaration's own start, so the node door's SEPARATE anchor check can only be
  // reached once the fence has let the token through — which is what makes the waivable arm a real control.
  project.createSourceFile(`${ROOT}/${PROOF_PATH}`, "export const oklch = 1;\n");
  const policy = tokenMintingPolicy(door, token);
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

/** Both doors' verdicts read as ONE object, never asserted door-by-door in a loop: the node door carries a
 *  SECOND refusal downstream (the declared-offset anchor check), so a loop that stops at the first failing
 *  `expect` reports the node door and never asks the file door at all — and the file door is the half with no
 *  other guard behind it. Measured while planting the break for this file. */
function fenceVerdicts(token: string): readonly unknown[] {
  return (["node", "file"] as const).map((door) => {
    const result = fencePass(token, door);
    return {
      door,
      policyIds: result.toolErrors.map(({ policyId }) => policyId),
      namesTheGrammar: result.toolErrors.every(({ message }) => message.includes("cannot be named by an @orb-waive marker")),
      namesTheRepair: result.toolErrors.every(({ message }) => message.includes("waivableCoordinate")),
      findings: result.authority.effectiveFindings.map(({ token: reported }) => reported),
      withheld: result.authority.withheldPolicyIds,
    };
  });
}

test("both report doors refuse an unwaivable position loudly instead of minting an unanswerable finding", () => {
  // The refusal is not a quiet drop: nothing reaches the findings list, and the owner is not a verdict.
  expect(fenceVerdicts("(x)")).toEqual([
    {
      door: "node",
      policyIds: ["waivable-coordinate-fence-node"],
      namesTheGrammar: true,
      namesTheRepair: true,
      findings: [],
      withheld: ["waivable-coordinate-fence-node"],
    },
    {
      door: "file",
      policyIds: ["waivable-coordinate-fence-file"],
      namesTheGrammar: true,
      namesTheRepair: true,
      findings: [],
      withheld: ["waivable-coordinate-fence-file"],
    },
  ]);
});

test("the CONTROL: the same doors mint the finding when the position is one the grammar can hold", () => {
  for (const door of ["node", "file"] as const) {
    const minted = fencePass("oklch", door);

    expect([door, minted.toolErrors]).toEqual([door, []]);
    expect(minted.authority.effectiveFindings.map(({ token }) => token)).toEqual(["oklch"]);
  }
});
