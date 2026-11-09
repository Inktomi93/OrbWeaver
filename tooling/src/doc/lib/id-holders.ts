// Who held a numbered id over git history. A retitle renames a file inside one commit (the old name goes,
// the new one arrives, same id), so those names are one item; names the history never joins in one commit
// are different items that took the same id.
import type { GitPathChangeSet } from "../../floor/git/git-history-contract.ts";
import { basenameOf, parseNumberedName } from "./names.ts";

/** The numbered paths one commit touched under `prefix`, grouped by id. */
function pathsById(set: GitPathChangeSet, prefix: string): ReadonlyMap<number, readonly string[]> {
  const groups = new Map<number, string[]>();
  for (const path of [...set.deleted, ...set.added]) {
    const name = path.startsWith(prefix) ? parseNumberedName(basenameOf(path)) : null;
    if (name !== null) {
      groups.set(name.id, [...(groups.get(name.id) ?? []), path]);
    }
  }
  return groups;
}

/** `group` joins every holder it shares a path with; components stay disjoint, so one pass merges them all. */
function withGroup(holders: readonly ReadonlySet<string>[], group: readonly string[]): readonly ReadonlySet<string>[] {
  const joined = holders.filter((holder) => group.some((path) => holder.has(path)));
  const merged = new Set([...group, ...joined.flatMap((holder) => [...holder])]);
  return [...holders.filter((holder) => !joined.includes(holder)), merged];
}

/** For each historic numbered path under `prefix` whose id another item also held, the paths of those other
 *  items. A path whose id only one item ever held has no entry. */
export function foreignHolders(changeSets: readonly GitPathChangeSet[], prefix: string): ReadonlyMap<string, readonly string[]> {
  const holdersById = new Map<number, readonly ReadonlySet<string>[]>();
  for (const set of changeSets) {
    for (const [id, group] of pathsById(set, prefix)) {
      holdersById.set(id, withGroup(holdersById.get(id) ?? [], group));
    }
  }
  const foreign = new Map<string, readonly string[]>();
  for (const holders of holdersById.values()) {
    for (const holder of holders) {
      const others = holders.filter((other) => other !== holder).flatMap((other) => [...other]);
      for (const path of holder) {
        if (others.length > 0) {
          foreign.set(path, others.toSorted());
        }
      }
    }
  }
  return foreign;
}
