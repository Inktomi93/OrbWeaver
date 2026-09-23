// Policy: policy-fixture-substrate — a family test NEVER writes into the checkout (#2185, #2332; matrix D3,
// §4.8, the probe rule in the lane skill; family `policy-soundness`, shared reader
// `lib/fixture-path-origin.ts`).
//
// THE PAID DEFECT. 2026-08-24: a review lane probed `gates/bus-definition-belts.ts` live on main, the next broad
// `git add` swept the probe into a commit, and the gate shipped BLINDED — and a blinded gate reports green
// forever, so nothing downstream ever catches it. `.claude/skills/lane/SKILL.md` states the rule in prose
// ("on a shared tree, message the orchestrator with the paths before you start"); nothing held it. A fixture is an in-memory
// `Project` or a runner-owned temp dir; the checkout is never a scratch pad.
//
// ═══ THE 2026-09-12 RULING SURVIVES — ITS INPUT CHANGED (#2332) ═══
//
// The first implementation of this policy recorded an orchestrator ruling, and that ruling is NOT reversed
// here. Its text: **FAIL-CLOSED IS ONLY HONEST WHEN UNREADABILITY IS RARE AND SUSPICIOUS** — where the
// unreadable shape is the common, correct one, a fail-closed positive-proof requirement stops being a guard
// and becomes a false-accusation engine; *a positive-proof requirement the reader structurally cannot satisfy
// is fail-closed in name and false-accusing in fact*. That reasoning is still correct and still governs.
//
// What changed is its ANTECEDENT. The ruling rested on a measured fact about the READER, not about the shape:
// the dominant population spelling roots its write at a FUNCTION PARAMETER
//
//     function plant(root: string, rel: string, content: string): void { writeFileSync(join(root, rel), content); }
//
// and `resolveStableExpression` cannot resolve a parameter BY CONTRACT (a parameter has no single authored
// value). So the parameter was acquitted outright and the policy judged a closed set of repo ANCHORS by
// identity instead. That acquittal is exactly the hole #2332 measured: 92 family-test files, ZERO findings,
// while six real checkout writes sat in `dangling-refs.repo.int.test.ts` — because a checkout root handed in
// through a parameter is invisible to an anchor walk that stops at the parameter.
//
// `lib/fixture-path-origin.ts` removes the antecedent rather than the ruling. A parameter is resolved at its
// COMPLETE authored call sites (`lib/fixture-path-call-graph.ts`): every caller scratch → scratch, any caller
// checkout → checkout, an incomplete or escaping caller set → `unreadable`. The dominant shape is therefore
// now READ rather than guessed, and the ruling's own condition is satisfied — unreadability is once again RARE
// and SUSPICIOUS (an exported or escaping helper, a mutable destination, a relative literal), which is exactly
// where the doctrine says fail-closed is honest. Identity is still the judge; the call graph only carries
// identity ACROSS the parameter hop that used to swallow it.
//
// THE LIMIT, NAMED RATHER THAN HIDDEN — and it is narrower than the one it replaces. The population is
// `tests/tooling/verify/gates/**`, so a mutation authored inside a helper MODULE outside that population is
// not visited; what reaches this policy from such a helper is the call site's own argument. And the proof is
// deliberately LEXICAL and STATIC: this is a path-provenance fence for authored path-bearing fs calls, not a
// filesystem sandbox, not an fd/FileHandle dataflow proof, not a subprocess fence, and not a runtime
// canonical-path containment proof. The RUNTIME half of the same contract, for the dynamic keys static
// provenance cannot read, is `tests/support/tool-fixtures.ts#fixturePath`, which this reader recognises as
// root-preserving.
//
// WRITE-AFFECTING OPERANDS ARE A CLOSED TABLE, NOT ARGUMENT ZERO. The first implementation judged
// `arguments[0]` for every verb, so `copyFileSync(scratchSource, checkoutDestination)` read GREEN while it
// overwrote a gate, and the read-only SOURCE of a copy was the operand being accused. `WRITE_ARGUMENTS` below
// names the mutated position per canonical export: copy/cp/symlink/link judge the DESTINATION, rename judges
// BOTH paths, and every async twin sits beside its sync form — a missing twin is a spelling that bypasses the
// whole rule (`gate-spelling-twins`' class).
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
// POPULATION PORT: NO legacy population — this policy is BORN FINAL, added at `575e48d5a`
// (`git show 575e48d5a^:tooling/src/verify/gates/policy-fixture-substrate.ts` → `exists on disk, but not in`).
// Nothing was ported and nothing was subtracted from a sibling to make room: `tests/tooling/verify/gates/**` was
// scanned by NO gate before this one, which is the gap #2185 names. There is no legacy SHA to record and an
// invented one would be worse than the absence.
//
// `hard`/`error`: this is the fence that keeps a gate's own test from blinding the gate. A module that could
// waive out of it would re-open the door the 2026-08-24 incident closed.
import type { CallExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import type { FixturePathOriginReader } from "../contract/fixture-path-origin.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { createFixturePathOriginReader } from "../lib/fixture-path-origin.ts";

/** The filesystem doors, by SPECIFIER. A bare node builtin has no import origin to resolve past — the spelling
 *  IS the identity — which is the same reasoning `policy-soundness#FORBIDDEN_IO_SPECIFIERS` records. */
const FS_SPECIFIERS: ReadonlySet<string> = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra"]);

/** THE CLOSED WRITE-EFFECT TABLE, by canonical fs export → the argument positions that are MUTATED.
 *  Read-only operands are deliberately absent: a copy SOURCE and a symlink TARGET are read, so judging them
 *  would accuse the legal direction while the illegal one passed. Every sync form carries its async twin. */
const WRITE_ARGUMENTS = {
  writeFileSync: [0],
  writeFile: [0],
  appendFileSync: [0],
  appendFile: [0],
  mkdirSync: [0],
  mkdir: [0],
  rmSync: [0],
  rm: [0],
  rmdirSync: [0],
  rmdir: [0],
  unlinkSync: [0],
  unlink: [0],
  cpSync: [1],
  cp: [1],
  copyFileSync: [1],
  copyFile: [1],
  renameSync: [0, 1],
  rename: [0, 1],
  createWriteStream: [0],
  symlinkSync: [1],
  symlink: [1],
  linkSync: [1],
  link: [1],
  openSync: [0],
  open: [0],
  truncateSync: [0],
  truncate: [0],
  chmodSync: [0],
  chmod: [0],
  chownSync: [0],
  chown: [0],
  lchownSync: [0],
  lchown: [0],
  lchmodSync: [0],
  lchmod: [0],
  lutimesSync: [0],
  lutimes: [0],
  utimesSync: [0],
  utimes: [0],
  mkdtempSync: [0],
  mkdtemp: [0],
  mkdtempDisposableSync: [0],
  mkdtempDisposable: [0],
} as const satisfies Readonly<Record<string, readonly number[]>>;

type WriteVerb = keyof typeof WRITE_ARGUMENTS;

const CHECKOUT_MESSAGE =
  "a family test filesystem mutation resolves a write-affecting path to the CHECKOUT (#2185, #2332). Paid 2026-08-24: a probe written into the tree was swept into a commit by the next broad `git add` and the gate shipped BLINDED, which reports green forever. Family fixtures READ the checkout but write only to an invocation-owned `scratch`/`plantedTree` root or a unique `mkdtemp[Disposable][Sync]` directory. (gate-runtime-standardization.md §6.5)";
const UNREADABLE_MESSAGE_BODY =
  "a family test filesystem mutation has an UNREADABLE write-affecting path (#2185, #2332). Every actual fs destination and both rename paths must prove an invocation-owned scratch root, and a `mkdtemp[Disposable][Sync]` prefix must prove a child of canonical `tmpdir()` or of owned scratch. Relative, mutable, escaping/reset, incomplete-caller and otherwise dynamic paths fail closed — honest here because the module identity of the fs door has already established an ACTUAL mutation, and because the dominant parameter-rooted shape is now resolved at its call sites rather than guessed.";
const UNREADABLE_MESSAGE = UNREADABLE_MESSAGE_BODY + " (gate-runtime-standardization.md §6.5)";
const MISSING_MESSAGE =
  "a family test filesystem mutation is missing a required write-affecting path argument (#2185, #2332), so scratch ownership cannot be proven at all. (gate-runtime-standardization.md §6.5)";
const FIX =
  'Root the write at the canonical `scratch` or `plantedTree` fixture (`tests/support/tool-fixtures.ts`), or create a unique directory with `mkdtemp[Disposable][Sync](join(tmpdir(), prefix))`, and keep every composed path below that root — `fixturePath(root, …)` carries a proven root across a runtime-computed segment. If the test genuinely needs the REAL tree it READS it: `readFileSync`/`existsSync`/a read-only `openSync(path, "r")` are untouched by this policy. Copy/cp/symlink/link judge their destination; rename judges both paths. A test that must PLANT at real-tree paths is the `__g_` conformance-suite shape and lives outside this population under an explicit dated grant (#2176), never behind a carve here.';

function writeDoor(call: CallExpression): { readonly verb: WriteVerb; readonly positions: readonly number[] } | undefined {
  const origin = resolveModuleMemberOrigin(call.getExpression());
  if (origin.kind === "unresolved" || !FS_SPECIFIERS.has(origin.value.moduleSpecifier)) {
    return;
  }
  // A namespace read (`fs.writeFileSync`) arrives with the verb in `memberPath`; a named import carries it as
  // the exported name. Both are the same door and both are judged. A LOCAL function of the same spelling
  // resolves to no module member and is never accused.
  const verb = origin.value.memberPath.at(-1) ?? origin.value.exportedName;
  return verb in WRITE_ARGUMENTS ? { verb: verb as WriteVerb, positions: WRITE_ARGUMENTS[verb as WriteVerb] } : undefined;
}

interface WriteCandidate {
  readonly call: CallExpression;
  readonly verb: WriteVerb;
  readonly positions: readonly number[];
}

/** Judge ONE established mutation. Deferred to `evaluate` rather than decided in the visitor because a
 *  helper's caller set is only complete once the whole walk has been delivered to the reader. */
function judge(ctx: GatePolicyContext, paths: FixturePathOriginReader, { call, verb, positions }: WriteCandidate): void {
  if ((verb === "open" || verb === "openSync") && paths.isReadOnlyOpen(call)) {
    return;
  }
  for (const position of positions) {
    const argument = call.getArguments()[position];
    if (argument === undefined) {
      ctx.report.node(call, { message: MISSING_MESSAGE });
      continue;
    }
    const origin = verb.startsWith("mkdtemp") ? paths.readMkdtempPrefix(argument) : paths.read(argument);
    if (origin.kind === "checkout") {
      ctx.report.node(call, { message: CHECKOUT_MESSAGE });
    } else if (origin.kind === "unreadable") {
      ctx.report.node(call, { message: `${UNREADABLE_MESSAGE_BODY} ${origin.detail} (gate-runtime-standardization.md §6.5)` });
    }
  }
}

/** The canonical fixture door, restated in the proof mini-project: `fixtureBinding` resolves `test` through
 *  module identity, so a LOCAL callback carrying a `scratch` property mints nothing (a `mustFlag` row). */
const SUPPORT = {
  "tests/support/tool-fixtures.ts":
    "export function test(name: string, body: (fixtures: { scratch: string; repoRoot: string; plantedTree: (files: Record<string, string>) => Promise<string> }) => unknown): void { void name; void body; }\nexport function fixturePath(root: string, ...parts: string[]): string { return [root, ...parts].join('/'); }\n",
} as const;
const PLANT = (body: string, fs = 'import { writeFileSync } from "node:fs";\n'): Readonly<Record<string, string>> => ({
  ...SUPPORT,
  "tests/tooling/verify/gates/probe.test.ts": `${fs}import { join, resolve } from "node:path";\nimport { test } from "../../../support/tool-fixtures.ts";\n${body}`,
});

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
  message: UNREADABLE_MESSAGE,
  fix: FIX,
  create: (ctx: GatePolicyContext) => {
    const paths = createFixturePathOriginReader();
    const candidates: WriteCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            // EVERY call is handed to the reader, not only the fs doors: the call graph's job is to know a
            // helper's COMPLETE caller set, and a helper's callers are ordinary calls.
            paths.visitCall(node);
            const door = writeDoor(node);
            if (door !== undefined) {
              candidates.push({ call: node, verb: door.verb, positions: door.positions });
            }
          },
        },
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node): void => {
            if (Node.isIdentifier(node)) {
              // Identifier references are what prove a helper does not ESCAPE (every reference is either its
              // declaration name or a callee position); without them a passed-around helper would read "closed".
              paths.visitIdentifier(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const candidate of candidates) {
          judge(ctx, paths, candidate);
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: PLANT('writeFileSync(join(process.cwd(), "tooling/src/verify/gates/x.ts"), "planted");\n'),
      expect: { count: 1, messageIncludes: "CHECKOUT" },
      why: "THE FOUNDING SHAPE — the 2026-08-24 incident exactly: a probe written into the checkout at a `process.cwd()`-rooted path",
    },
    {
      mode: "types",
      files: PLANT('test("x", ({ repoRoot }) => { function plant(root: string): void { writeFileSync(join(root, "x.ts"), "x"); } plant(repoRoot); });\n'),
      expect: { count: 1, messageIncludes: "CHECKOUT" },
      why: "THE HOLE #2332 MEASURED, and the reason the 2026-09-12 blanket acquittal could retire: the canonical `repoRoot` fixture reaches the write through a helper PARAMETER, where the anchor walk stopped. Resolving the parameter at its complete call sites is what makes this red",
    },
    {
      mode: "types",
      files: PLANT(
        'function inner(root: string): void { writeFileSync(join(root, "x.ts"), "x"); } function outer(root: string): void { inner(root); } outer(process.cwd());\n',
      ),
      expect: { count: 1, messageIncludes: "CHECKOUT" },
      why: "checkout provenance survives TWO complete helper-call hops — a one-hop reader would report this as unreadable instead of as the checkout write it is",
    },
    {
      mode: "types",
      files: PLANT('export function plant(root: string): void { writeFileSync(join(root, "x.ts"), "x"); }\n'),
      expect: { count: 1, messageIncludes: "UNREADABLE" },
      why: "FAIL-CLOSED WHERE THE DOCTRINE SAYS IT IS HONEST: an EXPORTED helper has no complete authored caller set, so its destination is genuinely unknown — rare and suspicious, as opposed to the closed-caller shape, which is now proven rather than accused",
    },
    {
      mode: "types",
      files: PLANT('test("x", ({ scratch }) => { writeFileSync(resolve(scratch, process.cwd()), "x"); });\n'),
      expect: { count: 1, messageIncludes: "CHECKOUT" },
      why: "`path.resolve` RESETS at a later absolute root, so an earlier scratch argument grants nothing. A reader that judged only the first argument would call this scratch",
    },
    {
      mode: "types",
      files: PLANT('test("x", ({ scratch }) => { writeFileSync(join(scratch, "..", "x"), "x"); });\n'),
      expect: { count: 1, messageIncludes: "UNREADABLE" },
      why: "static traversal ABOVE the owned root is rejected by the depth proof — the composition-escape half of the same contract `fixturePath` enforces at runtime",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch }) => { writeFileSync("probe.ts", "x"); writeFileSync(join(scratch, runtimeKey()), "x"); });\ndeclare function runtimeKey(): string;\n',
      ),
      expect: { count: 2, messageIncludes: "UNREADABLE" },
      why: "a RELATIVE-ONLY destination resolves against the runtime cwd (which IS the checkout under vitest), and a dynamic suffix with no finite authored value cannot be bounded statically. Both were silent passes before #2332",
    },
    {
      mode: "types",
      files: PLANT('test("x", ({ scratch, repoRoot }) => { let target = join(scratch, "x"); target = join(repoRoot, "x"); writeFileSync(target, "x"); });\n'),
      expect: { count: 1, messageIncludes: "UNREADABLE" },
      why: "a MUTABLE destination has no single authored value; the shared binding reader refuses it rather than crediting the first assignment",
    },
    {
      mode: "types",
      files: PLANT(
        'function fakeTest(_n: string, body: (f: { scratch: string }) => void): void { body({ scratch: "/tmp/x" }); } fakeTest("x", ({ scratch }) => writeFileSync(join(scratch, "x"), "x"));\n',
      ),
      expect: { count: 1, messageIncludes: "UNREADABLE" },
      why: "IDENTITY, NOT PROPERTY NAME: a LOCAL callback carrying a property called `scratch` cannot mint fixture provenance — the fixture door is resolved through `tests/support/tool-fixtures.ts#test` by module identity",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch, repoRoot }) => { copyFileSync(join(scratch, "source"), join(repoRoot, "dest")); cpSync(join(scratch, "source"), join(repoRoot, "dest")); });\n',
        'import { copyFileSync, cpSync } from "node:fs";\n',
      ),
      expect: { count: 2, messageIncludes: "CHECKOUT" },
      why: "COPY JUDGES ITS DESTINATION. Before #2332 only argument zero was read, so a copy ONTO a gate source was green while its read-only source was the operand being judged",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch, repoRoot }) => { renameSync(join(repoRoot, "old"), join(scratch, "new")); });\n',
        'import { renameSync } from "node:fs";\n',
      ),
      expect: { count: 1, messageIncludes: "CHECKOUT" },
      why: "RENAME MUTATES BOTH PATHS — the old directory entry is REMOVED — so a checkout source is a checkout mutation even when the destination is owned",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", async ({ scratch, repoRoot }) => { await fsp.copyFile(join(scratch, "s"), join(repoRoot, "d")); await fsp.cp(join(scratch, "s"), join(repoRoot, "d")); await fsp.rename(join(scratch, "o"), join(repoRoot, "n")); await fsp["unlink"](join(repoRoot, "o")); await fsp.rmdir(join(repoRoot, "o")); });\n',
        'import * as fsp from "node:fs/promises";\n',
      ),
      expect: { count: 5, messageIncludes: "CHECKOUT" },
      why: "THE ASYNC TWINS plus the namespace and bracket spellings of the same doors. `copyFile`, `rmdir` and `unlink` were absent from the first verb table entirely, so the async spelling of a governed operation bypassed the rule",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ repoRoot }) => { createWriteStream(join(repoRoot, "x.ts")).end("x"); symlinkSync("/tmp/s", join(repoRoot, "l")); linkSync("/tmp/s", join(repoRoot, "h")); truncateSync(join(repoRoot, "t")); openSync(join(repoRoot, "o"), "w"); });\n',
        'import { createWriteStream, linkSync, openSync, symlinkSync, truncateSync } from "node:fs";\n',
      ),
      expect: { count: 5, messageIncludes: "CHECKOUT" },
      why: "the remaining path-bearing CREATION doors: a stream and a write-capable `open` mutate the path they open, `truncate` mutates in place, and link creation judges the NEW link rather than its target",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ repoRoot }) => { chmodSync(join(repoRoot, "a"), 0o755); utimesSync(join(repoRoot, "b"), 0, 0); chownSync(join(repoRoot, "c"), 0, 0); });\n',
        'import { chmodSync, chownSync, utimesSync } from "node:fs";\n',
      ),
      expect: { count: 3, messageIncludes: "CHECKOUT" },
      why: "METADATA IS MUTATION: a mode/owner/timestamp change to a tracked file is a working-tree change a concurrent `git add` commits, which is the incident class verbatim",
    },
    {
      mode: "types",
      files: PLANT('test("x", ({ repoRoot }) => { mkdtempSync(join(repoRoot, "leak-")); });\n', 'import { mkdtempSync } from "node:fs";\n'),
      expect: { count: 1, messageIncludes: "CHECKOUT" },
      why: "`mkdtemp` CREATES a directory beside its prefix, so it cannot mint scratch below the checkout — the verb that otherwise looks like the sanctioned escape hatch",
    },
    {
      mode: "types",
      files: PLANT("writeFileSync();\n"),
      expect: { count: 1, messageIncludes: "missing" },
      why: "a governed verb with NO inspectable destination: the destination cannot be established at all, so the call is reported rather than acquitted (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: PLANT('test("x", ({ scratch }) => { writeFileSync(join(scratch, "x.ts"), "x"); });\n'),
      why: "the canonical per-invocation `scratch` fixture is the direct sanctioned root",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch }) => { function inner(root: string): void { writeFileSync(join(root, "x.ts"), "x"); } function outer(root: string): void { inner(root); } outer(scratch); });\n',
      ),
      why: "THE ACQUITTAL THE 2026-09-12 RULING PROTECTED, now PROVEN instead of assumed: the parameter-rooted plant helper passes because every one of its complete authored callers is scratch, across two hops. A reader that could not do this is the one the ruling was written about",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch }) => { function plant(root: string, rel: string): void { writeFileSync(join(root, rel), "x"); } plant(scratch, "a/b.ts"); });\n',
      ),
      why: "the literal population shape the ruling quoted (`plant(root, rel)`), including a composed RELATIVE segment that stays below the proven root",
    },
    {
      mode: "types",
      files: PLANT(
        'const scratch = mkdtempSync(join(tmpdir(), "orb-"));\nwriteFileSync(join(scratch, "x.ts"), "x");\n',
        'import { mkdtempSync, writeFileSync } from "node:fs";\nimport { tmpdir } from "node:os";\n',
      ),
      why: "`mkdtempSync` one segment BELOW the canonical temp base mints an invocation-owned root, resolved through its const binding by the same walk that convicts a repo anchor",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", async ({ scratch }) => { mkdtempSync(join(scratch, "nested", "fixture-")); await mkdtemp(join(tmpdir(), "orb-")); mkdtempDisposableSync(join(scratch, "d-")); });\n',
        'import { mkdtempDisposableSync, mkdtempSync } from "node:fs";\nimport { mkdtemp } from "node:fs/promises";\nimport { tmpdir } from "node:os";\n',
      ),
      why: "every `mkdtemp` twin stays legal below canonical temp AND below an already-owned scratch path — the positive control for the prefix rule, so the checkout-prefix `mustFlag` row is a decision rather than a blanket refusal",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch, repoRoot }) => { copyFileSync(join(repoRoot, "source"), join(scratch, "dest")); cpSync(join(repoRoot, "source"), join(scratch, "dest")); renameSync(join(scratch, "a"), join(scratch, "b")); });\n',
        'import { copyFileSync, cpSync, renameSync } from "node:fs";\n',
      ),
      why: "THE OTHER DIRECTION of the operand table: copying OUT of the checkout into scratch is legal (reading the real tree is what a family test is FOR), and a rename is clean only when BOTH affected paths are owned",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch, repoRoot }) => { openSync(join(repoRoot, "read.ts"), "r"); const flags = "rs"; openSync(join(repoRoot, "sync-read.ts"), flags); openSync(join(repoRoot, "numeric.ts"), 0); openSync(join(scratch, "write.ts"), "w"); });\n',
        'import { openSync } from "node:fs";\n',
      ),
      why: "a PROVEN read-only flag set (including the numeric `O_RDONLY` and a stable alias) may open a checkout path; an unreadable or write-capable flag stays governed, which is why the write arm sits in the same fixture",
    },
    {
      mode: "types",
      files: PLANT(
        'test("x", ({ scratch }) => { writeFileSync(fixturePath(scratch, runtimeKey()), "x"); });\ndeclare function runtimeKey(): string;\n',
        'import { writeFileSync } from "node:fs";\nimport { fixturePath } from "../../../support/tool-fixtures.ts";\n',
      ),
      why: "the canonical CHECKED composition door carries the proven root across a segment static provenance cannot read — the one sanctioned answer to the dynamic-key `mustFlag` row, and the seam between the static and runtime halves of this contract",
    },
    {
      mode: "types",
      files: PLANT('test("x", ({ scratch }) => { function plant(__dirname: string): void { writeFileSync(join(__dirname, "x"), "x"); } plant(scratch); });\n'),
      why: "IDENTITY OVER SPELLING, in the acquitting direction: a local parameter NAMED `__dirname` whose call site is proven scratch is not the ambient Node root. A text-equality anchor check called this a checkout write",
    },
    {
      mode: "types",
      files: PLANT('test("x", async ({ plantedTree }) => { const root = await plantedTree({ "a.ts": "x" }); writeFileSync(join(root, "b.ts"), "x"); });\n'),
      why: "the `plantedTree` fixture is an owned root in its own right — the whole-corpus form of `scratch`, and the fixture the repaired `dangling-refs` family test now builds its isolated corpora with",
    },
    {
      mode: "types",
      files: {
        "tests/tooling/verify/gates/probe.test.ts":
          'function writeFileSync(path: string, data: string): void { void path; void data; }\nwriteFileSync(String(process.cwd()), "x");\nexport const local = writeFileSync;\n',
      },
      why: "IDENTITY, NOT SPELLING: a LOCAL function named `writeFileSync`, called with a `process.cwd()` argument. It resolves to no module member, so it is not an fs door and never enters the candidate set — the same rule `policy-legacy-imports` pins with its `./pass.ts` row",
    },
    {
      mode: "types",
      files: PLANT(
        'const target = join(process.cwd(), "tooling/src/verify/gates/x.ts");\nexport const source = readFileSync(target, "utf8");\n',
        'import { readFileSync } from "node:fs";\n',
      ),
      why: "READS ARE UNTOUCHED, at the most provocative spelling available: a `process.cwd()`-rooted path handed to `readFileSync`. The differential harness's `git show` comparisons depend on it, and a policy that convicted this would be unusable",
    },
  ],
});
