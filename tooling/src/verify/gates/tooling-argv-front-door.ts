// Gate: tooling-argv-front-door (docs/architecture/core/Core-Tooling-Law.md §4.9) — the OPERATOR'S ARGV enters a
// tooling program at exactly ONE place and flows DOWN as a parameter. Arms: (A) a `process.argv` read
// (dotted or `process["argv"]`) outside a tool `cli.ts` / a censused ARGV_ENTRIES row; (B) the two-sided
// stale sweep over ARGV_ENTRIES; (C) the §4.6 blindness tripwire — zero cli.ts readers on a real-tree run.
// Scan-and-allowlist over the entries (GATE-AUTHORING §4). Comment posture: comment-SAFE (node kinds only).
//
// DECLARED LIMIT — the RESEARCH ZONE is out of scope, by derivation (#1118, and its own mustPass row
// below). `scripts/**` is the explicitly throwaway zone where KISS/YAGNI still apply (Core-Tooling-Law
// §2.7): 13 readers there today (10 `.ts` probes + the three launcher shims `ts7.cjs`,
// `review-mirror.mjs`, `vitest-supervised.mjs`), none of them a product surface, none of them a LIBRARY a
// second caller drives — each IS its own program, which is the very shape this gate sanctions in a
// `cli.ts`. The exclusion is not an allowlist and not a fence bolted on: `scanRoot` admits
// `tooling/src/` and nothing else, so a research script is never a candidate, and a probe PROMOTED into
// `tooling/src/<tool>/` (the §2.7 promotion path) enters the gate the moment it lands. That direction —
// zone in, immediately judged — is what the mustPass pair below writes down.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { readStringValue } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

const TOOLING_PREFIX = "tooling/src/";
const ANCHOR = "tooling/src/_shared/exit-contract.ts";
/** The five-slot template's argv front door: `tooling/src/<tool>/cli.ts` (Core-Tooling-Law §2.5). Derived
 *  by shape, not by a path list — a cli.ts that moves stops being one and its read goes RED at the new
 *  path, which is the rot a hand-written home table cannot have. */
const CLI_RE = /^tooling\/src\/[^/]+\/cli\.ts$/u;

/** The NON-`cli.ts` programs: a BASH-FRONTED tool has no cli.ts by §2.5 (its `.sh` is the argv front
 *  door), so the node half it execs reads argv itself — plus the one module whose SUBJECT is `argv[1]`,
 *  the entry identity, rather than the operator's argv. Every row states what would end it; the sweep in
 *  `run` REDs a row whose file stopped reading argv (both staleness modes — GATE-AUTHORING §4.4a). */
const ARGV_ENTRIES: ExemptionTable = {
  "tooling/src/_shared/entrypoint.ts": {
    why: "reads argv[1] — the ENTRY IDENTITY ('was this module the program?'), never the operator's flags; it is the one home for that question. Ends if the direct-invocation refusal moves or stops asking it.",
  },
  "tooling/src/stack/ops/dev-identity-entry.ts": {
    why: "the node half stack.sh execs for the dev-identity verbs — a BASH_FRONTED_TOOLS tool has no cli.ts (Core-Tooling-Law §2.5/§4.1). Ends if stack grows a cli.ts or this entry is retired.",
  },
  "tooling/src/stack/ops/engines-ctl.ts": {
    why: "the node half engines.sh execs for status/stop/sleep/wake/reconcile — same bash-fronted exception. Ends if the fleet front door stops being bash.",
  },
  "tooling/src/stack/ops/engines.ts": {
    why: "the node half engines.sh setsid-execs to boot the fleet (`--detach`) — same bash-fronted exception. Ends if the launcher moves behind a cli.ts.",
  },
  "tooling/src/stack/ops/prod-entry.ts": {
    why: "the node half stack.sh execs for every PROD invocation — same bash-fronted exception. Ends if stack grows a cli.ts or this entry is retired.",
  },
  "tooling/src/verify/ops/config-snapshot-entry.ts": {
    why: "the private process boundary readConfigSnapshot execs so native config loading does not eagerly import the whole verify CLI; its argv is a parent-authored runner/config request validated by the shared snapshot operation, never a second operator door. Ends if snapshot observation moves in-process or behind a different worker.",
  },
};

const seenEntries = new Set<string>();
let seenCliReaders = 0;

