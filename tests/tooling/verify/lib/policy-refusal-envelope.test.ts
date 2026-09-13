// The refusal envelope's own pins (#2111): the envelope is DERIVED from the same contract constants the runner and
// the dispatcher compose their refusals from, and these pins hold that two-sided — every member is text a real
// refusal carries (driven through `verifyPolicyProofs`), and the containment predicate refuses a generic needle
// while admitting an authored one. The per-member VALIDATOR arm lives in `policy-loader.test.ts`.
//
// AND (#2155) the completeness the envelope cannot have on its own: the EMITTER census at the bottom of this
// file. Its claim is exactly what it measures — over the five modules `POLICY_REFUSAL_EMITTERS` names, every
// message a refusal RAISES (thrown, or pushed into the array a throw joins) is composed from the table FRAGMENT
// by fragment, or is one of the declared caller-error invariants. Three false cleans in its first version, all
// three now permanent controls; the block comment above the census states each with its measurement.
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind, Node as TsNode } from "ts-morph";
import { defineFact } from "../../../../tooling/src/verify/contract/fact.ts";
import { GATE_AUTHORITY_ALARM_KINDS, GATE_AUTHORITY_TOOL_ERROR_KINDS } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { POLICY_REFUSAL_PREFIXES } from "../../../../tooling/src/verify/contract/policy-conformance.ts";
import { GATE_FACT_PHASES, POLICY_PASS_REFUSALS, POLICY_PHASES, POLICY_REFUSAL_EMITTERS } from "../../../../tooling/src/verify/contract/policy-pass.ts";
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

// ═══ THE ENVELOPE IS COMPLETE OVER THE EMITTERS, NOT ONLY OVER THE CONSTANTS (#2155, forge recommendation #4;
// REWRITTEN AT THE INTEGRATION REVIEW, and the rewrite is the lesson) ═══
//
// The envelope derives from `POLICY_PASS_REFUSALS`, so it is complete over the TABLE by construction. That says
// nothing about the modules that actually raise: a sentence spelled by literal beside the table is invisible to
// the envelope, and a `mustRefuse` row naming it would be admitted as "authored" while holding on every refusal
// of that shape. Eleven such literals sat in `policy-pass-context.ts` while the contract header already claimed
// it composed from the table.
//
// THE FIRST VERSION OF THIS CENSUS WAS ITSELF A FALSE CLEAN, in three ways, and each is now a fence with a
// permanent control below (all three measured on the unmodified test before the rewrite):
//
//   1. IT CREDITED A WHOLE ARGUMENT for MENTIONING the table. `argument.getText().includes("POLICY_PASS_REFUSALS.")`
//      says "this throw mentions the table somewhere", not "this throw is composed FROM the table". A template
//      reading one member and appending an unlisted generic sentence passed as composed. MEASURED: planting
//      `${POLICY_PASS_REFUSALS.factAbsent}: ${provider.id} and some new sentence nobody listed` in
//      `policy-pass-context.ts` left the census GREEN. The predicate is now per FRAGMENT: an argument is composed
//      only when it reads at least one table member AND every static fragment of it is a declared composition
//      fragment (`COMPOSITION_FRAGMENTS`), which is the closed set of joiners and subject labels the emitters
//      actually use. Authored interpolation slots (`${provider.id}`, `${failures.join("; ")}`) are runtime data
//      and are not fragments.
//   2. IT ONLY READ `throw new Error(...)`. Every receipt refusal in `lib/policy-pass.ts` is ASSEMBLED first —
//      `failures.push(<sentence>)` at `:647-671` and `:736-750` — and thrown as one joined string at `:689`/`:764`.
//      MEASURED: planting `failures.push("a generic refusal nobody listed")` ahead of the composed push at `:739`
//      left the census GREEN. An emitter site is now a `new Error(...)` argument OR a `<sink>.push(...)` argument
//      where `<sink>` is an identifier that appears inside some `new Error(...)` argument in the same file — the
//      indirect construction, reached by the join rather than by a name this test hardcodes.
//   3. ITS MODULE LIST WAS NARROWER THAN THE CONTRACT'S CLAIM. The contract named five emitters; this census
//      scanned two, so `resource-declaration`, `resource-policy` and `population-resolver` were unmeasured while
//      the header said "every throw in the dispatcher pair". The list is now DATA
//      (`contract/policy-pass.ts#POLICY_REFUSAL_EMITTERS`) read by both, and the roster is held TWO-SIDED against
//      the tree below, including the negative: `policy-refusal-envelope.ts` reads the table and raises nothing,
//      so it must NOT be a member.
//
// WHAT IS DELIBERATELY OUT OF SCOPE, unchanged: caller and programmer errors (`DISPATCHER_INVARIANTS`). They are
// not owner refusals — the conformance runner never reaches an owner — so putting them in the envelope would
// refuse `mustRefuse` rows for text the runtime cannot show a policy author. They are DECLARED and held
// two-sided instead, which is the same completeness with an honest vocabulary.
const DISPATCHER_MODULES = POLICY_REFUSAL_EMITTERS;

