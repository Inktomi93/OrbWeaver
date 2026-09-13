// Policy: tooling-argv-front-door (docs/architecture/core/Core-Tooling-Law.md §4.9) — the OPERATOR'S ARGV enters
// a tooling program at exactly ONE place and flows DOWN as a `readonly string[]` parameter. A `process.argv`
// read is legal only in a tool's `cli.ts` — derived by SHAPE (`tooling/src/<tool>/cli.ts`), so a cli.ts that
// moves reds at its new path — or in a censused ENTRY: the node half a `.sh` execs, which has no cli.ts by
// §2.5, plus `_shared/entrypoint.ts`, whose subject is `argv[1]` (the ENTRY IDENTITY), never the operator's
// flags. A library reading the GLOBAL argv makes its behaviour depend on how the process was started: it
// cannot be driven at its own seam, it silently re-admits flags the front door refused, and two callers of
// the same helper get different answers. Comment posture: comment-SAFE (node kinds only).
//
// AUTHORITY IS reviewed-grant — TWO policies, not the three docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments" first ruled (refuted on the tree and
// approved by the orchestrator, 2026-09-12, #1950). The legacy descriptor had ONE predicate (a non-cli
// `process.argv` read) and one exemption table (`ARGV_ENTRIES`, six rows); an ordinary policy and a
// reviewed-grant policy over that predicate would both report every non-cli read unless one partitioned by
// the table's subjects, which §12.5 keeps out of gate modules. The entries are recurring repository
// PERMISSIONS, so the six rows are six exact `(subject, operation)` rows in the central reviewed-grant table,
// each carrying its legacy `why` and an `endsWhen`; the legacy arm-B two-sided stale sweep IS central grant
// liveness (a row consumed zero times after a complete run is STALE, whether its file stopped reading argv or
// is gone). Zero live `@orb-gate-ignore` markers ever used the legacy ordinary door. The blindness tripwire
// (arm C) is `tooling-argv-front-door-health`, hard, in this family.
//
// THE PARTITION DELIBERATELY NOT TAKEN: five of the six entries are module-scope `runTool` PROGRAMS, so
// "a runTool program is a front door like cli.ts" was derivable and would have emptied the table to one
// row. It was REFUSED because it NARROWS the catch — a new `runTool` program reading argv would pass
// unreviewed where today it needs a censused row, which is the catch-regression guide §6.4 exists to find.
// Do not re-propose it.
//
// FAMILY `process-member` (with `tooling-argv-front-door-health` and, since #1950 group 4,
// `tooling-process-exit-home`, the same reader over the `exit` member) — the shared reader is `lib/process-member-origin.ts`
// (`classifyProcessMemberRead`): IDENTITY, NOT SPELLING. The legacy check compared the receiver's TEXT to
// `process`; the subject is now the `argv` member of the REAL `process` — the ambient global or the default
// export of the `node:process` door (mustFlag[2], the live spelling) — so a local object named `process` is
// provably different and passes (mustPass[5]), and a receiver the readers cannot place is REPORTED under the
// disjoint UNREADABLE text (mustFlag[3], #944). Both the dotted and the computed-literal `process["argv"]`
// spelling are one read (mustFlag[1]).
//
// AND THE ELEMENT SPELLING WAS ONE READ IN THE ACCUSING DIRECTION ONLY (#2058, fixed 2026-09-12). The
// reader classified its refusal on the member READ rather than on the RECEIVER, and
// `classifyOriginRefusal`'s `leafIdentifier` only unwraps a PropertyAccess, so every `bag["argv"]` in the
// corpus took the fail-closed arm: TWO real-tree errors on JSON bags — `snap/ops/run-report-index-assert.ts:97`
// and `verify/lib/ct-runner-lock.ts:69` — in a reviewed-grant policy that has no ordinary door to waive
// them with. `mustPass[4]` is the twin of `mustFlag[1]`: together they pin the discriminator as the
// receiver's IDENTITY rather than the spelling, in both directions.
//
// THE REPORTED POSITION is the whole member read as written (`process.argv` / `process["argv"]`). The legacy
// normalized the element form to `process.argv`, which is not an exact slice of that node and would throw
// in the final sink. `entire-population` because grant liveness is only sound after a complete run; a
// narrowed request DEFERS this policy (pinned in tests/tooling/verify/gates/tooling-front-door-family.test.ts).
//
// POPULATION PORT: byte-identical — the legacy `scanRoot: p.startsWith("tooling/src/")` is `@tooling`, and
// the DECLARED LIMIT it carried is unchanged: `scripts/**` (the research zone, #1118) is outside the
// population by derivation, never by an allowlist row, so a probe PROMOTED into `tooling/src/<tool>/` is
// judged from its first day there (mustPass[4], with an in-population anchor file because a fixture that
// admits nothing is a population tool error).
//
// Legacy descriptor: `4097be20d` (`tooling/src/verify/gates/tooling-argv-front-door.ts`). No private marker
// grammar; zero live `@orb-gate-ignore tooling-argv-front-door` markers at conversion (rg over packages/,
// tests/, tooling/, scripts/), so no translation was owed. The `isGovernedArgvEntry` door the legacy
// exported for `tests/tooling/_shared/entrypoint.int.test.ts` is gone with the table: that twin derives the
// governed entries from `REVIEWED_GRANTS` itself.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-argv-front-door` descriptor at f1bbc34e7e6961bb5cbb607c17470a642e44a1ca, the parent of the conversion
// `e2b183b80` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `4097be20d`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,445 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,105 and final `population` admits 1,105.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `tooling/src/_shared/__cbbhr_in_appearance-flags.ts`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyProcessMemberRead } from "../lib/process-member-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { isToolCli } from "../lib/tooling-import-door.ts";
import { argvLookalikeProof, nodeTypesProof } from "./_proof/node-types.ts";

