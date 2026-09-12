// The standing floor for the four policies converted by the `p-callback-provenance` lane (#1584), plus the
// `detached-work-traced-health` arm the conversion SPLIT out of one of them. They are grouped by the fact
// that one lane converted them together and by nothing else: three declare a SINGLETON family and the
// fourth joins `policy-soundness`. The header says so plainly rather than inventing a shared theme, because
// §5b.4 of docs/design/gate-runtime-standardization.md is explicit that a theme is not a family.
//
//   diagnostic-legibility          family `policy-soundness`      — every gate-corpus diagnostic STRING
//                                  reader `lib/policy-descriptor-read.ts`  carries a resolvable pointer.
//   evaluate-no-scope-capture      family SINGLETON               — a serialized browser callback closing
//                                                                   over a module-scope binding (#660).
//   audit-client-tests             family SINGLETON               — five structural test anti-patterns.
//   detached-work-traced           family `detached-work-traced`  — fire-and-forget whose failure is
//   detached-work-traced-health    reader `lib/detached-work.ts`    invisible, plus its blindness tripwire.
//
// WHAT THIS FILE CARRIES, AND WHY IT IS NOT A SECOND CONFORMANCE RUNNER. Every declared `mustFlag`/
// `mustPass` row of all five already executes on the static bar (`structure:policy-conformance`). What a
// row structurally CANNOT express, and therefore lives here:
//   §4.2  the ordinary identity TRIPLE — `effectiveFindings []`, `waivedFindings 1`, `authorityAlarms []`.
//         A `mustPass` row is green both when the marker suppressed the finding and when the fixture never
//         produced one, and it asserts nothing about alarms.
//   §4.5  the REFUSAL pins. `toolFailure` runs before the arm verdict, so an arm whose correct outcome is a
//         refusal is neither `mustFlag` nor `mustPass` (§4.5b). Three of the four policies carry a
//         fail-closed third answer and it is only reachable here.
//   §4.8  the fixture-specifier resolution control: a proof row's relative import that resolves to NOTHING
//         makes every identity row pass by fail-closure while conformance stays green.
//
// §4.3 (reviewed grants) applies to none of the five: all declare `facts: []` and `resources: []`.
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as auditClientTests } from "../../../../tooling/src/verify/gates/audit-client-tests.ts";
import { gate as detachedWorkTraced } from "../../../../tooling/src/verify/gates/detached-work-traced.ts";
import { gate as detachedWorkTracedHealth } from "../../../../tooling/src/verify/gates/detached-work-traced-health.ts";
import { gate as diagnosticLegibility } from "../../../../tooling/src/verify/gates/diagnostic-legibility.ts";
import { gate as evaluateNoScopeCapture } from "../../../../tooling/src/verify/gates/evaluate-no-scope-capture.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/callback-provenance-family";

const FAMILY: readonly GatePolicy[] = [diagnosticLegibility, evaluateNoScopeCapture, auditClientTests, detachedWorkTraced, detachedWorkTracedHealth];

const TRACING = "packages/server/src/foundation/observability/tracing.ts";
const HEALTHY_TRACING =
  "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
  "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n";

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

