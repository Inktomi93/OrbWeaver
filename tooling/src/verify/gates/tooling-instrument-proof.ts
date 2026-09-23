// Policy: tooling-instrument-proof (docs/law/Core-Tooling-Law.md §4.5) — an instrument-classed
// tool (INSTRUMENT_TOOLS, tooling/src/_shared/instruments.ts) owes TWO proof classes in tests/tooling/<tool>/:
// `@instrument-proof:` (a planted DEFECT must RED) and `@instrument-absence-proof:` (a removed apparatus /
// empty population must NOT read clean). Arms per class: (B) a member with no marker; (C) a marker in a
// NON-member's tree; (D) a malformed bare marker. Plus (A) a member with no tooling/src/<tool>/ DIRECTORY,
// (E) an unreadable registry, and (F) a member bypassing the shared printVerdict denominator door.
//
// comments-INTENDED: the marker IS a comment; the matcher anchors on the comment OPENER (mention-fence).
// THE PROOF MARKERS ARE NOT SUPPRESSIONS. `@instrument-proof` / `@instrument-absence-proof` are a positive
// EVIDENCE vocabulary this policy counts, not an exemption grammar, so nothing here translates to
// `@orb-waive` and the retiring-a-private-marker-vocabulary census does not apply (measured: zero live
// `@orb-gate-ignore` markers name this gate).
//
// FAMILY `tooling-instrument-proof` — a declared SINGLETON. Its subject is ONE registry and the proof
// vocabulary attached to it; no sibling policy judges either. Shared readers it consumes, as module +
// function: `lib/tuple-read.ts` `readTupleDeclaration` (the #947 spread-safe registry read),
// `lib/project-home-origin.ts` `locateProjectHome`/`classifyProjectHomeOrigin` (arm F's identity),
// `lib/absent-subject-anchor.ts` `subjectAnchor` (arm E's anchor). Shared primitives group nothing.
//
// POPULATION PORT: byte-identical. The legacy descriptor's `scanRoot` was
// `p === REGISTRY || p.startsWith("tests/tooling/") || p.startsWith("tooling/src/")` (pre-conversion SHA
// 250c9eb60); `@tooling` IS `tooling/src/`, and `tests/tooling/**` names the other half. No `ext` filter, so
// the `.tsx` half of `tests/tooling/**` stays admitted exactly as the legacy prefix test admitted it.
//
// §12.6 SHAPE DEVIATION, reported: the ruled row reads "syntax/resource visitors plus `evaluate`". The
// ARITY holds (one hard policy) and the resource half is real, but the marker scan is COMMENT POSTURE —
// comments are trivia, not kind-indexed nodes — and guide §2's own capability table names `visitFile` as
// the capability for exactly that. So the hooks are visitors + visitFile + evaluate. Nothing else changes.
//
// THE FILESYSTEM READ IS NOW A DECLARED DOOR. Arm A was `existsSync(join(ctx.root, "tooling/src", member))`
// and `fsBacked: true`; it is now `{ kind: "authored-path" }`, the DEMAND identity door
// (`contract/resource-path.ts`), asked one selector per registry member. Two deliberate deltas:
//   STRONGER — `existsSync` is true for a FILE, so `tooling/src/<tool>.ts` satisfied a directory claim. The
//   door answers `directory` explicitly, so it no longer does (`mustFlag[0]`'s sibling `mustFlag[1]`).
//   NEW THIRD ANSWER (#944) — `outside` (a selector reaching out of the checkout through an in-repo
//   symlink, which `existsSync` and `trackedFiles` both pass) and `unresolved` are neither live nor dead:
//   they are "I could not judge", with their own message and their own row (`mustFlag[2]`).
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back non-ready makes
// `resolveResourceDeclarations` (`lib/resource-declaration.ts`) THROW at the POPULATION phase and the owner
// is withheld before `create` runs (guide §3's acquisition-refusal rule). This module owns no not-ready branch: it reads the
// door through `readyResourceValue`, whose throw asserts that refusal. `authored-path` is an UNPOPULATED
// DEMAND kind, so its declaration admits no path and the door MUST be called on every run or the receipt
// phase refuses the unconsumed declaration — which is why the blind-registry arm still demands one selector
// before it returns (the `runner-config-path-liveness` precedent).
//
// ARM F IS AN IDENTITY UPGRADE, not a port. The legacy arm keyed on the module SPECIFIER plus the local
// binding name (`lib/symbol-reference.ts`), which #1506 had already shown to be one `import * as` from
// silent. It now locates `tooling/src/_shared/artifacts.ts` as a PROJECT HOME and classifies each candidate
// call through `classifyProjectHomeOrigin`, so an alias, a namespace member in either spelling, and a
// name-preserving re-export all resolve to the same canonical export — and a same-named `printResult` from
// another module resolves to `other` rather than needing a hand-written negative. The FILE prefilter in front
// of it (the file must import the artifacts specifier) is the legacy fence kept verbatim so the candidate
// set cannot widen; it is what makes the barrel DECLARED LIMIT below exactly the legacy limit.
//
// THAT FENCE'S §4.1 CELL WAS RE-CUT AND ITS RECORDED VERDICT NO LONGER HOLDS (lane `p-hooks-wave-refute`,
// and the reason is a change in this same commit). It was recorded as ENFORCED — *"removing it REDS
// `mustPass[4]`, because … `printVerdict` … comes back `unreadable`"* — which was TRUE while arm F
// classified every call in the file. With the NAME prefilter below, `printVerdict` is not a candidate at
// all, so the file fence no longer guards that subject: re-cut in the §4.1 direction
// (`if (tool === null || !importsArtifacts(sourceFile))` → `if (tool === null)`), driven against THIS
// policy through `verifyPolicyProofs` with the anchor asserted to occur exactly once, it now comes back
// `ROWS_DIED=0`. Harness control in the same session: cutting `namesTheDoor` reds exactly one row
// (`mustPass[5]`), so the cut reaches the code. The honest classification is §4.1 MUTUALLY REDUNDANT for
// CORRECTNESS — it is kept as a per-file speed fence and as the carrier of the barrel limit, both of which
// a proof row cannot express, and it is documented here rather than given a row that discriminates
// nothing. A home that cannot be located at all is arm F's own blindness tripwire (`mustFlag[9]`).
//
// AND ARM F HAD NO NAME PREFILTER, SO ITS FAIL-CLOSED THIRD ANSWER ACCUSED 654 CORRECT CALLS (#1950 D1,
// refuted at `ac0085c91` by a real-tree run). The identity upgrade above is right; what shipped with it
// was a CANDIDATE SET of every call in a file that imports the artifacts door. `classifyProjectHomeOrigin`
// routes through `resolveModuleMemberOrigin`, which cannot place a language builtin or a method on a local
// value, so `classifyOriginRefusal` answered `unreadable` and arm F reported it as never-a-pass: 654
// findings across 67 files — 582 ambient globals (`String` 259, `JSON` 89, `Promise` 78, `Number` 48,
// `Math` 39, `Object` 29, `Date` 27, `Array` 13) and 57 ordinary method calls (`file.write(…)`,
// `cdp.send(…)`, `arg.startsWith(…)`), not one of which could ever have been the door.
//
// THE FIX IS THE COMPANION RULE `lib/origin-verdict.ts` ALREADY OWNS, not a per-shape exclusion: *"prefilter
// on the name, resolve the identity, and fail closed only inside the candidate set."* That module's header
// records the identical failure one family over — an unprefiltered `NewExpression` arm accusing
// `new TRPCError(…)` of being node's `EventEmitter`. `referenceNamesExport` is the prefilter, and it is a
// NAME test that survives every spelling this arm exists to catch (alias, namespace, bracket, barrel), so
// identity still decides every candidate. Real tree after: 654 → 0, measured over one workspace Project
// with all three of this lane's policies driven through `runPolicyPass`. `mustPass[5]` is its row.
//
// THE DEVIATION, STATED (lane `p-hooks-wave-refute`): the refutation ruled a narrower fix — resolve the
// ambient global first and classify it `other`. That is correct and it was built and MEASURED: it takes
// the real tree to 57, leaving every non-global unjudgeable call still accused. The name prefilter
// subsumes it (a builtin does not name the door), which would leave the global reader unreachable behind
// it — dead code with a confident paragraph — so only one of the two ships.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-instrument-proof` descriptor at c19da53c3baa600b50c3a569830b77d2037b45fb, the parent of the conversion
// `ac0085c91` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `250c9eb60`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,476 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,614 and final `population` admits 1,614.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `tests/tooling/__cbbhr_in__ct-stories.tsx` (virtual)
// admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { AuthoredPathIdentity } from "../contract/resource-path.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { referenceNamesExport } from "../lib/origin-verdict.ts";
import type { LocatedProjectHome } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { readTupleDeclaration } from "../lib/tuple-read.ts";

