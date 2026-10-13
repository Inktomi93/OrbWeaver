// Classify sanitized profile paths without guessing mixed or unrecognized layouts.
// Single ST profiles are nested under a profile directory; native bundles retain entity directories at the root.
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { TreeChild, TreeLayout, TreeShape } from "../contract/tree-layout.ts";

/** An ST-only per-profile directory marker. */
const ST_AVATARS_DIR = "User Avatars";
/** Directories shared by both the ST profile layout and the orb bundle vocabulary — never a sole decider. */
const ST_SHARED_DIRS = new Set(["characters", "chats"]);
/** Synthetic wrapper a single picked ST profile is re-nested under so the profile LOOP sees one profile subdir. */
const ST_SINGLE_PROFILE_PREFIX = "profile/";

function buildShape(paths: readonly string[]): TreeShape {
  const topFiles = new Set<string>();
  const topDirs = new Set<string>();
  const childrenByDir = new Map<string, TreeChild>();
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
function looksLikeStProfile(child: TreeChild, orbOnlyDirs: ReadonlySet<string>): boolean {
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
