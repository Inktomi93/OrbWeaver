// The refusal envelope's own pins (#2111): the envelope is DERIVED from the same contract constants the runner and
// the dispatcher compose their refusals from, and these pins hold that two-sided — every member is text a real
// refusal carries (driven through `verifyPolicyProofs`), and the containment predicate refuses a generic needle
// while admitting an authored one. The per-member VALIDATOR arm lives in `policy-loader.test.ts`.
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind, Node as TsNode } from "ts-morph";
import { defineFact } from "../../../../tooling/src/verify/contract/fact.ts";
import { GATE_AUTHORITY_ALARM_KINDS, GATE_AUTHORITY_TOOL_ERROR_KINDS } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { POLICY_REFUSAL_PREFIXES } from "../../../../tooling/src/verify/contract/policy-conformance.ts";
import { GATE_FACT_PHASES, POLICY_PASS_REFUSALS, POLICY_PHASES } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { genericRefusalTextContaining, refusalEnvelope } from "../../../../tooling/src/verify/lib/policy-refusal-envelope.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function sourcePolicy(id: string, overrides: Partial<GatePolicy> = {}): GatePolicy {
  return defineGate({
    id,
    family: id,
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: `${id} message`,
    create: (ctx) => ({
      visitFile: (sourceFile) => {
        if (sourceFile.getFullText().includes("planted")) {
          ctx.report.file(ctx.relativePath(sourceFile));
        }
      },
    }),
    mustFlag: [{ mode: "source", files: { "packages/client/src/proof.ts": "export const planted = true;\n" }, why: "the founding defect" }],
    mustPass: [{ mode: "source", files: { "packages/client/src/proof.ts": "export const clean = true;\n" }, why: "the nearest legal shape" }],
    ...overrides,
  } as GatePolicy);
}

test("the envelope carries every prefix, every phase and kind token, every dispatcher sentence, and nothing twice", () => {
  const envelope = refusalEnvelope();
  expect(new Set(envelope).size).toBe(envelope.length);
  for (const prefix of Object.values(POLICY_REFUSAL_PREFIXES)) {
    expect(envelope).toContain(prefix);
  }
  for (const sentence of Object.values(POLICY_PASS_REFUSALS)) {
    expect(envelope).toContain(sentence);
  }
  for (const phase of new Set([...POLICY_PHASES, ...GATE_FACT_PHASES])) {
    expect(envelope).toContain(`[${phase}]`);
    expect(envelope).toContain(`${POLICY_REFUSAL_PREFIXES.passToolError} [${phase}] `);
  }
  for (const kind of [...GATE_AUTHORITY_TOOL_ERROR_KINDS, ...GATE_AUTHORITY_ALARM_KINDS]) {
    expect(envelope).toContain(`[${kind}]`);
  }
  for (const spelling of ["OWNER not-applicable/complete", "OWNER failure/incomplete", "OWNER incomplete/incomplete"]) {
    expect(envelope).toContain(spelling);
  }
  expect(envelope).toContain(`${POLICY_PASS_REFUSALS.policyReceiptRefused}: population "`);
  expect(envelope).toContain(" is malformed: ");
});

test("containment, not equality: a needle inside any member is generic; authored text beside the generic words is not", () => {
  expect(genericRefusalTextContaining("ERROR")).toBe(POLICY_REFUSAL_PREFIXES.factToolError);
  expect(genericRefusalTextContaining("resolved zero members")).toBeDefined();
  expect(genericRefusalTextContaining("incomplete/incomplete: receipt:")).toBeDefined();
  expect(genericRefusalTextContaining("refused: population")).toBeDefined();
  expect(genericRefusalTextContaining("BLINDNESS")).toBeUndefined();
  expect(genericRefusalTextContaining('population "final policy modules" resolved zero members')).toBeUndefined();
  expect(genericRefusalTextContaining("OWNER incomplete/incomplete: evaluate: BLINDNESS")).toBeUndefined();
  // Case-sensitive, exactly as the runner's `includes` is: a lowercase spelling is not the wrapper's word.
  expect(genericRefusalTextContaining("pass tool error")).toBeUndefined();
});

