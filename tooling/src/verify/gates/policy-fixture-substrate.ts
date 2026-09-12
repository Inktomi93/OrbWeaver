// Policy: policy-fixture-substrate — a family test NEVER writes into the checkout (#2185; matrix D3, §4.8, the
// probe rule in constitution §4; family `policy-soundness`, reader `lib/reference-fact.ts`).
//
// THE PAID DEFECT. 2026-08-24: a review lane probed `gates/bus-definition-belts.ts` live on main, the next broad
// `git add` swept the probe into a commit, and the gate shipped BLINDED — and a blinded gate reports green
// forever, so nothing downstream ever catches it. `.claude/rules/gates-and-tooling.md` states the rule in prose
// ("a gate probe on a shared tree is an ANNOUNCED operation"); nothing held it. A fixture is an in-memory
// `Project` or a runner-owned temp dir; the checkout is never a scratch pad.
//
// ═══ THE PREDICATE IS INVERTED FROM THE ROW THAT ORDERED IT, AND THAT IS THE DESIGN ═══
//
// The audit row (§RECOMMENDED ADDITIONS #2) asked for the POSITIVE proof: a write whose first argument does not
// resolve to a `tmpdir()` / `mkdtempSync` / `scratch`-rooted expression is RED, fail-closed. Re-derived over the
// whole population before building — 87 files, not the four the audit sampled — that rule reds ~15 files, every
// one of them CORRECT, because the dominant shape roots the write at a FUNCTION PARAMETER:
//
//     tests/tooling/verify/gates/no-blanket-suppression.repo.int.test.ts:56-59
//       function plant(root: string, rel: string, content: string): void {
//         const abs = join(root, rel);
//         writeFileSync(abs, content);            // <- first argument roots at a PARAMETER
//       }
//
// and `resolveStableExpression` CANNOT resolve a parameter — by contract, not by omission: a parameter has no
// single authored value, which is the whole point of the shared binding reader. Same shape at
// `runner-config-path-liveness.int.test.ts:39-40`, `enforcement-registry-parity.int.test.ts:66-67`,
// `motion-token-purity.test.ts:33-34`, `integer-line-boxes.int.test.ts:70-71`,
// `tsconfig-entry-liveness.int.test.ts:47-48`, `mixed-hook-singletons-conversion.test.ts:76-77`.
//
// THE RULE THAT GENERALISES (orchestrator ruling 2026-09-12, on this lane's refutation): **FAIL-CLOSED IS ONLY
// HONEST WHEN UNREADABILITY IS RARE AND SUSPICIOUS.** Where the unreadable shape is the common, correct one, a
// fail-closed positive-proof requirement stops being a guard and becomes a false-accusation engine. It is the
// mirror image of the lesson `lib/origin-verdict.ts` carries from the other direction (every fail-open →
// fail-closed repair owes a name prefilter, or every unreadable node becomes an accusation): **a positive-proof
// requirement the reader structurally cannot satisfy is fail-closed in name and false-accusing in fact.**
//
// So this policy judges a CLOSED SET BY IDENTITY, the discipline the family already uses
// (`policy-legacy-imports#FORBIDDEN_IMPORT_HOMES`, `lib/origin-verdict.ts`): a write is RED when its path
// expression is rooted at a REPO ANCHOR — `process.cwd()`, `import.meta.dirname`, `import.meta.url`,
// `__dirname`, `__filename`. That is exactly the paid defect (2026-08-24 was a probe at a repo-SPELLED path),
// and it acquits the parameter case correctly: a repo root has to be SPELLED somewhere, and wherever it is
// spelled this same rule reads it.
//
// THE WEAKENING, NAMED RATHER THAN HIDDEN: a repo root computed in ANOTHER FILE and passed in as an argument is
// out of reach. This policy is a fence against the shape that caused the incident, not a proof of hermeticity.
// The parameter-rooted acquittal is PINNED by its own `mustPass` row so it is a decision, not a gap.
//
// FAIL-CLOSED SURVIVES WHERE IT IS MEANINGFUL: a write verb whose first argument is ABSENT — a call the reader
// cannot inspect at all — is still reported, because that is the rare-and-suspicious case the doctrine means.
//
// THE FOUR `__g_` PLANTERS are the known exception and hold an explicit, dated grant (#2176, Phase F), never a
// directory carve: `check-gates.repo.int.test.ts` and its siblings materialise fixtures at real-tree paths on
// purpose and retire at the cutover. They are not in this population (`tests/tooling/*.ts`, not
// `tests/tooling/verify/gates/**`), so the grant is a statement about the cutover, not an exemption row here.
//
// BLINDNESS IS NOT THE FAMILY'S SELF-ANCHOR HERE, and the difference is structural rather than an omission.
// Every sibling in `policy-soundness` throws when its OWN module stops reading as final, because its population
// IS the gate corpus. This module's population is the TEST tree, so its own file never enters `ctx.files` and
// there is no self to anchor on. What holds it instead is the resolver one level up: an effective population
// that admits nothing is a `[population]` TOOL ERROR before any hook runs ("candidate corpus is empty"), which
// is strictly EARLIER and stronger than a receipt this module could emit — measured 2026-09-12, a zero-count
// receipt added here never ran, because the refusal had already fired. The family test pins that refusal by
// phase, with a seeing arm beside it, rather than this module carrying a second mechanism that says less.
//
// `hard`/`error`: this is the fence that keeps a gate's own test from blinding the gate. A module that could
// waive out of it would re-open the door the 2026-08-24 incident closed.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { resolveModuleMemberOrigin, resolveStableExpression } from "../lib/reference-fact.ts";