/** One message expression, split into what the author WROTE (`statics`), what the runtime fills in (`slots`),
 *  and the two woven back together in ORDER (`text`, the census key: authored text with `…` at every slot).
 *  `text` is built during the same walk rather than re-derived from the two lists — the lists lose the
 *  interleaving, and a re-derivation that guesses it drops the right-hand side of a `+` concatenation. */
interface Fragments {
  readonly statics: readonly string[];
  readonly slots: readonly string[];
  readonly text: string;
}

const joinFragments = (left: Fragments, right: Fragments): Fragments => ({
  statics: [...left.statics, ...right.statics],
  slots: [...left.slots, ...right.slots],
  text: `${left.text}${right.text}`,
});

/** Split a message expression into its authored fragments. A template's head/middle/tail are STATIC; every
 *  interpolation is a SLOT; a `+` concatenation is both sides in order; anything else is one opaque slot. */
function fragmentsOf(argument: Node): Fragments {
  let fragments: Fragments;
  if (TsNode.isStringLiteral(argument) || TsNode.isNoSubstitutionTemplateLiteral(argument)) {
    const literal = argument.getLiteralText();
    fragments = { statics: [literal], slots: [], text: literal };
  } else if (TsNode.isTemplateExpression(argument)) {
    const head = argument.getHead().getLiteralText();
    fragments = argument.getTemplateSpans().reduce<Fragments>(
      (accumulated, span) =>
        joinFragments(accumulated, {
          statics: [span.getLiteral().getLiteralText()],
          slots: [span.getExpression().getText()],
          text: `…${span.getLiteral().getLiteralText()}`,
        }),
      { statics: [head], slots: [], text: head },
    );
  } else if (TsNode.isBinaryExpression(argument)) {
    fragments = joinFragments(fragmentsOf(argument.getLeft()), fragmentsOf(argument.getRight()));
  } else {
    fragments = { statics: [], slots: [argument.getText()], text: "…" };
  }
  return fragments;
}

const TABLE = "POLICY_PASS_REFUSALS.";
/** THE CLOSED SET OF COMPOSITION FRAGMENTS — every piece of static text a COMPOSED refusal is allowed to carry
 *  beside its table member, measured across all five emitters and held two-sided below. Two kinds, and nothing
 *  else: JOINERS (punctuation between a member and a slot) and SUBJECT LABELS (the noun naming what the refusal
 *  is about, which the table's sentences deliberately do not carry). A fragment outside this set is a new
 *  SENTENCE, and a new sentence belongs in the table. */
const COMPOSITION_FRAGMENTS: readonly string[] = [
  " ",
  // NO `", "`: the review's example listed it, and the two-sided pin below refused it — every comma-joined list
  // in these emitters is `…join(", ")`, which is a SLOT expression, never authored static text. A declared
  // fragment nothing uses is a widened door, so it is not declared.
  ": ",
  " candidate(s)",
  " is ",
  "authored text ",
  "fact ",
  "non-resource policy ",
  "policy ",
  "resource ",
  "resource request ",
  "resource request exact-file:",
  "resource-only fact ",
  "resource-only policy ",
  "syntax owner ",
];

/** Every message expression a module RAISES: a `new Error(...)` argument, and — the indirect half — a
 *  `<sink>.push(...)` argument whose receiver is an identifier some `new Error(...)` argument in the same file
 *  reads. That is how `policy-pass.ts` builds a receipt refusal: push the sentences, join them into one throw. */