const REGISTRY = "tooling/src/_shared/instruments.ts";
const REGISTRY_CONST = "INSTRUMENT_TOOLS";
const PRINT_RESULT = "printResult";
const ARTIFACTS_HOME = { path: "tooling/src/_shared/artifacts.ts", names: [PRINT_RESULT] } as const;
const ANCHOR = "tooling/src/_shared/exit-contract.ts";
const TESTS_PREFIX = "tests/tooling/";
const TOOLING_SOURCE = "tooling/src/";
const LAW = "docs/law/Core-Tooling-Law.md §4.5";

/** The TWO proof classes. A planted-defect proof answers "does the instrument bite?"; an ABSENCE proof
 *  answers the strictly harder question "when the instrument could not measure, does it say so?" — the
 *  #409 class, where a blind zero renders as a clean verdict. Neither substitutes for the other: an
 *  instrument can red correctly on a plant and still report `0 findings, PASS` over a page it never
 *  censused, and that second failure is the one nobody notices.
 *
 *  Comment-OPENER match only (the mention fence): a prose/string mention of either marker never counts.
 *  A Record, not a switch — a third proof class is a row, and tsc then requires every consumer to handle it. */
const PROOF_CLASSES = {
  defect: {
    marker: "@instrument-proof",
    re: /^\s*\/\/ @instrument-proof:(?<reason>.*)$/u,
    owes: "a planted-defect proof (plant the defect class, assert the instrument REDs)",
  },
  absence: {
    marker: "@instrument-absence-proof",
    re: /^\s*\/\/ @instrument-absence-proof:(?<reason>.*)$/u,
    owes: "an ABSENCE proof (remove the apparatus or empty the population, assert the run does NOT read clean)",
  },
} as const;