/** The write verbs, by EXPORTED NAME on a filesystem door. A read (`readFileSync`, `existsSync`) is not this
 *  policy's business — reading the checkout is what a family test is FOR. */
const WRITE_VERBS: ReadonlySet<string> = new Set([
  "writeFileSync",
  "writeFile",
  "appendFileSync",
  "appendFile",
  "mkdirSync",
  "mkdir",
  "rmSync",
  "rm",
  "rmdirSync",
  "unlinkSync",
  "cpSync",
  "cp",
  "copyFileSync",
  "renameSync",
  "rename",
]);
/** The filesystem doors, by SPECIFIER. A bare node builtin has no import origin to resolve past — the spelling
 *  IS the identity — which is the same reasoning `policy-soundness#FORBIDDEN_IO_SPECIFIERS` records. */
const FS_SPECIFIERS: ReadonlySet<string> = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra"]);

/** THE CLOSED SET OF REPO ANCHORS. Each is an expression that evaluates to a path INSIDE the checkout, and each
 *  is recognised structurally rather than by spelling a variable name. */
const CWD = "cwd";
const PROCESS = "process";
const DIRNAME = "__dirname";
const FILENAME = "__filename";
const META_ROOTS: ReadonlySet<string> = new Set(["dirname", "url", "filename"]);
/** The ONE unresolved reason the walk continues through — see `anchorBelow`. */
const DYNAMIC = "dynamic";

const MESSAGE =
  "a family test under `tests/tooling/verify/gates/**` performs a filesystem WRITE at a path rooted in the CHECKOUT " +
  "(gate-runtime-standardization.md §4.8; the probe rule, constitution §4). A fixture is an in-memory ts-morph `Project` or a " +
  "runner-owned temp dir — never the repository. Paid 2026-08-24: a probe written into the tree was swept into a commit by the " +
  "next broad `git add` and the gate shipped BLINDED, which reports green forever. The token names the repo anchor the write " +
  "resolved through.";
const ABSENT_MESSAGE =
  "a family test under `tests/tooling/verify/gates/**` calls a filesystem WRITE verb with NO path argument the reader can " +
  "inspect. The destination cannot be established, so the call is reported rather than acquitted (#944 fail-closed) — this is the " +
  "rare-and-suspicious unreadability the doctrine means, as opposed to the parameter-rooted shape this policy deliberately acquits.";
