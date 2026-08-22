// Gate: no-raw-clock (Spine-Testing.md §3) — production reads time from the injected clock.
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the two sanctioned HOMES (the kit time engine, the
// composition root) are SCANNED and exempted by cited rows plus the shared RENAME TRIPWIRE; the test / dev-
// tool ZONES stay a scope decision in scanRoot, which is what they are. Comment posture: comment-SAFE.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const GATE_SELF = "tooling/src/verify/gates/no-raw-clock.ts";

/** The homes that may read the ambient clock — everything else takes the injected one. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/kit/src/time/": {
    why: "@orb/kit/time IS the clock seam — `createClock`/`nowMs` read the ambient clock here exactly once so nothing else has to. Ends when the time engine moves: the rename tripwire reds the row at its dead path",
  },
  "packages/server/src/entry/": {
    why: "the composition root CONSTRUCTS the clock it injects into every tier (Tier-5-Entry.md) — a root that cannot read `Date.now()` cannot mint one. Ends when entry moves, same tripwire",
  },
};

export const gate: GateDescriptor = {
  name: "no-raw-clock",
  docRow: "Spine-Testing.md §3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "raw Date.now() / new Date() — production reads time from the injected clock (@orb/kit/time), never ambient now (determinism: the same seam tests use). `new Date(ms)` to parse a known timestamp is fine. (Spine-Testing.md §3)",
  kinds: [SyntaxKind.CallExpression, SyntaxKind.NewExpression],
  scanRoot: (p) =>
    !(
      p.includes(".test.") ||
      p.startsWith("tests/") ||
      p.startsWith("scripts/") ||
      p.startsWith("tools/") ||
      // tooling/ = the promoted dev-tool fleet (docs/design/tooling-package.md §3.2): tools MEASURE the
      // real wall clock (watch-series elapsed, stage markers, artifact timestamps) — the injected-clock
      // determinism law governs app code, and the fence matches the scripts/ zone it was promoted from.
      p.startsWith("tooling/")
    ),
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "ambient-clock home" });
  },
  visit(node, sf, ctx): void {
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression().getText();
      if (expr === "Date.now") {
        ctx.report(node);
      }
      return;
    }

    if (Node.isNewExpression(node)) {
      const expr = node.getExpression().getText();
      if (expr === "Date" && node.getArguments().length === 0) {
        ctx.report(node);
      }
    }
  },
  mustFlag: [
    {
      why: "Date.now() call",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function doThing() {
            return Date.now();
          }
        `,
      },
    },
    {
      why: "new Date() with no args",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function doThing() {
            return new Date();
          }
        `,
      },
    },
    {
      expect: { count: 2, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded but neither sanctioned home resolves — under the old scanRoot exclusion a moved kit/time or entry/ kept its exemption at a path that no longer existed, forever and silently (this gate's sibling `no-raw-random` was carrying TWO such dead clauses when the conversion landed)",
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
      },
      // BOTH rows are dead in this mini-project ⇒ two findings; a `count: 1` here would be a lying proof.
    },
  ],
  mustPass: [
    {
      why: "new Date(ms) with args",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function parse(ms: number) {
            return new Date(ms);
          }
        `,
      },
    },
    {
      why: "Date.now() in allowed test file",
      files: {
        "tests/server/logic.test.ts": `
          export function doThing() {
            return Date.now();
          }
        `,
      },
    },
    {
      why: "Date.now() in allowed kit/time",
      files: {
        "packages/kit/src/time/index.ts": `
          export function doThing() {
            return Date.now();
          }
        `,
      },
    },
    {
      why: "Date.now() in the fenced tooling/ zone — tools measure the real wall clock",
      files: {
        "tooling/src/snap/ops/watch.ts": `
          export function elapsed(start: number) {
            return Date.now() - start;
          }
        `,
      },
    },
  ],
};
