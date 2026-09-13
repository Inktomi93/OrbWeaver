// Policy: tooling-process-exit-home (docs/architecture/core/Core-Tooling-Law.md §4.4, arm D of the retired
// `tooling-shared-plumbing`) — the process EXITS in ONE home, `_shared/run-tool.ts` (the exit-honesty
// runner: crash≠verdict, pipe-drain, never-downgrade). A `process.exit(` anywhere else under `tooling/src/**`
// drops unflushed stdout mid-report AND dodges the runner's exit classification. Comment posture:
// comment-SAFE (node kinds only).
//
// AUTHORITY IS reviewed-grant (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments", #1950 group 4): the legacy `HOMES` row for run-tool.ts is a
// recurring repository PERMISSION — one exact row, `(run-tool.ts, process-exit)`; the legacy stale sweep is
// central grant liveness.
//
// FAMILY `process-member` — the shared reader is `lib/process-member-origin.ts#classifyProcessMemberRead`,
// the SAME predicate `tooling-argv-front-door` and its health sibling judge `process.argv` with: what counts
// as "a member of the REAL process" is one reader in three policies, generalized over the member name. A
// `tooling-process-exit` singleton would have re-spelled it, which is the two-spellings-of-one-concept merge
// case the family law forbids. IDENTITY, NOT SPELLING: the legacy compared the receiver's TEXT to `process`;
// the subject is now the `exit` member of the real `process` — the ambient global or the default export of
// the `node:process` door (the live spelling, `_shared/run-tool.ts:12`) — so a local object named `process`
// is provably different and passes (mustPass[0]), and a receiver the readers cannot place is REPORTED under
// the disjoint UNREADABLE text (mustFlag[2], #944). Both the dotted and the computed-literal
// `process["exit"]` spelling are one call (mustFlag[1]).
//
// THE AMBIENT BRANCH: the shared `_proof/node-types.ts` plant declares `argv`/`env`/`pid`/`hrtime` on the
// augmented `NodeJS.Process` and not `exit`, so a module row cannot reach the resolved global branch for
// this member without editing a plant three other policies share; the branch is pinned in the family test
// against a plant DERIVED from that one (the same augmentation shape plus `exit`), and the undeclared-global
// row here (mustFlag[2]) pins the refusal side. Extending the shared plant with `exit` is the recorded
// follow-up that lets a module row take the pin over.
//
// THE REPORTED POSITION is the member read as written (`process.exit`). `entire-population` because grant
// liveness is only sound after a complete run; a narrowed request DEFERS this policy (pinned in
// tests/tooling/verify/gates/tooling-plumbing-family.test.ts). POPULATION PORT: byte-identical (`@tooling`).
//
// Legacy descriptor: `2c1a1d37c` (`tooling/src/verify/gates/tooling-shared-plumbing.ts`, arm D). No private
// marker grammar; zero live `@orb-gate-ignore tooling-shared-plumbing` markers at conversion.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyProcessMemberRead } from "../lib/process-member-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const EXIT_MEMBER = "exit";
const OPERATION = "process-exit";

const MESSAGE =
  "a bare process.exit outside the exit-honesty runner — `process.exit()` drops unflushed stdout (a large report truncates mid-line) AND dodges the runner's crash≠verdict / never-downgrade classification; the ONE exit lives in _shared/run-tool.ts, and every other path sets `process.exitCode` or returns its EXIT member and lets the loop drain (docs/architecture/core/Core-Tooling-Law.md §4.4).";
const UNREADABLE =
  "a call spelled like process.exit whose receiver the shared readers cannot place, so whether it exits the real process CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "return the EXIT member (or set `process.exitCode`) and let `runTool` (_shared/run-tool.ts) own the exit; a genuine hard exit belongs in the runner, which carries the exact reviewed grant `(run-tool.ts, process-exit)`.";

