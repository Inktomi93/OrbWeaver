// Policy: typography-tier-home-health — the RENAME TRIPWIRE for `no-raw-typography-in-features`'s tier
// permission (GATE-AUTHORING.md §4.4a mode B): a sanctioned home whose row resolves to zero files on the
// tree either moved or died, and an exclusion carried in a `population` predicate would follow it into the
// void silently. This policy shares the exact `SANCTIONED_HOMES` table with its sibling and runs over the
// ENTIRE population (never a narrowed subset), because "does this row resolve to a file" is a whole-tree
// question the occurrence policy's per-file dispatch cannot answer.
//
// FAMILY `raw-typography-tier` — a two-member SPLIT family with TWO shared `lib/` modules, and they are
// different kinds of thing: the shared READER is `lib/sanctioned-home.ts` (`unresolvedSanctionedHomeKeys`
// here, `sanctionedHome` in the occurrence twin), and the shared TABLE is
// `lib/raw-typography-tier.ts#SANCTIONED_HOMES`. Until 2026-09-12 that table was imported FROM THE SIBLING
// GATE MODULE — the shape the owner banned that day (#2096 / §12.3: a gate module never imports another
// gate module; a shared predicate moves to `lib/<family>.ts`), with `lib/contract-derives-not-respells.ts`
// as the worked precedent.
//
// POPULATION PORT: INHERITED, not ported — this half has no legacy population of its own. It declares
// `["@client", "@ui"]` because the occurrence twin does, and the two must be the same set or the tripwire
// would police a table over files the occurrence policy never reads. The legacy predicate behind it is that
// twin's `SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//`, byte-identical to the two roots, recorded once
// in `no-raw-typography-in-features.ts`.
// LEGACY SHA: NONE, and none is possible. This module was BORN FINAL at `99b7429e2`, the commit that split
// the tripwire out — `git show 99b7429e2^:<this file>` refuses with "exists on disk, but not in
// 99b7429e2^", and that refusal is the receipt (the `scrubber-factory-home` precedent). The twin cites
// `99b7429e2^` (spelled `d6f36904fa…`) for the legacy module both halves came from.
import { defineGate } from "../contract/policy.ts";
import { SANCTIONED_HOMES } from "../lib/raw-typography-tier.ts";
import { unresolvedSanctionedHomeKeys } from "../lib/sanctioned-home.ts";

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
