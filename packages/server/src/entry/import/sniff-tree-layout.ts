// Layout sniff for the folder-import ingest arm — pure over the SANITIZED, wrapper-stripped relative paths
// of an uploaded directory tree. Decides which staged-tree importer the upload routes to (the ST
// profile-directory loop vs the entity-agnostic orb bundle importer) and the staging PREFIX that normalizes
// the tree into the exact shape that importer consumes. Never guesses: an ambiguous or unrecognized tree is
// a typed reject, and a tree carrying BOTH format markers is a reject (never a silent pick).
//
// The two importers expect different roots:
//   • ST profile loop (`runProfileDirImport`) walks a PARENT dir holding one subdir PER profile
//     (`<profile>/characters/*.png`, `<profile>/settings.json`, `<profile>/chats/<char>/*.jsonl`). A single
//     picked profile is re-nested under a synthetic `profile/` wrapper so the loop sees one profile subdir.
//   • orb bundle importer (`importStagedArchive`) routes each file by its LEADING dir, so the entity dirs
//     (`characters/`, `personas/`, `presets/`, …) must sit at the tree root — no wrapper.
//
// `characters/` and `chats/` are SHARED vocabulary (both formats use them), so they never decide orb-vs-ST
// on their own: an orb-only entity dir (personas/presets/world-info/…) is the positive orb signal; a
// `settings.json` file or `User Avatars/` dir (or a shared dir with no orb signal) is the positive ST signal.

/** The ST single-profile settings file — an ST-only marker (orb carries settings under `user-settings/`). */
const ST_SETTINGS_FILE = "settings.json";
/** An ST-only per-profile directory marker. */
const ST_AVATARS_DIR = "User Avatars";
/** Directories shared by both the ST profile layout and the orb bundle vocabulary — never a sole decider. */
const ST_SHARED_DIRS = new Set(["characters", "chats"]);
/** Synthetic wrapper a single picked ST profile is re-nested under so the profile LOOP sees one profile subdir. */
const ST_SINGLE_PROFILE_PREFIX = "profile/";

/** The sniff outcome: the importer to route to + the staging-path prefix that normalizes the tree, or a
 *  typed reject carrying the top-level names found (so the caller can tell the user what it saw). Not
 *  exported (feature-type home rule) — callers consume the structural result of {@link sniffTreeLayout}. */
type TreeLayout =
  | { readonly kind: "st"; readonly stagePrefix: string }
  | { readonly kind: "orb"; readonly stagePrefix: string }
  | { readonly kind: "reject"; readonly found: readonly string[] };

/** The top-level shape derived from a set of relative paths, plus a one-level-down child index used only to
 *  recognize a multi-profile ST root (a parent dir whose subdirs are each an ST profile). */
interface TreeShape {
  readonly topFiles: Set<string>;
  readonly topDirs: Set<string>;
  /** For each top-level dir: the names of its immediate child files + child dirs (for multi-profile detection). */
  readonly childrenByDir: Map<string, { readonly files: Set<string>; readonly dirs: Set<string> }>;
}

function buildShape(paths: readonly string[]): TreeShape {
  const topFiles = new Set<string>();
  const topDirs = new Set<string>();
  const childrenByDir = new Map<string, { files: Set<string>; dirs: Set<string> }>();
  for (const path of paths) {
    const segments = path.split("/");
    const [top] = segments;
    if (top === undefined || top.length === 0) {
      continue;
    }
    if (segments.length === 1) {
      topFiles.add(top);
      continue;
    }
    topDirs.add(top);
    const child = childrenByDir.get(top) ?? { files: new Set<string>(), dirs: new Set<string>() };
    const second = segments[1];
    if (second !== undefined && second.length > 0) {
      if (segments.length === 2) {
        child.files.add(second);
      } else {
        child.dirs.add(second);
      }
    }
    childrenByDir.set(top, child);
  }
  return { topFiles, topDirs, childrenByDir };
}

/** An ST profile dir carries `settings.json`, or one of `characters/`/`chats/`/`User Avatars/`, and NO
 *  orb-only entity dir (an orb-only child means it is NOT an ST profile — don't guess). */
function looksLikeStProfile(child: { readonly files: Set<string>; readonly dirs: Set<string> }, orbOnlyDirs: ReadonlySet<string>): boolean {
  for (const dir of child.dirs) {
    if (orbOnlyDirs.has(dir)) {
      return false;
    }
  }
  if (child.files.has(ST_SETTINGS_FILE) || child.dirs.has(ST_AVATARS_DIR)) {
    return true;
  }
  for (const shared of ST_SHARED_DIRS) {
    if (child.dirs.has(shared)) {
      return true;
    }
  }
  return false;
}

/**
 * Sniff a wrapper-stripped relative-path set. `orbOnlyDirs` is the registry's entity-dir names MINUS the
 * ST-shared `characters`/`chats` (bare segment names, no trailing slash) — the positive orb signal.
 */
export function sniffTreeLayout(paths: readonly string[], orbOnlyDirs: ReadonlySet<string>): TreeLayout {
  const shape = buildShape(paths);
  const orbAtTop = [...shape.topDirs].some((d) => orbOnlyDirs.has(d));
  const stStrongAtTop = shape.topFiles.has(ST_SETTINGS_FILE) || shape.topDirs.has(ST_AVATARS_DIR);
  const stSharedAtTop = [...ST_SHARED_DIRS].some((d) => shape.topDirs.has(d));

  // A tree that shows BOTH an orb entity dir AND an ST-only settings.json is corrupt/ambiguous — reject.
  if (orbAtTop && stStrongAtTop) {
    return { kind: "reject", found: sortedTop(shape) };
  }
  if (orbAtTop) {
    return { kind: "orb", stagePrefix: "" };
  }
  // A single picked ST profile: its own contents sit at the tree top → re-nest under a synthetic wrapper.
  if (stStrongAtTop || stSharedAtTop) {
    return { kind: "st", stagePrefix: ST_SINGLE_PROFILE_PREFIX };
  }
  // A multi-profile ST root (the picked `data/`-style dir): subdirs are each an ST profile, none orb-shaped.
  if (shape.topDirs.size > 0) {
    const anyProfile = [...shape.topDirs].some((d) => {
      const child = shape.childrenByDir.get(d);
      return child !== undefined && looksLikeStProfile(child, orbOnlyDirs);
    });
    const anyOrb = [...shape.childrenByDir.values()].some((child) => [...child.dirs].some((d) => orbOnlyDirs.has(d)));
    if (anyProfile && !anyOrb) {
      return { kind: "st", stagePrefix: "" };
    }
  }
  return { kind: "reject", found: sortedTop(shape) };
}

function sortedTop(shape: TreeShape): string[] {
  return [...shape.topDirs, ...shape.topFiles].sort((a, b) => a.localeCompare(b));
}
