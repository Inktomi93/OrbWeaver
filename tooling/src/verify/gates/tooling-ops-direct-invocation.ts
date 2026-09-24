// Policy: tooling-ops-direct-invocation (#509/#527) — an `ops/**` module is a LIBRARY, and a library RUN as
// a program loads, executes nothing and exits 0: a bare zero that reads as "clean" (the legacy
// gate-authoring guide prescribed exactly that spelling for months, and pnpm printed its own ✓ lines over the silence). Every
// tooling/src/<tool>/ops/** module must call the refusal at MODULE SCOPE, or BE a program (a module-scope
// call to the one entry runner — stack.sh's node halves). Posture: comment-SAFE (statement nodes only).
//
// ONE HARD POLICY (#1950). Every finding is an ABSENCE — no module-scope guard statement — so
// there is no node to anchor a waiver on and no ordinary door by construction; the legacy findings were
// line 0/column 0 and unmarkable for the same reason. The escape from this policy is BEING an entry, never
// a suppression. The legacy §4.6 blindness arm (a home whose export no longer derives) is not a finding any
// more: the homes are LOCATED and RECEIPTED, one receipt per home, so an absent or renamed home refuses the
// run at the receipt phase — the runtime is the accuser (guide §6.3; pinned through `runPolicyPass` in
// tests/tooling/verify/gates/tooling-ops-direct-invocation.test.ts, because conformance has no must-refuse
// arm). Two receipts rather than one summed pair, because a sum lets one absent home read as `members: 1`.
//
// FAMILY `tooling-program-entry`, shared with `tooling-cli-entry` ("every tool cli.ts enters through
// `runTool`" — §12.6's exit/CLI arm of the retired `tooling-shared-plumbing`, which reads the SAME runner home
// through the same readers). The shared readers are `_shared/ts-workspace.ts` (`moduleScopeCalls`, the
// statement-level "what runs when this module loads" read) and `lib/project-home-origin.ts`
// (`locateProjectHome` + `classifyProjectHomeOrigin`, the declaration-identity judgment against a located
// home). The family name was minted WITH the second member: the loader refuses a one-member family whose
// name is not the policy id (`lib/policy-module.ts#policyFamilyNames`), so this module was a singleton
// under its own id until group 4 of #1950 landed the sibling.
//
// IDENTITY, NOT SPELLING: the legacy check DERIVED each name as "the sole exported function of its home"
// and compared the callee's TEXT, so a local `function refuseDirectInvocation()` in an ops module passed as
// guarded (mustFlag[2] now reds it) and `import { refuseDirectInvocation as refuse }` was reported
// (mustPass[3] now passes it). The callee must resolve BY DECLARATION to the guard home's export
// (guarded) or the runner home's export (a program); a callee the readers cannot place is no proven guard
// and is reported (mustFlag[3]). The names are fixed here, which is the house shape — a renamed export
// leaves its home's receipt `unresolved: 1` and refuses, where the legacy re-derived the new name silently.
//
// POPULATION PORT: the legacy `OPS_RE` (`tooling/src/[^/]+/ops/.+\.ts`) is `tooling/src/*/ops/**` with
// `ext: ["ts"]`, byte-identical over the tree; the two `_shared` homes are ADDED to the population so the
// policy can read its vocabulary through `ctx.files` (an intentional delta — they are skipped by the
// per-file arm, never judged). `entire-population` because every per-file verdict depends on those two
// files, which no per-file subset carries; a narrowed request DEFERS this policy rather than refusing on
// every scoped run.
//
// Legacy descriptor: `36bf5fa74` (`tooling/src/verify/gates/tooling-ops-direct-invocation.ts`). No private
// marker grammar; zero live `@orb-gate-ignore tooling-ops-direct-invocation` markers at conversion (rg over
// packages/, tests/, tooling/, scripts/), so no translation was owed. Behavioral twin:
// `tests/tooling/_shared/entrypoint.int.test.ts` RUNS every ops module and asserts exit 2.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-ops-direct-invocation` descriptor at 01123330987d1f22a088bcf5a57ef280942d30e7, the parent of the
// conversion `f1bbc34e7` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `36bf5fa74` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,441 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 270 and final `population` admits 272.
// legacy − final = ∅. final − legacy = {`tooling/src/_shared/entrypoint.ts`, `tooling/src/_shared/run-tool.ts`} — the
// two vocabulary homes added so `ctx.files` carries them. Controls: inside
// `tooling/src/agent-sync/ops/__cbbhr_in_render.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { SourceFile } from "ts-morph";
import { moduleScopeCalls } from "../../_shared/module-entry.ts";
import { defineGate } from "../contract/policy.ts";
import type { LocatedProjectHome } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";

/** The two `_shared` homes whose exports make a module a guarded library or a program. */
const GUARD_HOME = { path: "tooling/src/_shared/entrypoint.ts", names: ["refuseDirectInvocation"] } as const;
const RUNNER_HOME = { path: "tooling/src/_shared/run-tool.ts", names: ["runTool"] } as const;
const GUARD_RECEIPT = "program-entry home: entrypoint";
const RUNNER_RECEIPT = "program-entry home: run-tool";

const MESSAGE =
  "an ops/ module can be RUN as a program and would exit 0 without doing anything — the lying-instrument " +
  "shape (#509): a library module has no main, so `node <that path>` loads it, executes nothing, and prints " +
  "a bare zero a reader takes for a clean verdict. Every tooling/src/<tool>/ops/** module must refuse being " +
  "the process entry, or genuinely BE one. See tooling/src/_shared/entrypoint.ts.";

