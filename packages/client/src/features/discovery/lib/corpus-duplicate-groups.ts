// ONE FINDING, RENDERED ONCE — the pairwise→equivalence-class collapse the Similarity tab's duplicate-art
// section needed (side-eye se-verify-4 N3, issue #564).
//
// THE DEFECT THIS EXISTS FOR, measured on the populated library: "Duplicate art" drew 82 rows over 3,572px
// — 48% of the tab — and the content was COMBINATORIAL. Twelve cards sharing one placeholder portrait
// produce C(12,2) = 66 pairs, every one of them at 100%, so a single fact ("these twelve cards have the
// same picture") was rendered sixty-six times as sixty-six separate findings. A reader scrolling it cannot
// tell that they are looking at one group, and the section's own length is a function of the SQUARE of the
// most boring thing in the library.
//
// WHY ONLY THE EXACT MATCHES COLLAPSE. "Same portrait" is transitive; "similar portrait" is not. Chaining
// 0.9 edges would merge two cards that were never within 0.9 of each other and report them as one group —
// a stronger claim than the pass ever made. So the collapse is applied to the identical edges alone and
// every sub-identical pair keeps its own row, which is also where a pairwise reading is the honest one:
// with two members there is nothing to collapse.
//
// PURE, and unit-tested (`tests/client/features/discovery/lib/corpus-duplicate-groups.test.ts`): the
// grouping is a claim about the DATA, and a CT can only prove that whatever it computed reached the DOM.

/** One near-duplicate art pair as this module reads it — passed structurally by the tab, like
 *  `disambiguateLabels`' clusters, so no wire shape is re-spelled here. */
interface ArtPair {
  readonly characterIdA: string;
  readonly nameA: string;
  readonly characterIdB: string;
  readonly nameB: string;
  readonly similarity: number;
}

/** A set of cards that all carry the SAME portrait — the collapse of one identical-art clique. NOT
 *  exported: the caller reaches it through {@link ArtDuplicateSections} and never names it, and an export
 *  nothing imports is what `knip` is for. */
interface ArtCliqueGroup {
  /** Stable across renders and unique within the result: the smallest member id. */
  readonly id: string;
  readonly memberIds: readonly string[];
  /** Member names, in first-seen order — the tab shows a bounded run of them. */
  readonly names: readonly string[];
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
  const collapsed = new Set(cliques.flatMap((clique) => clique.memberIds));
  // A pair survives only when it is NOT entirely inside a collapsed clique — the group above already
  // states it, and re-listing it is the pairwise expansion this module deletes.
  return { cliques, pairs: pairs.filter((pair) => !(collapsed.has(pair.characterIdA) && collapsed.has(pair.characterIdB))) };
}

/** Union-find over the identical edges → each card's component root. */
function connect(identical: readonly ArtPair[]): Map<string, string> {
  const parent = new Map<string, string>();
  for (const pair of identical) {
    const [rootA, rootB] = [rootOf(parent, pair.characterIdA), rootOf(parent, pair.characterIdB)];
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  }
  return parent;
}

function rootOf(parent: Map<string, string>, id: string): string {
  let root = id;
  let next = parent.get(root);
  while (next !== undefined && next !== root) {
    root = next;
    next = parent.get(root);
  }
  return root;
}

/** Components of 3+ members, in the order the ranked pair list introduced them. */
function componentsOf(identical: readonly ArtPair[], parent: Map<string, string>): ArtCliqueGroup[] {
  const members = new Map<string, { readonly ids: string[]; readonly names: string[] }>();
  const seen = new Set<string>();
  for (const side of identical.flatMap((pair) => [
    { id: pair.characterIdA, name: pair.nameA },
    { id: pair.characterIdB, name: pair.nameB },
  ])) {
    if (seen.has(side.id)) {
      continue;
    }
    seen.add(side.id);
    const bucket = members.get(rootOf(parent, side.id)) ?? { ids: [], names: [] };
    bucket.ids.push(side.id);
    bucket.names.push(side.name);
    members.set(rootOf(parent, side.id), bucket);
  }
  return [...members.values()]
    .filter((bucket) => bucket.ids.length >= MIN_CLIQUE)
    .map((bucket) => ({
      // The smallest id is deterministic and independent of iteration order — the ids are ULID-shaped, so
      // it is also the earliest-minted member.
      id: [...bucket.ids].sort()[0] ?? "",
      memberIds: bucket.ids,
      names: bucket.names,
    }));
}
