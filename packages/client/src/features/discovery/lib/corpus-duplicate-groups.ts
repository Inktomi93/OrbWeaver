// Exact-art edges collapse transitively; near matches do not connect components.
// Members retain their dossier identity beside their first-seen display name.

import type { CharacterId } from "@orb/kit/ids";

/** One near-duplicate art pair as this module reads it — passed structurally by the tab, like
 *  `disambiguateLabels`' clusters, so no wire shape is re-spelled here. */
interface ArtPair {
  readonly characterIdA: CharacterId;
  readonly nameA: string;
  readonly characterIdB: CharacterId;
  readonly nameB: string;
  readonly similarity: number;
}

/** A member's displayed name and dossier identity travel together through grouping and rendering. */
export interface ArtCliqueMember {
  readonly id: CharacterId;
  readonly name: string;
}

interface ArtCliqueGroup {
  readonly id: CharacterId;
  readonly members: readonly ArtCliqueMember[];
}

/** What the duplicate-art section actually renders: the cliques, then the pairs that are not one. Generic
 *  in the pair so a leftover row comes back as the CALLER's row — the wire's ids are branded and a
 *  structural `string` return would launder that brand off on the way through. */
export interface ArtDuplicateSections<T> {
  readonly cliques: readonly ArtCliqueGroup[];
  readonly pairs: readonly T[];
}

/** Cosines arrive as floats; an "identical" edge is 1 up to representation error, never `=== 1`. */
const IDENTICAL_FLOOR = 0.9995;
/** A clique needs three members to BE a clique — two cards are already one row, and collapsing them would
 *  cost the pair row its Compare door for no reduction at all. */
const MIN_CLIQUE = 3;

/**
 * Split near-duplicate art pairs into identical-art CLIQUES and the leftover pairs.
 *
 * Union-find over the identical edges only. A component of 3+ becomes one group; a component of 2 is handed
 * back as its pair (it is already the minimal rendering), and every sub-identical pair passes through
 * untouched in input order — the caller has already ranked them.
 */
export function groupIdenticalArt<T extends ArtPair>(pairs: readonly T[]): ArtDuplicateSections<T> {
  const identical = pairs.filter((pair) => pair.similarity >= IDENTICAL_FLOOR);
  const roots = connect(identical);
  const cliques = componentsOf(identical, roots);
  const collapsed = new Set(cliques.flatMap((clique) => clique.members.map((member) => member.id)));
  // A pair survives only when it is NOT entirely inside a collapsed clique — the group above already
  // states it, and re-listing it is the pairwise expansion this module deletes.
  return { cliques, pairs: pairs.filter((pair) => !(collapsed.has(pair.characterIdA) && collapsed.has(pair.characterIdB))) };
}

/** Union-find over the identical edges → each card's component root. */
function connect(identical: readonly ArtPair[]): Map<CharacterId, CharacterId> {
  const parent = new Map<CharacterId, CharacterId>();
  for (const pair of identical) {
    const [rootA, rootB] = [rootOf(parent, pair.characterIdA), rootOf(parent, pair.characterIdB)];
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  }
  return parent;
}

function rootOf(parent: Map<CharacterId, CharacterId>, id: CharacterId): CharacterId {
  let root = id;
  let next = parent.get(root);
  while (next !== undefined && next !== root) {
    root = next;
    next = parent.get(root);
  }
  return root;
}

/** Components of 3+ members, in the order the ranked pair list introduced them. */
function componentsOf(identical: readonly ArtPair[], parent: Map<CharacterId, CharacterId>): ArtCliqueGroup[] {
  const components = new Map<CharacterId, { id: CharacterId; readonly members: ArtCliqueMember[] }>();
  const seen = new Set<CharacterId>();
  for (const member of identical.flatMap((pair) => [
    { id: pair.characterIdA, name: pair.nameA },
    { id: pair.characterIdB, name: pair.nameB },
  ])) {
    if (seen.has(member.id)) {
      continue;
    }
    seen.add(member.id);
    const root = rootOf(parent, member.id);
    const component = components.get(root) ?? { id: member.id, members: [] };
    component.members.push(member);
    if (member.id < component.id) {
      component.id = member.id;
    }
    components.set(root, component);
  }
  return [...components.values()].filter((component) => component.members.length >= MIN_CLIQUE);
}
