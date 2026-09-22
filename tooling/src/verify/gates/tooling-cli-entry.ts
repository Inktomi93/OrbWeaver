// Policy: tooling-cli-entry (docs/architecture/core/Core-Tooling-Law.md §4.4, arm E of the retired
// `tooling-shared-plumbing`) — every tool `cli.ts` enters through `runTool` (_shared/run-tool.ts), the
// exit-honesty runner that owns crash≠verdict, pipe-drain and never-downgrade. A cli.ts that hand-rolls its
// own entry exits with whatever node decided, and a crash reads as "violations found". Comment posture:
// comment-SAFE (node kinds only).
//
// ONE HARD POLICY (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950 group 4): every finding is an ABSENCE — no call in the cli that
// provably enters the runner — so there is no node to anchor a waiver on and no ordinary door by
// construction; the escape is BEING a program that enters the runner, never a suppression. FAMILY
// `tooling-program-entry`, shared with `tooling-ops-direct-invocation` (whose "a module that IS a program"
// arm reads the SAME runner home): the shared readers are `lib/project-home-origin.ts` (`locateProjectHome` +
// `classifyProjectHomeOrigin`, the declaration-identity judgment against a located home) and
// `lib/tooling-import-door.ts#isToolCli` (the four-segment cli shape). The family name is minted WITH this
// second member — the loader refuses a one-member family under any name but its policy id.
//
// IDENTITY, NOT SPELLING: the legacy required an import whose specifier ENDED IN `_shared/run-tool.ts` plus
// a call whose callee TEXT was `runTool`, so a local `function runTool()` passed as an entry (mustFlag[1] now
// reds it) and `import { runTool as run }` was reported (mustPass[1] now passes it). The callee must resolve
// BY DECLARATION to the runner home's `runTool` export; a callee the readers cannot place is no proven entry
// and the cli is reported (mustFlag[3]). The runner home is LOCATED and RECEIPTED, so an absent home or a
// renamed export refuses the run at the receipt phase — the runtime is the accuser (pinned through
// `runPolicyPass` in tests/tooling/verify/gates/tooling-plumbing-family.suite.test.ts). DECLARED LIMIT, carried:
// the legacy accepted the runner call ANYWHERE in the cli (not only at module scope); so does this policy
// (mustPass[2]) — the module-scope rule belongs to `tooling-ops-direct-invocation`'s program arm.
//
// POPULATION PORT: the legacy judged `tooling/src/<tool>/cli.ts` by regex inside `visitFile`; the population
// is `tooling/src/*/cli.ts` (the same four-segment shape) plus the runner home, ADDED so the policy can read
// its vocabulary through `ctx.files` (skipped by the per-file arm, never judged). `entire-population` because
// every per-file verdict depends on the home, which no per-file subset carries; a narrowed request DEFERS.
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arm E). No private
// marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-shared-plumbing` descriptor at daf3444358fc10c2b0a3bc3377c62abe23e82c63, the parent of the conversion
// `7b80f66a4`; this module did not exist there, so it is measured against the module it was carved from,
// `tooling-shared-plumbing` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `2c1a1d37c` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,464 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,617 and final `population` admits 16.
// legacy − final = 1,601 — every scanned path other than `tooling/src/*/cli.ts` and the runner home: arm E judged the
// cli shape by regex inside `visitFile`. final − legacy = ∅. Controls: inside: no virtual sibling fits the exact-path
// population, so the real shared member `tooling/src/_shared/run-tool.ts` is the control, admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import { isToolCli } from "../lib/tooling-import-door.ts";

const RUNNER_HOME = { path: "tooling/src/_shared/run-tool.ts", names: ["runTool"] } as const;
const RUNNER_RECEIPT = "program-entry home: run-tool";

const MESSAGE =
  'a tool cli.ts must enter through runTool (_shared/run-tool.ts) — the exit-honesty runner owns crash≠verdict, pipe-drain and never-downgrade, and a hand-rolled entry exits with whatever node decided, so a crash reads as "violations found" (docs/architecture/core/Core-Tooling-Law.md §4.4).';
const FIX = "end the cli.ts in `await runTool(main)` (_shared/run-tool.ts), where `main` returns the EXIT member; the runner classifies every other outcome.";

const missing = (rel: string): string =>
  `${rel} must enter through runTool (_shared/run-tool.ts): no call in it resolves to the runner's \`runTool\` export, so it never enters the exit-honesty runner and its exit code is whatever node decided.`;

