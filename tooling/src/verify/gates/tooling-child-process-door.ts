// Policy: tooling-child-process-door (docs/law/Core-Tooling-Law.md §4.4, arms F + F2 of the
// retired `tooling-shared-plumbing`) — every tooling spawn rides the PRIORITY_BELOW_NORMAL (10, every OS) homelab floor through the ONE
// subprocess home, `_shared/proc.ts`: a `node:child_process` import anywhere else under `tooling/src/**` is a
// raw spawn that bypasses the floor (arm F), and a call to one of the home's FULL-PRIORITY doors
// (`spawnFullPrioritySync`, `spawnFullPriorityChild` — the un-niced exceptions for a process a human waits
// on or that IS the workload) is legal only for a reviewed caller (arm F2). Comment posture: comment-SAFE
// (node kinds only).
//
// AUTHORITY IS reviewed-grant (#1950 group 4): the legacy `HOMES` row for proc.ts and the
// four-row `FULL_PRIORITY_CALLERS` census are recurring repository PERMISSIONS with stated end conditions —
// `(proc.ts, child-process-import)` and one `(caller, full-priority-spawn)` per caller (the surviving legacy
// callers plus `stack-start` and `dev`, the portable `pnpm start` and `pnpm dev`, whose children are the app
// a person is using and for which the niced doors do not exist off POSIX); the legacy
// two-sided stale sweep is central grant liveness. Both arms share one policy because they share one
// subject (the subprocess home) and one authority. FAMILY: a SINGLETON under its own id.
//
// IDENTITY FOR THE DOORS, SPECIFIER FOR THE IMPORT: the import arm matches the module specifier exactly
// (`node:child_process` and the bare `child_process` spelling, mustFlag[1] — an import has no other identity).
// The full-priority doors are judged by DECLARATION against the LOCATED `_shared/proc.ts` home through
// `lib/project-home-origin.ts`, so a local function that merely shares a door's name is NOT the door
// (mustPass[0] — the legacy text comparison red it, and the un-niced spawn such a function would need is
// caught by the import arm, mustFlag[6]) and an aliased import is (mustFlag[3]); a callee the readers cannot
// place is REPORTED under the disjoint UNREADABLE text (mustFlag[5]). The home is located and RECEIPTED, so an
// absent proc.ts or a renamed door refuses the run at the receipt phase (pinned through `runPolicyPass` in
// tests/tooling/verify/gates/tooling-plumbing-family.suite.test.ts). The home's own body is skipped for the door
// arm by derivation — it DEFINES the doors — never by a row.
//
// THE REPORTED POSITION is the quoted specifier for an import and the callee as written for a door call.
// `entire-population` because grant liveness is only sound after a complete run; a narrowed request DEFERS
// this policy. POPULATION PORT: byte-identical (`@tooling`).
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arms F + F2). No
// private marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-shared-plumbing` descriptor at daf3444358fc10c2b0a3bc3377c62abe23e82c63, the parent of the conversion
// `7b80f66a4`; this module did not exist there, so it is measured against the module it was carved from,
// `tooling-shared-plumbing` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `2c1a1d37c` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,464 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,617 and final `population` admits 1,120.
// legacy − final = 497 — `tests/tooling/**` (482) and `tests/e2e/support/**` (15): arms F/F2 fenced to `tooling/src`
// inside `visit`. final − legacy = ∅. Controls: inside `tooling/src/_shared/__cbbhr_in_appearance-flags.ts` (virtual)
// admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const PROC_HOME = { path: "tooling/src/_shared/proc.ts", names: ["spawnFullPrioritySync", "spawnFullPriorityChild"] } as const;
const PROC_RECEIPT = "child-process home: proc";
/** node's two spellings of the subprocess module. */
const CHILD_PROCESS_DOORS: ReadonlySet<string> = new Set(["node:child_process", "child_process"]);
const IMPORT_OPERATION = "child-process-import";
const SPAWN_OPERATION = "full-priority-spawn";

const MESSAGE =
  "a subprocess outside the ONE home — every tooling spawn rides the PRIORITY_BELOW_NORMAL (10, every OS) homelab floor through _shared/proc.ts (`spawnNiced`/`runNicedSync`/`spawnNicedChild`): a direct `node:child_process` import bypasses the floor, and a call to a FULL-PRIORITY door (`spawnFullPrioritySync`/`spawnFullPriorityChild`, the un-niced exceptions for a process a human waits on or that IS the workload) is licensed per caller by an exact reviewed grant, never ambient (docs/law/Core-Tooling-Law.md §4.4).";