export const gate = defineGate({
  id: "tooling-process-exit-home",
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
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.CallExpression)) {
              return;
            }
            const callee = node.getExpression();
            if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
              return;
            }
            const verdict = classifyProcessMemberRead(callee, EXIT_MEMBER);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              // The member read as written (`process.exit`) — the call's own leading slice.
              token: callee.getText(),
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
      files: { "tooling/src/ast/ops/bail.ts": 'import process from "node:process";\nexport function bail(): never {\n  process.exit(2);\n}\n' },
      expect: { count: 1, token: "process.exit", messageIncludes: "a bare process.exit" },
      why: "the founding shape through the `node:process` door (the live spelling): a bare exit outside run-tool — drops the pipe and dodges the exit-honesty runner (arm D). `messageIncludes` names the PRECISE text, which the unreadable arm never emits, so this row proves the door branch resolved rather than fail-closed",
    },
    {
      mode: "types",
      files: { "tooling/src/ast/ops/element.ts": 'import process from "node:process";\nexport function bail(): never {\n  process["exit"](2);\n}\n' },
      expect: { count: 1, token: 'process["exit"]', messageIncludes: "a bare process.exit" },
      why: "the ELEMENT-ACCESS spelling — a dotted-only matcher would be the loophole; the position is the read as written",
    },
    {
      mode: "types",
      files: { "tooling/src/ast/ops/undeclared.ts": "export function bail(): never {\n  process.exit(2);\n}\n" },
      expect: { count: 1, token: "process.exit", messageIncludes: "CANNOT be established" },
      why: "THE UNDECLARED GLOBAL: the ambient spelling in a project WITHOUT `@types/node` binds no trusted declaration, so the shared global resolver refuses it and the policy reports fail-closed under the UNREADABLE text — a call it cannot prove is never a silent pass. The RESOLVED ambient branch is pinned in the family test against the augmentation-shaped plant (see the header)",
    },
    {
      mode: "types",
      files: {
        "tooling/src/_shared/run-tool.ts": 'import process from "node:process";\nexport function crash(): never {\n  process.exit(process.exitCode ?? 2);\n}\n',
      },
      expect: { count: 1, messageIncludes: "Subject: tooling/src/_shared/run-tool.ts, operation: process-exit" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the runner reds like any other site and is licensed by its exact grant row (`tooling-process-exit-home:run-tool`). A proof row cannot carry a grant; the family test proves the row consumes exactly this",
    },
    {
      mode: "types",
      files: {
        "tooling/src/ast/ops/twice.ts":
          'import process from "node:process";\nexport function a(): never {\n  process.exit(1);\n}\nexport function b(): never {\n  process.exit(2);\n}\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two exits in one carrier are ONE `(subject, operation)` finding, because a reviewed grant licenses one identity and two matching findings would make the row OVER-BROAD and license neither",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "tooling/src/snap/ops/local.ts": "const process = { exit: (code: number): number => code };\nexport const a = process.exit(1);\n" },
      why: 'THE IDENTITY COUNTERFACTUAL: a LOCAL object named `process` is provably a different declaration, so its `exit` is not the real process\'s. The legacy `getText() === "process"` comparison red it — the readers refuse it as a proven non-module binding, which is `other`',
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/door.ts": 'import process from "node:fs";\nexport const a = process.exit;\nexport const b = process.exit(1);\n' },
      why: "THE DOOR COMPARISON, pinned: a default import NAMED `process` from another module enters a different door (`node:fs`), which is not the process. Replacing the door comparison with a bare `reads` reds this row",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/code.ts": 'import process from "node:process";\nexport function verdict(code: number): void {\n  process.exitCode = code;\n}\n',
      },
      why: "the sanctioned shape — `process.exitCode` is set and the loop drains; it is neither the `exit` member nor a call",
    },
    {
      mode: "types",
      files: {
        "tooling/src/snap/ops/prose.ts":
          "// process.exit() drops unflushed stdout — never call it here; return the EXIT member instead.\nexport const EXIT_TOOL_ERROR = 2;\n",
      },
      why: "comment posture: comment-SAFE. The policy subscribes to node kinds, so a header explaining why not to exit must never be read as an exit (the #117/#132 class)",
    },
  ],
});
