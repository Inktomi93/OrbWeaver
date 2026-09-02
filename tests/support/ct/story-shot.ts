// WHERE A CT/e2e STORY SHOT LANDS (#1201) — its ONE home, so the family name is not re-spelled at
// thirteen call sites.
//
// THE DEFECT THIS CLOSES. CT stories and local e2e specs wrote their eyeball shots to
// `reports/snaps/<name>.png`, the SNAP instrument's published pointer. Since #1164 that path is a symlink
// into a finished snap run's slot, and a screenshot is an ordinary file write: it FOLLOWS the link and
// rewrites the bytes inside that finished run, while the alias stays a symlink — so nothing at the pointer
// shows the run's evidence was replaced. A live collision existed on the tree the day this was found
// (`tracker-blocks.ct.tsx` wrote `tracker-kit-scene.png`, the same name `artifact-out.int.test.ts` plants
// as a retention keeper).
//
// THE FIX IS THE CORPUS, NOT THE NAME. A CT story shot is not a snap RUN — it is not `--out`-named, not
// diffed, and not published — so it belongs in its own pointer-free family. `reports/ct-shots/` holds no
// aliases, so there is no link for a write to follow, and a name a snap run happens to share is no longer
// a collision at all. Pinned by `story-shot.test.ts`, whose planted control writes through a real
// published alias and shows the finished slot change under it.
//
// NOT DONE HERE (#1201 leftover, stated rather than implied): these shots are still one file per NAME, so
// two concurrent CT runs on one checkout overwrite each other's copy of the same story. Giving them a run
// slot needs the CT run's identity to reach the WORKER processes (playwright re-evaluates its config per
// worker, so the id must be minted once in the parent and inherited through the environment) — a
// playwright-ct.config.ts change with no cheap proof, deliberately left to a lane that can run the suite.

/** The pointer-free family every CT/e2e story shot is written into. Repo-relative: playwright resolves a
 *  screenshot path against the config's root, and every consumer of these shots is a human with a repo. */
export const STORY_SHOT_DIR = "reports/ct-shots";

const PNG_SUFFIX = /\.png$/iu;

/** The path a story shot writes to: `reports/ct-shots/<name>.png`. `name` may carry the extension or not
 *  — the call sites came from a `--out`-shaped convention where both spellings were in use. */
export function storyShot(name: string): string {
  return `${STORY_SHOT_DIR}/${name.replace(PNG_SUFFIX, "")}.png`;
}