const FIX =
  'add `refuseDirectInvocation(import.meta.url, "<the real door>")` as the first statement after the ' +
  "imports (tooling/src/_shared/entrypoint.ts), naming the command the caller actually meant — the refusal " +
  "is a fix, not a scolding. A module that IS a documented process entry (a bash-fronted tool's node half) " +
  "instead enters through `runTool` at module scope, which makes running it do real work.";

const missing = (rel: string): string =>
  `${rel} is an ops/ LIBRARY module with no module-scope \`refuseDirectInvocation(…)\` call resolving to _shared/entrypoint.ts and no module-scope \`runTool(…)\` resolving to _shared/run-tool.ts — running it directly would load it, execute nothing and exit 0.`;

/** Does any module-scope call PROVABLY enter one of the two homes? An unreadable callee is no proven guard. */
function entersHome(sourceFile: SourceFile, home: LocatedProjectHome): boolean {
  return moduleScopeCalls(sourceFile).some((call) => classifyProjectHomeOrigin(call.getExpression(), home) === "home");
}

export const gate = defineGate({
  id: "tooling-ops-direct-invocation",
  family: "tooling-program-entry",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: ["tooling/src/*/ops/**", GUARD_HOME.path, RUNNER_HOME.path], ext: ["ts"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const guard = locateProjectHome(ctx.files, ctx.relativePath, GUARD_HOME);
    const runner = locateProjectHome(ctx.files, ctx.relativePath, RUNNER_HOME);
    return {
      visitFile: (sourceFile) => {
        const rel = ctx.relativePath(sourceFile);
        if (rel === GUARD_HOME.path || rel === RUNNER_HOME.path) {
          return;
        }
        if (entersHome(sourceFile, guard) || entersHome(sourceFile, runner)) {
          return;
        }
        // An ABSENT statement has no node to anchor on, so this is file-level by construction and hard.
        ctx.report.file(rel, { line: 1, column: 1, message: missing(rel), fix: FIX });
      },
      evaluate: () => {
        // One receipt PER home: an absent home is `members: 0` and a renamed export `unresolved: 1`, and
        // either refuses the run on its own — a summed pair would let one absent home read as `members: 1`.
        ctx.receipt({ kind: "population", source: GUARD_RECEIPT, members: guard.members, unresolved: guard.unresolved });
        ctx.receipt({ kind: "population", source: RUNNER_RECEIPT, members: runner.members, unresolved: runner.unresolved });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, line: 1 },
      why: "the founding shape (#509): an ops module with no guard and no top-level work — `node <path>` loads it, runs nothing and exits 0, which every reader takes for clean",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'export const SCAFFOLD = `refuseDirectInvocation(import.meta.url, "pnpm aa");`;\n// refuseDirectInvocation(import.meta.url, "pnpm aa");\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE LYING-PROOF CASE: the guard spelled inside a TEMPLATE STRING and inside a COMMENT. A text search called this module armed (it did, in new-gate.ts's scaffold) — only an AST-positional statement check answers the real question",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\nexport const x = 1;\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE IDENTITY RED: a LOCAL function that merely shares the guard's name refuses nothing — its callee resolves to the module's own declaration, not the home's export. The legacy text comparison called this module armed",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts": 'import { refuseDirectInvocation } from "./missing.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n',
      },
      expect: { count: 1, line: 1 },
      why: "FAIL-CLOSED: a guard call whose import door does not resolve is no PROVEN guard — the module is reported rather than silently admitted on the strength of a spelling",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts":
          "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\nexport function other(): void {}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts": 'import { other } from "../../_shared/entrypoint.ts";\n\nother();\n\nexport const x = 1;\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE EXPORT-NAME HALF of the identity: a module-scope call into the guard HOME that is not the guard EXPORT is not a guard. Widening GUARD_HOME.names to admit `other` turns this row green, which is what pins the name half of the `(file, export)` pair",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n',
      },
      why: "the armed library shape — the guard called at module scope, naming the real door. The two homes are in the population and are SKIPPED, never judged: deleting the home skip reds this row with the homes' own absent-guard findings",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/entry.ts": 'import { runTool } from "../../_shared/run-tool.ts";\n\nawait runTool(() => 0);\n',
      },
      why: "DERIVED EXEMPTION, not an allowlist: a module that ends in a module-scope `runTool` IS a program (stack.sh's `ops/prod-entry.ts`/`ops/dev-identity-entry.ts` halves) — running it does the real work, so the silent-zero lie is unrepresentable there. Structural, so it can never rot into a stale path row. Replacing the runner-home verdict with `true` reds mustFlag[2]; replacing it with `false` reds this row",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/lib/x.ts": "export const x = 1;\n",
        "tooling/src/aa/cli.ts": "export const c = 1;\n",
      },
      why: "DECLARED LIMIT: `lib/` and `cli.ts` are not in the population. The class this policy closes is the one the docs pointed people INTO — `ops/` is where the verb-shaped modules live and where every wrong spelling aimed; a cli.ts that fails to enter through runTool is the plumbing exit/CLI policy's finding, not a second red here. The two homes keep the fixture admitted",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'import { refuseDirectInvocation as refuse } from "../../_shared/entrypoint.ts";\n\nrefuse(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n',
      },
      why: "AN IMPORT ALIAS enters the same guard — the callee resolves to the home's export whatever it was spelled as. The legacy text comparison reported this module as unguarded",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/entrypoint.ts":
          "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\nexport function other(): void {}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n',
      },
      why: "THE LEGACY BLINDNESS SHAPE, judged normally: the guard home exporting a SECOND function is still the home and the guard call still resolves to the named export. The legacy sole-exported-function derivation returned undefined here and reported the whole run BLIND; a fixed export name has nothing to derive. Classified in the §4.6 differential, not a narrowing",
    },
  ],
});
