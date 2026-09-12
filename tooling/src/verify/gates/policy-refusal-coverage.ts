// Policy: policy-refusal-coverage — a verdict resting on a DERIVED POPULATION must PIN its refusal (#2184;
// matrix 5P, §4.5/§4.5b; family `policy-soundness`, readers `lib/policy-descriptor-read.ts`).
//
// THE RULE. A final policy that declares `facts` or `resources` does not compute its own denominator: a fact
// provider or a ResourceHost door hands it one. When that supply FAILS — a fact that withholds, a resource that
// comes back missing, a population that admits zero paths — the policy reports nothing, and reporting nothing is
// indistinguishable from a clean tree. So such a policy owes a REFUSAL PROOF: either a `mustRefuse` row (§4.5b),
// or a family test that drives it through `runPolicyPass` and asserts the refusal a row cannot express (an owner
// status, an empty finding set, a phase).
//
// THE PAID DEFECTS, all three of them the same shape — a refusal nobody pinned:
//   • #1977 — the third proof arm was minted BECAUSE refusals lived only in module headers;
//   • #2109 item 2 — three refusal pins existed as hand-measured PROSE ("measured before/after") until a lane
//     turned them into rows;
//   • `warning-code-coverage`'s own before/after paragraph, which recorded a measurement nothing re-runs.
// A refusal nobody pins is a clean pass over an empty denominator — #944's whole class.
//
// ═══ SEVERITY: `ordinary` / `warning` NOW, `hard` / `error` AT A NAMED EVENT ═══
//
// The audit row that ordered this module (policing-surface-audit-2026-09-12.md:566) specifies the tier as
// *"`ordinary`/`warning` + a `workItem`, or `hard`/`error` once the burn-down is short"*, and the validator makes
// that the only legal reading: `lib/policy-validation.ts:419` REFUSES `hard` + `warning` AT LOAD (#2025) —
// *"unsuppressible and non-blocking at once means neither"* — so there is no soft `hard` landing. At mint this
// module reds ≤ 92 of 98 derived-population consumers; a `hard`/`error` landing would put 92 blocking findings on
// the commit bar in one commit, which is not a burn-down, it is a stop.
//
// THE FLIP CONDITION IS AN EVENT, NOT AN ASPIRATION: flip to `hard` + `error` (and drop `workItem`) in the commit
// that takes THIS POLICY'S OWN EFFECTIVE COUNT TO ZERO on a whole-corpus run. The count IS the burn-down, so the
// condition is readable off `reports/check-structure.json` — nobody has to remember it.
//
// AND THE DOOR THE WARNING TIER OPENS IS WATCHED. `ordinary` means a consumer can `@orb-waive` this finding
// instead of writing the pin. That waiver is reconciled centrally into the policy's `waived` count, and
// `pnpm check:structure-delta` (#2110) prints `waived` before → after per policy — so waiving instead of fixing
// MOVES A NUMBER the barrier already reads. The door is open during the drain; it is not unobserved.
//
// WHAT SATISFIES THE RULE, and why the test half is recognised the way it is. `mustRefuse` is read off the
// descriptor literal. The family-test half is a `runPolicyPass(<binding>, …)` call inside a `test(…)`, where
// `<binding>` resolves to an IMPORT OF THE POLICY MODULE ITSELF — the import is the binding between pin and
// subject, so a test that imports six policies and drives one covers only the one it drove. The dispatcher call
// is recognised by NAME rather than by import origin, deliberately and by this family's own precedent: proof
// fixtures `declare` the dispatcher rather than importing it (`policy-waiver-identity`'s family rows do exactly
// this), so an origin test would be unsatisfiable inside the very proofs that must falsify the rule.
//
// WHAT THIS IS NOT. A policy with `facts: []` and `resources: []` computes its own population from the corpus and
// is not asked — its denominator is the tree, and a zero there is a real zero. This module does not judge whether
// a refusal pin is CORRECT; `mustRefuse` rows are executed by the conformance stage and `runPolicyPass` pins by
// their suite. It asks only whether one EXISTS, which is the question nothing asked before.
//
// BLINDNESS: this module reads final descriptors through the shared reader, so if that recognizer dies every
// module reads "not final" and the corpus reports ✓ forever. It self-anchors on its OWN path and THROWS instead.
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { descriptorProperty, descriptorValue, finalDescriptorOf, policyIdOfPath } from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, ORDINARY_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-refusal-coverage.ts";
const GATES_DIR = "tooling/src/verify/gates/";
const TESTS_DIR = "tests/";
/** The production dispatcher's name — see the header for why the TEST side is keyed on the name. */
const DISPATCHER = "runPolicyPass";
const DERIVED_FIELDS = ["facts", "resources"] as const;
const MUST_REFUSE = "mustRefuse";

