// Policy: diagnostic-legibility (Documentation-Law.md — machine-first: an error message IS the amnesiac
// agent's documentation at the moment of blocking). Every gate/policy diagnostic STRING in the gate corpus
// must carry a resolvable pointer — a `*.md` doc path, a code-home path/file/`@orb/<pkg>` specifier — so a
// blocked cold agent gets a navigable next step, never a dead-end "no".
//
// THIS POLICY IS DELIBERATELY CONTRACT-AGNOSTIC, AND THAT OUTLIVED THE MIXED CORPUS. `tooling/src/verify/gates/**`
// carried BOTH descriptor shapes in production until #2176 Phase F (2026-09-14) retired the legacy one; a
// reader that CLASSIFIED by contract identity would have silently under-reported on whichever half it did
// not model, and the corpus moved daily. This policy never classifies, and still does not: its subject is
// the AUTHORED SYNTAX any descriptor shape shares — a `message:`/`unreadableMessage:` property assignment,
// plus the string values of a `const MSG`/`MESSAGES` table (the shorthand-`{ message }` idiom) — so the
// shape of the object around it never reaches the reader. mustFlag[1] keeps a LEGACY
// `export const gate: GateDescriptor = {…}` and mustFlag[2] a FINAL `defineGate({…})` with the identical
// defect: the SHAPE-AGNOSTIC property pinned as two rows rather than asserted in prose. The legacy row is
// now a shape control rather than a live population — the loader refuses that module — and it stays for
// exactly the property it always held.
//
// FAMILY `policy-soundness`, reader `lib/policy-descriptor-read.ts` — `staticSegments` for the diagnostic's
// static text and `isMessageProperty` for the subject. That module is the gate corpus's one descriptor
// reader and already serves `policy-soundness`, `policy-proof-expectations`, `policy-waiver-identity` and
// `policy-waiver-spelling`; this policy asks a different QUESTION of the same subject through the same
// reader, which is what §5b.4 means by a family (a shared `lib/` computation, not a theme). The private
// `literalText`/`resolveMessageText`/`unwrap` trio it used to carry is DELETED, not moved.
//
// POPULATION PORT: legacy `scanRoot: p => p.startsWith("tooling/src/verify/gates/")` plus an in-run
// `abs.includes("/tooling/src/verify/gates/") && abs.endsWith(".ts")` filter over the shared project →
// `{ in: ["@tooling"], under: ["tooling/src/verify/gates/**"] }`. Byte-identical: the source universe is
// authored `.ts`/`.tsx` only (§12.4), `_proof/` stays IN exactly as legacy had it, and no other tree
// contains that prefix. The legacy `scanRoot` existed to keep the four whole-project scanners from also
// reading this gate's example strings; the population field now IS that fence and the four are unaffected.
// LEGACY SHA `1e81658b4^` — this is the ONE member of the ten-module `policy-soundness` family that is a
// CONVERSION rather than a module born final; the other NINE have no legacy population and say so.
// (Both counts corrected 2026-09-13, LD-2319-3: the sentence said "nine-module" and "the other eight",
// written before a tenth member joined. Re-derived, not adjusted:
// `rg --files-with-matches 'family: "policy-soundness"' tooling/src/verify/gates` lists ten files —
// diagnostic-legibility · policy-binding-resolution · policy-family-readers · policy-fixture-substrate ·
// policy-legacy-imports · policy-proof-expectations · policy-refusal-coverage · policy-soundness ·
// policy-waiver-identity · policy-waiver-spelling.) Read
// by the three-question test rather than inherited: the introducing commit is `1e81658b4`
// (`git log -S 'defineGate({' --reverse -- <this file>`), the cited sha is its parent by construction, and
// the blob there is legacy (`git show 1e81658b4^:<this file>` has `defineGate` count 0).
//
// MARKER CENSUS — the private `// terse-ok:` grammar is RETIRED (§12.5 bans a gate-specific exemption
// vocabulary). Live sites on the tree at conversion: ZERO (`/usr/bin/grep -rn terse-ok packages tests
// tooling scripts docs` returns only this module's own prose and fixtures, tooling/src/verify/gates/GATE-AUTHORING.md's
// house-grammar list, `review-mirror/lib/strip.ts`'s strip list, and two docs — a fact
// `gate-config-system.md:188` already records as "zero live sites"). So legacy 0 = current 0: no marker was
// translated and none was dropped. The escape is now the central `@orb-waive diagnostic-legibility(<position>)`.
//
// THE DOOR, CHECKED (§3 "ordinary is a claim about the door"). The legacy arm reported a FILE finding with
// a synthetic `{file, line, column: 0}` anchor, which `locateFinding` (lib/ordinary-waiver.ts:394) cannot
// bind — it had no working waiver door at all. The finding is RE-ANCHORED on the property assignment node,
// whose derived position is its own property NAME (`message`, or the table key). Authored text at its exact
// offset, one position per diagnostic, so two pointerless values in one `MSG` table are separately waivable.
//
// §4.6 DIFFERENTIAL (real corpus, both sides executed — the result is in the landing commit message). Two
// classified deltas, both WIDENING, neither a catch regression:
//   1. `unreadableMessage:` joins `message:` — `isMessageProperty`'s set. A second diagnostic string the
//      runtime reports from, invisible to the legacy `getName() === "message"` test.
//   2. A diagnostic assembled from a template or a `+` chain is judged PER STATIC SEGMENT rather than over
//      the legacy `getText()` blob. Legacy concatenated across an interpolation, so a pointer could be
//      satisfied by text that never appears contiguously in any rendered message; per-segment is strictly
//      stricter and is the intentional correction. A wholly dynamic value still yields no segments and is
//      SKIPPED, exactly as the legacy `undefined` was.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `diagnostic-legibility` descriptor at d07338082afc3525bdc2b0813d7ce451087dd40f, the parent of the conversion
// `1e81658b4` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,437 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 285 and final `population` admits 285. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `tooling/src/verify/gates/_proof/__cbbhr_in_client-vendors.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { ObjectLiteralExpression, PropertyAssignment } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { isMessageProperty, staticSegments } from "../lib/policy-descriptor-read.ts";