function refusalSites(sourceFile: SourceFile): readonly Node[] {
  const thrown = sourceFile
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((expression) => expression.getExpression().getText() === "Error")
    .flatMap((expression) => {
      const argument = expression.getArguments()[0];
      return argument === undefined ? [] : [argument];
    });
  const sinks = new Set(thrown.flatMap((argument) => argument.getDescendantsOfKind(SyntaxKind.Identifier).map((identifier) => identifier.getText())));
  const pushed = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const callee = call.getExpression();
    if (!(TsNode.isPropertyAccessExpression(callee) && callee.getName() === "push" && sinks.has(callee.getExpression().getText()))) {
      return [];
    }
    const argument = call.getArguments()[0];
    return argument === undefined ? [] : [argument];
  });
  return [...thrown, ...pushed];
}

/** Is this message COMPOSED from the table? It must read a member AND carry no static text outside the declared
 *  composition fragments — the two halves the first version of this census collapsed into a substring match. */
function isComposed(argument: Node): boolean {
  const { statics, slots } = fragmentsOf(argument);
  const readsMember = slots.some((slot) => slot.startsWith(TABLE));
  const foreign = statics.filter((fragment) => fragment !== "" && !COMPOSITION_FRAGMENTS.includes(fragment));
  return readsMember && foreign.length === 0;
}

/** The census key of every refusal site in `sourceFile` that is NOT composed from the table. */
function unaccountedRefusals(sourceFile: SourceFile): readonly string[] {
  return refusalSites(sourceFile)
    .filter((argument) => !isComposed(argument))
    .map((argument) => fragmentsOf(argument).text);
}

/** THE INVARIANT REFUSALS: caller and programmer errors — a malformed invocation, an owner plan that disagrees
 *  with the dispatcher, a receipt with no discriminant, a population expression that does not parse, a path the
 *  workspace resolved twice. They are NOT owner refusals and deliberately NOT table members: no `mustRefuse` row
 *  can ever see one (the conformance runner would not have got as far as an owner), and putting them in the
 *  envelope would refuse rows for text the runtime never shows a policy author. Declared here, held two-sided by
 *  the test below, over all five emitters. */