const MESSAGE =
  "a FINAL policy declares `facts` or `resources` — a verdict resting on a DERIVED population — and pins NO REFUSAL " +
  "(gate-runtime-standardization.md §4.5/§4.5b). When the supply fails (a fact withholds, a resource is missing, a population admits zero " +
  "paths) the policy reports nothing, and reporting nothing is indistinguishable from a clean tree: a refusal nobody pins is a clean pass " +
  "over an empty denominator (#944). Paid three times — #1977 (the third arm minted because refusals lived only in headers), #2109 item 2 " +
  "(three pins carried as hand-measured prose), and `warning-code-coverage`'s before/after paragraph.";
const FIX =
  "Add a `mustRefuse` row (§4.5b: never empty; each row's `expect` is `messageIncludes` ONLY) naming the refusal text this policy's failure " +
  "mode produces — a withheld fact, an unresolved resource, a population that admits zero paths. OR, where the refusal is something a row " +
  "cannot express (an owner STATUS, an empty finding set, the phase it refused in), drive the policy through `runPolicyPass` in a family " +
  "test under `tests/tooling/verify/gates/` that IMPORTS this module, and assert those. One or the other, never neither. " +
  // THE ESCAPE HATCH, SPELLED EXACTLY — and the POSITION is not a guess: it is the token this policy reports,
  // which is the name of the `facts` or `resources` property that created the obligation (see `judgeCorpus`).
  // A `fix` that promises a waiver without naming the position a marker must carry is a promise the operator
  // cannot act on, and it is the shape `policy-waiver-spelling` reds (§5b.3).
  "While the burn-down drains this policy is `ordinary`, so a deliberate deferral can be waived at the reported field: " +
  "`// @orb-waive policy-refusal-coverage(resources): <reason and its end condition>` — or `(facts)` when the obligation came " +
  "from the fact declaration. The position is ALWAYS the reported field name, never a path or a line number.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the descriptor reader ` +
  "(lib/policy-descriptor-read.ts finalDescriptorOf) is dead, so every module would read out of scope and this policy would report ✓ over " +
  "the whole corpus forever. Refusing the run.";

/** Does the descriptor declare a NON-EMPTY `facts` or `resources` array? An explicit `[]` is the corpus-computed
 *  shape and is not asked for a refusal pin; an ABSENT field is a validator error elsewhere, never this one. */
function isNonEmptyArray(value: MorphNode | undefined): boolean {
  return value !== undefined && Node.isArrayLiteralExpression(value) && value.getElements().length > 0;
}

function derivesPopulation(descriptor: ObjectLiteralExpression): boolean {
  return DERIVED_FIELDS.some((field) => isNonEmptyArray(descriptorValue(descriptor, field)));
}

/** A non-empty `mustRefuse` array on the descriptor literal. */
function hasRefusalRow(descriptor: ObjectLiteralExpression): boolean {
  return isNonEmptyArray(descriptorValue(descriptor, MUST_REFUSE));
}

/** Is `name` imported in `testFile` from a module under the gate corpus — and if so, which policy id? The import
 *  is the binding between a pin and its subject: a test that imports six policies and drives one covers one. */
function importedPolicyOf(testFile: SourceFile, name: string): string | undefined {
  let found: string | undefined;
  for (const declaration of testFile.getImportDeclarations()) {
    const target = declaration.getModuleSpecifierSourceFile();
    const named = declaration.getNamedImports().some((specifier) => (specifier.getAliasNode() ?? specifier.getNameNode()).getText() === name);
    if (target !== undefined && named) {
      const path = target.getFilePath().replaceAll("\\", "/");
      const index = path.indexOf(GATES_DIR);
      if (index !== -1 && path.endsWith(".ts")) {
        found = policyIdOfPath(path.slice(index));
        break;
      }
    }
  }
  return found;
}

/** Record ONE `runPolicyPass(<imported policy>, …)` call as a pin for the module its subject was imported from.
 *
 *  Reached from a VISITOR, never from a descendant walk: `policy-soundness` E3 bans `getDescendantsOfKind` in a
 *  gate module ("use visitors, ctx.files, or a shared reader [direct-walk]") — measured here as a real finding
 *  against this very module on the family's real-corpus arm before the collection moved. */
