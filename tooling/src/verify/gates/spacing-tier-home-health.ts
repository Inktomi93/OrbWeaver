// Native ESLint owns raw spacing occurrences; this hard singleton retains the missing-home claim.
// The entire admitted population and real token anchor preserve scoped deferral and fixture behavior.
import { defineGate } from "../contract/policy.ts";
import { TIER_IMPLEMENTATION_HOMES } from "../lib/raw-spacing-tier.ts";
import { unresolvedSanctionedHomeKeys } from "../lib/sanctioned-home.ts";

/** The real-tree anchor (tooling/src/verify/gates/GATE-AUTHORING.md §4.5): the generated token vocabulary the spacing gate's
 *  message points at — present on every real run, inside neither sanctioned home, needed by no example
 *  that is not deliberately arming this arm. Guards the tripwire off a fixture/mini-project run, where
 *  the anchor is never loaded and every row would falsely "prove" itself dead. */
const ANCHOR = "packages/ui/src/tokens/index.ts";

export const gate = defineGate({
  id: "spacing-tier-home-health",
  family: "spacing-tier-home-health",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message:
    "a SANCTIONED-HOME row for the raw-spacing tier permission resolves to no file on the tree — the spacing-token implementation tier it exempts either moved or died and its new path is judged by nobody: re-point the row at the real home or delete it, in lib/raw-spacing-tier.ts.",
  create: (ctx) => ({
    evaluate: () => {
      if (!ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === ANCHOR)) {
        return;
      }
      for (const key of unresolvedSanctionedHomeKeys(ctx.files, ctx.relativePath, TIER_IMPLEMENTATION_HOMES)) {
        ctx.report.file(ANCHOR, {
          line: 1,
          message: `stale SANCTIONED-HOME row — "${key}" resolves to no file on the tree, so the spacing-token implementation tier it exempts either moved or died and its new path is judged by nobody: re-point the row at the real home or delete it, in lib/raw-spacing-tier.ts`,
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
      expect: { count: 1, messageIncludes: '"packages/ui/src/markdown/" resolves to no file' },
      why: "THE RENAME TRIPWIRE: the anchor is loaded and the layout home still resolves, but the markdown home resolves to no file — that row permits nothing and ratchets down. The `messageIncludes` names WHICH row, which a bare count cannot: the finding is anchored on the ANCHOR file for every row (there is no file to point at), so the key is the only thing distinguishing 'the markdown row is dead' from 'the layout row is dead' — a reader that returned the wrong key would pass a count-only expectation. There is no `token` to pin: this is a `ctx.report.file` finding",
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