const FIX =
  "Root the write at a scratch directory: the `scratch` fixture parameter (`tests/support/tool-fixtures.ts`), `mkdtempSync(join(tmpdir(), …))`, " +
  "or the `plantedTree` fixture, which materialises a whole throwaway root under the session scratchpad. If the test genuinely needs the REAL " +
  "tree, it reads it — `readFileSync`/`existsSync` are untouched by this policy. A test that must PLANT at real-tree paths is the `__g_` " +
  "conformance-suite shape and lives outside this population under an explicit dated grant (#2176), never behind a carve here.";

/** Is this call a filesystem WRITE — the verb resolved to an fs door by import origin, never by name alone?
 *  A local helper called `writeFileSync` resolves to no module member and is not accused. */
function fsWriteCall(call: CallExpression): boolean {
  const fact = resolveModuleMemberOrigin(call.getExpression());
  if (fact.kind === "unresolved") {
    return false;
  }
  const { moduleSpecifier, exportedName, memberPath } = fact.value;
  // A namespace read (`fs.writeFileSync`) arrives with the verb in `memberPath`; a named import carries it as
  // the exported name. Both are the same door and both are judged.
  const verb = memberPath.at(-1) ?? exportedName;
  return FS_SPECIFIERS.has(moduleSpecifier) && WRITE_VERBS.has(verb);
}

/** `process.cwd()` — the call, not the property. */
function isCwdCall(node: MorphNode): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  return Node.isPropertyAccessExpression(callee) && callee.getName() === CWD && callee.getExpression().getText() === PROCESS;
}

/** `import.meta.dirname` / `import.meta.url` / `import.meta.filename`. */
function isImportMetaRoot(node: MorphNode): boolean {
  return Node.isPropertyAccessExpression(node) && META_ROOTS.has(node.getName()) && node.getExpression().getKind() === SyntaxKind.MetaProperty;
}

function isRepoAnchor(node: MorphNode): boolean {
  if (Node.isIdentifier(node)) {
    const text = node.getText();
    return text === DIRNAME || text === FILENAME;
  }
  return isCwdCall(node) || isImportMetaRoot(node);
}

/** THE ANCHOR WALK. A path expression is a tree of joins, template spans, concatenations and bindings; this
 *  follows every branch, hopping ONE resolution step through each identifier (the shared stable-binding reader),
 *  and answers with the first repo anchor it reaches. A `visited` set bounds it: a const cycle would otherwise
 *  be an infinite descent, and an instrument that hangs is an instrument nobody runs. */
/** An anchor and the node that CARRIES it inside the reported call.
 *
 *  They differ the moment the walk crosses a binding: `mkdirSync(join(ROOT, …))` is convicted by an
 *  `import.meta.dirname` that lives in ROOT's declaration, somewhere else entirely. A finding's position must be
 *  a slice of the node it is reported on, so the CARRIER — the `ROOT` identifier, which is inside the call — is
 *  what the reader points at, and it is also the better repair target: `ROOT` is what this call has to stop
 *  using. Measured here as a conformance TOOL ERROR ("token is not anchored at its declared offset") before the
 *  two were separated. */
interface Anchored {
  readonly anchor: MorphNode;
  readonly carrier: MorphNode;
}

/** One hop BELOW a node that is not itself an anchor: through an identifier's stable binding, or across every
 *  child of a compound expression (a `join(…)` call, a template literal, a concatenation). */
