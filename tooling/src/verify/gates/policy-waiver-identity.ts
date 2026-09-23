// Policy: policy-waiver-identity — §4.2 of the soundness enforcer (#1971; family `policy-soundness`, reader
// `lib/policy-descriptor-read.ts`; work row #1952 — `hard`/`error` since #2025, 2026-09-12: the owner ruled `hard` +
// `warning` a contradiction, so the arms below BLOCK): every ORDINARY policy proves ONCE that its own report
// supplies the policy id and position the central waiver engine binds to — one POSITIVE arm, the correct
// `@orb-waive <id>(<position>): <reason>` at the reported position, yielding 0 effective findings and 1 waived.
// Without it every waiver in the tree against that policy is a silent no-op. Two shapes are valid
// (gate-runtime-standardization.md §6.2), and this policy accepts BOTH — the trap the brief named, because an
// arm that lives in a different file is invisible to any single-file read:
//
//   • an in-module `mustPass` row whose fixture text carries a MARKER-FORM line naming this policy
//     (`schema-branding.ts:137`); the fixture may be assembled by a helper (`byte-check-cast`'s
//     `schemaFixture({ waiver: "  // @orb-waive byte-check-cast(…)" })`) — every string inside the row is read;
//     and the fixture may be a RESOURCE carrier, whose marker is spelled in that carrier's own comment
//     syntax — `/* */` for CSS, an HTML comment for Markdown, `--` for SQL — so the marker-form recogniser
//     (`lib/policy-descriptor-read.ts#MARKER_LINE_RE`) reads the same opener set the engine's `commentBody`
//     accepts; a resource-only ordinary policy proves its door exactly this way (`ledger-symbol-liveness`);
//   • a family test under `tests/tooling/verify/gates/**` that IMPORTS the module (by resolved specifier,
//     never by path text) and drives a marker-form fixture inside a `test(…)` whose body reads
//     `waivedFindings` (`ordinary-visitors-family.suite.test.ts:187-196`). POLARITY is the point: the negative arm
//     right below it (`:198-205`) carries the same marker and asserts alarms, and "a marker naming your
//     policy inside another policy's negative arm is not your arm" (§4.2) — which is exactly how
//     `no-form-state-in-useeffect` had no arm while a grep counted one.
//
// MARKER-FORM, not mention: a line whose comment content BEGINS with the opener (guide §8's honest census
// predicate). A `fix` string, a header comment and a `messageIncludes` all MENTION the spelling and none is
// an arm — three of the four live findings at mint are exactly header prose.
//
// DECLARED LIMIT: a family test that asserts the positive arm through a helper whose body carries the
// `waivedFindings` read is not recognised (none exists; the corpus's four family-test arms are all direct).
// BLINDNESS: `members` receipts the final modules recognised, so a corpus that recognises none is withheld by
// the dispatcher's own zero-count refusal; and this module self-anchors like its siblings.
//
// Entire-population by necessity — the verdict joins a module to tests in another directory. Warning, not
// error: four ordinary policies carry no arm at mint (#1952 recorded the closure that missed them). Hard:
// the proof of a waiver door is not itself waivable.
//
// FAMILY `policy-soundness` — the shared reader is `lib/policy-descriptor-read.ts` (`mentionsWaiverOf` and
// `markerFormIdsOf` for the marker grammar, `enclosingTestCall` for the arm join). Reading the waiver
// grammar from the same module its sibling `policy-waiver-spelling` reads means the two cannot disagree
// about what a marker IS while disagreeing about where it must be named.
// POPULATION PORT: NONE — no legacy population exists to port, because this module was BORN FINAL at
// `fe8c9cc84`, the commit that created the family; `git show fe8c9cc84^:<this file>` refuses with "exists
// on disk, but not in fe8c9cc84^", and that refusal IS the receipt (the `scrubber-factory-home`
// precedent). The population is authored and is the family's WIDEST — it joins `@tooling` gate modules to
// `@tests` family tests, because the verdict is exactly that join.
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { descriptorProperty, descriptorValue, enclosingTestCall, finalDescriptorOf, policyIdOfPath } from "../lib/policy-descriptor-read.ts";
import { enclosingStringExpression, markerFormIdsOf, staticSegments, staticText } from "../lib/policy-static-text.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK, ORDINARY_TRUNK, PROBE_FAMILY_TEST_PATH, PROBE_IMPORT_FROM_TEST } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-waiver-identity.ts";
const GATES_DIR = "tooling/src/verify/gates/";
const TESTS_DIR = "tests/tooling/verify/gates/";
const ORDINARY = "ordinary";
const WAIVED_FINDINGS = "waivedFindings";
const STRING_KINDS = [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateExpression] as const;

