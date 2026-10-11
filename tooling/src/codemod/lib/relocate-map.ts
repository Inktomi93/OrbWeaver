// The relocate plan expanded into exact file moves, plus the old→new path function every rewrite shares.
// Routing is total and unique: a routed directory's file that matches no role, or two roles, refuses.
import { matchesGlob, posix } from "node:path";
import type { RelocateMove, RelocatePlan } from "../contract/relocate.ts";
import { CodemodError } from "./errors.ts";

/** The expanded plan: every file that moves, and the whole-directory renames text citations follow. */
export interface MoveMap {
  readonly files: ReadonlyMap<string, string>;
  readonly dirRenames: readonly (readonly [from: string, to: string])[];
  /** Directories that are split by role; a citation of the directory itself has no single new home. */
  readonly routedDirs: ReadonlySet<string>;
  /** `<dir name>/<rest>` short citation → its new short spelling, for routed moves that opted in. */
  readonly shortForms: ReadonlyMap<string, string>;
}

function under(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}

function routeOf(base: string, route: Readonly<Record<string, readonly string[]>>, dir: string): string {
  const roles = Object.entries(route)
    .filter(([, globs]) => globs.some((glob) => matchesGlob(base, glob)))
    .map(([role]) => role);
  if (roles.length !== 1) {
    throw new CodemodError(
      `relocate: ${dir}/${base} matches ${roles.length === 0 ? "no role" : `roles ${roles.join(", ")}`}`,
      "Every file in a routed directory matches exactly one role glob; edit the plan's route.",
    );
  }
  return roles[0] ?? "";
}

function addShortForm(shortForms: Map<string, string>, clashes: Set<string>, from: string, to: string): void {
  const prior = shortForms.get(from);
  if (prior !== undefined && prior !== to) {
    clashes.add(from);
  }
  shortForms.set(from, to);
}

interface Expansion {
  readonly files: Map<string, string>;
  readonly dirRenames: [string, string][];
  readonly routedDirs: Set<string>;
  readonly shortForms: Map<string, string>;
  readonly clashes: Set<string>;
}

function expandRouted(move: RelocateMove, route: Readonly<Record<string, readonly string[]>>, members: readonly string[], out: Expansion): void {
  out.routedDirs.add(move.from);
  const fromName = posix.basename(move.from);
  const toName = posix.basename(move.to);
  for (const path of members) {
    const base = path.slice(move.from.length + 1);
    if (base.includes("/")) {
      throw new CodemodError(`relocate: routed directory ${move.from} holds a subdirectory (${path})`, "Route only flat directories.");
    }
    const role = routeOf(base, route, move.from);
    out.files.set(path, `${move.to}/${role}/${base}`);
    if (move.shortForms) {
      addShortForm(out.shortForms, out.clashes, `${fromName}/${base}`, `${toName}/${role}/${base}`);
    }
  }
}

/** Expand the plan against the tracked tree. */
export function expandMoves(plan: RelocatePlan, tracked: readonly string[]): MoveMap {
  const out: Expansion = { files: new Map(), dirRenames: [], routedDirs: new Set(), shortForms: new Map(), clashes: new Set() };
  const { files, dirRenames, routedDirs, shortForms, clashes } = out;
  for (const move of plan.moves) {
    const members = tracked.filter((path) => under(path, move.from));
    if (members.length === 0) {
      throw new CodemodError(`relocate: ${move.from} names no tracked file`, "Fix the plan path, or drop a move that already ran.");
    }
    if (move.route !== undefined) {
      expandRouted(move, move.route, members, out);
      continue;
    }
    if (members.length > 1 || members[0] !== move.from) {
      dirRenames.push([move.from, move.to]);
    }
    for (const path of members) {
      files.set(path, `${move.to}${path.slice(move.from.length)}`);
    }
  }
  for (const clash of clashes) {
    shortForms.delete(clash);
  }
  const targets = new Set(files.values());
  const collision = tracked.find((path) => targets.has(path) && !files.has(path));
  if (collision !== undefined) {
    throw new CodemodError(`relocate: ${collision} already exists`, "A move may not overwrite a tracked file.");
  }
  return { files, dirRenames, routedDirs, shortForms };
}

/** Where `path` (a file or a directory) lives after the moves. */
export function mapPath(path: string, moves: MoveMap): string {
  const file = moves.files.get(path);
  if (file !== undefined) {
    return file;
  }
  const rename = moves.dirRenames.find(([from]) => under(path, from));
  return rename === undefined ? path : `${rename[1]}${path.slice(rename[0].length)}`;
}

/** True when `path` is a routed directory: its files went to several homes, so it has no single new one. */
export function isSplitDirectory(path: string, moves: MoveMap): boolean {
  return moves.routedDirs.has(path);
}