const UNREADABLE =
  "a call spelled like a full-priority spawn door whose callee the shared readers cannot place, so whether it is proc.ts's un-niced door CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "spawn through `spawnNiced`/`runNicedSync`/`spawnNicedChild` from _shared/proc.ts; a process that genuinely must not be niced (a boot a human waits on, a server that IS the workload) takes an exact reviewed grant `(file, full-priority-spawn)` in lib/reviewed-grants.ts stating why nice is wrong there and what ends it.";

/** The callee's spelled name, so only a call that LOOKS like a door is carried to the identity readers. */
function calleeName(expression: Node): string | undefined {
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  const member = readMemberReference(expression);
  return member.kind === "resolved" ? member.value.name : undefined;
}

export const gate = defineGate({
  id: "tooling-child-process-door",
  family: "tooling-child-process-door",
  authority: "reviewed-grant",
  severity: "error",
  population: "@tooling",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const proc = locateProjectHome(ctx.files, ctx.relativePath, PROC_HOME);
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.ImportDeclaration)) {
              return;
            }
            if (!CHILD_PROCESS_DOORS.has(node.getModuleSpecifierValue())) {
              return;
            }
            const specifier = node.getModuleSpecifier();
            candidates.push({ node: specifier, subject: ctx.relativePath(sourceFile), operation: IMPORT_OPERATION, token: specifier.getText(), offset: 0 });
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.CallExpression)) {
              return;
            }
            const rel = ctx.relativePath(sourceFile);
            if (rel === PROC_HOME.path) {
              return;
            }
            const callee = node.getExpression();
            // Identity FIRST (an aliased door spells a different local name); the spelled name gates only the
            // fail-closed answer, so an unplaceable callee is reported only when it is spelled like a door.
            const verdict = classifyProjectHomeOrigin(callee, proc);
            if (verdict === "other") {
              return;
            }
            const name = calleeName(callee);
            if (verdict === "unreadable" && (name === undefined || !proc.names.has(name))) {
              return;
            }
            candidates.push({
              node,
              subject: rel,
              operation: SPAWN_OPERATION,
              token: callee.getText(),
              offset: 0,
              ...(verdict === "unreadable" ? { unreadable: true } : {}),
            });
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: PROC_RECEIPT, members: proc.members, unresolved: proc.unresolved });
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "tooling/src/seed/ops/raw.ts", operation: "child-process-import" },
      files: { [PROC_HOME.path]: procStub(), "tooling/src/seed/ops/raw.ts": 'import { spawn } from "node:child_process";\nexport const s = spawn;\n' },
      expect: { count: 1, token: '"node:child_process"', messageIncludes: "Subject: tooling/src/seed/ops/raw.ts, operation: child-process-import" },
      why: "the founding shape — a direct child_process import outside proc.ts bypasses the PRIORITY_BELOW_NORMAL (10, every OS) homelab floor (arm F); the position is the quoted specifier",
    },
    {
      mode: "types",
      files: { [PROC_HOME.path]: procStub(), "tooling/src/seed/ops/bare.ts": 'import { spawn } from "child_process";\nexport const s = spawn;\n' },
      expect: { count: 1, token: '"child_process"' },
      why: "the BARE specifier spelling of the same module — a `node:`-only matcher would be the loophole",
    },
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/hot.ts":
          'import { spawnFullPrioritySync } from "../../_shared/proc.ts";\nexport const x = (): void => spawnFullPrioritySync("x", []);\n',
      },
      expect: { count: 1, token: "spawnFullPrioritySync", messageIncludes: "operation: full-priority-spawn" },
      why: "an un-censused full-priority spawn through the real door — the exception is licensed by an exact grant row, never ambient (arm F2)",
    },
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/warm.ts":
          'import { spawnFullPriorityChild as detach } from "../../_shared/proc.ts";\nexport const x = (): void => detach("x", []);\n',
      },
      expect: { count: 1, token: "detach", messageIncludes: "operation: full-priority-spawn" },
      why: "the DETACHED door through an IMPORT ALIAS — the callee resolves to the home's export whatever it was spelled as, and a second door must not be a second loophole (arm F2 matches the door SET). The legacy text comparison passed this call",
    },
    {
      mode: "types",
      files: { [PROC_HOME.path]: `import { spawn } from "node:child_process";\n${procStub()}export const s = spawn;\n` },
      expect: { count: 1, messageIncludes: "Subject: tooling/src/_shared/proc.ts, operation: child-process-import" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the home's own child_process import reds like any other and is licensed by its exact grant row (`tooling-child-process-door:proc`); the home's door DEFINITIONS are not calls and its body is skipped for the door arm by derivation",
    },
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/blind.ts":
          'import { spawnFullPriorityChild } from "./missing.ts";\nexport const x = (): void => spawnFullPriorityChild("x", []);\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "FAIL-CLOSED (#944): a door-spelled callee whose import does not resolve is not proven NOT to be the door — reported under the disjoint UNREADABLE text rather than silently admitted on the strength of a spelling",
    },
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/own-spawn.ts":
          'import { spawn } from "node:child_process";\nfunction spawnFullPrioritySync(c: string, a: readonly string[]): void {\n  void spawn(c, [...a]);\n}\nexport const x = (): void => spawnFullPrioritySync("x", []);\n',
      },
      expect: { count: 1, token: '"node:child_process"' },
      why: "THE CLASS THE LEGACY F2 TEXT MATCH STOOD FOR, caught where it actually lives: a LOCAL function named like a door that really spawns un-niced must import child_process to do so, and the import arm reds it — the identity refusal of the local name (mustPass[0]) narrows nothing",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/local.ts":
          'declare function spawnFullPrioritySync(c: string, a: string[]): void;\nexport const x = (): void => spawnFullPrioritySync("x", []);\n',
      },
      why: "THE IDENTITY COUNTERFACTUAL — the legacy's own F2 fixture: a LOCAL declaration that merely shares a door's name is provably not proc.ts's door, so it is no full-priority spawn. What it could have stood for (an un-niced spawn) needs child_process and is the import arm's finding (mustFlag[7])",
    },
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/niced.ts": 'import { spawnNiced } from "../../_shared/proc.ts";\nexport const x = spawnNiced("x", []);\n',
      },
      why: "the sanctioned shape — a spawn through the home's NICED door needs no permission; the name prefilter never carries it to the identity readers",
    },
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/prose.ts":
          '// import { spawn } from "node:child_process" is banned here; use spawnNiced from _shared/proc.ts.\nexport const doc = true;\n',
      },
      why: "comment posture: comment-SAFE. The policy subscribes to node kinds, so a header naming the banned import is not an import",
    },
    {
      mode: "types",
      files: { [PROC_HOME.path]: procStub(), "scripts/probes/some-probe.ts": 'import { spawn } from "node:child_process";\nexport const s = spawn;\n' },
      why: "THE DECLARED LIMIT (#1118): the research zone is outside the population BY DERIVATION, not by a grant — a probe PROMOTED into tooling/src/<tool>/ is judged from its first day there. The home keeps the fixture admitted",
    },
    {
      mode: "types",
      files: {
        [PROC_HOME.path]: procStub(),
        "tooling/src/seed/ops/written.ts":
          'import { spawnFullPrioritySync } from "../../_shared/proc.ts";\nlet door = spawnFullPrioritySync;\ndoor = spawnFullPrioritySync;\nexport const x = (): void => door("x", []);\n',
      },
      why: "DECLARED LIMIT OF THE PREFILTER, recorded rather than hidden: a WRITTEN binding under a name that is not a door's is never carried to the identity readers, so it is neither reported nor fail-closed here — the unreadable arm needs the door's own spelling (mustFlag[5]). Widening the prefilter to every callee would report every unplaceable call in the tree",
    },
  ],
});

/** The home's door surface, planted so a proof locates it: an absent home REFUSES the run by receipt. */
function procStub(): string {
  return [
    "export function spawnFullPrioritySync(cmd: string, args: readonly string[]): void {",
    "  void cmd;",
    "  void args;",
    "}",
    "export function spawnFullPriorityChild(cmd: string, args: readonly string[]): void {",
    "  void cmd;",
    "  void args;",
    "}",
    "export function spawnNiced(cmd: string, args: readonly string[]): void {",
    "  void cmd;",
    "  void args;",
    "}",
    "",
  ].join("\n");
}