const ARGV_MEMBER = "argv";
const OPERATION = "process-argv-read";

const MESSAGE =
  "a second argv reader — the operator's argv enters a tooling program at ONE place (the tool's cli.ts, or a reviewed bash-fronted entry) and flows DOWN as a `readonly string[]` parameter. An ops/lib/contract module reading the GLOBAL argv makes its behaviour depend on how the process was started: it cannot be driven at its own seam, it silently re-admits flags the front door refused, and two callers of the same helper get different answers (docs/architecture/core/Core-Tooling-Law.md §2.5/§4.9).";
const UNREADABLE =
  "a member read spelled like process.argv whose receiver the shared readers cannot place, so whether it is the operator's argv CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the receiver a readable binding, or take argv as a parameter (docs/architecture/core/Core-Tooling-Law.md §2.5/§4.9).";
const FIX =
  "take `argv: readonly string[]` as a parameter and let the cli.ts pass `process.argv.slice(2)` down — the strict grammar stays in the tool's own parse module. A bash-fronted node half that IS the program takes an exact reviewed grant `(file, process-argv-read)`.";

export const gate = defineGate({
  id: "tooling-argv-front-door",
  family: "process-member",
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
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile) => {
            const verdict = classifyProcessMemberRead(node, ARGV_MEMBER);
            if (verdict === "other") {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            if (isToolCli(subject)) {
              return;
            }
            candidates.push({
              node,
              subject,
              operation: OPERATION,
              token: node.getText(),
              offset: 0,
              ...(verdict === "unreadable" ? { unreadable: true } : {}),
            });
          },
        },
      ],
      evaluate: () => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "tooling/src/codemod/lib/diagnostics.ts", operation: "process-argv-read" },
      files: { "tooling/src/codemod/lib/diagnostics.ts": 'import process from "node:process";\nexport const limit = process.argv.slice(2).length;\n' },
      expect: { count: 1, token: "process.argv", messageIncludes: "a second argv reader" },
      why: "the founding shape — a LIBRARY helper reading the global argv through the `node:process` door (the live spelling), so its behaviour depends on how the process was started and no caller can drive it. `messageIncludes` names the PRECISE text, which the unreadable arm never emits, so this row proves the door branch resolved rather than fail-closed",
    },
    {
      mode: "types",
      files: { "tooling/src/ast/lib/emit.ts": 'import process from "node:process";\nexport const v = process["argv"][2];\n' },
      expect: { count: 1, token: 'process["argv"]' },
      why: "the ELEMENT-ACCESS spelling — a dotted-only matcher would be the loophole, and an index sweep habitually misses it; the position is the read as written",
    },
    {
      mode: "types",
      files: { ...nodeTypesProof(), "tooling/src/stack/ops/prod.ts": 'export const sep = process.argv.indexOf("--");\n' },
      expect: { count: 1, token: "process.argv", messageIncludes: "a second argv reader" },
      why: "the AMBIENT GLOBAL spelling — no import at all — resolves through the planted `@types/node` declaration to the global `process` (the branch every real-tree read without an import takes); the same read one directory up from the front door. Precise, not fail-closed: the message fragment is MESSAGE-only",
    },
    {
      mode: "types",
      files: { "tooling/src/stack/ops/undeclared.ts": 'export const sep = process.argv.indexOf("--");\n' },
      expect: { count: 1, token: "process.argv", messageIncludes: "CANNOT be established" },
      why: "THE UNDECLARED GLOBAL: the same ambient spelling in a project WITHOUT `@types/node` binds no trusted declaration, so the shared global resolver refuses it and the policy reports fail-closed under the UNREADABLE text — a read it cannot prove is never a silent pass. This is the §4.8b hazard made explicit: without the planted types the row above would pass for THIS reason",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/written.ts": 'import proc from "node:process";\nlet process = proc;\nprocess = proc;\nexport const a = process.argv.slice(2);\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944): a WRITTEN local binding named `process` might still hold the real process, so the readers refuse it as ambiguous and the policy reports under the disjoint UNREADABLE text instead of passing",
    },
    {
      mode: "types",
      files: { "tooling/src/stack/ops/engines.ts": 'import process from "node:process";\nexport const d = process.argv.includes("--detach");\n' },
      expect: { count: 1, messageIncludes: "Subject: tooling/src/stack/ops/engines.ts, operation: process-argv-read" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: a reviewed bash-fronted entry reds like any other reader and is licensed by its exact grant row (`tooling-argv-front-door:stack-engines`), so a new entry is a finding until someone reviews it. The family test proves this real central grant consumes the identity; module witnesses independently prove the synthetic exact-grant door",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/twice.ts":
          'import process from "node:process";\nexport const a = process.argv.slice(2);\nexport const b = process.argv.length;\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two reads in one carrier are ONE `(subject, operation)` finding, because a reviewed grant licenses one identity and two matching findings would make the row OVER-BROAD and license neither",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "tooling/src/seed/cli.ts": 'import process from "node:process";\nexport const a = process.argv.slice(2);\n' },
      why: "the sanctioned front door — a tool cli.ts is SCANNED and admitted by shape, not population-excluded, so a cli.ts that moves reds at its new path. Dropping the `isToolCli` skip reds this row",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/parse.ts": "export function parseArgs(argv: readonly string[]): number {\n  return argv.length;\n}\n" },
      why: "the house shape the policy exists to force — a parse module takes argv as a PARAMETER and reads no global; the declared limit is that the policy says nothing about that grammar's strictness",
    },
    {
      mode: "types",
      files: {
        "tooling/src/stack/ops/prod.ts": "// process.argv is [node, script, verb, ...] — the operator's own argv starts here.\nexport const AFTER_VERB = 3;\n",
      },
      why: "comment posture: comment-SAFE. The policy subscribes to node kinds, so a header explaining the argv layout must never be read as a read (the #117/#132 class)",
    },
    {
      mode: "types",
      files: {
        "tooling/src/verify/lib/selection.ts":
          "export function pick(opts: { readonly argv: readonly string[] }): string | undefined {\n  return opts.argv[0];\n}\n",
      },
      why: "a `.argv` property read on something that is NOT `process` — the reader keys on the receiver's identity, so an options bag carrying argv is untouched",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/index-assert.ts":
          'export function check(value: Record<string, unknown>, raw: unknown): boolean {\n  return Array.isArray(value["argv"]) && typeof (raw as Record<string, unknown>)["argv"] === "string";\n}\n',
      },
      why: 'ELEMENT ACCESS × NON-PROCESS RECEIVER (#2058), the twin of the row above and the shape that was reported TWICE on the real tree. `value["argv"]` and `(raw as Record<string, unknown>)["argv"]` are JSON bags, not the operator\'s argv, and neither can be: the receiver is a parameter. Both spellings are here because the second adds a cast the receiver must be unwrapped through. The mustFlag element-access row above proves the reader still CATCHES `process["argv"]`, so this row and that one together pin the discriminator as the RECEIVER rather than the spelling',
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/lib/clean.ts": "export const clean = true;\n",
        "scripts/probes/some-probe.ts": 'import process from "node:process";\nexport const args = process.argv.slice(2);\n',
      },
      why: "THE DECLARED LIMIT (#1118): the research zone is outside the population BY DERIVATION, not by an allowlist row — same language, same read, only the ZONE differs from the mustFlag rows above. `scripts/**` is throwaway probes + launcher shims where KISS applies (Core-Tooling-Law §2.7); a probe PROMOTED into tooling/src/<tool>/ is judged from its first day there. The clean tooling file keeps the fixture admitted",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/local.ts": 'const process = { argv: ["a", "b"] };\nexport const a = process.argv.slice(2);\n' },
      why: 'THE IDENTITY COUNTERFACTUAL: a LOCAL object named `process` is provably a different declaration, so its `argv` is not the operator\'s. The legacy `getText() === "process"` comparison red it — the readers refuse it as a proven non-module binding, which is `other`',
    },
    {
      mode: "types",
      files: { ...argvLookalikeProof(), "tooling/src/snap/ops/lookalike.ts": "export const a = lookalike.argv;\n" },
      why: "THE GLOBAL-BRANCH COMPARISON, pinned: an `argv` member of a DIFFERENT trusted global (`lookalike.argv`, planted as a `@types/` declaration) resolves to that global, and the name comparison refuses it. Replacing the global-branch comparison with a bare `reads` reds this row. (`process.env.argv` and `const process = console` were tried first and do NOT reach the comparison — a member no trusted declaration names is refused as unreadable one step earlier)",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/door.ts": 'import process from "node:fs";\nexport const a = process.argv;\n' },
      why: "THE DOOR COMPARISON, pinned: a default import NAMED `process` from another module enters a different door (`node:fs`), which is not the process. Replacing the door comparison with a bare `reads` reds this row",
    },
  ],
});
