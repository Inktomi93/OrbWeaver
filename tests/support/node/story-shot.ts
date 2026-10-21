// Story screenshots stay separate from Snap's published run pointers.

/** The pointer-free family every CT/e2e story shot is written into. Repo-relative: playwright resolves a
 *  screenshot path against the config's root, and every consumer of these shots is a human with a repo. */
export const STORY_SHOT_DIR = "reports/ct-shots";

const PNG_SUFFIX = /\.png$/iu;

/** The path a story shot writes to: `reports/ct-shots/<name>.png`. `name` may carry the extension or not
 *  — the call sites came from a `--out`-shaped convention where both spellings were in use. */
export function storyShot(name: string): string {
  return `${STORY_SHOT_DIR}/${name.replace(PNG_SUFFIX, "")}.png`;
}
