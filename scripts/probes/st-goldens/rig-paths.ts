// The rig's DATA root and the four gitignored directories under it. One home, because the data root is
// overridable and a second copy of the `??` would silently anchor half the rig to the wrong tree.
//
// `ST_GOLDENS_DATA_ROOT` exists because the data (fixtures, both capture arms, and the ~500MB ST runtime)
// is gitignored and therefore lives in exactly ONE checkout, while the scripts live in every worktree. A
// lane editing the rig has the code and none of the data; without the override it cannot run what it just
// changed. Unset ⇒ this directory, so a main-tree run is byte-identical to before.
import path from "node:path";
import process from "node:process";

export const RIG_DIR = path.resolve(import.meta.dirname);
// biome-ignore lint/style/noProcessEnv: this file IS the rig's centralized path config — the rule's own remedy.
export const DATA_ROOT = path.resolve(process.env["ST_GOLDENS_DATA_ROOT"] ?? RIG_DIR);

export const FIXTURES_DIR = path.join(DATA_ROOT, "fixtures");
export const ST_OUTPUT_DIR = path.join(DATA_ROOT, "output");
export const ORB_OUTPUT_DIR = path.join(DATA_ROOT, "orbweaver-output");
export const ST_RUNTIME_DIR = path.join(DATA_ROOT, "sillytavern-runtime");

/** The canonical chat inputs `build-fixtures.ts` seeds the ST runtime from. Read THESE, never the ST
 *  runtime's copy: ST rewrites its chat files as it generates — so a runtime read replays whatever ST left
 *  behind (measured: a 65-line seed truncated to one greeting, which collapsed 44 captures into one). */
export const SEED_CHATS_DIR = path.resolve(RIG_DIR, "../../../packages/default-content/demo-chats");