type ProofClass = keyof typeof PROOF_CLASSES;
const PROOF_CLASS_NAMES = Object.keys(PROOF_CLASSES) as readonly ProofClass[];

const MESSAGE = `the instrument-proof contract is broken — every ${REGISTRY_CONST} member owes BOTH proof classes, both vocabularies are two-sided, the registry must stay readable, and registered tools must enter the shared printVerdict denominator door instead of calling ${PRINT_RESULT} directly (${LAW}).`;
const FIX = `add the missing marker-carrying proof test, register the tool, delete the stale/malformed marker, or route the registered instrument's RESULT through printVerdict with declared denominators.`;

interface MarkerHit {
  readonly path: string;
  readonly line: number;
  readonly tool: string;
  readonly kind: ProofClass;
  readonly malformed: boolean;
}

interface Member {
  readonly name: string;
  readonly node: MorphNode;
}

/** The instrument tool a `tooling/src/…` path belongs to, or null for the shared and verify trees. */
function instrumentToolOf(path: string): string | null {
  if (!path.startsWith(TOOLING_SOURCE)) {
    return null;
  }
  const tool = path.slice(TOOLING_SOURCE.length).split("/")[0] ?? "";
  return tool === "" || tool === "_shared" || tool === "verify" ? null : tool;
}

const importsArtifacts = (sourceFile: SourceFile): boolean =>
  sourceFile
    .getImportDeclarations()
    .some(
      (declaration) =>
        declaration.getModuleSpecifierValue().endsWith("_shared/artifacts") || declaration.getModuleSpecifierValue().endsWith("_shared/artifacts.ts"),
    );

/** Is this call's callee a REFERENCE expression at all — the only shape the origin reader can judge? */
function calleeReference(call: MorphNode): MorphNode | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  return Node.isIdentifier(callee) || Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee) ? callee : undefined;
}