const DISPATCHER_INVARIANTS: readonly string[] = [
  "… cannot author …",
  "… must be a nonempty string",
  "… must be a nonempty string when present",
  "… must be a nonnegative integer",
  "… must be a positive integer",
  "… … cannot be named by an @orb-waive marker: the position grammar admits no parenthesis, CR or LF, so the finding would be permanently unwaivable. Keep the value as the CARRIER and in the MESSAGE, and hand back its leading paren-free slice as the COORDINATE (lib/waivable-coordinate.ts waivableCoordinate; guide §3, #2107).",
  "Invalid population expression: …",
  "Invalid repository path …: expected a repo-relative POSIX file path",
  "Invalid repository path …: invalid path segment",
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

const sorted = (values: readonly string[]): readonly string[] => [...values].toSorted((left, right) => left.localeCompare(right));

test("the refusal EMITTER roster is data, held two-sided against the tree (#2155)", ({ repoRoot }) => {
  // THE ROSTER'S OTHER SIDE. `POLICY_REFUSAL_EMITTERS` is the contract's own list; this derives the same set
  // from the tree — a `lib/` module composing a refusal from the table — and requires equality. A new emitter
  // that never joins the roster reds here, and so does a roster entry that stopped composing. Before this pin
  // the contract claimed five modules while the census below read two, and nothing held the pair together.
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(`${repoRoot}/tooling/src/verify/lib/*.ts`);
  const derived = project
    .getSourceFiles()
    .filter((sourceFile) => refusalSites(sourceFile).some((argument) => fragmentsOf(argument).slots.some((slot) => slot.startsWith(TABLE))))
    .map((sourceFile) => sourceFile.getFilePath().slice(`${repoRoot}/`.length));
  expect(sorted(derived)).toEqual(sorted(DISPATCHER_MODULES));

  // AND THE NEGATIVE THE ROSTER ASSERTS RATHER THAN ASSUMES: the envelope module READS the table (it is built
  // from it) and raises nothing, so "references the table" is not the predicate and it is not an emitter.
  const envelope = project.getSourceFileOrThrow(`${repoRoot}/tooling/src/verify/lib/policy-refusal-envelope.ts`);
  expect(envelope.getFullText()).toContain(TABLE);
  expect(refusalSites(envelope)).toEqual([]);
  expect(DISPATCHER_MODULES).not.toContain("tooling/src/verify/lib/policy-refusal-envelope.ts");
});

test("every refusal the emitters raise is COMPOSED from the table or a declared invariant — per FRAGMENT, and including the pushed sentences", ({
  repoRoot,
}) => {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const modules = DISPATCHER_MODULES.map((path) => project.addSourceFileAtPath(`${repoRoot}/${path}`));
  const unaccounted = modules.flatMap((sourceFile) => unaccountedRefusals(sourceFile));
  // TWO-SIDED: a new literal refusal appears here, and a declared invariant that no longer exists disappears.
  expect(sorted(unaccounted)).toEqual(sorted(DISPATCHER_INVARIANTS));

  // THE COMPOSITION FRAGMENTS ARE TWO-SIDED TOO — a declared joiner or subject label no emitter uses any more is
  // a widened door nobody is holding, and it would silently admit the next appended sentence that happens to
  // match it.
  const used = new Set(
    modules.flatMap((sourceFile) =>
      refusalSites(sourceFile)
        .filter((argument) => isComposed(argument))
        .flatMap((argument) => fragmentsOf(argument).statics.filter((fragment) => fragment !== "")),
    ),
  );
  expect(sorted([...used])).toEqual(sorted(COMPOSITION_FRAGMENTS));

  // And every sentence the emitters DO compose from is an envelope member — the derivation, checked from the
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
});

test("the census PLANTED CONTROLS: an appended sentence and an indirect pushed literal are both unaccounted (#2155 review)", () => {
  // THE TWO FALSE CLEANS THE FIRST CENSUS SHIPPED, now permanent rows. Each of these passed the substring
  // predicate on the real tree; each must be UNACCOUNTED under the fragment predicate, or the fence is gone.
  const project = new Project({ useInMemoryFileSystem: true });

  // (a) A composed member with an unlisted sentence appended — the shape planted in `policy-pass-context.ts`.
  const appended = project.createSourceFile(
    "/planted/appended.ts",
    'import { POLICY_PASS_REFUSALS } from "./table.ts";\nexport function refuse(id: string): never {\n' +
      "  throw new Error(`${POLICY_PASS_REFUSALS.factAbsent}: ${id} and some new sentence nobody listed`);\n}\n",
  );
  expect(unaccountedRefusals(appended)).toEqual(["…: … and some new sentence nobody listed"]);

  // (b) The SAME shape minus the appended sentence stays composed — the control's control, so (a) is not passing
  // because the fragment reader simply refuses everything.
  const clean = project.createSourceFile(
    "/planted/clean.ts",
    'import { POLICY_PASS_REFUSALS } from "./table.ts";\nexport function refuse(id: string): never {\n' +
      "  throw new Error(`${POLICY_PASS_REFUSALS.factAbsent}: ${id}`);\n}\n",
  );
  expect(unaccountedRefusals(clean)).toEqual([]);

  // (c) A generic sentence PUSHED into the array a composed throw joins — invisible to any `throw`-only reader.
  const pushed = project.createSourceFile(
    "/planted/pushed.ts",
    'import { POLICY_PASS_REFUSALS } from "./table.ts";\nexport function refuse(empty: boolean): void {\n' +
      '  const failures: string[] = [];\n  if (empty) {\n    failures.push("a generic refusal nobody listed");\n  }\n' +
      "  failures.push(POLICY_PASS_REFUSALS.factsNoReceipt);\n  if (failures.length > 0) {\n" +
      '    throw new Error(`${POLICY_PASS_REFUSALS.policyReceiptRefused}: ${failures.join("; ")}`);\n  }\n}\n',
  );
  expect(unaccountedRefusals(pushed)).toEqual(["a generic refusal nobody listed"]);

  // (d) A push onto an array NO refusal reads is not an emitter site — the rule follows the join, and does not
  // sweep every `.push` in the file.
  const unrelated = project.createSourceFile(
    "/planted/unrelated.ts",
    'import { POLICY_PASS_REFUSALS } from "./table.ts";\nexport function collect(): readonly string[] {\n' +
      '  const paths: string[] = [];\n  paths.push("packages/client/src/a.ts");\n' +
      "  if (paths.length === 0) {\n    throw new Error(POLICY_PASS_REFUSALS.factsNoReceipt);\n  }\n  return paths;\n}\n",
  );
  expect(unaccountedRefusals(unrelated)).toEqual([]);
});
