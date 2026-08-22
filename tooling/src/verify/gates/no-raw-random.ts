// Gate: no-raw-random (Spine-Testing.md §3) — production draws entropy from an injected seeded PRNG.
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the sanctioned HOMES are SCANNED and exempted by
// cited rows plus the shared RENAME TRIPWIRE; the test / dev-script ZONES stay a scanRoot scope decision.
//
// THE CONVERSION FOUND THE HAZARD LIVE: the old exclusion list carried `packages/kit/src/prng/` and
// `packages/kit/src/random/` — NEITHER DIRECTORY EXISTS on this tree (probed 2026-08-22; the kit slots are
// ids/ + macro/'s injectable `random`). Two exemptions for nothing, unfalsifiable by construction, exactly
// the silent carry §3 predicts. They are DELETED here rather than re-keyed as rows, and the tripwire is what
// makes the next one impossible.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const GATE_SELF = "tooling/src/verify/gates/no-raw-random.ts";

/** The homes that may draw ambient entropy — everything else takes an injected PRNG. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/server/src/entry/": {
    why: "the composition root SEEDS the PRNG it injects into every tier (Tier-5-Entry.md) — the seed has to come from somewhere. Ends when entry moves: the rename tripwire reds the row at its dead path",
  },
  "packages/client/src/main.tsx": {
    why: "the client's own composition root, same reason and same end condition (keyed as a FILE row, so a rename to main.ts reds instead of silently un-exempting)",
  },
  "packages/kit/src/ids/": {
    why: "the id generator is the entropy seam itself — it is what every other call site injects. Ends when the ids engine moves, same tripwire",
  },
};

export const gate: GateDescriptor = {
  name: "no-raw-random",
  docRow: "Spine-Testing.md §3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "ambient Math.random() — determinism: inject a seeded PRNG / the seeded id generator instead (the same seam tests pin). (UI-Gates-and-Lessons.md §11.5)",
  kinds: [SyntaxKind.CallExpression],
  scanRoot: (p) => !(p.includes(".test.") || p.startsWith("tests/") || p.startsWith("scripts/") || p.startsWith("tools/")),
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "ambient-entropy home" });
  },
  visit(node, sf, ctx): void {
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression().getText();
      if (expr === "Math.random") {
        ctx.report(node);
      }
    }
  },
  mustFlag: [
    {
      why: "ambient Math.random() in production code",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function rollDice() {
            return Math.random();
          }
        `,
      },
    },
    {
      expect: { count: 3, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B), one finding per dead row: the shared anchor is loaded and NO sanctioned home resolves. This is the arm that would have named `packages/kit/src/prng/` and `packages/kit/src/random/` the day they stopped existing, instead of carrying them as unfalsifiable scanRoot clauses",
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
      },
    },
  ],
  mustPass: [
    {
      why: "THE ALLOWLIST ITSELF: the server composition root is now SCANNED and its seed draw passes only on a cited SANCTIONED_HOMES row",
      files: {
        "packages/server/src/entry/boot.ts": `
          export function init() {
            return Math.random();
          }
        `,
      },
    },
    {
      why: "Math.random() in a test file",
      files: {
        "tests/server/logic.test.ts": `
          export function runTest() {
            return Math.random();
          }
        `,
      },
    },
    {
      why: "seeded PRNG call",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function rollDice(prng: () => number) {
            return prng();
          }
        `,
      },
    },
  ],
};