/** Is this callee a CANDIDATE — does it NAME the home's export, in any spelling this policy must catch?
 *
 *  THE NAME PREFILTER IS WHAT MAKES FAIL-CLOSURE SAFE HERE, and it is `lib/origin-verdict.ts`'s own rule,
 *  quoted in that module's header: *"Fail-closed reporting is correct for a CANDIDATE whose identity cannot
 *  be read; applied to every node of a kind in a population it converts each unreadable node into an
 *  accusation. Prefilter on the name, resolve the identity, and fail closed only inside the candidate
 *  set."* Arm F shipped without it and classified EVERY call in a candidate file, so every call whose
 *  origin the module reader cannot place became an `unreadable` accusation: 654 findings across 67 files
 *  on the real tree (#1950 D1) — 582 language builtins (`String` 259, `JSON` 89, `Promise` 78, `Number`
 *  48, `Math` 39, `Object` 29, `Date` 27, `Array` 13) and 57 ordinary method calls on local values
 *  (`file.write(…)`, `cdp.send(…)`, `arg.startsWith(…)`), none of which could ever have been the door.
 *
 *  IT DOES NOT WEAKEN THE IDENTITY UPGRADE, which is the whole point of the arm: `referenceNamesExport`
 *  follows an import ALIAS to its original exported name and reads a member in either spelling, so the
 *  aliased (`mustFlag[10]`), namespace (`[11]`), bracket (`[12]`) and name-preserving barrel (`[13]`)
 *  bypasses all stay candidates, and the same-named `printResult` from another module (`mustPass[6]`) is
 *  still admitted as a candidate and acquitted by IDENTITY rather than by spelling. What the prefilter
 *  removes is only nodes that do not name the door at all. */
const namesTheDoor = (callee: MorphNode): boolean => referenceNamesExport(callee, PRINT_RESULT);