test("every producible prefix is the text a REAL refusal starts with, driven through the conformance runner", () => {
  // The runner composes from the same constants, so this is the two-sided pin that the envelope's members are
  // emitted text and not a second spelling: each produced refusal's opening words are an envelope member.
  const thrown = sourcePolicy("hook-throw", {
    create: () => ({
      evaluate: () => {
        throw new Error("provider exploded");
      },
    }),
  });
  const badReceipt = sourcePolicy("bad-receipt", {
    create: (ctx) => ({ evaluate: () => ctx.receipt({ kind: "population", source: "subjects", members: 0 }) }),
  });
  const reviewed = sourcePolicy("bad-reviewed-finding", {
    authority: "reviewed-grant",
    create: (ctx) => ({ evaluate: () => ctx.report.file("packages/client/src/proof.ts") }),
  });
  const mismatch = sourcePolicy("population-mismatch", { population: "@server" });
  const details = new Map(
    verifyPolicyProofs([thrown, badReceipt, reviewed, mismatch]).map((failure) => [`${failure.policyId}:${failure.arm}`, failure.detail]),
  );
  const produced = [
    details.get("hook-throw:mustFlag"),
    details.get("bad-receipt:mustFlag"),
    details.get("bad-reviewed-finding:mustFlag"),
    details.get("population-mismatch:mustFlag"),
  ];
  expect(produced.every((detail) => detail !== undefined)).toBe(true);
  expect(produced[0]).toMatch(/^PASS TOOL ERROR \[evaluate\] provider exploded$/u);
  expect(produced[1]).toMatch(/^PASS TOOL ERROR \[receipt\] policy receipt refused: population "subjects" resolved zero members$/u);
  expect(produced[2]).toMatch(/^AUTHORITY TOOL ERROR \[invalid-reviewed-grant-identity\] /u);
  expect(produced[3]).toMatch(/^PASS TOOL ERROR \[population\] Invalid population resolution: expression admitted zero paths from 1 candidate\(s\)$/u);
  for (const detail of produced) {
    const generic = refusalEnvelope().filter((member) => detail !== undefined && detail.startsWith(member));
    expect(generic.length).toBeGreaterThan(0);
  }
  // And the authored slot is what survives containment: the receipt SOURCE names the policy's own text.
  expect(genericRefusalTextContaining('population "subjects" resolved zero members')).toBeUndefined();
});

test("the context-door sentences the envelope carries are the text the LIVE context emits (every reachable door)", () => {
  // WHAT CHANGED AT #2155: `lib/policy-pass-context.ts` no longer spells these by literal — all eleven of its
  // refusal sites now COMPOSE from `POLICY_PASS_REFUSALS`, so the contract header naming it as an emitter is
  // true and the envelope is DERIVED rather than mirrored. The pin stays, and it is now the stronger claim:
  // each door is driven to its refusal through the production dispatcher and the produced text must contain
  // the contract's sentence, so a composition pointed at the WRONG key reds here even though it still compiles.
  //
  // SEVEN DOORS, which is every one reachable through `runPolicyPass`. It was FIVE until #2155, and the three
  // it missed were `sourceOutsidePopulation`, `factFailed` and `factAbsent`.
  // `factAbsent` (`policy-pass-context.ts` `declared fact is absent from this pass`) is a DECLARED LIMIT rather
  // than a missing door: `resolveFactRuns` (`lib/policy-pass.ts:451`) sets a `pending` value for EVERY fact of
  // every selected policy before any context is built, so a declared provider missing from the registry is an
  // internal invariant no caller can produce. It is pinned by the census test below as a composed site instead.
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/packages/client/src/a.ts", "export const a = 1;\n");
  // OUTSIDE every policy's `@client` population and inside the wider fact's — the subject of the widening door.
  project.createSourceFile("/repo/packages/server/src/b.ts", "export const b = 1;\n");
  const fact = defineFact({
    id: "envelope-fact",
    population: "@client",
    analysis: "syntax",
    resources: [],
    create: (ctx) => ({
      finish: () => {
        ctx.receipt({ kind: "population", source: "envelope-fact", members: 1 });
        return 1;
      },
    }),
  });
  // A provider whose population is WIDER than its consumer's, handing back one of its own files: the only
  // route by which a policy holds a SourceFile outside its own effective population.
  const widerFact = defineFact({
    id: "wider-fact",
    population: "@authored",
    analysis: "syntax",
    resources: [],
    create: (ctx) => ({
      finish: () => {
        ctx.receipt({ kind: "population", source: "wider-fact", members: ctx.files.length });
        return ctx.files.find((candidate) => ctx.relativePath(candidate).startsWith("packages/server/"));
      },
    }),
  });
  const failingFact = defineFact({
    id: "failing-fact",
    population: "@client",
    analysis: "syntax",
    resources: [],
    create: () => ({
      finish: (): number => {
        throw new Error("the provider exploded");
      },
    }),
  });
  const doors: readonly { readonly key: keyof typeof POLICY_PASS_REFUSALS; readonly policy: GatePolicy }[] = [
    {
      key: "factNotFinished",
      policy: sourcePolicy("door-fact-early", {
        execution: "entire-population",
        facts: [fact],
        create: (ctx) => ({
          visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: () => void ctx.fact(fact) }],
          evaluate: () => ctx.receipt({ kind: "population", source: "door", members: 1 }),
        }),
      }),
    },
    { key: "factUndeclared", policy: sourcePolicy("door-fact-undeclared", { create: (ctx) => ({ evaluate: () => void ctx.fact(fact) }) }) },
    {
      key: "sourcePathOutsidePopulation",
      policy: sourcePolicy("door-source-path", { create: (ctx) => ({ evaluate: () => void ctx.sourceFile("packages/client/src/none.ts") }) }),
    },
    {
      key: "findingOutsidePopulation",
      policy: sourcePolicy("door-finding", { create: (ctx) => ({ evaluate: () => ctx.report.file("packages/client/src/none.ts") }) }),
    },
    { key: "syntaxOwnerChecker", policy: sourcePolicy("door-checker", { create: (ctx) => ({ evaluate: () => void ctx.checker() }) }) },
    {
      // THE WIDER-FACT DOOR (#1976): a shared provider's population is the UNION of its consumers', so a policy
      // can hold a SourceFile its OWN population never admitted. `ctx.relativePath` on it refuses — with the
      // widening diagnosis appended, which is why the assertion is CONTAINMENT and not equality.
      key: "sourceOutsidePopulation",
      policy: sourcePolicy("door-wider-fact", {
        execution: "entire-population",
        facts: [widerFact],
        create: (ctx) => ({
          evaluate: () => {
            const foreign = ctx.fact(widerFact);
            if (foreign !== undefined) {
              ctx.relativePath(foreign);
            }
            ctx.receipt({ kind: "population", source: "door-wider-fact", members: 1 });
          },
        }),
      }),
    },
    {
      key: "factFailed",
      policy: sourcePolicy("door-fact-failed", {
        execution: "entire-population",
        facts: [failingFact],
        create: (ctx) => ({
          evaluate: () => {
            void ctx.fact(failingFact);
            ctx.receipt({ kind: "population", source: "door-fact-failed", members: 1 });
          },
        }),
      }),
    },
  ];
  for (const { key, policy } of doors) {
    const result = runPolicyPass({ knownPolicies: [policy], policies: [policy], root: "/repo", project, reviewedGrants: [], failOnWarnings: false });
    const produced = result.toolErrors.map(({ message }) => message).join("; ");
    expect(produced, key).toContain(POLICY_PASS_REFUSALS[key]);
    expect(refusalEnvelope(), key).toContain(POLICY_PASS_REFUSALS[key]);
  }
});