function recordPin(pinned: Set<string>, call: CallExpression, testFile: SourceFile): void {
  const callee = call.getExpression();
  if (!(Node.isIdentifier(callee) && callee.getText() === DISPATCHER)) {
    return;
  }
  const subject = call.getArguments()[0];
  if (subject === undefined || !Node.isIdentifier(subject)) {
    return;
  }
  const module = importedPolicyOf(testFile, subject.getText());
  if (module !== undefined) {
    pinned.add(module);
  }
}

function judgeCorpus(ctx: GatePolicyContext, pinned: ReadonlySet<string>): void {
  let scanned = 0;
  for (const sourceFile of ctx.files) {
    const path = ctx.relativePath(sourceFile);
    if (!path.startsWith(GATES_DIR)) {
      continue;
    }
    const descriptor = finalDescriptorOf(sourceFile);
    if (descriptor === undefined) {
      if (path === SELF) {
        throw new Error(BLIND);
      }
      continue;
    }
    scanned += 1;
    if (!derivesPopulation(descriptor)) {
      continue;
    }
    if (!(hasRefusalRow(descriptor) || pinned.has(policyIdOfPath(path)))) {
      // The position is the declaration that ACTUALLY created the obligation — the first `facts`/`resources`
      // that is NON-EMPTY, never merely the first one declared. Measured here: every policy carries `facts: []`
      // explicitly (the contract requires it), so "first declared" pointed at `facts` on a module whose
      // obligation came from `resources`, and sent the reader to a line with nothing wrong on it.
      const owed = DERIVED_FIELDS.filter((field) => isNonEmptyArray(descriptorValue(descriptor, field)))
        .map((field) => descriptorProperty(descriptor, field))
        .find((property) => property !== undefined);
      ctx.report.node(owed ?? descriptor, { token: owed?.getName() ?? MUST_REFUSE, offset: 0 });
    }
  }
  // THE RECEIPT COUNTS EVERY FINAL MODULE THE WALK READ, not the derived subset — measured here: a receipt whose
  // population is the SUBSET refuses at zero members, and "zero policies derive a population" is a legitimate
  // corpus state (it is what every `mustPass` fixture of this policy looks like). A receipt that cannot be
  // satisfied by a correct tree is the population-fence trap one level up: it proves the walk was BLIND, and
  // blindness is about what was scanned, not about what was found.
  ctx.receipt({ kind: "population", source: "final policy modules", members: scanned });
}

/** A family test at a real family-test path, importing the probe module and driving it through the dispatcher. */
const PIN_TEST_PATH = "tests/tooling/verify/gates/probe-family.test.ts";
/** `binding` is the local name the test imports from `module`; the body is what runs inside the one `test(…)`. */
const PIN_TEST = (body: string, module = "probe", binding = "probe"): string =>
  `import { gate as ${binding} } from "../../../../tooling/src/verify/gates/${module}.ts";\ndeclare function ${DISPATCHER}(policy: unknown, files: unknown): { authority: { toolErrors: unknown[] } };\ndeclare function test(name: string, body: () => void): void;\ndeclare function expect(value: unknown): { toHaveLength: (n: number) => void };\ntest("refusal", () => {\n${body}\n});\n`;
/** A registering FINAL sibling the "wrong module" row's pin binds to instead — planted so its relative import
 *  RESOLVES (a dangling one would be the family's fail-closed control, which is a different row entirely). */
const ELSEWHERE = {
  "tooling/src/verify/gates/elsewhere.ts": 'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "elsewhere" });\n',
};
const DRIVEN = `  const refused = ${DISPATCHER}(probe, { "packages/client/src/a.ts": "export const x = 1;\\n" });\n  expect(refused.authority.toolErrors).toHaveLength(1);`;
/** A probe that DERIVES its population (one declared resource) — the shape this policy asks about.
 *
 *  The trunk's `resources: []` is REPLACED, never appended to: `ORDINARY_TRUNK` already declares the empty array,
 *  and a second `resources` key in the same object literal leaves `descriptorValue` reading the FIRST one. That
 *  is exactly how the founding row reported zero findings on its first run — the fixture said `[]` to the reader
 *  and `[{…}]` to a human, which is the shape of every fixture that proves nothing. */
const EMPTY_RESOURCES = "resources: [],";
const DERIVED_RESOURCES = 'resources: [{ kind: "tracked", why: "the planted probe\'s derived population" }],';
/** The SAME derived declaration with the escape hatch on the line above it — the §4.2 positive identity arm's
 *  fixture. The position (`resources`) is the token `judgeCorpus` reports, so the marker names the coordinate
 *  the finding actually carries rather than one an author guessed; a marker naming anything else is the
 *  dead-position alarm the family test drives. */
