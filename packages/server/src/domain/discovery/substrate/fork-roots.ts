// domain/discovery/substrate/fork-roots — path-compressed fork-lineage roots (pure; zero I/O). Walks the
// chats.parentChatId self-FK to the family root so the chat near-dup arm can label a look-alike pair
// "forked" (shared root) vs "duplicate" (independent). Iterative with a visited-guard so a cyclic/self
// parent chain terminates instead of looping forever.

export function forkRoots(edges: ReadonlyMap<string, string | null>): Map<string, string> {
  const rootOf = new Map<string, string>();
  const resolve = (start: string): string => {
    const cached = rootOf.get(start);
    if (cached !== undefined) {
      return cached;
    }
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
        break;
      }
      chain.push(cur);
      cur = parent;
    }
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