const MESSAGE =
  "an ORDINARY policy has no positive §6.2 identity arm (gate-runtime-standardization.md): no `mustPass` fixture carrying a " +
  "marker-form `@orb-waive <id>(<position>): <reason>` line, and no family test under tests/tooling/verify/gates/ that imports the " +
  "module and drives such a fixture inside a `test(…)` asserting `waivedFindings`. Without the arm, nothing proves the report's " +
  "policy id and position are what the central engine binds a waiver to — every waiver against it may be a silent no-op.";
const FIX =
  "add a `mustPass` row whose fixture produces exactly ONE finding and carries `// @orb-waive <id>(<position>): <reason>` at the " +
  "reported position (schema-branding.ts:137), or a `runPolicyPass` pin in the family test asserting `waivedFindings` length 1 " +
  "(ordinary-visitors-family.suite.test.ts:187-196). Build it on a one-finding fixture; a wrong position alarms and fails the row.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the import-origin recognizer ` +
  "(lib/gate-contract-origin.ts isCanonicalDefineGate) is dead, so every module would read out of scope. Refusing the run.";

interface FamilyTestArm {
  readonly testFile: SourceFile;
  readonly policyId: string;
  readonly testCall: CallExpression;
}

interface ArmLedger {
  /** Policy ids whose OWN descriptor's `mustPass` carries a marker-form line naming them. */
  readonly inModule: Set<string>;
  readonly familyArms: FamilyTestArm[];
  /** `test(…)` calls whose body reads `waivedFindings` — the positive-arm signature. */
  readonly positiveTests: Set<CallExpression>;
  readonly descriptors: Map<SourceFile, ObjectLiteralExpression | undefined>;
  readonly seenTops: Set<MorphNode>;
}

function descriptorOf(ledger: ArmLedger, sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  if (!ledger.descriptors.has(sourceFile)) {
    ledger.descriptors.set(sourceFile, finalDescriptorOf(sourceFile));
  }
  return ledger.descriptors.get(sourceFile);
}

/** Is this node inside the descriptor's own `mustPass` property? An ancestor walk on a delivered node. */
function insideMustPass(node: MorphNode, descriptor: ObjectLiteralExpression): boolean {
  return (
    node.getFirstAncestor((ancestor) => Node.isPropertyAssignment(ancestor) && ancestor.getName() === "mustPass" && ancestor.getParent() === descriptor) !==
    undefined
  );
}

function recordMarkerLiteral(ledger: ArmLedger, literal: MorphNode, sourceFile: SourceFile, path: string): void {
  const top = enclosingStringExpression(literal);
  if (ledger.seenTops.has(top)) {
    return;
  }
  ledger.seenTops.add(top);
  const ids = staticSegments(top).segments.flatMap((segment) => markerFormIdsOf(segment));
  if (ids.length === 0) {
    return;
  }
  if (path.startsWith(GATES_DIR)) {
    const descriptor = descriptorOf(ledger, sourceFile);
    const own = policyIdOfPath(path);
    if (descriptor !== undefined && ids.includes(own) && insideMustPass(top, descriptor)) {
      ledger.inModule.add(own);
    }
  } else if (path.startsWith(TESTS_DIR)) {
    const testCall = enclosingTestCall(top);
    if (testCall !== undefined) {
      ledger.familyArms.push(...ids.map((policyId) => ({ testFile: sourceFile, policyId, testCall })));
    }
  }
}

