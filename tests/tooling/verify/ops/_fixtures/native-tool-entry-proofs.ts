import type { GatePolicy } from "../../../../../tooling/src/verify/contract/policy.ts";

const RUNNER_HOME = { path: "tooling/src/floor/cli/run-tool.ts" };
function runnerStub(): string {
  return "export async function runTool(main: () => number): Promise<void> {\n  void main;\n}\n";
}

export const NATIVE_TOOL_ENTRY_PROOFS: readonly Pick<GatePolicy, "id" | "mustFlag" | "mustPass">[] = [
  {
    id: "tooling-cli-entry",
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
          "tooling/src/othercli/cli.ts": 'import { other } from "../floor/cli/run-tool.ts";\n\nother();\n',
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
          "tooling/src/goodcli/cli.ts": 'import { runTool } from "../floor/cli/run-tool.ts";\nawait runTool(() => 0);\n',
        },
        why: "a cli.ts entering through runTool — the sanctioned front-door shape (arm E's pass half). The runner home is in the population and is SKIPPED, never judged: it is not a cli.ts by shape",
      },
      {
        mode: "types",
        files: {
          [RUNNER_HOME.path]: runnerStub(),
          "tooling/src/aliascli/cli.ts": 'import { runTool as run } from "../floor/cli/run-tool.ts";\nawait run(() => 0);\n',
        },
        why: "AN IMPORT ALIAS enters the same runner — the callee resolves to the home's export whatever it was spelled as. The legacy text comparison reported this cli as unentered",
      },
      {
        mode: "types",
        files: {
          [RUNNER_HOME.path]: runnerStub(),
          "tooling/src/nestedcli/cli.ts":
            'import { runTool } from "../floor/cli/run-tool.ts";\nasync function boot(): Promise<void> {\n  await runTool(() => 0);\n}\nawait boot();\n',
        },
        why: "DECLARED LIMIT, carried from the legacy: the runner call may sit anywhere in the cli, not only at module scope — the legacy accepted any call, and the module-scope rule is the ops-direct-invocation program arm's, not this policy's",
      },
      {
        mode: "types",
        files: { [RUNNER_HOME.path]: runnerStub(), "tooling/src/snap/ops/cli.ts": "export const c = 1;\n" },
        why: "THE CLI SHAPE IS FOUR SEGMENTS: a `cli.ts` nested under ops/ is an ordinary module, not a tool's front door, and is outside the population by the `tooling/src/*/cli.ts` glob. The runner home keeps the fixture admitted",
      },
    ],
  },
  {
    id: "tooling-ops-direct-invocation",
    mustFlag: [
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts": "export const x = 1;\n",
        },
        expect: { count: 1, line: 1 },
        why: "the founding shape (#509): an ops module with no guard and no top-level work — `node <path>` loads it, runs nothing and exits 0, which every reader takes for clean",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts":
            'export const SCAFFOLD = `refuseDirectInvocation(import.meta.url, "pnpm aa");`;\n// refuseDirectInvocation(import.meta.url, "pnpm aa");\n',
        },
        expect: { count: 1, line: 1 },
        why: "THE LYING-PROOF CASE: the guard spelled inside a TEMPLATE STRING and inside a COMMENT. A text search called this module armed (it did, in new-gate.ts's scaffold) — only an AST-positional statement check answers the real question",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts":
            'function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\nexport const x = 1;\n',
        },
        expect: { count: 1, line: 1 },
        why: "THE IDENTITY RED: a LOCAL function that merely shares the guard's name refuses nothing — its callee resolves to the module's own declaration, not the home's export. The legacy text comparison called this module armed",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts": 'import { refuseDirectInvocation } from "./missing.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n',
        },
        expect: { count: 1, line: 1 },
        why: "FAIL-CLOSED: a guard call whose import door does not resolve is no PROVEN guard — the module is reported rather than silently admitted on the strength of a spelling",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts":
            "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\nexport function other(): void {}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts": 'import { other } from "../../floor/cli/entrypoint.ts";\n\nother();\n\nexport const x = 1;\n',
        },
        expect: { count: 1, line: 1 },
        why: "THE EXPORT-NAME HALF of the identity: a module-scope call into the guard HOME that is not the guard EXPORT is not a guard. Widening GUARD_HOME.names to admit `other` turns this row green, which is what pins the name half of the `(file, export)` pair",
      },
    ],
    mustPass: [
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts":
            'import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n',
        },
        why: "the armed library shape — the guard called at module scope, naming the real door. The two homes are in the population and are SKIPPED, never judged: deleting the home skip reds this row with the homes' own absent-guard findings",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/entry.ts": 'import { runTool } from "../../floor/cli/run-tool.ts";\n\nawait runTool(() => 0);\n',
        },
        why: "DERIVED EXEMPTION, not an allowlist: a module that ends in a module-scope `runTool` IS a program (a private process boundary such as `verify/ops/config-snapshot-entry.ts`) — running it does the real work, so the silent-zero lie is unrepresentable there. Structural, so it can never rot into a stale path row. Replacing the runner-home verdict with `true` reds mustFlag[2]; replacing it with `false` reds this row",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/lib/x.ts": "export const x = 1;\n",
          "tooling/src/aa/cli.ts": "export const c = 1;\n",
        },
        why: "DECLARED LIMIT: `lib/` and `cli.ts` are not in the population. The class this policy closes is the one the docs pointed people INTO — `ops/` is where the verb-shaped modules live and where every wrong spelling aimed; a cli.ts that fails to enter through runTool is the plumbing exit/CLI policy's finding, not a second red here. The two homes keep the fixture admitted",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts": "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts":
            'import { refuseDirectInvocation as refuse } from "../../floor/cli/entrypoint.ts";\n\nrefuse(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n',
        },
        why: "AN IMPORT ALIAS enters the same guard — the callee resolves to the home's export whatever it was spelled as. The legacy text comparison reported this module as unguarded",
      },
      {
        mode: "types",
        files: {
          "tooling/src/floor/cli/entrypoint.ts":
            "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\nexport function other(): void {}\n",
          "tooling/src/floor/cli/run-tool.ts": "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n",
          "tooling/src/aa/ops/x.ts":
            'import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n',
        },
        why: "THE LEGACY BLINDNESS SHAPE, judged normally: the guard home exporting a SECOND function is still the home and the guard call still resolves to the named export. The legacy sole-exported-function derivation returned undefined here and reported the whole run BLIND; a fixed export name has nothing to derive. Classified in the §4.6 differential, not a narrowing",
      },
    ],
  },
];
