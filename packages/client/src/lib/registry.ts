// The ONE composition mechanism (client-architecture-lockdown.md §5) — replaces every parallel
// static map (SECTION_PANEL_DEFAULTS, YOU_MODAL_ROWS, …). No mutating `register()` API exists:
// a definition is an exported value on its feature's front door, assembled ONCE at the door (G8).

/** Total, closed, read-only view over a vocabulary tuple. `get` throws on an id absent from the map —
 *  reachable only via a bad cast, since `Id` is closed by construction. */
export interface Registry<Id extends string, Def> {
  readonly name: string;
  readonly get: (id: Id) => Def;
  readonly list: () => readonly Def[];
  readonly has: (id: Id) => boolean;
}

/** Open-ended contributor view — no fixed vocabulary, ids arrive with the contributions themselves. */
export interface ContributorRegistry<Def extends { readonly id: string }> {
  readonly name: string;
  readonly get: (id: string) => Def;
  readonly list: () => readonly Def[];
  readonly has: (id: string) => boolean;
}

/**
 * Assembles a total registry over a closed vocabulary tuple. `definitions` is a `Record<Id, Def>` —
 * tsc fails the build on a missing or extra member, so completeness is a compile fact, not a gate.
 * `list()` preserves `ids` order.
 */
export function createRegistry<Id extends string, Def>(name: string, ids: readonly Id[], definitions: Record<Id, Def>): Registry<Id, Def> {
  const map = new Map<Id, Def>(ids.map((id) => [id, definitions[id]]));
  return {
    name,
    get(id): Def {
      const def = map.get(id);
      if (def === undefined) {
        throw new Error(`registry "${name}": unknown id "${id}"`);
      }
      return def;
    },
    list(): readonly Def[] {
      return ids.map((id) => definitions[id]);
    },
    has(id): boolean {
      return map.has(id);
    },
  };
}

/**
 * Assembles an open-ended contributor registry. A duplicate `id` across `contributions` THROWS at
 * construction — the cross-feature extension seam never silently shadows an entry. `list()`
 * preserves `contributions` order.
 */
export function createContributorRegistry<Def extends { readonly id: string }>(name: string, contributions: readonly Def[]): ContributorRegistry<Def> {
  const map = new Map<string, Def>();
  for (const def of contributions) {
    if (map.has(def.id)) {
      throw new Error(`createContributorRegistry "${name}": duplicate contributor id "${def.id}"`);
    }
    map.set(def.id, def);
  }
  return {
    name,
    get(id): Def {
      const def = map.get(id);
      if (def === undefined) {
        throw new Error(`registry "${name}": unknown id "${id}"`);
      }
      return def;
    },
    list(): readonly Def[] {
      return contributions;
    },
    has(id): boolean {
      return map.has(id);
    },
  };
}