function importsModule(testFile: SourceFile, module: SourceFile): boolean {
  const target = module.getFilePath();
  return testFile.getImportDeclarations().some((declaration) => declaration.getModuleSpecifierSourceFile()?.getFilePath() === target);
}

function hasPositiveArm(ledger: ArmLedger, module: SourceFile, policyId: string): boolean {
  return (
    ledger.inModule.has(policyId) ||
    ledger.familyArms.some((arm) => arm.policyId === policyId && ledger.positiveTests.has(arm.testCall) && importsModule(arm.testFile, module))
  );
}

function judgeCorpus(ctx: GatePolicyContext, ledger: ArmLedger): void {
  let finalModules = 0;
  for (const sourceFile of ctx.files) {
    const path = ctx.relativePath(sourceFile);
    if (!path.startsWith(GATES_DIR)) {
      continue;
    }
    const descriptor = descriptorOf(ledger, sourceFile);
    if (descriptor === undefined) {
      if (path === SELF) {
        throw new Error(BLIND);
      }
      continue;
    }
    finalModules += 1;
    const policyId = policyIdOfPath(path);
    if (staticText(descriptorValue(descriptor, "authority")) === ORDINARY && !hasPositiveArm(ledger, sourceFile, policyId)) {
      ctx.report.node(descriptorProperty(descriptor, "mustPass") ?? descriptor, { token: "mustPass", offset: 0 });
    }
  }
  ctx.receipt({ kind: "population", source: "final policy modules", members: finalModules });
}

/** A family test at the probe test path importing the probe module, with `body` inside its one `test(…)`. */
const familyTest = (body: string): string =>
  `import { gate as probe } from "${PROBE_IMPORT_FROM_TEST}";\ndeclare function runPolicyPass(policy: unknown, files: unknown): { authority: { waivedFindings: unknown[]; authorityAlarms: unknown[] } };\ntest("arm", () => {\n${body}\n});\n`;
const POSITIVE_BODY =
  '  const waived = runPolicyPass(probe, { "packages/client/src/a.ts": "// @orb-waive probe(x): the proof reason.\\nexport const x = 1;\\n" });\n  expect(waived.authority.waivedFindings).toHaveLength(1);';
const NEGATIVE_BODY =
  '  const mismatched = runPolicyPass(probe, { "packages/client/src/a.ts": "// @orb-waive probe(y): names a dead position.\\nexport const x = 1;\\n" });\n  expect(mismatched.authority.authorityAlarms).toHaveLength(1);';