export const gate = defineGate({
  id: "tooling-cli-entry",
  family: "tooling-program-entry",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: ["tooling/src/*/cli.ts", RUNNER_HOME.path], ext: ["ts"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const runner = locateProjectHome(ctx.files, ctx.relativePath, RUNNER_HOME);
    const entered = new Set<string>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.CallExpression)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            if (isToolCli(rel) && classifyProjectHomeOrigin(node.getExpression(), runner) === "home") {
              entered.add(rel);
            }
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: RUNNER_RECEIPT, members: runner.members, unresolved: runner.unresolved });
        for (const sourceFile of ctx.files) {
          const rel = ctx.relativePath(sourceFile);
          if (isToolCli(rel) && !entered.has(rel)) {
            // An ABSENT call has no node to anchor on, so this is file-level by construction and hard.
            ctx.report.file(rel, { line: 1, column: 1, message: missing(rel), fix: FIX });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { [RUNNER_HOME.path]: runnerStub(), "tooling/src/badcli/cli.ts": "export const c = 1;\n" },
      expect: { count: 1, line: 1 },
      why: "the founding shape — a tool cli.ts that never enters the exit-honesty runner (arm E)",
    },
    {
      mode: "types",
      files: {
        [RUNNER_HOME.path]: runnerStub(),
        "tooling/src/localcli/cli.ts": "async function runTool(main: () => number): Promise<void> {\n  void main();\n}\nawait runTool(() => 0);\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE IDENTITY RED: a LOCAL function that merely shares the runner's name runs nothing through it — its callee resolves to the cli's own declaration, not the home's export. The legacy text comparison called this cli entered (it also demanded an import whose specifier ended in `run-tool.ts`, which this file lacks; the identity answer subsumes both halves)",
    },
    {
      mode: "types",
      files: {
        [RUNNER_HOME.path]: `${runnerStub()}export function other(): void {}\n`,
        "tooling/src/othercli/cli.ts": 'import { other } from "../_shared/run-tool.ts";\n\nother();\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE EXPORT-NAME HALF of the identity: a call into the runner HOME that is not the runner EXPORT is no entry. Widening RUNNER_HOME.names to admit `other` turns this row green, which is what pins the name half of the `(file, export)` pair",
    },
    {
      mode: "types",
      files: { [RUNNER_HOME.path]: runnerStub(), "tooling/src/blindcli/cli.ts": 'import { runTool } from "./missing.ts";\n\nawait runTool(() => 0);\n' },
      expect: { count: 1, line: 1 },
      why: "FAIL-CLOSED: a runner call whose import door does not resolve is no PROVEN entry — the cli is reported rather than silently admitted on the strength of a spelling",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [RUNNER_HOME.path]: runnerStub(),
        "tooling/src/goodcli/cli.ts": 'import { runTool } from "../_shared/run-tool.ts";\nawait runTool(() => 0);\n',
      },
      why: "a cli.ts entering through runTool — the sanctioned front-door shape (arm E's pass half). The runner home is in the population and is SKIPPED, never judged: it is not a cli.ts by shape",
    },
    {
      mode: "types",
      files: {
        [RUNNER_HOME.path]: runnerStub(),
        "tooling/src/aliascli/cli.ts": 'import { runTool as run } from "../_shared/run-tool.ts";\nawait run(() => 0);\n',
      },
      why: "AN IMPORT ALIAS enters the same runner — the callee resolves to the home's export whatever it was spelled as. The legacy text comparison reported this cli as unentered",
    },
    {
      mode: "types",
      files: {
        [RUNNER_HOME.path]: runnerStub(),
        "tooling/src/nestedcli/cli.ts":
          'import { runTool } from "../_shared/run-tool.ts";\nasync function boot(): Promise<void> {\n  await runTool(() => 0);\n}\nawait boot();\n',
      },
      why: "DECLARED LIMIT, carried from the legacy: the runner call may sit anywhere in the cli, not only at module scope — the legacy accepted any call, and the module-scope rule is the ops-direct-invocation program arm's, not this policy's",
    },
    {
      mode: "types",
      files: { [RUNNER_HOME.path]: runnerStub(), "tooling/src/snap/ops/cli.ts": "export const c = 1;\n" },
      why: "THE CLI SHAPE IS FOUR SEGMENTS: a `cli.ts` nested under ops/ is an ordinary module, not a tool's front door, and is outside the population by the `tooling/src/*/cli.ts` glob. The runner home keeps the fixture admitted",
    },
  ],
});

/** The runner's export surface, planted so a proof locates it: an absent home REFUSES the run by receipt. */
function runnerStub(): string {
  return "export async function runTool(main: () => number): Promise<void> {\n  void main;\n}\n";
}
