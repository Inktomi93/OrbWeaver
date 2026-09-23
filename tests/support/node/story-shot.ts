// WHERE AN e2e-LOCAL STORY SHOT LANDS (#1201) — this file's remaining job, now that CT specs have moved
// off it.
//
// THE DEFECT THIS CLOSED. CT stories and local e2e specs used to write their eyeball shots to
// `reports/snaps/<name>.png`, the SNAP instrument's published pointer. Since #1164 that path is a symlink
// into a finished snap run's slot, and a screenshot is an ordinary file write: it FOLLOWS the link and
// rewrites the bytes inside that finished run, while the alias stays a symlink — so nothing at the pointer
// shows the run's evidence was replaced. A live collision existed on the tree the day this was found
// (`tracker-blocks.ct.tsx` wrote `tracker-kit-scene.png`, the same name `artifact-out.int.test.ts` plants
// as a retention keeper). The fix moved every write off `reports/snaps/` into this pointer-free
// `reports/ct-shots/` family — no aliases live here, so there is no link for a write to follow.
//
// SPLIT 2026-09 (#1291, closing the leftover this file's header used to state): CT specs run in
// Playwright WORKER processes, so giving them a per-RUN slot needed the CT run's identity to reach those
// workers — `playwright-ct.config.ts` now does that (opens the "ct" instrument's slot once, sets an env
// var before forking). Every `.ct.tsx` call site moved to `tests/support/ct/snap-out.ts` `ctSnapPath`,
// which resolves into that per-run slot. `tests/e2e/**` local specs run under a SEPARATE config
// (`playwright.config.ts`) with no "ct" run to adopt — out of #1291's scope — so they still call
// `storyShot`/`STORY_SHOT_DIR` here, still safe against the symlink-follow defect, still one file per
// NAME (two concurrent e2e runs on one checkout can still collide on a shared story name).

/** The pointer-free family every CT/e2e story shot is written into. Repo-relative: playwright resolves a
 *  screenshot path against the config's root, and every consumer of these shots is a human with a repo. */
export const STORY_SHOT_DIR = "reports/ct-shots";

const PNG_SUFFIX = /\.png$/iu;

/** The path a story shot writes to: `reports/ct-shots/<name>.png`. `name` may carry the extension or not
 *  — the call sites came from a `--out`-shaped convention where both spellings were in use. */
export function storyShot(name: string): string {
  return `${STORY_SHOT_DIR}/${name.replace(PNG_SUFFIX, "")}.png`;
}