export const gate = defineGate({
  id: "tooling-instrument-proof",
  family: "tooling-instrument-proof",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling", "@tests"], under: [`${TOOLING_SOURCE}**`, `${TESTS_PREFIX}**`] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-path" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const members: Member[] = [];
    const markers: MarkerHit[] = [];
    const bypasses: { readonly node: MorphNode; readonly tool: string }[] = [];
    const unjudgedCalls: { readonly node: MorphNode; readonly tool: string }[] = [];
    let sources: readonly string[] = [];
    let registrySeen = false;
    let home: LocatedProjectHome | undefined;

    const artifactsHome = (): LocatedProjectHome => {
      home ??= locateProjectHome(ctx.files, (file) => ctx.relativePath(file), ARTIFACTS_HOME);
      return home;
    };

    type Report = (node: MorphNode, detail: string) => void;

    /** Arm A for ONE member: live directory, dead row, or the unjudgeable third answer. */
    const judgeMemberHome = (member: Member, identity: AuthoredPathIdentity | undefined, report: Report): boolean => {
      const selector = `${TOOLING_SOURCE}${member.name}`;
      if (identity === undefined || identity.status === "outside" || identity.status === "unresolved") {
        report(
          member.node,
          `${REGISTRY_CONST} names "${member.name}" and its ${selector} selector could not be judged as a tree identity at all — that is "I could not measure", never "clean" (${LAW}).`,
        );
        return false;
      }
      if (identity.status !== "directory") {
        report(
          member.node,
          `${REGISTRY_CONST} names "${member.name}" but ${selector}/ is not a live directory — a dead registry row is a loaded gun (${LAW}).`,
        );
        return false;
      }
      return true;
    };

    /** Arm A + the per-member proof pair, over one authored-path identity per registry member. */
    const judgeMembers = (identities: ReadonlyMap<string, AuthoredPathIdentity>, report: Report): void => {
      for (const member of members) {
        if (!judgeMemberHome(member, identities.get(`${TOOLING_SOURCE}${member.name}`), report)) {
          continue;
        }
        for (const kind of PROOF_CLASS_NAMES) {
          if (!markers.some((hit) => hit.tool === member.name && hit.kind === kind && !hit.malformed)) {
            report(
              member.node,
              `instrument "${member.name}" has no \`${PROOF_CLASSES[kind].marker}\` test — it owes ${PROOF_CLASSES[kind].owes}; without it a verdict tool ships a green that cannot fail (${LAW}).`,
            );
          }
        }
      }
    };

    /** Arm F's two verdicts, both fenced to REGISTERED instruments: a resolved bypass, and a call the
     *  origin reader could not judge at all inside a file that reaches the shared door. */
    const judgeVerdictDoor = (memberNames: ReadonlySet<string>, report: Report): void => {
      for (const bypass of bypasses.filter((candidate) => memberNames.has(candidate.tool))) {
        report(
          bypass.node,
          `registered instrument "${bypass.tool}" calls ${PRINT_RESULT} directly — route its verdict through printVerdict with declared denominators so an empty population cannot read clean (arm F; ${LAW}).`,
        );
      }
      for (const unjudged of unjudgedCalls.filter((candidate) => memberNames.has(candidate.tool))) {
        report(
          unjudged.node,
          `registered instrument "${unjudged.tool}" calls something this policy could not resolve to an origin, inside a file that imports the shared artifacts door — arm F is UNJUDGED here, which is never a pass (${LAW}). Sources: ${sources.length === 0 ? "<none>" : sources.join("+")}.`,
        );
      }
    };

    /** One test file's marker census — comment posture, so a line scan rather than a node walk. */
    const scanMarkers = (path: string, text: string): void => {
      const tool = path.slice(TESTS_PREFIX.length).split("/")[0] ?? "";
      if (tool === "" || tool.endsWith(".ts") || tool.endsWith(".tsx")) {
        return; // flat tests/tooling files belong to no tool mirror
      }
      for (const [index, lineText] of text.split("\n").entries()) {
        for (const kind of PROOF_CLASS_NAMES) {
          const match = PROOF_CLASSES[kind].re.exec(lineText);
          if (match !== null) {
            markers.push({ path, line: index + 1, tool, kind, malformed: (match.groups?.["reason"] ?? "").trim() === "" });
          }
        }
      }
    };

    /** Arms C and D: the marker vocabulary is two-sided, and a reasonless marker is not protection. */
    const judgeMarkerIntegrity = (memberNames: ReadonlySet<string>): void => {
      for (const hit of markers) {
        const detail = hit.malformed
          ? `malformed \`${PROOF_CLASSES[hit.kind].marker}\` marker — the reason (${PROOF_CLASSES[hit.kind].owes}) is REQUIRED (${LAW}).`
          : `\`${PROOF_CLASSES[hit.kind].marker}\` marker in "${hit.tool}"'s tree, but "${hit.tool}" is not in ${REGISTRY_CONST} — register it or delete the marker (${LAW}).`;
        if (hit.malformed || !memberNames.has(hit.tool)) {
          ctx.report.file(hit.path, { line: hit.line, column: 1, message: `${MESSAGE} ${detail}`, fix: FIX });
        }
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile: SourceFile) => {
            if (ctx.relativePath(sourceFile) !== REGISTRY || !Node.isVariableDeclaration(node) || node.getName() !== REGISTRY_CONST) {
              return;
            }
            registrySeen = true;
            if (node.getInitializer() === undefined) {
              return;
            }
            const vocabulary = readTupleDeclaration(node);
            sources = vocabulary.sources;
            // The member's OWN element node, so a row spread in from a sibling module reports at that
            // module's line rather than at the spread that composed it (#947).
            for (const member of vocabulary.entries) {
              members.push({ name: member.value, node: member.node });
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile: SourceFile) => {
            const path = ctx.relativePath(sourceFile);
            const tool = instrumentToolOf(path);
            // The legacy candidate fence, verbatim: only a file that imports the artifacts module can reach
            // its door, and classifying every call in `tooling/src` would resolve symbols for tens of
            // thousands of nodes. It reads like a pure performance prefilter and is NOT one — cutting it
            // reds `mustPass[4]`, because the fail-closed arm then fires on a file whose verdict door is a
            // module the fixture never plants (§4.1 cut receipt in the header).
            if (tool === null || !importsArtifacts(sourceFile)) {
              return;
            }
            const callee = calleeReference(node);
            if (callee === undefined || !namesTheDoor(callee)) {
              return;
            }
            const verdict = classifyProjectHomeOrigin(callee, artifactsHome());
            if (verdict === "home") {
              bypasses.push({ node, tool });
            }
            if (verdict === "unreadable") {
              unjudgedCalls.push({ node, tool });
            }
          },
        },
      ],
      visitFile: (sourceFile) => {
        const path = ctx.relativePath(sourceFile);
        if (path.startsWith(TESTS_PREFIX)) {
          scanMarkers(path, sourceFile.getFullText());
        }
      },
      evaluate: () => {
        const present = new Set(ctx.files.map((file) => ctx.relativePath(file)));
        ctx.receipt({ kind: "population", source: "instrument-proof-corpus", members: ctx.files.length, unresolved: 0 });
        const anchor = subjectAnchor(present, [REGISTRY, ANCHOR]);
        const report = (node: MorphNode, detail: string): void => ctx.report.node(node, { message: `${MESSAGE} ${detail}`, fix: FIX });

        if (present.has(ANCHOR) && !registrySeen) {
          ctx.report.file(anchor(REGISTRY), {
            line: 1,
            column: 1,
            message: `${MESSAGE} ${REGISTRY_CONST} could not be read — the registry moved/renamed and this gate is blind. Re-point the gate (${LAW}).`,
            fix: FIX,
          });
          // The demand door refuses a zero-subject call by contract, and an unconsumed declaration is a tool
          // error, so a blind run demands the one selector it can always name.
          readyResourceValue(ctx.resources.authoredPaths([anchor(REGISTRY)]));
          return;
        }
        const selectors = members.length === 0 ? [anchor(REGISTRY)] : members.map((member) => `${TOOLING_SOURCE}${member.name}`);
        const index = readyResourceValue(ctx.resources.authoredPaths(selectors));
        const identities = new Map(index.identities.map((identity) => [identity.selector, identity]));
        judgeMembers(identities, report);
        const memberNames = new Set(members.map((member) => member.name));
        judgeMarkerIntegrity(memberNames);
        judgeVerdictDoor(memberNames, report);
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["ghost"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
      },
      expect: { count: 1, token: '"ghost"', messageIncludes: "is not a live directory" },
      why: "a registry row naming a tool with no dir — the rename tripwire (arm A). The finding anchors on the registry ELEMENT, so the token is the dead member itself",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["ghost"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/ghost.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "is not a live directory" },
      why: "THE DELIBERATE STRENGTHENING: the legacy `existsSync` was satisfied by a FILE at that path, so `tooling/src/ghost.ts` proved a directory claim it never checked. The authored-path door answers `file` here and the row stays RED",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["ghost"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        // The link ESCAPES the fixture root, so git must not track it.
        ".gitignore": "tooling/src/ghost\n",
      },
      links: { "tooling/src/ghost": "../../.." },
      expect: { count: 1, messageIncludes: "could not be judged as a tree identity" },
      why: "THE #944 THIRD ANSWER, and a read `existsSync` structurally could not make: an in-repo SYMLINK whose target is outside the checkout satisfies both `existsSync` and tracked membership, and only the authored-path door's realpath containment sees the escape. Pinned by `messageIncludes` because the fail-closed arm produces the same COUNT as the dead-row verdict",
    },
    {
      // THE #947 SPLIT: the member arrives through an imported spread. A direct-element reader saw only
      // "snapx" and the spread-in instrument owed no proof pair at all.
      mode: "resource",
      files: {
        "tooling/src/_shared/instrument-core.ts": 'export const CORE_INSTRUMENTS = ["ghost"] as const;\n',
        [REGISTRY]: `import { CORE_INSTRUMENTS } from "./instrument-core.ts";\nexport const ${REGISTRY_CONST} = [...CORE_INSTRUMENTS, "snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/ghost/index.ts": "export {};\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      expect: { count: 2, messageIncludes: "ghost" },
      why: 'THE #947 SPLIT RED: `[...CORE_INSTRUMENTS, "snapx"]` — the locally-written member is fully proven, and the SPREAD member owes both proof classes. Before the resolver it was not a subject at all, so a registry could shed its whole core into a sibling module and go green',
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "export const t = 1;\n",
      },
      expect: { count: 2, messageIncludes: "has no" },
      why: "a registered instrument whose mirror tree carries NEITHER proof class — one finding per class, so a missing absence proof can never hide behind a present defect proof (arm B ×2)",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "// @instrument-proof: plants a contrast failure and asserts the audit reds\nexport const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: "@instrument-absence-proof" },
      why: "THE FOUNDING SHAPE OF THE ABSENCE ARM — an instrument that proves it BITES but never proves it refuses to report clean when it measured nothing (#409's class). Before this arm, exactly this shape was fully compliant",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = [] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tests/tooling/rogue/x.test.ts":
          "// @instrument-absence-proof: empties the population and asserts the run refuses to read clean\nexport const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: `not in ${REGISTRY_CONST}` },
      why: "an ABSENCE marker in an unregistered tool's tree — the second vocabulary is two-sided from birth, exactly like the first (arm C)",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/cli.test.ts": "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof:\nexport const t = 1;\n",
      },
      expect: { count: 2, messageIncludes: "malformed" },
      why: "a bare ABSENCE marker with no reason — it reds as its own flavour AND does not satisfy the class it names, so the instrument still owes an absence proof (arm D + arm B)",
    },
    {
      mode: "resource",
      files: {
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
      },
      expect: { count: 1, messageIncludes: "could not be read" },
      why: "the anchor present but the registry gone — the blindness tripwire (arm E). THE ANCHOR MOVE IS THIS ROW: the verdict names a file that does not exist, so it reports at the first present named subject and carries the missing path in its message, where the legacy `REGISTRY:0:0` anchor now throws through the report sink",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts": `import { ${PRINT_RESULT} } from "../../_shared/artifacts.ts";\nexport function run(): void { ${PRINT_RESULT}("snapx", []); }\n`,
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: "arm F is UNJUDGED here" },
      why: "ARM F'S OWN BLINDNESS TRIPWIRE, and the arm the identity upgrade creates: the artifacts HOME is gone, so no reference can be resolved to it and every candidate call is the #944 third answer. A verdict-door gate that cannot find the door must say so, never pass",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts": `import { ${PRINT_RESULT} as emit } from "../../_shared/artifacts.ts";\nexport function run(): void { emit("snapx", []); }\n`,
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: `calls ${PRINT_RESULT} directly` },
      why: "a registered instrument bypassing the shared denominator door through an ALIASED import — the local name is `emit`, so only canonical-export identity sees it (arm F)",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts": `import * as artifacts from "../../_shared/artifacts.ts";\nexport function run(): void { artifacts.${PRINT_RESULT}("snapx", []); }\n`,
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: `calls ${PRINT_RESULT} directly` },
      why: "#1506: the NAMESPACE spelling of the same bypass. The legacy arm read NAMED imports only, so this example produced ZERO findings — the gate that exists to stop an instrument shipping an unfalsifiable green was itself one `import * as` from silent",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts": `import * as artifacts from "../../_shared/artifacts.ts";\nexport function run(): void { artifacts["${PRINT_RESULT}"]("snapx", []); }\n`,
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: `calls ${PRINT_RESULT} directly` },
      why: "#1506: the bracket spelling of the namespace bypass — one reference, one finding, whichever way it is written",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/_shared/artifacts-barrel.ts": `export { ${PRINT_RESULT} } from "./artifacts.ts";\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts": `import { ${PRINT_RESULT} } from "../../_shared/artifacts.ts";\nimport { ${PRINT_RESULT} as viaBarrel } from "../../_shared/artifacts-barrel.ts";\nexport function run(): void { void ${PRINT_RESULT}; viaBarrel("snapx", []); }\n`,
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: `calls ${PRINT_RESULT} directly` },
      why: "THE RE-EXPORT DOOR, which no spelling-keyed reader can see: the call goes through a barrel that name-preservingly re-exports the same canonical symbol, and the file's direct artifacts import is never called. Only canonical-export identity resolves it to the same home. DECLARED LIMIT, stated here because this fixture is where a reader would otherwise infer the opposite: the unused direct import is what makes the file a CANDIDATE — the inherited prefilter keys on the artifacts specifier, so a file reaching the door ONLY through a barrel is not examined at all. That limit is the legacy fence's, unchanged by this conversion (the legacy arm additionally required a local binding, so it saw strictly less), and closing it is a candidate-set widening with its own performance measurement, not a conversion decision",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "tooling/src/_shared/instrument-core.ts": 'export const CORE_INSTRUMENTS = ["ghost"] as const;\n',
        [REGISTRY]: `import { CORE_INSTRUMENTS } from "./instrument-core.ts";\nexport const ${REGISTRY_CONST} = [...CORE_INSTRUMENTS, "snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/ghost/index.ts": "export {};\n",
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/ghost/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      why: "the SPLIT's green half: both the spread-in and the locally-written member carry both reasoned proof markers — resolving the spread widens the obligation set, never the accusation",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a dead class in a fixture tree and asserts the scan REDs on it\nexport const t = 1;\n",
        "tests/tooling/snapx/absence.test.ts":
          "// @instrument-absence-proof: removes the in-page collector and asserts the run reports an INSTRUMENT ERROR, never 0 findings\nexport const t = 1;\n",
      },
      why: "a registered instrument carrying BOTH reasoned proof markers — the honourable shape. The two may live in one file or two; the gate asks for the CLASSES, not a file layout",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = [] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
      },
      why: "an EMPTY registry is legal-armed (P1 state — members join as their tools land); emptiness is not blindness. It is also the row that holds the DEMAND-DOOR contract: with zero members there is no member selector, and the door still has to be called with one subject or the receipt phase refuses the unconsumed declaration",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/proof.test.ts":
          '// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nconst doc = "the grammar is `// @instrument-absence-proof: <reason>`";\nexport const t = doc;\n',
      },
      why: "DECLARED LIMIT, written down: a marker QUOTED inside a string is a MENTION, not a use — the matcher anchors on the comment OPENER, so documentation of the vocabulary never registers a proof nor trips the two-sided arm",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts":
          'import { printVerdict } from "../../_shared/evidence.ts";\nexport function run(): number { return printVerdict("snapx", { verdict: 0, denominators: { scanned: { value: 1, refuseWhen: "zero" } }, pairs: [["findings", 0]] }); }\n',
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      why: "a registered instrument entering the shared verdict door with an explicit non-zero denominator — the honourable arm F shape, and the file imports no artifacts door at all",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts": `import { ${PRINT_RESULT} } from "../../_shared/artifacts.ts";\nexport async function run(handle: { write(text: string): Promise<void> }): Promise<string> { void ${PRINT_RESULT}; await handle.write(String(1)); return JSON.stringify({ n: Math.round(1.5) }); }\n`,
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      why: "THE NAME-PREFILTER NARROWING (#1950 D1), and the row that dies without it: an instrument file that DOES import the artifacts door and calls four things that are not it — a language builtin as a bare callee (`String`), as a namespace member (`JSON.stringify`, `Math.round`), and a method on a local value the module reader cannot place (`handle.write`). Cut `namesTheDoor` and every one of them becomes an `unreadable` accusation, which is exactly what shipped: 654 findings across 67 files on the real tree, 582 builtins and 57 local method calls, while every conformance row here stayed green because no legacy fixture ever called anything but the door inside a candidate file",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/_shared/elsewhere.ts": `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tooling/src/snapx/ops/run.ts": `import { ${PRINT_RESULT} } from "../../_shared/artifacts.ts";\nimport * as other from "../../_shared/elsewhere.ts";\nexport function run(): void { void ${PRINT_RESULT}; other.${PRINT_RESULT}("snapx", []); }\n`,
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      why: "#1506's NEGATIVE control, strengthened so the IDENTITY fence decides it rather than the prefilter: this file DOES import the artifacts door (so the performance prefilter admits it) and still calls a same-named `printResult` from another module. Only canonical-export identity can acquit it — keying arm F on the member NAME flags this and REDS this row",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/verify/reporting.ts": `import { ${PRINT_RESULT} } from "../_shared/artifacts.ts";\nexport function shared(): void { ${PRINT_RESULT}("shared", []); }\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
      },
      why: "THE INSTRUMENT-TREE FENCE, pinned: `_shared` and `verify` are not instrument tools, so the shared layer's own call to the door is not an instrument bypassing it. The caller sits in `verify/` and spells the specifier `../_shared/artifacts.ts` DELIBERATELY, so the candidate prefilter admits it and the TREE fence is what acquits it — an earlier version of this row lived in `_shared/` and imported `./artifacts.ts`, which the prefilter rejects, so the joint cut of the tree fence and the registered-member fence came back CLEAN and the row proved nothing (§4.1 MUTUALLY-REDUNDANT procedure, run and recorded)",
    },
    {
      mode: "resource",
      files: {
        [REGISTRY]: `export const ${REGISTRY_CONST} = ["snapx"] as const;\n`,
        [ANCHOR]: "export const EXIT = 0;\n",
        [ARTIFACTS_HOME.path]: `export function ${PRINT_RESULT}(_tool: string, _pairs: unknown): void {}\n`,
        "tooling/src/snapx/index.ts": "export {};\n",
        "tests/tooling/snapx/proof.test.ts":
          "// @instrument-proof: plants a defect and asserts red\n// @instrument-absence-proof: empties the population and asserts no clean read\nexport const t = 1;\n",
        "tests/tooling/smoke.test.ts": "// @instrument-absence-proof: a marker in a FLAT tests/tooling file\nexport const t = 1;\n",
      },
      why: "THE FLAT-FILE FENCE, pinned: `tests/tooling/<file>.test.ts` mirrors no tool, so a marker there names no instrument and must not trip the two-sided arm C as a tool literally called `smoke.test.ts`. Dropping the `tool.endsWith('.ts')` guard reports `\"smoke.test.ts\" is not in INSTRUMENT_TOOLS` and REDS this row",
    },
  ],
});
