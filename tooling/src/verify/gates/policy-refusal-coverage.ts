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
// condition is readable off `reports/check-structure.json` — nobody has to remember it. RE-MEASURED at `80b0693cb`
// with the #2274 repair below: 60 → 17. The 43 that discharged were pinned all along by real family tests the dead
// recognizer could not see, so the drop is a READER fix, not a burn-down; 17 is the real remaining debt.
//
// THE COUNT REACHED ZERO ON 2026-09-13 AND THE FLIP DID NOT HAPPEN IN THAT COMMIT — read this before
// concluding the condition above was ignored. The burn-down was discharged by #2327 (sixteen consumers
// pinned across five commits: `verify-registry-parity`, the three authored-tree consumers, the two
// registry-fact consumers, and the ten `drizzle-schema` fact consumers) and by the #2330 recognizer repair
// below, which retired the seventeenth as a FALSE accusation. 17 → 16 → 13 → 11 → 1 → 0, each step measured
// by name with `pnpm check:structure --check policy-refusal-coverage`. Flipping `ordinary`/`warning` to
// `hard`/`error` and dropping `workItem` is an OWNER decision that was deliberately held back from the
// zeroing commit rather than forgotten: a zero one hour old is not yet evidence that the corpus stays at
// zero, and the flip also closes the `@orb-waive` door the section below describes as watched-while-draining.
// SO THE ROW STAYS `ordinary`/`warning` **WITH** ITS `workItem` UNTIL THAT FLIP — the two move together and
// neither moves alone. `warning` with no `workItem` is not a third state this module may sit in even for one
// commit: `lib/policy-module.ts:51` refuses it AT LOAD (measured 2026-09-13 by deleting the key —
// `pnpm check:structure --check policy-refusal-coverage` exits 2, *"descriptor.workItem must be an own
// enumerable property when severity is warning"*, and the corpus never loads), so a zeroing commit that
// dropped only the pointer could not even run. WHICH number the pointer names is decided one paragraph up
// and never here; this paragraph owns the STATE, not the id.
//
// AND THE #2330 REPAIR, WHICH IS #2274 ONE SPELLING OVER. The recognizer read the driven set through
// `bindsParameter`, which cannot see a SHORTHAND property's value binding (`{ knownPolicies: policies,
// policies }`) — TypeScript resolves that name node to the PROPERTY symbol. Ten live family tests spell the
// dispatcher input that way, and `freeze-provenance-write-pairing-health` sat accused for the module's whole
// life while carrying a real §4.5 refusal pin at `freeze-provenance-conversion.test.ts:110`. Measured with a
// one-token probe (`policies` → `policies: policies`): 11 → 10, restored, 11. The lesson is the same one the
// section above paid for: THE PROOF SET ONLY EVER SPELLED THE SHAPE ONE WAY, so its own fixtures could not
// see the gap. Both the repaired shape and the still-unreachable OBJECT-PATTERN shape are now rows.
//
// AND THE DOOR THE WARNING TIER OPENS IS WATCHED. `ordinary` means a consumer can `@orb-waive` this finding
// instead of writing the pin. That waiver is reconciled centrally into the policy's `waived` count, and
// `pnpm check:structure-delta` (#2110) prints `waived` before → after per policy — so waiving instead of fixing
// MOVES A NUMBER the barrier already reads. The door is open during the drain; it is not unobserved.
//
// WHAT SATISFIES THE RULE, and why the test half is recognised the way it is. `mustRefuse` is read off the
// descriptor literal. The family-test half is a `runPolicyPass({ policies: […] , … })` call inside a `test(…)`
// whose DRIVEN SET resolves to an import of the policy module itself — the import is the binding between pin and
// subject, so a test that imports six policies and drives one covers only the one it drove. The dispatcher call
// is recognised by NAME rather than by import origin, deliberately and by this family's own precedent: proof
// fixtures `declare` the dispatcher rather than importing it (`policy-waiver-identity`'s family rows do exactly
// this), so an origin test would be unsatisfiable inside the very proofs that must falsify the rule.
//
// ═══ THE TEST HALF WAS DEAD FOR ITS FIRST WEEK, AND THE FIXTURE IS WHY (#2274) ═══
//
// The founding recognizer asked for `runPolicyPass(<policy identifier>, …)` — a FIRST POSITIONAL ARGUMENT. The
// production dispatcher has never had one: `lib/policy-pass.ts:835` is `runPolicyPass(input: PolicyPassInput)`,
// ONE options object, and the driven set is its `policies` property. So no real family test could ever be
// recognised, and the `mustPass` "TEST HALF" row was green only because its fixture `declare`d a two-positional
// dispatcher that exists nowhere on the tree. Measured by `cb-v-wave-8b` on `50e31c534` and reproduced here at
// `80b0693cb`: a fixture-shaped scratch test moved the real-tree count 60 → 59, while
// `tests/tooling/verify/gates/mirror-index-family.test.ts` — fifteen refusal pins over all three mirror gates —
// discharged nothing, and all three of its subjects sat in the accused list. With the recognizer below the same
// real-tree drive reads 17, and NOTHING newly accused (43 discharged, 0 added) — the repair's two-sided receipt.
// THE LESSON, which is the reason this
// paragraph is long: a proof fixture that INVENTS the shape it is proving against tests the fixture. The retired
// shape is now a `mustFlag` row (§4.1's "land a retired exception as an ASSERTION, not an absence"), so the
// recognizer can never drift back to it silently.
//
// HOW THE DRIVEN SET IS READ, and why it is a walk rather than one property read. `policies` is authored four
// ways across the ~60 live family tests, and all four are correct: a literal `[gate]`, a module const
// (`policies: FAMILY`), a spread (`[...policies]`), and — the DOMINANT shape — a local `pass(policy, …)` helper
// whose parameter is the driven set. `resolveStableExpression` cannot resolve a parameter BY CONTRACT
// (`policy-fixture-substrate.ts:23`), so the walk hops one further step: the parameter's position in its
// declaring function, then that function's call sites IN THE SAME FILE, then the argument at that position. The
// hop is not optional politeness. This policy's unreadability direction is INVERTED from its
// `policy-fixture-substrate` sibling — there an unresolved read ACQUITS, here it ACCUSES — so the family's own
// doctrine ("a positive-proof requirement the reader structurally cannot satisfy is fail-closed in name and
// false-accusing in fact") lands on the helper shape as a hard requirement rather than a nicety.
//
// WHAT THIS IS NOT. A policy with `facts: []` and `resources: []` computes its own population from the corpus and
// is not asked — its denominator is the tree, and a zero there is a real zero. This module does not judge whether
// a refusal pin is CORRECT; `mustRefuse` rows are executed by the conformance stage and `runPolicyPass` pins by
// their suite. It asks only whether one EXISTS, which is the question nothing asked before.
//
// FAMILY: `policy-soundness`, shared reader `lib/policy-descriptor-read.ts` (`finalDescriptorOf`,
// `descriptorValue`, `descriptorProperty`, `policyIdOfPath`) — the same descriptor reader
// `policy-waiver-identity` and `policy-waiver-spelling` resolve through. NOT a singleton and NOT a `-health`
// split: it differs from its siblings in SUBJECT (the refusal proof rather than the waiver arm), not in
// authority, so it is one more policy under the shared `family` string. Its severity DOES differ while the
// burn-down drains, which the section above states as a dated, checkable event rather than a permanent shape.
// POPULATION PORT: NO legacy population — this policy is BORN FINAL, added at `575e48d5a`
// (`git show 575e48d5a^:tooling/src/verify/gates/policy-refusal-coverage.ts` → `exists on disk, but not in`).
// Nothing was ported: no legacy descriptor ever asked who owed a refusal proof, which is the gap #2184 names
// and why its paid defects are three separate lanes rediscovering it. There is no legacy SHA to record.
//
// BLINDNESS: this module reads final descriptors through the shared reader, so if that recognizer dies every
// module reads "not final" and the corpus reports ✓ forever. It self-anchors on its OWN path and THROWS instead.
import type { CallExpression, Node as MorphNode, ObjectLiteralExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import {
  bindsParameter,
  descriptorProperty,
  descriptorValue,
  finalDescriptorOf,
  objectLiteralOf,
  policyIdOfPath,
  stableTerminal,
} from "../lib/policy-descriptor-read.ts";
import { resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import { familyFixture, finalProbeModule, ORDINARY_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-refusal-coverage.ts";
const GATES_DIR = "tooling/src/verify/gates/";
const TESTS_DIR = "tests/";
/** The production dispatcher's name — see the header for why the TEST side is keyed on the name. */
const DISPATCHER = "runPolicyPass";
/** The dispatcher's SELECTED set (`PolicyPassInput.policies`, `contract/policy-pass.ts:131`). `knownPolicies` is
 *  deliberately NOT read: it is the roster authority reconciliation needs, and a policy listed there but not
 *  selected is never RUN — crediting it would be the coverage-by-coincidence the `mustFlag` rows below forbid. */
const DRIVEN_FIELD = "policies";
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
  "test under `tests/tooling/verify/gates/` that IMPORTS this module, and assert those. THE ROUTE IS THE PRODUCTION SIGNATURE, spelled " +
  "exactly: `runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false })` inside a " +
  "`test(…)`, with `gate` imported from this module — a local `pass(policy, …)` helper is read through to its call sites, so the shape you " +
  "already write is the shape that counts. One or the other, never neither. " +
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

/** The policy id an expression NAMES, or undefined: the reference resolved to a module export whose canonical
 *  home is a gate module. Resolved through the shared origin reader rather than by re-walking the file's import
 *  declarations (#2097 — a `getSymbol().getDeclarations()` chain inside a gate module is the private-reader
 *  shape this family reports), so an alias, a re-export and a namespace read are all the same binding.
 *
 *  NO `_proof/` FENCE, and that is a MEASUREMENT rather than an oversight (#2274 review): a fixture-substrate
 *  module resolves to the id `_proof/<name>` — `policyIdOfPath` slices the whole corpus-relative remainder, not
 *  the basename — and an id carrying a slash equals no policy id that exists, so a pin naming one discharges
 *  nothing. The fence this comment replaces was cut in both directions: proof rows stayed green and the
 *  real-tree count stayed 17, which is what dead defensive code looks like. */
function policyIdOfExpression(node: MorphNode): string | undefined {
  const origin = resolveModuleMemberOrigin(node);
  let found: string | undefined;
  if (origin.kind === "resolved" && origin.value.canonical.kind === "project") {
    const path = origin.value.canonical.sourceFile.getFilePath().replaceAll("\\", "/");
    const index = path.indexOf(GATES_DIR);
    const relative = index === -1 ? undefined : path.slice(index);
    if (relative !== undefined && relative.endsWith(".ts")) {
      found = policyIdOfPath(relative);
    }
  }
  return found;
}

/** Every call in one test file whose callee is a bare identifier, keyed `<path>\0<name>`. Collected by the SAME
 *  visitor that finds the dispatcher calls, because a helper's call sites may be authored BELOW the helper and
 *  because `policy-soundness` E3 bans a descendant walk in a gate module. */
type CallIndex = Map<string, CallExpression[]>;
const callKey = (path: string, name: string): string => `${path}\u0000${name}`;

/** One recorded dispatcher call. Resolution waits for `evaluate`: the call-site index is not complete until the
 *  whole population has been visited. */
interface Drive {
  readonly call: CallExpression;
  readonly path: string;
}

/** The function-like declaration that DECLARES a parameter named `name`, walking ANCESTORS only. */
function declaringFunction(node: MorphNode, name: string): MorphNode | undefined {
  return node.getFirstAncestor(
    (candidate) => Node.isFunctionLikeDeclaration(candidate) && candidate.getParameters().some((parameter) => parameter.getName() === name),
  );
}

/** How a function-like declaration is CALLED: its own name, or the variable an arrow/function expression is
 *  bound to. Anything else (an inline callback, a method) has no call-site name this reader can index. */
function callableName(owner: MorphNode): string | undefined {
  let name: string | undefined;
  if (Node.isFunctionDeclaration(owner)) {
    name = owner.getName();
  } else {
    const parent = owner.getParent();
    if (parent !== undefined && Node.isVariableDeclaration(parent)) {
      name = parent.getName();
    }
  }
  return name;
}

/** The `for (const policy of […])` statement that BINDS `name`, walking ANCESTORS only. */
function declaringForOf(node: MorphNode, name: string): MorphNode | undefined {
  return node.getFirstAncestor((candidate) => {
    const list = Node.isForOfStatement(candidate) ? candidate.getInitializer() : undefined;
    return list !== undefined && Node.isVariableDeclarationList(list) && list.getDeclarations().some((declaration) => declaration.getName() === name);
  });
}

/** THE LOOP HOP — the fifth authored shape, and a FALSE ACCUSATION until it was read (measured on this lane's
 *  own re-run: `bus-pair.test.ts:162` drives three policies through `for (const policy of [a, b, c])` and two of
 *  them stayed accused). A loop binding has no single authored value either, so the subject is the ITERATED
 *  expression — every member of it is driven, which is exactly what the loop does. */
function hopIteration(node: MorphNode, subjects: Subjects): void {
  const owner = Node.isIdentifier(node) ? declaringForOf(node, node.getText()) : undefined;
  if (owner !== undefined && Node.isForOfStatement(owner)) {
    collectDriven(owner.getExpression(), subjects);
  }
}

/** THE SHORTHAND'S VALUE BINDS WHAT ITS NAME CANNOT RESOLVE (#2330). `descriptorValue` hands back a shorthand
 *  property's NAME NODE, and on that node `getSymbol()` resolves the PROPERTY — the value binding needs the
 *  checker's `getShorthandAssignmentValueSymbol`, which a gate module may not reach for. So `bindsParameter`
 *  reads FALSE for `{ knownPolicies: policies, policies }` and the hop below never ran: ten live family tests
 *  spell the driven set that way, and `freeze-provenance-write-pairing-health` was falsely accused for the
 *  module's whole life while carrying a real §4.5 pin.
 *
 *  WHY THIS IS NOT A LOOSER GUARD. The hop's actual work is `declaringFunction(node, name)`, which demands an
 *  ANCESTOR function-like declaring a parameter of exactly that name and returns undefined otherwise — so a
 *  shorthand naming nothing still credits nothing. And a shorthand whose name binds a stable local instead is
 *  never seen here: `collectDriven` resolves an identifier through `stableTerminal` FIRST, and only an
 *  unresolvable binding falls through. The shared `bindsParameter` is deliberately untouched —
 *  `policy-soundness` ARM E4 reads it for a different question (a receiver that PROVABLY binds a parameter),
 *  and widening it there would answer that question differently. */
function bindsShorthandValue(node: MorphNode): boolean {
  const parent = node.getParent();
  return parent !== undefined && Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === node;
}

/** THE PARAMETER HOP — the dominant real shape (`function pass(policy, …) { runPolicyPass({ policies: [policy] …`).
 *  A parameter has no single authored value, so `resolveStableExpression` refuses it BY CONTRACT; the driven
 *  policy is at the same POSITION in every call site of the declaring function, in this file. */
function hopParameter(node: MorphNode, subjects: Subjects): void {
  if (!(Node.isIdentifier(node) && (bindsParameter(node) || bindsShorthandValue(node)))) {
    hopIteration(node, subjects);
    return;
  }
  const name = node.getText();
  const owner = declaringFunction(node, name);
  const called = owner === undefined ? undefined : callableName(owner);
  if (owner === undefined || called === undefined || !Node.isFunctionLikeDeclaration(owner)) {
    return;
  }
  const position = owner.getParameters().findIndex((parameter) => parameter.getName() === name);
  for (const site of subjects.index.get(callKey(subjects.path, called)) ?? []) {
    const argument = site.getArguments()[position];
    if (argument !== undefined) {
      collectDriven(argument, subjects);
    }
  }
}

/** The resolution state for ONE dispatcher call: where it lives, every indexed call site, the pins it produces,
 *  and the cycle fence a const-alias loop would otherwise turn into an infinite descent. */
interface Subjects {
  readonly path: string;
  readonly index: CallIndex;
  readonly pinned: Set<string>;
  readonly seen: Set<object>;
}

/** Every policy a driven-set expression names. FOUR authored shapes, each measured live on this tree: a module
 *  import, an array literal (spreads unwrapped), a const alias of an array, and a binding with no single
 *  authored value — a helper parameter or a `for…of` head, which the two hops below reach.
 *
 *  There is NO fifth "alias to a non-array terminal" branch: it was written, cut in both directions, and
 *  removed — the proof rows stayed green and the real-tree count stayed 17, because `resolveModuleMemberOrigin`
 *  already resolves an alias chain to its module export before this reader ever sees a terminal. An
 *  unrecognised shape falls through to no pin, which ACCUSES; that direction is the family's doctrine and it is
 *  what makes a new authored shape visible instead of silently credited. */
function collectDriven(node: MorphNode, subjects: Subjects): void {
  if (subjects.seen.has(node.compilerNode)) {
    return;
  }
  subjects.seen.add(node.compilerNode);
  const id = policyIdOfExpression(node);
  if (id !== undefined) {
    subjects.pinned.add(id);
    return;
  }
  const terminal = stableTerminal(node);
  if (terminal === undefined) {
    hopParameter(node, subjects);
  } else if (Node.isArrayLiteralExpression(terminal)) {
    for (const element of terminal.getElements()) {
      collectDriven(Node.isSpreadElement(element) ? element.getExpression() : element, subjects);
    }
  } else {
    hopParameter(node, subjects);
  }
}

/** Record ONE `runPolicyPass({ policies: […] , … })` call as a pin for every module it DRIVES.
 *
 *  THE `test(…)` FENCE IS DELIBERATELY NOT HERE, and that is a measurement rather than an omission. The founding
 *  header promised one ("inside a `test(…)`") and the founding code never checked; adding it here took the
 *  helper arm from a pin to a false accusation on this lane's own fixture, because the DOMINANT authored shape
 *  puts the dispatcher call in a MODULE-SCOPE `pass(policy, …)` helper that only the test body calls
 *  (`mirror-index-family.test.ts:48-56` is the exemplar). "Executed by a test" is a call-graph question, and a
 *  reader that answers it approximately accuses the correct majority. What survives is the fence that is real
 *  and checkable: the call is IN A FAMILY TEST FILE (the population), and it DRIVES this module (the walk).
 *  The remaining fence is the field: the driven set is `policies`, never `knownPolicies`. */
function recordPin(drive: Drive, index: CallIndex, pinned: Set<string>): void {
  const input = objectLiteralOf(drive.call.getArguments()[0]);
  const driven = input === undefined ? undefined : descriptorValue(input, DRIVEN_FIELD);
  if (driven !== undefined) {
    collectDriven(driven, { path: drive.path, index, pinned, seen: new Set<object>() });
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
/** THE DISPATCHER AS IT ACTUALLY IS — one options object (`lib/policy-pass.ts:835`). The fixture `declare`s it
 *  rather than importing it, which is this family's precedent (the header says why the NAME is the recognizer);
 *  what it may never again do is invent a SIGNATURE, which is the whole of #2274. */
const DISPATCHER_DECLARATION = `declare function ${DISPATCHER}(input: { policies: readonly unknown[]; knownPolicies?: readonly unknown[] }): { authority: { toolErrors: unknown[] } };`;
/** The RETIRED two-positional signature, kept as a fixture so the `mustFlag` row below can assert that a call
 *  shaped like it credits NOTHING (§4.1: a removed exception lands as an assertion, not as an absence). */
const RETIRED_DECLARATION = `declare function ${DISPATCHER}(policy: unknown, files: unknown): { authority: { toolErrors: unknown[] } };`;
/** How ONE pin-test fixture varies: `binding` is the local name the test imports from `module`, `dispatcher` is
 *  the `declare`d signature, and `alsoImport` names a SECOND gate module imported under its own name — the row
 *  that puts the judged module in `knownPolicies` while a DIFFERENT one is driven needs both bindings in scope
 *  to be a real falsifier. An options object rather than four positionals because biome's `useMaxParams` caps at
 *  four and the cap is right here: every call site below reads better naming the one field it varies. */
interface PinTestShape {
  readonly module?: string;
  readonly binding?: string;
  readonly dispatcher?: string;
  readonly alsoImport?: string;
}
/** The body is what runs inside the one `test(…)`; everything else defaults to the probe module. */
const PIN_TEST = (body: string, shape: PinTestShape = {}): string => {
  const { module = "probe", binding = "probe", dispatcher = DISPATCHER_DECLARATION, alsoImport } = shape;
  const second = alsoImport === undefined ? "" : `import { gate as ${alsoImport} } from "../../../../tooling/src/verify/gates/${alsoImport}.ts";\n`;
  return `${second}import { gate as ${binding} } from "../../../../tooling/src/verify/gates/${module}.ts";\n${dispatcher}\ndeclare function test(name: string, body: () => void): void;\ndeclare function expect(value: unknown): { toHaveLength: (n: number) => void };\ntest("refusal", () => {\n${body}\n});\n`;
};
/** A registering FINAL sibling the "wrong module" row's pin binds to instead — planted so its relative import
 *  RESOLVES (a dangling one would be the family's fail-closed control, which is a different row entirely). */
const ELSEWHERE = {
  "tooling/src/verify/gates/elsewhere.ts": 'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "elsewhere" });\n',
};
/** The dispatcher driven at the production shape, with the subject in the `policies` array literal. */
const driving = (binding: string): string =>
  `  const refused = ${DISPATCHER}({ knownPolicies: [${binding}], policies: [${binding}] });\n  expect(refused.authority.toolErrors).toHaveLength(1);`;
const DRIVEN = driving("probe");
/** THE HELPER SHAPE — the dominant authored spelling across the live family tests, and the one the parameter
 *  hop exists for. The driven set is a PARAMETER; only its call site names the subject. */
const DRIVEN_THROUGH_HELPER = `  function pass(policy: unknown): { authority: { toolErrors: unknown[] } } {\n    return ${DISPATCHER}({ knownPolicies: [policy], policies: [policy] });\n  }\n  expect(pass(probe).authority.toolErrors).toHaveLength(1);`;
/** THE LOOP SHAPE — a for-of binding has no single authored value either, so the subject is the ITERATED
 *  expression (`bus-pair.test.ts:162` drives three policies this way). */
const DRIVEN_THROUGH_LOOP = `  for (const policy of [probe]) {\n    const refused = ${DISPATCHER}({ knownPolicies: [policy], policies: [policy] });\n    expect(refused.authority.toolErrors).toHaveLength(1);\n  }`;
/** THE ALIAS-AND-SPREAD SHAPE — a module const of the family, spread into the driven set. Two hops in one
 *  fixture on purpose: the spread element and the const alias behind it are separate branches of the walk. */
const DRIVEN_THROUGH_SPREAD = `  const family = [probe];\n  const refused = ${DISPATCHER}({ knownPolicies: [...family], policies: [...family] });\n  expect(refused.authority.toolErrors).toHaveLength(1);`;
/** THE SHORTHAND SHAPE (#2330) — the helper shape one token over: the parameter is NAMED `policies`, so the
 *  driven set is written `{ knownPolicies: policies, policies }`. Ten live family tests spell it this way. */
const DRIVEN_THROUGH_SHORTHAND = `  function pass(policies: readonly unknown[]): { authority: { toolErrors: unknown[] } } {\n    return ${DISPATCHER}({ knownPolicies: policies, policies });\n  }\n  expect(pass([probe]).authority.toolErrors).toHaveLength(1);`;
/** THE DESTRUCTURED SHAPE — a DECLARED LIMIT, landed as an assertion rather than a paragraph (§4.1). The
 *  driven set binds a BindingElement inside a parameter's object pattern, so its subject is not at any
 *  ARGUMENT POSITION: it is a property of an object each call site builds, and reaching it is a different
 *  walk. `split-arm-parity.test.ts:207` is the one live instance and it drives no accused module today. */
const DRIVEN_THROUGH_DESTRUCTURED = `  function pass({ policies }: { policies: readonly unknown[] }): { authority: { toolErrors: unknown[] } } {\n    return ${DISPATCHER}({ knownPolicies: policies, policies });\n  }\n  expect(pass({ policies: [probe] }).authority.toolErrors).toHaveLength(1);`;
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
    const drives: Drive[] = [];
    const index: CallIndex = new Map();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            const path = ctx.relativePath(sourceFile);
            const callee = Node.isCallExpression(node) ? node.getExpression() : undefined;
            if (callee === undefined || !Node.isCallExpression(node) || !path.startsWith(TESTS_DIR) || !Node.isIdentifier(callee)) {
              return;
            }
            // BOTH sides of the join are collected in this one pass: the dispatcher calls, and every
            // identifier-callee call so a helper's ARGUMENTS can be reached from its parameter later. Nothing
            // is resolved yet — a helper is routinely authored above its own call sites.
            const key = callKey(path, callee.getText());
            index.set(key, [...(index.get(key) ?? []), node]);
            if (callee.getText() === DISPATCHER) {
              drives.push({ call: node, path });
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const drive of drives) {
          recordPin(drive, index, pinned);
        }
        judgeCorpus(ctx, pinned);
      },
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
        [PIN_TEST_PATH]: PIN_TEST(`  const other = ${DISPATCHER}({ policies: [sibling] });\n  void other;`, { module: "elsewhere", binding: "sibling" }),
      }),
      expect: { count: 1, token: "resources" },
      why: "THE PIN MUST BIND TO THIS MODULE: a family test that drives the dispatcher but imports a DIFFERENT module covers nothing here. Without this row the test half would be satisfied by any `runPolicyPass` anywhere in the suite — coverage by coincidence",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), {
        [PIN_TEST_PATH]: PIN_TEST(`  const refused = ${DISPATCHER}(probe, {});\n  void refused;`, { dispatcher: RETIRED_DECLARATION }),
      }),
      expect: { count: 1, token: "resources" },
      why: "#2274, THE DEAD HALF LANDED AS AN ASSERTION RATHER THAN AN ABSENCE (§4.1): a call in the RETIRED two-positional shape `runPolicyPass(<policy>, …)` credits NOTHING, because the production dispatcher takes one options object and never had a positional subject. The founding recognizer read exactly this shape, so its `mustPass` TEST-HALF row was green over a signature that exists nowhere on the tree while every real family test discharged nothing — measured 60 → 59 for the invented shape and 60 → 60 for the real one at `80b0693cb`. Without this row the recognizer could drift back and the proof set would not notice",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), {
        ...ELSEWHERE,
        [PIN_TEST_PATH]: PIN_TEST(`  const other = ${DISPATCHER}({ knownPolicies: [probe], policies: [sibling] });\n  void other;`, {
          module: "elsewhere",
          binding: "sibling",
          alsoImport: "probe",
        }),
      }),
      expect: { count: 1, token: "resources" },
      why: "`knownPolicies` IS NOT THE DRIVEN SET, and the fixture puts THE JUDGED MODULE in it so the row can actually fail: the roster authority reconciliation needs lists policies that are never RUN, so a module appearing only there was never exercised and its refusal was never reached. Point `DRIVEN_FIELD` at `knownPolicies` and this row alone goes green. Crediting it would be the same coverage-by-coincidence the row above forbids, one field over",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST("  void probe;") }),
      expect: { count: 1, token: "resources" },
      why: "IMPORTING IS NOT PINNING: the family test imports this very module and never drives it through the dispatcher. The import alone is the shape a lane produces when it deletes a flaky pin but leaves the header claiming one",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST(DRIVEN_THROUGH_DESTRUCTURED) }),
      expect: { count: 1, token: "resources" },
      why: "THE DECLARED LIMIT, LANDED AS AN ASSERTION RATHER THAN A PARAGRAPH (§4.1, #2330): a helper whose driven set arrives through an OBJECT PATTERN (`function pass({ policies })`) credits nothing. The binding is a BindingElement, not a parameter, and its subject sits at no ARGUMENT POSITION — it is a property of an object each call site builds, which is a different walk from the positional hop. Read the direction: this row ACCUSES, so the limit is fail-closed, and the day the walk learns object patterns this row goes red and must be promoted to a `mustPass`. One live instance (`split-arm-parity.test.ts:207`), driving no derived-population module today",
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
      why: "THE TEST HALF, AT THE PRODUCTION SIGNATURE: a family test that IMPORTS this module and drives it through `runPolicyPass({ policies: [<it>] , … })` inside a `test(…)`. This is the arm a row cannot express — an owner status, an empty finding set, a phase — and #1977 exists because it used to live in a header instead. The fixture is the shape `mirror-index-family.test.ts:55` actually writes; #2274 is what an invented one costs",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST(DRIVEN_THROUGH_HELPER) }),
      why: "THE HELPER SHAPE, which is the DOMINANT one across the live family tests (`pass(policy, …)` wrapping the dispatcher, ~half of the ~60 files): the driven set is a PARAMETER, and `resolveStableExpression` cannot resolve a parameter by contract. The walk hops to the declaring function's call sites in the same file. This policy's unreadability direction is inverted from `policy-fixture-substrate`'s — an unresolved read here ACCUSES — so without the hop the family's own doctrine makes it a false-accusation engine over the correct majority",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST(DRIVEN_THROUGH_LOOP) }),
      why: "THE LOOP SHAPE: a `for (const policy of […])` driving several policies through one dispatcher call. The binding has no single authored value, so the subject is the ITERATED expression — every member is driven, which is exactly what the loop does. Live at `bus-pair.test.ts:162`, where three policies share one loop and two of them stayed accused until the hop was read",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST(DRIVEN_THROUGH_SHORTHAND) }),
      why: "THE SHORTHAND SHAPE (#2330), and it was a FALSE ACCUSATION for the module's whole life: a helper whose parameter is NAMED `policies` writes the driven set as `{ knownPolicies: policies, policies }`, and `descriptorValue` correctly returns a shorthand's NAME NODE — but `bindsParameter` asks `getSymbol()` for a ParameterDeclaration, and on a shorthand's name TypeScript resolves the PROPERTY symbol, never the value binding. The guard read false, the parameter hop never ran, and a real pin credited nothing. Measured: `freeze-provenance-conversion.test.ts:110` carries a live §4.5 refusal pin and the one-token edit `policies` → `policies: policies` moved the real-tree count 11 → 10 with nothing else touched. Ten live family tests spell it this way, so the blast radius was the dominant helper shape's twin",
    },
    {
      mode: "types",
      files: familyFixture(DERIVING(""), { [PIN_TEST_PATH]: PIN_TEST(DRIVEN_THROUGH_SPREAD) }),
      why: "THE ALIAS-AND-SPREAD SHAPE: the driven set is `[...family]` over a const the file declares. Two branches of the walk in one row — the spread element, and the alias behind it resolved through `stableTerminal`. Cut either and this row alone reds",
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