// ═══ THE ENVELOPE IS COMPLETE OVER THE DISPATCHER, NOT ONLY OVER THE CONSTANTS (#2155, forge recommendation
// #4) ═══
//
// The envelope derives from `POLICY_PASS_REFUSALS`, so it is complete over the TABLE by construction. That
// says nothing about the two modules that actually throw: a sentence spelled by literal beside the table is
// invisible to the envelope, and a `mustRefuse` row naming it would be admitted as "authored" while holding on
// every refusal of that shape. Eleven such literals sat in `policy-pass-context.ts` while the contract header
// already claimed it composed from the table (#2155 item 2). This census closes the loop the other way: EVERY
// `throw new Error(...)` in the dispatcher pair is either COMPOSED from the table — and therefore in the
// envelope — or one of the invariant refusals declared below, and the declaration is held two-sided so a
// deleted throw reds as loudly as a new one.
const DISPATCHER_MODULES = ["tooling/src/verify/lib/policy-pass.ts", "tooling/src/verify/lib/policy-pass-context.ts"] as const;
/** The literal parts of a throw argument, `…` where an interpolation was. A template's authored slots are the
 *  policy's own text and are never part of the generic sentence. */
function staticText(argument: Node): string | undefined {
  // ONE TAIL RETURN, the pass.ts idiom: biome's `noUselessUndefined` deletes a trailing `return undefined;`
  // as a safe fix and tsc's `noImplicitReturns` then reds the fall-through (`.claude/rules/gates-and-tooling.md`).
  let text: string | undefined;
  if (TsNode.isStringLiteral(argument) || TsNode.isNoSubstitutionTemplateLiteral(argument)) {
    text = argument.getLiteralText();
  } else if (TsNode.isTemplateExpression(argument)) {
    text = [argument.getHead().getLiteralText(), ...argument.getTemplateSpans().map((span) => span.getLiteral().getLiteralText())].join("…");
  } else if (TsNode.isBinaryExpression(argument)) {
    const left = staticText(argument.getLeft());
    const right = staticText(argument.getRight());
    text = left === undefined || right === undefined ? undefined : `${left}${right}`;
  }
  return text;
}