function anchorBelow(node: MorphNode, visited: Set<MorphNode>): Anchored | undefined {
  let found: Anchored | undefined;
  if (Node.isIdentifier(node)) {
    const fact = resolveStableExpression(node);
    // THE CARRIER STOPS HERE, at the identifier: everything past this hop lives in another declaration, so this
    // is the last node on the path that is still inside the call being reported.
    if (fact.kind !== "unresolved") {
      found = carriedBy(anchorOf(fact.value, visited), node);
    } else if (fact.reason === DYNAMIC) {
      // A `"dynamic"` refusal is NOT unknowability — it is the reader saying "this binding's VALUE is computed",
      // and `resolveStableExpression` treats a call as a TERMINAL by contract (`class-token-splice.ts:110`). The
      // overwhelmingly common repo-anchor spelling is exactly that shape: `const ROOT = join(import.meta.dirname,
      // "..", "..")`. Measured here red-first — the whole binding arm reported NOTHING until this branch existed.
      // The EXPRESSION is still right there, so the structural walk continues into it; only the VALUE was opaque.
      found = carriedBy(anchorOf(fact.node, visited), node);
    }
    // EVERY OTHER refusal is an acquittal, and the header says why: a PARAMETER (`missing`) is the common CORRECT
    // shape, so convicting on it would make this a false-accusation engine rather than a fence.
    return found;
  }
  for (const child of node.getChildren()) {
    found = anchorOf(child, visited);
    if (found !== undefined) {
      break;
    }
  }
  return found;
}

/** Re-seat a result's CARRIER on `carrier` — used at every binding hop, and nowhere else: a walk that stays
 *  inside the reported expression keeps the carrier it already had. */
function carriedBy(found: Anchored | undefined, carrier: MorphNode): Anchored | undefined {
  return found === undefined ? found : { anchor: found.anchor, carrier };
}

function anchorOf(node: MorphNode, visited: Set<MorphNode>): Anchored | undefined {
  // ONE TAIL RETURN — the accumulator idiom (`lib/pass.ts`'s shape): `biome`'s `noUselessUndefined` deletes a
  // trailing `return undefined;` and tsc's `noImplicitReturns` then reds the fall-through, so the two rules are
  // satisfied by structure rather than by a suppression.
  let found: Anchored | undefined;
  if (!visited.has(node)) {
    visited.add(node);
    found = isRepoAnchor(node) ? { anchor: node, carrier: node } : anchorBelow(node, visited);
  }
  return found;
}

function judgeWrite(ctx: GatePolicyContext, call: CallExpression): void {
  const first = call.getArguments()[0];
  if (first === undefined) {
    ctx.report.node(call, { message: ABSENT_MESSAGE });
    return;
  }
  const found = anchorOf(first, new Set());
  if (found !== undefined) {
    const anchor = found.carrier;
    // THE COORDINATE IS PAREN-FREE, and that is a hard requirement rather than a nicety: the `@orb-waive`
    // position grammar admits no parenthesis, CR or LF, so a token of `process.cwd()` would make the finding
    // PERMANENTLY UNWAIVABLE (`lib/ordinary-waiver.ts waivableCoordinate`, guide §3, #2107) — measured here as a
    // conformance TOOL ERROR before the slice was narrowed. `process.cwd()` hands back its callee `process.cwd`,
    // which is a leading slice at the same offset; every other anchor is already a bare name.
    const coordinate = Node.isCallExpression(anchor) ? anchor.getExpression() : anchor;
    ctx.report.node(call, { token: coordinate.getText(), offset: coordinate.getStart() - call.getStart(), message: MESSAGE });
  }
}

const PLANT = (body: string, prelude = 'import { writeFileSync } from "node:fs";\nimport { join } from "node:path";\n'): string => `${prelude}${body}`;