const WAIVED_RESOURCES = `// @orb-waive policy-refusal-coverage(resources): the planted probe defers its refusal pin; ends when the probe carries a mustRefuse row.\n  ${DERIVED_RESOURCES}`;
const DERIVING = (extra: string, resources: string = DERIVED_RESOURCES): string =>
  finalProbeModule(
    `${ORDINARY_TRUNK.replace(EMPTY_RESOURCES, resources)}\n  fix: "f",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],${extra}`,
  );

export const gate = defineGate({
  id: "policy-refusal-coverage",
  family: "policy-soundness",
  authority: "ordinary",
  severity: "warning",
  workItem: 2184,
  // The gate corpus PLUS the family tests that may carry the pin — the join is the whole verdict, which is the
  // same reason `policy-waiver-identity` spans both roots.
  population: {
    in: ["@tooling", "@tests"],
    under: ["tooling/src/verify/gates/**", "tests/tooling/verify/gates/**"],
    notUnder: ["tooling/src/verify/gates/_proof/**"],
  },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const pinned = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (Node.isCallExpression(node) && ctx.relativePath(sourceFile).startsWith(TESTS_DIR)) {
              recordPin(pinned, node, sourceFile);
            }
          },
        },
      ],
      evaluate: (): void => judgeCorpus(ctx, pinned),
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: familyFixture(DERIVING("")),
      expect: { count: 1, token: "resources" },
      why: "THE FOUNDING SHAPE and the live class (≤92 modules at mint): a policy declaring a RESOURCE — a denominator it does not compute — with neither a `mustRefuse` row nor a family-test pin. The position is the `resources` declaration, because that line is what created the obligation",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), {
        ...ELSEWHERE,
        [PIN_TEST_PATH]: PIN_TEST(`  const other = ${DISPATCHER}(sibling, {});\n  void other;`, "elsewhere", "sibling"),
      }),
      expect: { count: 1, token: "resources" },
      why: "THE PIN MUST BIND TO THIS MODULE: a family test that drives the dispatcher but imports a DIFFERENT module covers nothing here. Without this row the test half would be satisfied by any `runPolicyPass` anywhere in the suite — coverage by coincidence",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST("  void probe;") }),
      expect: { count: 1, token: "resources" },
      why: "IMPORTING IS NOT PINNING: the family test imports this very module and never drives it through the dispatcher. The import alone is the shape a lane produces when it deletes a flaky pin but leaves the header claiming one",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: familyFixture(
        DERIVING(
          `\n  mustRefuse: [{ mode: "source", files: { "packages/client/src/c.ts": "z" }, expect: { messageIncludes: "resolved zero members" }, why: "the refusal" }],`,
        ),
      ),
      why: "THE ROW HALF: a `mustRefuse` row discharges the obligation, read off the descriptor literal. This policy asks only whether a pin EXISTS — the row's correctness is the conformance stage's job, run on every static bar",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST(DRIVEN) }),
      why: "THE TEST HALF: a family test that IMPORTS this module and drives it through `runPolicyPass` inside a `test(…)`. This is the arm a row cannot express — an owner status, an empty finding set, a phase — and #1977 exists because it used to live in a header instead",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING("", WAIVED_RESOURCES)),
      why: "THE §4.2 POSITIVE IDENTITY ARM, in-module: the correct `@orb-waive policy-refusal-coverage(resources)` marker at the REPORTED position suppresses the finding. It is what makes the `ordinary` tier's escape hatch REAL rather than a promise in `fix` prose — the shape `policy-waiver-identity` requires of every ordinary policy and `policy-waiver-spelling` requires of every `fix`. Its discrimination control (a marker naming a DEAD position must ALARM) lives in the family test through `runPolicyPass`, because §4.2 forbids a negative arm here: under `knownPolicies: [policy]` it would ride the unknown-policy short-circuit and prove nothing",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(`${ORDINARY_TRUNK}\n  fix: "f",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`),
      ),
      why: "THE POLICY THIS RULE DOES NOT ASK: `facts: []` and `resources: []` — a policy that computes its population from the corpus itself. Its denominator IS the tree, so a zero there is a real zero and no refusal proof is owed. Without this row the rule would read as 'every policy owes a mustRefuse', which is the rent the audit explicitly refused",
    },
  ],
});
