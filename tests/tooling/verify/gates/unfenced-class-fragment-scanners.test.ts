// The standing family floor for the two UNFENCED CLASS-FRAGMENT SCANNERS — `no-color-literals` and
// `no-raw-container-widths`. Both subscribe to every StringLiteral / NoSubstitutionTemplateLiteral in
// @client+@ui, split it on whitespace, and report ONE finding per offending class FRAGMENT with the fragment
// itself as the position token. Neither applies a `className`/`cn()` carrier fence (decided 2026-09-11,
// #1954), and each module's header cites the other for that call.
//
// They are two SINGLETON `family:` values sharing one test file, which §4.9 of
// docs/design/gate-runtime-standardization.md permits ("one family test may cover several siblings"). Before
// this file neither policy had a family test at ALL, so neither had a home for the §4.2 identity arm, and
// both are ORDINARY — a policy whose whole design rests on a per-fragment waiver door with nothing proving
// that door binds (#1994).
//
// WHAT THIS FILE CARRIES, AND WHY IT IS NOT A SECOND CONFORMANCE RUNNER: both policies' declared
// `mustFlag`/`mustPass` rows already execute on the static bar (`structure:policy-conformance`). What a row
// cannot express, and therefore what lives here, is:
//   §4.2  the positive identity arm driven through `runPolicyPass`, asserting all THREE of
//         `effectiveFindings []`, `waivedFindings 1` and `authorityAlarms []` — a `mustPass` row separately
//         asserts none of the last two (gold standard: ordinary-visitors-family.test.ts:187-196).
//   §4.8  the fixture-specifier resolution control, which is part of every family floor.
//   #1991 the MESSAGE-DISJOINTNESS transplant for `no-color-literals`: it flags three disjoint patterns and
//         emits a distinct per-finding message for each, and `expectationFailure` matches `messageIncludes`
//         against `finding.message ?? policyMessage`. A needle that appeared in two arms would silently stop
//         discriminating in BOTH directions, leaving every arm's row green on the wrong arm's behaviour.
// §4.3 (reviewed grants) and §4.5 (refusal/receipt) do not apply: both policies declare `facts: []` and
// `resources: []`, resolve no home and derive no population, so there is no receipt to forge and nothing to
// refuse about.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noColorLiterals } from "../../../../tooling/src/verify/gates/no-color-literals.ts";
import { gate as noRawContainerWidths } from "../../../../tooling/src/verify/gates/no-raw-container-widths.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/unfenced-class-fragment-scanners";

const FAMILY: readonly GatePolicy[] = [noColorLiterals, noRawContainerWidths];

/** The three discriminating needles `no-color-literals`' proof rows use — the opening clause of each arm's
 *  own per-finding message. Held here as well as in the module so the transplant below is a CROSS-CHECK
 *  rather than a restatement: if an arm's message is reworded, the module's rows and these pins fail
 *  together and the disjointness claim is re-proved, never quietly dropped. */
const HEX_NEEDLE = "arbitrary hex color class";
const NON_TOKEN_NEEDLE = "named non-token color class";
const PALETTE_NEEDLE = "Tailwind PALETTE-scale color class";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

/** The message an author actually reads for a single-finding fixture: the per-finding message when the
 *  report supplied one, the policy header otherwise — exactly the resolution `expectationFailure` and
 *  `lib/structure-report.ts` both perform. */
function soleMessage(policy: GatePolicy, files: Readonly<Record<string, string>>): string {
  const result = passOf(policy, files);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
  return result.authority.effectiveFindings[0]?.message ?? policy.message;
}