export const gate = defineGate({
  id: "policy-fixture-substrate",
  family: "policy-soundness",
  authority: "hard",
  severity: "error",
  population: { in: ["@tests"], under: ["tests/tooling/verify/gates/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node): void => {
          if (Node.isCallExpression(node) && fsWriteCall(node)) {
            judgeWrite(ctx, node);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "tests/tooling/verify/gates/probe.test.ts": PLANT('writeFileSync(join(process.cwd(), "tooling/src/verify/gates/x.ts"), "planted");\n') },
      expect: { count: 1, token: "process.cwd" },
      why: "THE FOUNDING SHAPE — the 2026-08-24 incident exactly: a probe written into the checkout at a `process.cwd()`-rooted path. The token is the ANCHOR rather than the whole call, because the anchor is what has to change",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/verify/gates/probe.test.ts": PLANT(
          'const ROOT = join(import.meta.dirname, "..", "..", "..");\nmkdirSync(join(ROOT, "packages/client/src/probe"), { recursive: true });\n',
          'import { mkdirSync } from "node:fs";\nimport { join } from "node:path";\n',
        ),
      },
      expect: { count: 1, token: "ROOT" },
      why: "THE ANCHOR WALK THROUGH A BINDING and a second verb: the repo root is a const one hop away and the verb is `mkdirSync`, not `writeFileSync`. Without the identifier hop the dominant real-world spelling (`const ROOT = join(import.meta.dirname, …)`) would be invisible",
    },
    {
      mode: "types",
      files: { "tests/tooling/verify/gates/probe.test.ts": PLANT('writeFileSync(`${__dirname}/planted.ts`, "x");\n') },
      expect: { count: 1, token: "__dirname" },
      why: "THE TEMPLATE-SPAN BRANCH: the anchor is inside a template literal, not an argument of `join`. The walk descends every child, so the shape of the concatenation is not part of the rule",
    },
    {
      mode: "types",
      files: { "tests/tooling/verify/gates/probe.test.ts": PLANT("writeFileSync();\n") },
      expect: { count: 1, messageIncludes: "NO path argument" },
      why: "FAIL-CLOSED WHERE IT IS MEANINGFUL (#944): a write with no inspectable destination is rare AND suspicious, which is the condition the doctrine attaches to fail-closed — as opposed to the parameter shape below, where unreadability is common and correct",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tests/tooling/verify/gates/probe.test.ts": PLANT(
          "function plant(root: string, rel: string, content: string): void {\n  writeFileSync(join(root, rel), content);\n}\nexport const p = plant;\n",
        ),
      },
      why: "THE ACQUITTAL THIS POLICY IS DESIGNED AROUND, PINNED so it is a decision rather than a gap (#2185): the parameter-rooted plant helper is the DOMINANT shape across the 87-file population and is correct. `resolveStableExpression` cannot resolve a parameter by contract, so the row the audit asked for would have reported every one of these — a positive-proof requirement the reader structurally cannot satisfy is fail-closed in name and false-accusing in fact",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/verify/gates/probe.test.ts": PLANT(
          'import { mkdtempSync } from "node:fs";\nimport { tmpdir } from "node:os";\nconst scratch = mkdtempSync(join(tmpdir(), "orb-"));\nwriteFileSync(join(scratch, "a.ts"), "x");\n',
          'import { writeFileSync } from "node:fs";\nimport { join } from "node:path";\n',
        ),
      },
      why: "THE SANCTIONED SHAPE — a `mkdtempSync(tmpdir())` root, resolved through its const binding by the same walk that convicts a repo anchor. It passes because no anchor is REACHED, never because the walk stopped early",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/verify/gates/probe.test.ts": PLANT(
          'const target = join(process.cwd(), "tooling/src/verify/gates/x.ts");\nexport const source = readFileSync(target, "utf8");\n',
          'import { readFileSync } from "node:fs";\nimport { join } from "node:path";\n',
        ),
      },
      why: "READS ARE UNTOUCHED, at the most provocative spelling available: a `process.cwd()`-rooted path handed to `readFileSync`. Reading the real tree is what a family test is FOR — the differential harness's `git show` comparisons depend on it — and a policy that convicted this would be unusable",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/verify/gates/probe.test.ts":
          'function writeFileSync(path: string, data: string): void {\n  void path;\n  void data;\n}\nwriteFileSync(String(process.cwd()), "x");\nexport const local = writeFileSync;\n',
      },
      why: "IDENTITY, NOT SPELLING: a LOCAL function named `writeFileSync`, called with a `process.cwd()` argument. It resolves to no module member, so it is not an fs door and is never accused — the same rule `policy-legacy-imports` pins with its `./pass.ts` row",
    },
  ],
});
