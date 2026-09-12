// Policy: tooling-argv-front-door-health — the §4.6 BLINDNESS TRIPWIRE for `tooling-argv-front-door`:
// seventeen tool `cli.ts` files front this tree and every one of them reads `process.argv`; if NONE is seen
// reading it on a run over the real tree, the read matcher stopped recognising the shape and every arm of
// the sibling is vacuously green. Split from the legacy descriptor (guide §12.6, #1950) because this is a
// whole-tree HARD verdict — nobody may license "the matcher is blind" — while the sibling's findings are
// reviewed permissions; one authority per policy.
//
// FAMILY `process-member` (with `tooling-argv-front-door` and `tooling-process-exit-home`) — the shared reader is `lib/process-member-origin.ts`
// (`classifyProcessMemberRead`), the SAME predicate the sibling judges reads with, so what counts as "a
// cli.ts reads argv" here is exactly what counts as "a read" there; `lib/tooling-import-door.ts#isToolCli`
// is the shared cli shape.
//
// THE ANCHOR is the legacy one: `tooling/src/_shared/exit-contract.ts`, a file every real run loads and no
// fixture loads unless it is deliberately arming this arm. The finding anchors THERE — the legacy reported
// on the gate module's own path, and a policy that anchors a verdict on itself teaches the next lane a
// self-anchor; the file the arm already guarded on is the honest subject. The SELF-GUARD is carried
// verbatim: with the anchor absent the tripwire stays silent rather than "proving" every matcher blind
// (mustPass[1]). `entire-population` because "does any cli.ts read argv" is a question no per-file subset
// can answer; a narrowed request DEFERS this policy (pinned in the family test).
//
// POPULATION PORT: byte-identical (`@tooling`). Legacy descriptor: `4097be20d`
// (`tooling/src/verify/gates/tooling-argv-front-door.ts`, arm C).
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyProcessMemberRead } from "../lib/process-member-origin.ts";
import { isToolCli } from "../lib/tooling-import-door.ts";
import { argvLookalikeProof, nodeTypesProof } from "./_proof/node-types.ts";

const ANCHOR = "tooling/src/_shared/exit-contract.ts";
const ARGV_MEMBER = "argv";

// THE `mustFlag` ROWS CARRY NO `messageIncludes` AND MUST NOT (#1968, #2058). This module emits exactly
// ONE message — the policy-level `MESSAGE` below, with no per-finding override — and that message BEGINS
// with "blind gate", so a row asserting that fragment passes whatever the policy did. Five rows carried it
// and the claim was empty in all five. `count` + `line` are the real assertions; the discriminating work
// is done by each row's own FIXTURE, which its `why` names.
const MESSAGE =
  "blind gate — no tool cli.ts was seen reading process.argv on a real-tree run, so the argv-reader matcher recognises nothing and every arm of tooling-argv-front-door is vacuously green. Re-derive the read shape in lib/process-member-origin.ts (docs/architecture/core/Core-Tooling-Law.md §4.9).";

export const gate = defineGate({
  id: "tooling-argv-front-door-health",
  family: "process-member",
  authority: "hard",
  severity: "error",
  population: "@tooling",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Re-derive the process.argv read shape in lib/process-member-origin.ts; if the cli.ts front door itself moved, re-derive `isToolCli` in lib/tooling-import-door.ts.",
  create: (ctx) => {
    let cliReaders = 0;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile) => {
            if (classifyProcessMemberRead(node, ARGV_MEMBER) === "reads" && isToolCli(ctx.relativePath(sourceFile))) {
              cliReaders += 1;
            }
          },
        },
      ],
      evaluate: () => {
        // A whole-tree claim: without the real-tree anchor a fixture or a mini-project would "prove" the
        // matcher blind — the §4.5 misfire the legacy arm guarded against too.
        if (cliReaders > 0 || !ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === ANCHOR)) {
          return;
        }
        ctx.report.file(ANCHOR, { line: 1, column: 1 });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [ANCHOR]: "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/stack/ops/engines.ts": 'import process from "node:process";\nexport const g = process.argv.includes("--detach");\n',
        "tooling/src/stack/ops/prod-entry.ts": 'import process from "node:process";\nexport const p = process.argv.slice(2);\n',
      },
      expect: { count: 1, line: 1 },
      why: "the §4.6 blindness tripwire as carried — reviewed entries read argv but NO cli.ts does, which is what a matcher that stopped recognising the read looks like from the inside",
    },
    {
      mode: "types",
      files: {
        [ANCHOR]: "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/snap/cli.ts": 'const process = { argv: ["a"] };\nexport const a = process.argv.slice(2);\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE IDENTITY HALF of the tripwire: a cli.ts reading `argv` off a LOCAL object named `process` is not a reader of the operator's argv, so it does not clear the tripwire. Replacing the identity verdict with a bare `reads` reds this row",
    },
    {
      mode: "types",
      files: {
        [ANCHOR]: "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/snap/ops/cli.ts": 'import process from "node:process";\nexport const a = process.argv.slice(2);\n',
      },
      expect: { count: 1, line: 1 },
      why: "THE CLI SHAPE IS FOUR SEGMENTS: a `cli.ts` nested under ops/ is an ordinary module, not a tool's front door, so its read clears nothing and the tripwire fires. Widening `isToolCli` to any file named cli.ts reds this row",
    },
    {
      mode: "types",
      files: {
        [ANCHOR]: "export const EXIT = { clean: 0 } as const;\n",
        ...argvLookalikeProof(),
        "tooling/src/snap/cli.ts": "export const a = lookalike.argv;\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE GLOBAL-BRANCH COMPARISON, pinned in the tripwire: a cli.ts reading the `argv` of a DIFFERENT trusted global (`lookalike.argv`) reads nothing of the operator's, so it does not clear the tripwire. Replacing the global-branch comparison with a bare `reads` reds this row",
    },
    {
      mode: "types",
      files: {
        [ANCHOR]: "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/snap/cli.ts": "export const a = process.argv.slice(2);\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE UNDECLARED GLOBAL does not clear the tripwire: a cli.ts reading a bare `process.argv` in a project WITHOUT `@types/node` is UNREADABLE to the shared resolver, and an unprovable read counts for nothing — the tripwire fires. On the real tree the same read resolves through `@types/node` (mustPass[2])",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [ANCHOR]: "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/snap/cli.ts": 'import process from "node:process";\nexport const a = process.argv.slice(2);\n',
      },
      why: "a live cli.ts reader through the `node:process` door satisfies the tripwire, judged against the real-tree anchor",
    },
    {
      mode: "types",
      files: {
        ...nodeTypesProof(),
        [ANCHOR]: "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/snap/cli.ts": "export const a = process.argv.slice(2);\n",
      },
      why: "a live cli.ts reader through the AMBIENT global — the branch a real-tree cli.ts without an import takes, resolved through the planted `@types/node` declaration — satisfies the tripwire. Replacing the global-branch comparison with a bare `other` reds this row",
    },
    {
      mode: "types",
      files: { "tooling/src/stack/ops/engines.ts": 'import process from "node:process";\nexport const g = process.argv.includes("--detach");\n' },
      why: "THE ANCHOR GUARD: with no real-tree anchor in the project the tripwire self-guards off — a synthetic mini-project can never red it. Deleting the anchor check reds this row",
    },
  ],
});