const ORDINARY_NO_ARM = finalProbeModule(
  `${ORDINARY_TRUNK}\n  fix: "waive with @orb-waive probe(<position>): <reason>",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
);

export const gate = defineGate({
  id: "policy-waiver-identity",
  family: "policy-soundness",
  authority: "hard",
  severity: "error",
  // The gate corpus plus the family tests that may carry a policy's arm — the join is the whole verdict.
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
    const ledger: ArmLedger = { inModule: new Set(), familyArms: [], positiveTests: new Set(), descriptors: new Map(), seenTops: new Set() };
    return {
      visitors: [
        {
          kinds: [...STRING_KINDS],
          visit: (node, sourceFile): void => recordMarkerLiteral(ledger, node, sourceFile, ctx.relativePath(sourceFile)),
        },
        {
          kinds: [SyntaxKind.PropertyAccessExpression],
          visit: (node): void => {
            if (Node.isPropertyAccessExpression(node) && node.getName() === WAIVED_FINDINGS) {
              const testCall = enclosingTestCall(node);
              if (testCall !== undefined) {
                ledger.positiveTests.add(testCall);
              }
            }
          },
        },
      ],
      evaluate: (): void => judgeCorpus(ctx, ledger),
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: familyFixture(ORDINARY_NO_ARM),
      expect: { count: 1, token: "mustPass" },
      why: "THE FOUNDING SHAPE (three of the four live cases): an ordinary policy whose only spelling is a MENTION — here in `fix`, on the tree in header prose — and no arm anywhere. The anchor is `mustPass`, where the in-module arm belongs",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK.replace('mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],', 'mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "// @orb-waive probe(x): r\\nx" }, expect: { count: 1 }, why: "w" }],')}\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "mustPass" },
      why: "a marker-form line inside a `mustFlag` fixture is the WRONG arm — a row that must still flag cannot be the row proving the waiver suppresses",
    },
    {
      mode: "types",
      files: familyFixture(ORDINARY_NO_ARM, { [PROBE_FAMILY_TEST_PATH]: familyTest(NEGATIVE_BODY) }),
      expect: { count: 1, token: "mustPass" },
      why: "THE POLARITY TRAP (`no-form-state-in-useeffect`): the family test imports the module and carries the marker — inside a NEGATIVE arm asserting alarms. A grep counts it; the enclosing `test(…)` reads no `waivedFindings`, so this policy does not",
    },
    {
      mode: "types",
      files: familyFixture(ORDINARY_NO_ARM, {
        [PROBE_FAMILY_TEST_PATH]: `declare function runPolicyPass(policy: unknown, files: unknown): { authority: { waivedFindings: unknown[]; authorityAlarms: unknown[] } };\ntest("arm", () => {\n${POSITIVE_BODY}\n});\n`,
      }),
      expect: { count: 1, token: "mustPass" },
      why: "a positive-looking test that does NOT import the module proves nothing about it — the join is by resolved import, never by the marker's spelling of the id",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "// @orb-waive other-policy(x): r\\ny" }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "mustPass" },
      why: "a marker-form line naming ANOTHER policy inside this module's `mustPass` is that policy's mention, not this policy's arm — identity is the id in the marker",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "// @orb-waive probe(x): the proof reason.\\nexport const x = 1;\\n" }, why: "the positive arm" }],`,
        ),
      ),
      why: "the in-module shape (schema-branding.ts:137): a `mustPass` fixture carrying the marker-form line naming this policy",
    },
    {
      mode: "types",
      files: familyFixture(ORDINARY_NO_ARM, { [PROBE_FAMILY_TEST_PATH]: familyTest(POSITIVE_BODY) }),
      why: "the family-test shape (ordinary-visitors-family.suite.test.ts:187-196): the test imports the module by resolved specifier and its `test(…)` drives the marker fixture and reads `waivedFindings`",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": \`// @orb-waive \${ID}(x): r\\nexport const x = 1;\\n\` }, why: "w" }],`,
          'const ID = "probe";\n',
        ),
      ),
      why: "a marker assembled through a template over a const id is read whole — the id is resolved, not spelled",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": fixture({ waiver: "  // @orb-waive probe(x): r\\n" }) }, why: "w" }],`,
          'function fixture(parts: { waiver: string }): string {\n  return parts.waiver + "export const x = 1;\\n";\n}\n',
        ),
      ),
      why: "the `byte-check-cast` shape: the fixture is built by a helper and the marker is one of its ARGUMENTS — every string literal inside the row is read, so a helper-built fixture still counts",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  mustPass: [{ mode: "resource", files: { "docs/adr/0001-x.md": "<!-- @orb-waive probe(x): the proof reason. -->\\n- **D1** — x\\n" }, why: "the markdown carrier arm" }],`,
        ),
      ),
      why: "the RESOURCE-CARRIER in-module shape (`ledger-symbol-liveness`): a Markdown fixture's marker is an HTML comment, so the recogniser reads the same opener set the engine's `commentBody` accepts — `//`, `/*`, `{/*`, `<!--` and `--`. Without the HTML opener in `MARKER_LINE_RE` this row reds: the arm is real, the engine consumes it, and this policy could not see it",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
      ),
      why: "SCOPE: a HARD policy has no waiver door and owes no identity arm (§4.4)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
        { "tooling/src/verify/gates/legacy.ts": 'export const gate = { name: "legacy", docRow: "x", message: "m", mustFlag: [1], mustPass: [1] };\n' },
      ),
      why: "SCOPE: a legacy descriptor beside a final module is not judged — its markers are `@orb-gate-ignore`, and the receipt still counts the one final module",
    },
  ],
});