// A pointer token: a doc, a concrete source file, a code dir path, or an @orb package specifier.
const MD = /[\w.-]+\.md\b/u;
const SRC_FILE = /\b[\w-]+\.(?:ts|tsx)\b/u;
const CODE_DIR =
  /(?:^|[\s(/"'`])(?:packages|tooling|features|domain|infra|foundation|entry|transport|contracts?|kit|db|server|client|ui|tools|scripts|tests|lib|data|forms|state|hooks|surfaces|anchors|components|engine|substrate|persistence|verbs|guard)\//u;
const PKG_SPEC = /@orb\/[\w-]+/u;
const MSG_TABLE_NAME = /^(?:MSG|MESSAGES)$/u;

const MESSAGE =
  "a gate/policy diagnostic carries no pointer — end the message with a `<Doc>.md §N` doc path or a code-home (packages/…, features/…, an @orb/… specifier, or a concrete file.ts), because the error message IS the blocked amnesiac agent's documentation (Documentation-Law.md) and a pointerless message is a dead-end 'no'.";
const FIX =
  "end the message with a `<Doc>.md §N` doc path or a code-home (packages/…, an @orb/… specifier, or a concrete file.ts). A diagnostic that genuinely needs none waives with `@orb-waive diagnostic-legibility(<position>): <why the fix is self-contained + end condition>`, where the position is the PROPERTY NAME the diagnostic is bound to — `message` for a `message:` property, the table key for a `const MSG`/`MESSAGES` entry — never the string itself.";

/** Does the diagnostic text itself carry a resolvable doc/code-home pointer? */
export function hasPointer(text: string): boolean {
  return MD.test(text) || SRC_FILE.test(text) || CODE_DIR.test(text) || PKG_SPEC.test(text);
}

/** The `const MSG = { … }` / `const MESSAGES = { … }` object a property belongs to, or undefined. The
 *  shorthand-`{ message }` idiom: the diagnostic never appears at a `message:` property at all, so the
 *  TABLE is the subject. `as const` / `satisfies` / parentheses are unwrapped on the way up. */
function messageTableOwner(object: ObjectLiteralExpression): boolean {
  let cursor: Node = object.getParent();
  while (Node.isAsExpression(cursor) || Node.isSatisfiesExpression(cursor) || Node.isParenthesizedExpression(cursor)) {
    cursor = cursor.getParent();
  }
  return Node.isVariableDeclaration(cursor) && MSG_TABLE_NAME.test(cursor.getName());
}

/** Is this property assignment a gate diagnostic? Either a `message:`/`unreadableMessage:` property (the
 *  shared reader's set) or any value of a `const MSG`/`MESSAGES` table. */
function isDiagnosticProperty(property: PropertyAssignment): boolean {
  if (isMessageProperty(property)) {
    return true;
  }
  const parent = property.getParent();
  return Node.isObjectLiteralExpression(parent) && messageTableOwner(parent);
}

export const gate = defineGate({
  id: "diagnostic-legibility",
  family: "policy-soundness",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@tooling"], under: ["tooling/src/verify/gates/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node): void => {
          if (!(Node.isPropertyAssignment(node) && isDiagnosticProperty(node))) {
            return;
          }
          const { segments } = staticSegments(unwrapExpression(node.getInitializerOrThrow()));
          // No readable static text at all is the legacy `undefined` — a dynamic diagnostic is a declared
          // limit, never a guessed finding.
          if (segments.length > 0 && !segments.some(hasPointer)) {
            ctx.report.node(node, { message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "tooling/src/verify/gates/x.ts": 'export const gate = { message: "a bare diagnostic with no home" };\n' },
      expect: { count: 1, token: "message" },
      why: "the founding shape — a gate `message:` with no doc/code-home pointer, so the amnesiac agent it blocks gets a dead-end 'no'",
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/contract/gate.ts": "export interface GateDescriptor {\n  readonly name: string;\n  readonly message: string;\n}\n",
        "tooling/src/verify/gates/legacy-half.ts":
          'import type { GateDescriptor } from "../contract/gate.ts";\nexport const gate: GateDescriptor = { name: "legacy-half", message: "no home for this rule" };\n',
      },
      expect: { count: 1, token: "message" },
      why: "THE SHAPE CONTROL: a LEGACY `GateDescriptor` object literal. The corpus can no longer HOLD one — `lib/loader.ts` refuses it at load since #2176 Phase F (2026-09-14) — but this reader walks SOURCE, not the loaded corpus, and a reader that classified by contract identity rather than by the fields it actually needs would under-report on any shape it did not recognise. The row is kept for that property, not for a live population: the legacy half asserted as a row rather than as prose",
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/contract/policy.ts": "export function defineGate<Policy>(policy: Policy): Policy {\n  return policy;\n}\n",
        "tooling/src/verify/gates/final-half.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst MESSAGE = "no home for this rule either";\nexport const gate = defineGate({ id: "final-half", message: MESSAGE });\n',
      },
      expect: { count: 1, token: "message" },
      why: "THE MIXED-RUNTIME HALF #2: a FINAL `defineGate({…})` whose message is resolved one hop through a module const. Same defect, same single finding, same reported position as the legacy half above — which is what 'contract-agnostic' means, measured",
    },
    {
      mode: "types",
      files: { "tooling/src/verify/gates/table.ts": 'const MSG = { verb: "bare table diagnostic" } as const;\nexport const use = MSG.verb;\n' },
      expect: { count: 1, token: "verb" },
      why: "a pointerless value in a `const MSG` object table (the shorthand-`{ message }` idiom, where the diagnostic never sits at a `message:` property at all) — and the position is the TABLE KEY, so two bad entries in one table are separately waivable",
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/gates/unreadable.ts":
          'export const gate = { message: "see Documentation-Law.md", unreadableMessage: "could not read it, give up" };\n',
      },
      expect: { count: 1, token: "unreadableMessage" },
      why: 'INTENTIONAL WIDENING over legacy (§4.6 delta 1): `unreadableMessage` is the #944 third answer\'s own diagnostic and the shared reader counts it as a message property. The legacy `getName() === "message"` test was blind to it, so a fail-closed arm could ship a dead-end message while the pointer-bearing `message:` beside it passed. The pointer-bearing sibling in the SAME fixture is what makes the count exactly 1',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "tooling/src/verify/gates/ok.ts": 'export const gate = { message: "the fix lives in packages/ui/src/x.ts" };\n' },
      why: "a gate message carrying a concrete code-home pointer (packages/…/x.ts) — a navigable next step, passes",
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/gates/tooling-home.ts": 'export const gate = { message: "the name is not a real gate file in tooling/src/verify/gates/" };\n',
      },
      why: "`tooling/` IS a code home — the @orb/tooling root joined the pointer vocabulary at the P6 verify move, and without it every message that navigates a reader to the tool tree reads as a dead-end",
    },
    {
      mode: "types",
      files: { "tooling/src/verify/gates/dynamic.ts": "export const gate = { message: buildMessage(count) };\n" },
      why: "DECLARED LIMIT, carried from the legacy `resolveMessageText` returning undefined: a diagnostic whose value is not statically readable yields NO segments and is skipped rather than guessed into a finding. The row dies if the reader ever starts inventing text for a dynamic value",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/chat/outside.ts": 'export const gate = { message: "a bare diagnostic with no home" };\n',
        "tooling/src/verify/gates/clean.ts": 'export const gate = { message: "see Documentation-Law.md" };\n',
      },
      why: "THE POPULATION FENCE, and the only row that dies without it: the identical pointerless `message:` outside `tooling/src/verify/gates/**` is not a gate diagnostic and is not this policy's business (the four whole-project scanners pin their own roots to exclude this tree; this population is the other side of that fence). Delete the `under:` and this row alone reds",
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/gates/waived.ts":
          '// @orb-waive diagnostic-legibility(message): the proof\'s stand-in reason; ends when this fixture stops flagging.\nexport const gate = { message: "a bare diagnostic with no home" };\n',
      },
      why: "POSITIONAL IDENTITY (§4.2's twin): the finding is anchored on the PROPERTY ASSIGNMENT, so its derived position is the property name `message` — authored text at its exact offset, which the legacy file-anchored finding never was (it had no working waiver door at all). The fixture is mustFlag[1] plus the marker line, so exactly ONE occurrence exists for the one marker to consume",
    },
  ],
});
