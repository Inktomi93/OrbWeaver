// domain/discovery/substrate/fork-roots — path-compressed fork-lineage roots (pure; zero I/O). A fork is a
// deep COPY linked ONLY by `chats.parentChatId` (D27); walking that self-FK to the family ROOT lets the chat
// near-dup arm label a look-alike pair `forked` (shared root — a known fork family) vs `duplicate` (independent
// look-alike). Classic union-find find-with-path-compression: each chat resolves to the topmost ancestor
// reachable via parentChatId (a chat with no/absent parent is its OWN root).
//
// DETERMINISM + SAFETY: iterative walk with a visited-guard so a cyclic/self parent chain (a corrupt lineage)
// terminates instead of looping forever; memoized so repeated lookups are O(1) after the first.

/**
 * Resolve every node id to its fork-family ROOT. `edges` maps a chatId → its `parentChatId` (null/absent = a
 * root). A parent not present as a key is treated as a root (a fork can outlive its parent — SET NULL). Two
 * ids share a family iff they map to the same root.
 */
export function forkRoots(edges: ReadonlyMap<string, string | null>): Map<string, string> {
  const rootOf = new Map<string, string>();
  const resolve = (start: string): string => {
    const cached = rootOf.get(start);
    if (cached !== undefined) {
      return cached;
    }
    // Walk to the root, collecting the chain to path-compress afterwards. `seen` guards a cycle.
    const chain: string[] = [];
    const seen = new Set<string>();
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const memo = rootOf.get(cur);
      if (memo !== undefined) {
        cur = memo;
        break;
      }
      const parent = edges.get(cur);
      if (parent === undefined || parent === null || !edges.has(parent)) {
        break; // `cur` is a root (no parent, or the parent row is gone — SET NULL).
      }
      chain.push(cur);
      cur = parent;
    }
    // `cur` is now the root (or the cycle-entry / memoized root). Compress the whole chain onto it.
    rootOf.set(start, cur);
    for (const node of chain) {
      rootOf.set(node, cur);
    }
    return cur;
  };
  for (const id of edges.keys()) {
    resolve(id);
  }
  return rootOf;
}