/** The static text of every `new Error(...)` in `sourceFile` whose argument does NOT read the refusal table. */
function unaccountedThrows(sourceFile: SourceFile): readonly string[] {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((expression) => expression.getExpression().getText() === "Error")
    .flatMap((expression) => {
      const argument = expression.getArguments()[0];
      if (argument === undefined || argument.getText().includes("POLICY_PASS_REFUSALS.")) {
        return [];
      }
      return [staticText(argument) ?? `<UNREADABLE ${argument.getKindName()}>`];
    });
}

/** THE INVARIANT REFUSALS: caller and programmer errors — a malformed invocation, an owner plan that disagrees
 *  with the dispatcher, a receipt with no discriminant, a path the workspace resolved twice. They are NOT owner
 *  refusals and deliberately NOT table members: no `mustRefuse` row can ever see one (the conformance runner
 *  would not have got as far as an owner), and putting them in the envelope would refuse rows for text the
 *  runtime never shows a policy author. Declared here, held two-sided by the test below. */
const DISPATCHER_INVARIANTS: readonly string[] = [
  "… cannot author …",
  "… must be a nonempty string",
  "… must be a nonempty string when present",
  "… must be a nonnegative integer",
  "… must be a positive integer",
  "… … cannot be named by an @orb-waive marker: the position grammar admits no parenthesis, CR or LF, so the finding would be permanently unwaivable. Keep the value as the CARRIER and in the MESSAGE, and hand back its leading paren-free slice as the COORDINATE (lib/waivable-coordinate.ts waivableCoordinate; guide §3, #2107).",
  "fact collector has no finish hook",
  "loaded policies import different fact descriptors with id …",
  "node finding cannot derive a nonempty authored position token from …",
  "node finding token and offset must be supplied together",
  "node finding token … is not anchored at its declared offset",
  "ordinary waiver population has ambiguous syntax and resource carriers: …",
  "ordinary waiver source population has no SourceFile: …",
  "planned … policy disagrees with dispatcher applicability: …",
  "planned population disagrees with dispatcher resolution for …",
  "planned runnable policy resolved …: …",
  "policy receipt has invalid discriminant …",
  "policy receipt must be an object with an exact discriminant",
  "resolved fact source path has no SourceFile: …",
  "resolved source population path has no SourceFile: …",
  "runPolicyPass accepts only policies branded by defineGate",
  "runPolicyPass owner plan mode is invalid for …",
  "runPolicyPass owner plan reason disagrees with mode for …",
  "runPolicyPass owner plan reason is blank for …",
  "runPolicyPass owner plans must be a Map",
  "runPolicyPass owner plans must cover exactly the selected policies",
  "runPolicyPass received duplicate policy id …",
  "runPolicyPass requires a nonempty policy array",
  "runPolicyPass selected policy is absent from the known roster: …",
  "runPolicyPass selected policy is not the loaded descriptor identity: …",
  "selected policies import different fact descriptors with id …",
  "workspace contains duplicate source path …",
];

test("every throw in the dispatcher pair is a COMPOSED refusal or a declared invariant — the envelope's completeness over the emitters", ({ repoRoot }) => {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const modules = DISPATCHER_MODULES.map((path) => project.addSourceFileAtPath(`${repoRoot}/${path}`));
  const unaccounted = modules.flatMap((sourceFile) => unaccountedThrows(sourceFile)).toSorted((left, right) => left.localeCompare(right));
  // TWO-SIDED: a new literal refusal appears here, and a declared invariant that no longer exists disappears.
  expect(unaccounted).toEqual([...DISPATCHER_INVARIANTS].toSorted((left, right) => left.localeCompare(right)));
  expect(unaccounted).not.toContain("<UNREADABLE Identifier>");

  // And every sentence the pair DOES compose from is an envelope member — the derivation, checked from the
  // emitter side rather than from the table side.
  const composedKeys = modules.flatMap((sourceFile) =>
    sourceFile
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter((access) => access.getExpression().getText() === "POLICY_PASS_REFUSALS")
      .map((access) => access.getName()),
  );
  expect(composedKeys.length).toBeGreaterThan(10);
  for (const key of new Set(composedKeys)) {
    const sentence = POLICY_PASS_REFUSALS[key as keyof typeof POLICY_PASS_REFUSALS];
    expect(sentence, key).toBeDefined();
    expect(refusalEnvelope(), key).toContain(sentence);
  }

  // THE PLANTED DRIFT CONTROL, in the same invocation: a module that spells a refusal by literal instead of
  // composing it is UNACCOUNTED, which is exactly the state `policy-pass-context.ts` was in before #2155. A
  // census that could not name this would be measuring nothing.
  const planted = project.createSourceFile(
    "/planted/drift.ts",
    "export function refuse(path: string): never {\n  throw new Error(`finding file is outside the effective population: ${path}`);\n}\n",
  );
  expect(unaccountedThrows(planted)).toEqual(["finding file is outside the effective population: …"]);
});
