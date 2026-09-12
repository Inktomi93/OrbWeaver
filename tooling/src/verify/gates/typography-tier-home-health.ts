// Policy: typography-tier-home-health — the RENAME TRIPWIRE for `no-raw-typography-in-features`'s tier
// permission (GATE-AUTHORING.md §4.4a mode B): a sanctioned home whose row resolves to zero files on the
// tree either moved or died, and an exclusion carried in a `population` predicate would follow it into the
// void silently. This policy shares the exact `SANCTIONED_HOMES` table with its sibling and runs over the
// ENTIRE population (never a narrowed subset), because "does this row resolve to a file" is a whole-tree
// question the occurrence policy's per-file dispatch cannot answer.
import { defineGate } from "../contract/policy.ts";
import { unresolvedSanctionedHomeKeys } from "../lib/sanctioned-home.ts";
import { SANCTIONED_HOMES } from "./no-raw-typography-in-features.ts";

/** The real-tree anchor (GATE-AUTHORING.md §4.5): the generated token vocabulary the typography gate's
 *  message points at — present on every real run, inside neither sanctioned home, needed by no example
 *  that is not deliberately arming this arm. Guards the tripwire off a fixture/mini-project run, where
 *  the anchor is never loaded and every row would falsely "prove" itself dead. */
const ANCHOR = "packages/ui/src/tokens/index.ts";

export const gate = defineGate({
  id: "typography-tier-home-health",
  family: "raw-typography-tier",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message:
    "a SANCTIONED-HOME row for the raw-typography tier permission resolves to no file on the tree — the typography-token implementation tier it exempts either moved or died and its new path is judged by nobody: re-point the row at the real home or delete it, in no-raw-typography-in-features.ts.",
  create: (ctx) => ({
    evaluate: () => {
      if (!ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === ANCHOR)) {
        return;
      }
      for (const key of unresolvedSanctionedHomeKeys(ctx.files, ctx.relativePath, SANCTIONED_HOMES)) {
        ctx.report.file(ANCHOR, {
          line: 1,
          message: `stale SANCTIONED-HOME row — "${key}" resolves to no file on the tree, so the typography-token implementation tier it exempts either moved or died and its new path is judged by nobody: re-point the row at the real home or delete it, in no-raw-typography-in-features.ts`,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
      },
      expect: { count: 1 },
      why: "THE RENAME TRIPWIRE: the anchor is loaded and the layout home still resolves, but the markdown home resolves to no file — that row permits nothing and ratchets down",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
        "packages/ui/src/markdown/render.tsx": "export const M = null;\n",
      },
      why: "both homes STILL EARNED, judged against the real-tree anchor: each resolves to a live file, so the tripwire stays quiet",
    },
    {
      mode: "source",
      files: { "packages/client/src/unrelated.ts": "export const clean = true;\n" },
      why: "the anchor is not loaded (a plain fixture run) — the tripwire self-guards off, never claiming both homes dead",
    },
  ],
});
