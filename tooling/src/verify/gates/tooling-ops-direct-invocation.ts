// Gate: tooling-ops-direct-invocation (#509/#527) — an `ops/**` module is a LIBRARY, and a library RUN as a
// program loads, executes nothing and exits 0: a bare zero that reads as "clean" (GATE-AUTHORING.md §8.1
// prescribed exactly that spelling for months, and pnpm printed its own ✓ lines over the silence). Every
// tooling/src/<tool>/ops/** module must call the refusal at MODULE SCOPE, or BE a program (a module-scope
// call to the one entry runner — stack.sh's node halves). Both names are DERIVED from their `_shared` homes,
// so a rename REDs (§4.6) instead of silently disarming the gate. Posture: comment-SAFE (statement nodes only).
import { join } from "node:path";
import { moduleScopeCallees, soleExportedFunction } from "../../_shared/ts-workspace.ts";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";

/** `tooling/src/<tool>/ops/**\/*.ts` — leading-slash agnostic (GATE-AUTHORING.md §3). */
const OPS_RE = /(?:^|\/)tooling\/src\/[^/]+\/ops\/.+\.ts$/u;

/** The two `_shared` homes this gate DERIVES its vocabulary from. A hard-coded identifier would go
 *  dead-green the day either export is renamed; deriving means the rename REDs at the tripwire instead. */
const GUARD_HOME = "tooling/src/_shared/entrypoint.ts";
const RUNNER_HOME = "tooling/src/_shared/run-tool.ts";
const GATE_SELF = "tooling/src/verify/gates/tooling-ops-direct-invocation.ts";

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

const BLIND = (home: string): string =>
  `${GATE_SELF} derives its vocabulary from ${home} and found no single exported function there — the gate ` +
  "is keyed on a name that no longer resolves, so it would report ✓ over every unguarded ops module forever " +
  `(GATE-AUTHORING.md §4). Re-point this gate at the renamed export, or restore ${home}.`;

const MISSING = (rel: string, guard: string): string =>
  `${rel} is an ops/ LIBRARY module with no module-scope \`${guard}(…)\` call and no module-scope entry ` +
  "runner — running it directly would load it, execute nothing and exit 0.";

/** Derived once per run in `begin`; `undefined` means the derivation failed and the tripwire owns the run. */
let guardName: string | undefined;
let runnerName: string | undefined;

function reportBlindness(ctx: GateRunCtx): void {
  for (const [home, name] of [
    [GUARD_HOME, guardName],
    [RUNNER_HOME, runnerName],
  ] as const) {
    if (name === undefined) {
      // A GENUINELY file-level Finding (line/column 0, no node position), so `finding-overload-provenance`
      // does not judge it and a marker here would itself be stale — the arm-E shape, no marker.
      ctx.report({ file: GATE_SELF, line: 0, column: 0, message: BLIND(home) });
    }
  }
}

export const gate: GateDescriptor = {
  name: "tooling-ops-direct-invocation",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — tooling/src/_shared/entrypoint.ts",
  status: "active",
  scopeSafety: "incremental-safe", // a per-FILE verdict; the derivation reads the shared Project, not the fileset
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => OPS_RE.test(p),

  begin: (ctx) => {
    guardName = soleExportedFunction(ctx.project, join(ctx.root, GUARD_HOME));
    runnerName = soleExportedFunction(ctx.project, join(ctx.root, RUNNER_HOME));
  },

  visitFile: (sf, ctx) => {
    if (guardName === undefined || runnerName === undefined) {
      return; // the tripwire in `run` owns this run — one loud finding, not one per file
    }
    const callees = moduleScopeCallees(sf);
    if (callees.has(guardName) || callees.has(runnerName)) {
      return;
    }
    // An ABSENT statement has no node to anchor on or hang a marker off, so this is file-level by
    // construction (`tooling-shared-plumbing` arm E's shape) and takes no marker. The escape from this gate
    // is BEING an entry, never a suppression.
    const rel = repoRel(ctx.root, sf.getFilePath());
    ctx.report({ file: rel, line: 0, column: 0, message: MISSING(rel, guardName) });
  },

  run: (ctx) => {
    reportBlindness(ctx);
  },

  mustFlag: [
    {
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, messageIncludes: "exit 0" },
      why: "the founding shape (#509): an ops module with no guard and no top-level work — `node <path>` loads it, runs nothing and exits 0, which every reader takes for clean",
    },
    {
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'export const SCAFFOLD = `refuseDirectInvocation(import.meta.url, "pnpm aa");`;\n// refuseDirectInvocation(import.meta.url, "pnpm aa");\n',
      },
      expect: { count: 1 },
      why: "THE LYING-PROOF CASE: the guard spelled inside a TEMPLATE STRING and inside a COMMENT. A text search called this module armed (it did, in new-gate.ts's scaffold) — only an AST-positional statement check answers the real question",
    },
    {
      files: {
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n',
      },
      expect: { messageIncludes: "no single exported function" },
      why: "§4.6 BLINDNESS: the guard's home is gone (a rename/move), so the derived name resolves to nothing — the gate must RED loudly instead of passing every unguarded module for ever",
    },
  ],
  mustPass: [
    {
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/x.ts":
          'import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n',
      },
      why: "the armed library shape — the guard called at module scope, naming the real door",
    },
    {
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/ops/entry.ts": 'import { runTool } from "../../_shared/run-tool.ts";\n\nawait runTool(() => 0);\n',
      },
      why: "DERIVED EXEMPTION, not an allowlist: a module that ends in a module-scope `runTool` IS a program (stack.sh's `ops/prod-entry.ts`/`ops/engines.ts` halves) — running it does the real work, so the silent-zero lie is unrepresentable there. Structural, so it can never rot into a stale path row",
    },
    {
      files: {
        "tooling/src/_shared/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
        "tooling/src/_shared/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
        "tooling/src/aa/lib/x.ts": "export const x = 1;\n",
        "tooling/src/aa/cli.ts": "export const c = 1;\n",
      },
      why: "DECLARED LIMIT: `lib/` and `contract/` are not in scope. The class this gate closes is the one the docs pointed people INTO — `ops/` is where the verb-shaped modules live and where every wrong spelling aimed; a cli.ts that fails to enter through runTool is `tooling-shared-plumbing` arm E's finding, not a second red here",
    },
  ],
};