test("the five converted policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE FIXTURE-SPECIFIER RESOLUTION CONTROL (§4.8). `evaluate-no-scope-capture`'s ARM-B row is a
// CROSS-MODULE import, so a dangling specifier there would make it pass by fail-closure — the resolver
// returns no symbol, the callback never resolves, and the row's single finding would have to come from
// somewhere else entirely.
// ---------------------------------------------------------------------------------------------------
function danglingSpecifiers(files: readonly SourceFile[]): readonly string[] {
  return files
    .flatMap((sourceFile) => sourceFile.getImportDeclarations())
    .filter((declaration) => declaration.getModuleSpecifierValue().startsWith(".") && declaration.getModuleSpecifierSourceFile() === undefined)
    .map((declaration) => `${declaration.getSourceFile().getFilePath()} -> ${declaration.getModuleSpecifierValue()}`);
}

test("every relative import in every proof of these five resolves inside the proof's own file map", () => {
  const shared = new Project({ useInMemoryFileSystem: true });
  const dangling: string[] = [];
  let sequence = 0;
  for (const policy of FAMILY) {
    for (const proof of [...policy.mustFlag, ...policy.mustPass]) {
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
  const declared = FAMILY.reduce((sum, policy) => sum + policy.mustFlag.length + policy.mustPass.length, 0);
  expect(sequence).toBe(declared);
  expect(sequence).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY (§4.2), one POSITIVE arm per ordinary policy: the correct
// `@orb-waive <id>(<position>)` at the position the policy reports suppresses its ONE finding, consumes
// exactly one waiver, and raises no authority alarm. `detached-work-traced-health` is `hard` and has no
// arm here by construction. Assertions are written out in each test rather than behind a shared helper —
// a helper hides them from the `useExpect` lint, and an arm that silently asserts nothing is exactly the
// defect class this file exists to close.
//
// EVERY ONE OF THESE FOUR POLICIES SHIPPED `authority: "ordinary"` WITH NO WORKING DOOR (§3, "ordinary is
// a claim about the door"). Three passed a SYNTHETIC token at `offset: 0` — `no-assertion`,
// `async-no-await`, `cancel_2` — which `report.node` now validates against the node text and would THROW
// on, and which `locateFinding` could never have bound because they are not authored text. The fourth
// reported a FILE finding with a `column: 0` anchor `locateFinding` refuses outright. So these four arms
// are not a formality: they are the first proof that any of these policies has a usable door at all.
// ---------------------------------------------------------------------------------------------------
const REASON = "the proof's stand-in reason; ends when this fixture stops flagging.";

test("diagnostic-legibility: a waiver naming the PROPERTY NAME binds to its own finding", () => {
  const waived = passOf(diagnosticLegibility, {
    "tooling/src/verify/gates/waived.ts": `// @orb-waive diagnostic-legibility(message): ${REASON}\nexport const gate = { message: "a bare diagnostic with no home" };\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("evaluate-no-scope-capture: a waiver naming the CAPTURED IDENTIFIER binds to its own finding", () => {
  const waived = passOf(evaluateNoScopeCapture, {
    "tooling/src/snap/ops/waived.ts":
      `const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n` +
      `  // @orb-waive evaluate-no-scope-capture(MARK): ${REASON}\n` +
      `  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }) => el.setAttribute(MARK, "1"));\n}\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("audit-client-tests: a waiver naming the TEST CALLEE binds to its own finding", () => {
  const waived = passOf(auditClientTests, {
    "tests/tooling/waived.test.ts": `// @orb-waive audit-client-tests(test): ${REASON}\ntest("does nothing", () => {\n  const x = 1;\n  void x;\n});\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("detached-work-traced: a waiver naming the guarded WORK CHAIN binds to its own finding", () => {
  const waived = passOf(detachedWorkTraced, {
    [TRACING]: HEALTHY_TRACING,
    "packages/server/src/infra/network/waived.ts": `export function tear(res: R): void {\n  // @orb-waive detached-work-traced(res.body.cancel): ${REASON}\n  void res.body.cancel().catch(() => undefined);\n}\n`,
  });

  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// AND THE ARMS DISCRIMINATE. For each ordinary policy, the SAME fixture with the marker's position
// replaced by a name the carrier does not declare must leave the finding EFFECTIVE and raise an alarm
// naming that policy. Without this, every arm above would be equally green against a policy that reported
// an unspellable position and a waiver engine that silently matched nothing — which is precisely what all
// four of these policies did before the conversion.
// ---------------------------------------------------------------------------------------------------
const DEAD = "names a position this carrier does not declare.";

test("a waiver naming a DEAD position suppresses nothing and alarms, for all four ordinary policies", () => {
  const arms: readonly (readonly [GatePolicy, Readonly<Record<string, string>>])[] = [
    [
      diagnosticLegibility,
      {
        "tooling/src/verify/gates/dead.ts": `// @orb-waive diagnostic-legibility(fix): ${DEAD}\nexport const gate = { message: "a bare diagnostic with no home" };\n`,
      },
    ],
    [
      evaluateNoScopeCapture,
      {
        "tooling/src/snap/ops/dead.ts":
          `const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n` +
          `  // @orb-waive evaluate-no-scope-capture(MARKX): ${DEAD}\n` +
          `  await loc.evaluate((el: { setAttribute: (n: string, v: string) => void }) => el.setAttribute(MARK, "1"));\n}\n`,
      },
    ],
    [
      auditClientTests,
      { "tests/tooling/dead.test.ts": `// @orb-waive audit-client-tests(describe): ${DEAD}\ntest("does nothing", () => {\n  const x = 1;\n  void x;\n});\n` },
    ],
    [
      detachedWorkTraced,
      {
        [TRACING]: HEALTHY_TRACING,
        "packages/server/src/infra/network/dead.ts": `export function tear(res: R): void {\n  // @orb-waive detached-work-traced(res.body.destroy): ${DEAD}\n  void res.body.cancel().catch(() => undefined);\n}\n`,
      },
    ],
  ];

  const unbound = arms
    .map(([policy, files]) => {
      const result = passOf(policy, files);
      const alarmed = result.authority.authorityAlarms.some((alarm) => alarm.policyId === policy.id);
      return result.authority.effectiveFindings.length === 1 && alarmed ? null : policy.id;
    })
    .filter((id) => id !== null);

  expect(unbound).toEqual([]);
  // The sweep covers every ORDINARY member, never a subset that silently shrank.
  expect(arms).toHaveLength(FAMILY.filter((policy) => policy.authority === "ordinary").length);
});

// ---------------------------------------------------------------------------------------------------
// §4.5 — THE REFUSALS. `toolFailure` runs BEFORE the arm verdict and fails on a non-success owner status,
// so an arm whose CORRECT outcome is a refusal is neither `mustFlag` nor `mustPass` (§4.5b). These are the
// only home for the three fail-closed third answers this lane's policies carry, and each one names the
// evidence it could not gather rather than rendering a clean verdict over it.
//
// The first two MOVED here from `tests/tooling/gate-conformance.repo.int.test.ts`, which drove them
// through the LEGACY dispatcher's `runPass`; that harness cannot run a `defineGate` policy at all. Same
// three claims, now asserted against `phase: "evaluate"` — the final contract has no `finalize` hook.
// ---------------------------------------------------------------------------------------------------
test("evaluate-no-scope-capture: an UNRESOLVED runtime identifier in a browser callback refuses the run", () => {
  const result = passOf(evaluateNoScopeCapture, {
    "tooling/src/snap/ops/unresolved.ts":
      "async function run(page: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> { await page.evaluate(() => missingRuntime()); }\n",
  });

  expect(result.toolErrors).toEqual([
    expect.objectContaining({ policyId: "evaluate-no-scope-capture", phase: "evaluate", message: expect.stringContaining("missingRuntime") }),
  ]);
});

test("evaluate-no-scope-capture: the built-in `undefined` resolves without weakening arbitrary-identifier fail-loud", () => {
  const builtIn = passOf(evaluateNoScopeCapture, {
    "tooling/src/snap/ops/builtin.ts":
      "async function run(page: { evaluate: (fn: unknown) => Promise<boolean> }): Promise<boolean> { return await page.evaluate(() => document.title !== undefined); }\n",
  });
  const unresolved = passOf(evaluateNoScopeCapture, {
    "tooling/src/snap/ops/sentinel.ts":
      "async function run(page: { evaluate: (fn: unknown) => Promise<boolean> }): Promise<boolean> { return await page.evaluate(() => document.title !== userSentinel); }\n",
  });

  expect(builtIn.toolErrors).toEqual([]);
  expect(builtIn.policies[0]?.findings).toEqual([]);
  expect(unresolved.toolErrors).toEqual([
    expect.objectContaining({ policyId: "evaluate-no-scope-capture", phase: "evaluate", message: expect.stringContaining("userSentinel") }),
  ]);
});

test("evaluate-no-scope-capture: a self-contained browser callback is a clean, RESOLVED control", () => {
  const result = passOf(evaluateNoScopeCapture, {
    "tooling/src/snap/ops/clean.ts":
      "async function run(page: { evaluate: (fn: unknown) => Promise<number> }): Promise<number> { return await page.evaluate(() => document.title.length); }\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.findings).toEqual([]);
});

test("detached-work-traced-health: an ABSENT derivation source refuses rather than reporting blindness", () => {
  const result = passOf(detachedWorkTracedHealth, { "packages/server/src/domain/chat/verbs/turn.ts": "export const fire = 1;\n" });

  expect(result.toolErrors).toEqual([
    expect.objectContaining({
      policyId: "detached-work-traced-health",
      phase: "evaluate",
      message: expect.stringContaining("is not in the effective population"),
    }),
  ]);
  // AND IT IS A REFUSAL, NOT A FINDING: a tripwire that reported "zero openers" here would be accusing the
  // tree of a blindness it merely could not measure — the exact false-positive twin of a silent clean.
  expect(result.policies[0]?.findings).toEqual([]);
});

// THE MEASUREMENT THAT RETIRED AN ARM, kept as a pin so the next reader inherits the fact rather than the
// assumption. `audit-client-tests` shipped a draft out-of-population REFUSAL for a helper whose body lives
// outside the policy's population. Running it showed the branch UNREACHABLE: an imported identifier's
// symbol declares an `ImportSpecifier`, which has no body, so `resolveCalleeBody` never leaves the calling
// file — in the final policy AND in the legacy gate, neither of which calls `getAliasedSymbol`. The arm was
// deleted; what is actually true is pinned here and as the policy's own `mustPass[9]`.
test("audit-client-tests: an IMPORTED assertion helper is not followed — the declared limit, measured", () => {
  const result = passOf(auditClientTests, {
    "tests/support/outside.ts": "export function expectOk(x: number): void {\n  expect(x).toBeGreaterThan(0);\n}\n",
    "tests/tooling/helper-outside.test.ts": 'import { expectOk } from "../support/outside.ts";\ntest("asserts elsewhere", () => {\n  expectOk(1);\n});\n',
  });

  // No refusal, and no silence either: the policy renders its ordinary verdict, which is that this test
  // carries no assertion it can see. A future widening (the alias hop) turns this green and owes a
  // successor proof.
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.findings).toHaveLength(1);
  expect(result.policies[0]?.findings[0]?.token).toBe("test");
});
