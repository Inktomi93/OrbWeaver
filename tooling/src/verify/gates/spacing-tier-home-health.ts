// Policy: spacing-tier-home-health — the RENAME TRIPWIRE for `no-raw-spacing-in-features`'s tier
// permission (GATE-AUTHORING.md §4.4a mode B): a sanctioned home whose row resolves to zero files on the
// tree either moved or died, and an exclusion carried in a `population` predicate would follow it into the
// void silently. This policy shares the exact `SANCTIONED_HOMES` table with its sibling and runs over the
// ENTIRE population (never a narrowed subset), because "does this row resolve to a file" is a whole-tree
// question the occurrence policy's per-file dispatch cannot answer.
//
// FAMILY `raw-spacing-tier` — a two-member SPLIT family with TWO shared `lib/` modules, and they are
// different kinds of thing: the shared READER is `lib/sanctioned-home.ts` (`unresolvedSanctionedHomeKeys`
// here, `sanctionedHome` in the occurrence twin), and the shared TABLE is
// `lib/raw-spacing-tier.ts#SANCTIONED_HOMES`. The split is forced by `execution`: the occurrence check is
// per-file and incremental-safe, this verdict needs the entire declared population, and one descriptor
// carries one `execution` value.
// Until 2026-09-12 this sentence read "imported from the sibling rather than re-spelled", describing a
// GATE-TO-GATE import as though it were the sanctioned arrangement — the shape the owner banned that day
// (#2096 / §12.3: a gate module never imports another gate module; a shared predicate moves to
// `lib/<family>.ts`). The table moved to `lib/` and this sentence moved with it; a header that legitimises
// a banned shape is read as precedent by the next lane, which is why it is corrected here and not later.
// POPULATION PORT: byte-identical. The legacy descriptor (d6f36904f, the parent of 99b7429e2 — its
// `no-raw-spacing-in-features.ts` carried BOTH arms in one `GateDescriptor`) scoped with
// `scanRoot: (p) => /\/packages\/(?:client|ui)\/src\//u.test(`/${p}`)`; `["@client", "@ui"]` is the same set.
// The population is a STRUCTURAL non-narrowing, not an unenforced fence (guide §6.1's structurally-unfalsifiable classification, wave 4):
// `SANCTIONED_HOMES`' keys are hardcoded under one package, so no fixture placed under an added population
// root can ever land on one and no discriminating row EXISTS.
// CUT DIRECTION IS INVERTED HERE (guide §6.1) — this is a tripwire, so its fences ACQUIT and opening one
// makes it flag FEWER. The ANCHOR self-guard's falsifier is `mustPass[1]` going RED; the resolution reader's
// is `mustFlag[0]` going GREEN. A lane applying the occurrence direction reads both as unenforced.
// §4.5 and §4.6 live in `tests/tooling/verify/gates/tier-home-health-family.int.test.ts`: the narrowed-request
// DEFERRAL pin with its whole-project control (ec336d41c), and the split-arm differential replaying every
// legacy example through the frozen d6f36904f descriptor and the UNION of both final policies (6f815e95e).
import { defineGate } from "../contract/policy.ts";
import { SANCTIONED_HOMES } from "../lib/raw-spacing-tier.ts";
import { unresolvedSanctionedHomeKeys } from "../lib/sanctioned-home.ts";

/** The real-tree anchor (GATE-AUTHORING.md §4.5): the generated token vocabulary the spacing gate's
 *  message points at — present on every real run, inside neither sanctioned home, needed by no example
 *  that is not deliberately arming this arm. Guards the tripwire off a fixture/mini-project run, where
 *  the anchor is never loaded and every row would falsely "prove" itself dead. */
const ANCHOR = "packages/ui/src/tokens/index.ts";

export const gate = defineGate({
  id: "spacing-tier-home-health",
  family: "raw-spacing-tier",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message:
    "a SANCTIONED-HOME row for the raw-spacing tier permission resolves to no file on the tree — the spacing-token implementation tier it exempts either moved or died and its new path is judged by nobody: re-point the row at the real home or delete it, in no-raw-spacing-in-features.ts.",
  create: (ctx) => ({
    evaluate: () => {
      if (!ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === ANCHOR)) {
        return;
      }
      for (const key of unresolvedSanctionedHomeKeys(ctx.files, ctx.relativePath, SANCTIONED_HOMES)) {
        ctx.report.file(ANCHOR, {
          line: 1,
          message: `stale SANCTIONED-HOME row — "${key}" resolves to no file on the tree, so the spacing-token implementation tier it exempts either moved or died and its new path is judged by nobody: re-point the row at the real home or delete it, in no-raw-spacing-in-features.ts`,
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