function relOf(abs: string): string | null {
  const norm = abs.replace(/\\/gu, "/");
  const i = norm.indexOf(`/${TOOLING_PREFIX}`);
  return i === -1 ? null : norm.slice(i + 1);
}

/** Both spellings of the read, so a dotted-only matcher is not the loophole (`ts` and `tsx` are already
 *  one language here; the ELEMENT-access form is the one a sweep habitually misses). */
function argvRead(node: Node): boolean {
  if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
    return node.getName() === "argv" && node.getExpression().getText() === "process";
  }
  if (node.isKind(SyntaxKind.ElementAccessExpression)) {
    const key = node.getArgumentExpression();
    return key !== undefined && readStringValue(key) === "argv" && node.getExpression().getText() === "process";
  }
  return false;
}

export const gate: GateDescriptor = {
  name: "tooling-argv-front-door",
  docRow: "Core-Enforcement-Active-Gates.md (docs/architecture/core/Core-Tooling-Law.md §4.9)",
  status: "active",
  scopeSafety: "whole-project",
  message:
    "a second argv reader — the operator's argv enters a tooling program at ONE place (the tool's cli.ts, or a censused bash-fronted entry) and flows DOWN as a `readonly string[]` parameter. An ops/lib/contract module reading the GLOBAL argv makes its behaviour depend on how the process was started: it cannot be driven at its own seam, it silently re-admits flags the front door refused, and two callers of the same helper get different answers (docs/architecture/core/Core-Tooling-Law.md §2.5/§4.9).",
  fix: "take `argv: readonly string[]` as a parameter and let the cli.ts pass `process.argv.slice(2)` down — the strict grammar stays in the tool's own parse module.",
  scanRoot: (p) => p.startsWith(TOOLING_PREFIX),
  kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
  begin: () => {
    seenEntries.clear();
    seenCliReaders = 0;
  },
  visit: (node, sf, ctx) => {
    const rel = relOf(sf.getFilePath());
    if (rel === null || !argvRead(node)) {
      return;
    }
    if (CLI_RE.test(rel)) {
      seenCliReaders += 1;
      return;
    }
    if (rel in ARGV_ENTRIES) {
      seenEntries.add(rel);
      return;
    }
    ctx.report(node, { token: "process.argv", offset: 0 });
  },
  run: (ctx) => {
    // Both cross-file arms are anchored on the real tree, never on a row's own path and never on
    // `scope.kind` (GATE-AUTHORING §4.5 / #505 — a scoped run builds the full Project).
    if (!fileLoaded(ctx, ANCHOR)) {
      return;
    }
    // Arm C: the §4.6 blindness tripwire. Eighteen tool cli.ts files front this tree; if NONE of them
    // read argv the matcher stopped recognising the shape and every arm above is silently green.
    if (seenCliReaders === 0) {
      ctx.report({
        file: "tooling/src/verify/gates/tooling-argv-front-door.ts",
        line: 0,
        column: 0,
        message:
          "blind gate — no tool cli.ts was seen reading process.argv on a real-tree run, so the matcher recognises nothing and every arm is vacuously green. Re-derive the read shape (docs/architecture/core/Core-Tooling-Law.md §4.9).",
      });
    }
    // Arm B: the two-sided sweep. A row is stale whether its file merely stopped reading argv (mode A)
    // or is gone from the tree entirely (mode B) — `seenEntries` is populated only by a LIVE match, so
    // one unconditional check covers both.
    for (const [entry, row] of Object.entries(ARGV_ENTRIES)) {
      if (!seenEntries.has(entry)) {
        ctx.report({
          file: entry,
          line: 0,
          column: 0,
          message: `stale ARGV_ENTRIES row — "${entry}" no longer reads process.argv (row why: ${row.why}). Re-key or delete the row (docs/architecture/core/Core-Tooling-Law.md §4.9).`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'import process from "node:process";\nexport const limit = process.argv.slice(2).length;\n',
      at: "tooling/src/codemod/lib/diagnostics.ts",
      expect: { count: 1, token: "process.argv" },
      why: "the founding shape — a LIBRARY helper reading the global argv, so its behaviour depends on how the process was started and no caller can drive it",
    },
    {
      files: 'import process from "node:process";\nexport const sep = process.argv.indexOf("--");\n',
      at: "tooling/src/stack/ops/prod.ts",
      expect: { count: 1, token: "process.argv" },
      why: "an ops module reaching past its own entry for the `--` forwarding split — the same read, one directory up from the front door",
    },
    {
      files: 'import process from "node:process";\nexport const v = process["argv"][2];\n',
      at: "tooling/src/ast/lib/emit.ts",
      expect: { count: 1, token: "process.argv" },
      why: "the ELEMENT-ACCESS spelling — a dotted-only matcher would be the loophole, and an index sweep habitually misses it",
    },
    {
      files: {
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/snap/cli.ts": 'import process from "node:process";\nexport const a = process.argv.slice(2);\n',
      },
      expect: { messageIncludes: "stale ARGV_ENTRIES row" },
      why: "staleness mode (B) — the anchor loads and a live cli.ts reader satisfies the blindness tripwire, but NO ARGV_ENTRIES file is on the tree, so every row must red as naming nothing",
    },
    {
      files: {
        "tooling/src/_shared/exit-contract.ts": "export const EXIT = { clean: 0 } as const;\n",
        "tooling/src/_shared/entrypoint.ts": 'import process from "node:process";\nexport const e = process.argv[1];\n',
        "tooling/src/stack/ops/dev-identity-entry.ts": 'import process from "node:process";\nexport const d = process.argv.slice(2);\n',
        "tooling/src/stack/ops/engines-ctl.ts": 'import process from "node:process";\nexport const c = process.argv[2];\n',
        "tooling/src/stack/ops/engines.ts": 'import process from "node:process";\nexport const g = process.argv.includes("--detach");\n',
        "tooling/src/stack/ops/prod-entry.ts": 'import process from "node:process";\nexport const p = process.argv.slice(2);\n',
        "tooling/src/verify/ops/config-snapshot-entry.ts": 'import process from "node:process";\nexport const s = process.argv.slice(2);\n',
      },
      expect: { messageIncludes: "blind gate" },
      why: "the §4.6 blindness tripwire — every censused entry reads argv but NO cli.ts does, which is what a matcher that stopped recognising the read looks like from the inside",
    },
  ],
  mustPass: [
    {
      files: 'import process from "node:process";\nexport const a = process.argv.slice(2);\n',
      at: "tooling/src/seed/cli.ts",
      why: "the sanctioned front door — a tool cli.ts is SCANNED and admitted by shape, not scanRoot-excluded, so a cli.ts that moves reds at its new path",
    },
    {
      files: 'import process from "node:process";\nexport const d = process.argv.includes("--detach");\n',
      at: "tooling/src/stack/ops/engines.ts",
      why: "a censused ARGV_ENTRIES row — the node half a `.sh` execs has no cli.ts to enter through (Core-Tooling-Law §2.5)",
    },
    {
      files: "export function parseArgs(argv: readonly string[]): number {\n  return argv.length;\n}\n",
      at: "tooling/src/snap/ops/parse.ts",
      why: "the house shape the gate exists to force — a parse module takes argv as a PARAMETER and reads no global; the declared limit is that the gate says nothing about that grammar's strictness",
    },
    {
      files: "// process.argv is [node, script, verb, ...] — the operator's own argv starts here.\nexport const AFTER_VERB = 3;\n",
      at: "tooling/src/stack/ops/prod.ts",
      why: "comment posture: comment-SAFE. The gate subscribes to node kinds, so a header explaining the argv layout must never be read as a read (the #117/#132 class)",
    },
    {
      files: 'import process from "node:process";\nexport const args = process.argv.slice(2);\n',
      at: "scripts/probes/some-probe.ts",
      why: "THE DECLARED LIMIT (#1118): the research zone is outside scanRoot BY DERIVATION, not by an allowlist row — same language, same read, only the ZONE differs from the mustFlag rows above, which is what makes this pair a proof rather than an assertion. `scripts/**` is throwaway probes + launcher shims where KISS applies (Core-Tooling-Law §2.7); a probe PROMOTED into tooling/src/<tool>/ is judged from its first day there. Ends if the research zone ever becomes a product surface.",
    },
    {
      files: "export function pick(opts: { readonly argv: readonly string[] }): string | undefined {\n  return opts.argv[0];\n}\n",
      at: "tooling/src/verify/lib/selection.ts",
      why: "a `.argv` property read on something that is NOT `process` — the matcher keys on the receiver, so an options bag carrying argv is untouched",
    },
  ],
};
