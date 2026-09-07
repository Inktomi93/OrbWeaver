// Type-worlds phase 1 (#1859 / #1351): the flat `tests/support/ct/` helper directory spanned three type
// programs, so nothing but a per-file tsconfig entry could say which world a helper lived in — 30 entries
// in the root `exclude`, 29 in `tsconfig.tests-dom.json`, 7 more across the ui/client reach-backs. A
// helper's LOCATION now declares its world: `tests/support/browser/` (its body needs lib.dom — in-page
// `evaluate` callbacks, React providers, CT fixtures; every `.tsx`) and `tests/support/node/` (playwright
// orchestration, tRPC recorders, node-side readers). The split is MEASURED, not guessed: the rule-only node
// world (`tsconfig.json` with no per-file entries) reds exactly the browser set's own bodies (2026-09-06).
//
// Preview:  pnpm codemod:run scripts/codemods/type-worlds-support-split.ts
// Apply:    pnpm codemod:run scripts/codemods/type-worlds-support-split.ts --apply

import process from "node:process";
import { moveFiles, runCodemod } from "@orb/tooling/codemod";

const CT = "tests/support/ct";
const BROWSER = "tests/support/browser";
const NODE = "tests/support/node";

const BROWSER_FILES: readonly string[] = [
  "accessible-names.ts",
  "autosave-status-transcript.ts",
  "canvas-ink.ts",
  "contained-within.ct.tsx",
  "contained-within-fixtures.tsx",
  "contained-within.ts",
  "ct-config-groups.ts",
  "ct-data-providers.tsx",
  "ct-providers.tsx",
  "drop-files.ts",
  "held-portrait-image.ts",
  "ink-void.ts",
  "measure-clamp.ts",
  "measure-content-column.ts",
  "part-vs-surface.ts",
  "pixel-contrast.ts",
  "prose-measure.ts",
  "scroll-containing-block.ts",
  "settings-geometry.ts",
  "tier-liveness.ts",
  "touch-floor.ct.tsx",
  "touch-floor-fixtures.tsx",
  "touch-floor.ts",
  "weave-drive.ts",
];

const NODE_FILES: readonly string[] = [
  "assert-token-roundtrip.ts",
  "block-main-thread.ts",
  "chat-and-inbox-reads-empty.ts",
  "open-context-sections.ts",
  "regex-reads-empty.ts",
  "resolved-token-color.ts",
  "route-impersonate-stream.ts",
  "route-orb-socket.ts",
  "route-trpc.ts",
  "seed-active-chat.ts",
  "set-number.ts",
  "snap-out.ts",
  "story-shot.test.ts",
  "story-shot.ts",
  "user-settings-view.ts",
];

await runCodemod(
  "type-worlds-support-split",
  (ctx) => {
    ctx.plan(
      moveFiles(ctx, [
        ...BROWSER_FILES.map((file) => [`${CT}/${file}`, `${BROWSER}/${file}`] as const),
        ...NODE_FILES.map((file) => [`${CT}/${file}`, `${NODE}/${file}`] as const),
      ]),
    );
    // The emptied `tests/support/ct/` directory was removed by hand after the apply (`rmdir`) — the kit's
    // `removeEmptyDirectory` wants `{ confirm: true }` and this one-shot did not need a second plan for it.
  },
  {
    argv: process.argv.slice(2),
    // Only these trees can import a test helper (packages never do), so the project is scoped to them: ts-morph
    // builds its whole-project reference map on the FIRST move, and over the default 9k-file graph that build
    // alone ran past nine minutes (2026-09-06) — over ~3.5k files it is a fraction of that.
    setup: {
      replaceGlobs: ["tests/**/*.ts", "tests/**/*.tsx", "playwright/**/*.tsx", "scripts/**/*.ts", "tooling/src/**/*.ts"].map(
        (glob) => `${process.cwd()}/${glob}`,
      ),
    },
  },
);