test("both unfenced class-fragment policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (§4.8). A proof row's relative import that resolves to NOTHING
// makes every identity row pass by FAIL-CLOSURE while conformance still reports green. Neither policy
// resolves imports today, so this is a ratchet against a future row that does.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test("every relative import in every proof of this family resolves inside the proof's own file map", () => {
  const shared = new Project({ useInMemoryFileSystem: true });
  const dangling: string[] = [];
  let sequence = 0;
  for (const policy of FAMILY) {
    for (const { proof } of policyProofRows(policy)) {
      sequence += 1;
      const root = `${ROOT}-proof-${sequence}`;
      const files = Object.entries(proof.files).map(([path, source]) => shared.createSourceFile(`${root}/${path}`, source));
      dangling.push(...danglingSpecifiers(files).map((row) => `${policy.id}: ${row}`));
      for (const file of files) {
        shared.removeSourceFile(file);
      }
    }
  }
  expect(dangling).toEqual([]);
  // AND THE SWEEP ACTUALLY RAN: "zero dangling" and "no row was visited" look identical, so the expected
  // count is DERIVED from the descriptors rather than hand-carried.
  const declared = FAMILY.reduce((sum, policy) => sum + policyProofRows(policy).length, 0);
  expect(sequence).toBe(declared);
  expect(sequence).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY (§4.2). Both policies report the offending class FRAGMENT as the position — not
// the enclosing quoted literal, and not the JSX attribute — so that is what a marker must name. Each arm is
// built on a fixture producing EXACTLY ONE finding, because one marker consumes one occurrence.
// ---------------------------------------------------------------------------------------------------
test("an ordinary waiver naming the offending COLOR fragment binds to no-color-literals' own finding", () => {
  const waived = passOf(noColorLiterals, {
    "packages/ui/src/x.tsx":
      "// @orb-waive no-color-literals(bg-black): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      'export const G = <div className="bg-black" />;\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("an ordinary waiver naming the offending WIDTH fragment binds to no-raw-container-widths' own finding", () => {
  const waived = passOf(noRawContainerWidths, {
    "packages/client/src/features/x/x.tsx":
      "// @orb-waive no-raw-container-widths(max-w-96): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
      'export const G = <div className="max-w-96" />;\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("naming the enclosing LITERAL instead of the fragment suppresses nothing and reports a dead position", () => {
  // The discrimination control for both arms above, written once: the position these policies report is the
  // FRAGMENT. A marker naming the whole quoted literal — the spelling `no-raw-spacing-in-features` requires,
  // and therefore the one an author moving between these gates would reach for — binds to nothing.
  const mismatched = passOf(noColorLiterals, {
    "packages/ui/src/x.tsx":
      '// @orb-waive no-color-literals("bg-black"): names the literal, not the fragment this policy positions at.\n' +
      'export const G = <div className="bg-black" />;\n',
  });

  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "ordinary-waiver", policyId: "no-color-literals" }]);
});

// ---------------------------------------------------------------------------------------------------
// MESSAGE DISJOINTNESS — THE TRANSPLANT (#1991). `no-color-literals` flags three disjoint patterns and its
// four `mustFlag` rows discriminate them with `messageIncludes`. That only works while no needle appears in
// a sibling arm's message: `messageIncludes` is a SUBSTRING test, so an arm rebuilt as `${OTHER} …`, or a
// needle broadened into shared boilerplate, would make every row pass on every arm's behaviour at once.
// Each row below transplants the two SIBLING needles onto one arm's fixture and requires them NOT to match.
// ---------------------------------------------------------------------------------------------------
const HEX_FIXTURE = { "packages/client/src/x.tsx": 'export const G = <div className="text-[#abc]" />;\n' };
const NON_TOKEN_FIXTURE = { "packages/ui/src/x.tsx": 'export const G = <div className="bg-black" />;\n' };
const PALETTE_FIXTURE = { "packages/client/src/palette.tsx": 'export const G = <div className="text-red-500" />;\n' };

test("the HEX arm's message carries its own needle and NEITHER sibling's", () => {
  const message = soleMessage(noColorLiterals, HEX_FIXTURE);
  expect(message).toContain(HEX_NEEDLE);
  expect(message).not.toContain(NON_TOKEN_NEEDLE);
  expect(message).not.toContain(PALETTE_NEEDLE);
});

test("the NON-TOKEN arm's message carries its own needle and NEITHER sibling's", () => {
  const message = soleMessage(noColorLiterals, NON_TOKEN_FIXTURE);
  expect(message).toContain(NON_TOKEN_NEEDLE);
  expect(message).not.toContain(HEX_NEEDLE);
  expect(message).not.toContain(PALETTE_NEEDLE);
});

test("the PALETTE arm's message carries its own needle and NEITHER sibling's", () => {
  const message = soleMessage(noColorLiterals, PALETTE_FIXTURE);
  expect(message).toContain(PALETTE_NEEDLE);
  expect(message).not.toContain(HEX_NEEDLE);
  expect(message).not.toContain(NON_TOKEN_NEEDLE);
});

test("the declared policy header is an UMBRELLA, not one arm's remedy — the #1991 defect, pinned", () => {
  // `lib/render.ts` prints `policy.message` as the group header above a run's occurrence lines, and the
  // occurrence lines carry no message of their own. So a palette-only run's author reads THIS string and
  // nothing else. It used to be MESSAGE_HEX verbatim, which handed that author the hex remedy. §5b.2 makes
  // "the message is TRUE of what the code flags" unconditional; an umbrella that quoted any arm's opening
  // clause would also re-collide with that arm's `messageIncludes` needle.
  expect(noColorLiterals.message).not.toContain(HEX_NEEDLE);
  expect(noColorLiterals.message).not.toContain(NON_TOKEN_NEEDLE);
  expect(noColorLiterals.message).not.toContain(PALETTE_NEEDLE);
  // …and it is an umbrella rather than a fourth unrelated sentence: it names a representative of all three
  // banned shapes, so the header alone is actionable whichever arm fired.
  expect(noColorLiterals.message).toContain("bg-black");
  expect(noColorLiterals.message).toContain("text-red-500");
  expect(noColorLiterals.message).toContain("#0a0a0a");
});
