// `createEntityDraftStore` (UI-Gates §7 row 4 + §11.3; UI-Lib-Zustand.md D-1..D-4): the gated
// Zustand draft factory — an editor's crash-survival mirror, keyed by entity id. The factory bakes
// every persist footgun so no call site can hold it wrong:
//   • frozen `EMPTY` default — the stable "no draft" ref (a fresh `{}` per render infinite-loops
//     `useSyncExternalStore` under v5's `Object.is`; the CONSTANT identity is the fix, freeze is the
//     belt) — UI-Lib-Zustand.md C-1.
//   • `partialize` → ONLY `{ drafts }` persists — a transient sibling field can never resurrect
//     stale from localStorage (the partly-IRREVERSIBLE footgun, §11.5) — D-2.
//   • `version` + a TOTAL, crash-proof `migrate` — any unknown/corrupt persisted shape degrades to
//     `{ drafts: {} }`, never a throw that bricks the editor — D-3.
//   • a module-level STORAGE key registry — two stores persisting to one key silently clobber each
//     other; a duplicate name THROWS at store creation (§11.5's STORAGE_KEYS uniqueness).
// Shape: a VANILLA `createStore` per factory call, read through the top-level `useStore` hook —
// the docs-blessed DI pattern for dynamically-created stores (UI-Lib-Zustand.md §A "initialize-
// with-props"); no hook is minted inside the factory. Storage is injectable (tests pin an
// in-memory Map; production defaults to localStorage). Devtools: `devtools(persist(...))` —
// devtools OUTERMOST (UI-Lib-Zustand.md "devtools last" typing note), gated by the shared
// STORE_DEVTOOLS_ENABLED (DEV + extension present — warning-clean in the node lane), every
// internal write action-labeled. This factory is the persist-shaped sibling of
// `createGatedStore` (hook-shaped stores) — the ONLY two ways client state is minted.

import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { useStore } from "zustand/react";
import { createStore } from "zustand/vanilla";
import { STORE_DEVTOOLS_ENABLED } from "./create-gated-store";

/** The stable no-draft reference — see the header. One frozen constant serves every store. */
const EMPTY: Readonly<Record<string, never>> = Object.freeze({});

const STORAGE_KEY_PREFIX = "orb-draft:";
const DEFAULT_VERSION = 1;

// The §11.5 STORAGE_KEYS uniqueness registry — module-scope, asserted at factory call time.
const registeredNames = new Set<string>();

interface DraftsState<TInput> {
  readonly drafts: Readonly<Record<string, Readonly<Partial<TInput>>>>;
}

export interface EntityDraftStoreConfig {
  /** Unique store name — becomes the namespaced localStorage key (`orb-draft:<name>`). */
  readonly name: string;
  /** Bump when the draft shape changes; `migrate` decides what survives. @defaultValue 1 */
  readonly version?: number;
  /** Injectable storage (tests). @defaultValue localStorage */
  readonly storage?: StateStorage;
}

export interface EntityDraftStore<TInput> {
  /** Reactive read — returns the frozen `EMPTY` (stable ref) when no draft exists. */
  readonly useDraft: (id: string) => Readonly<Partial<TInput>>;
  readonly useHasDraft: (id: string) => boolean;
  /** Non-hook read for factory seeding (the autosave form seeds draft-over-server at mount). */
  readonly readDraft: (id: string) => Readonly<Partial<TInput>> | undefined;
  readonly setField: <K extends keyof TInput>(id: string, key: K, value: TInput[K]) => void;
  /** Shallow-merge a patch into the id's draft (the autosave mirror's whole-values write). */
  readonly setDraft: (id: string, patch: Partial<TInput>) => void;
  readonly clearDraft: (id: string) => void;
  readonly hasDraft: (id: string) => boolean;
}

/** TOTAL migrate: any unrecognized/older persisted shape falls back to a fresh empty map — drafts
 *  are crash-survival cache, not canon; losing them beats bricking the editor (D-3). */
function migrateDrafts<TInput>(persisted: unknown): DraftsState<TInput> {
  if (
    typeof persisted === "object" &&
    persisted !== null &&
    "drafts" in persisted &&
    typeof (persisted as { drafts: unknown }).drafts === "object" &&
    (persisted as { drafts: unknown }).drafts !== null
  ) {
    return persisted as DraftsState<TInput>;
  }
  return { drafts: {} };
}

export function createEntityDraftStore<TInput>(
  config: EntityDraftStoreConfig,
): EntityDraftStore<TInput> {
  if (registeredNames.has(config.name)) {
    throw new Error(
      `createEntityDraftStore: duplicate store name "${config.name}" — two stores would clobber ` +
        "one localStorage key. Every draft store needs a unique name.",
    );
  }
  registeredNames.add(config.name);

  const empty = EMPTY as Readonly<Partial<TInput>>;

  const store = createStore<DraftsState<TInput>>()(
    devtools(
      persist((): DraftsState<TInput> => ({ drafts: {} }), {
        name: `${STORAGE_KEY_PREFIX}${config.name}`,
        version: config.version ?? DEFAULT_VERSION,
        // ONLY the draft map persists (see header). The default shallow `merge` is then safe by
        // construction: `drafts` is the single persisted top-level key (UI-Lib-Zustand.md D-4).
        partialize: (s): DraftsState<TInput> => ({ drafts: s.drafts }),
        migrate: migrateDrafts<TInput>,
        ...(config.storage === undefined
          ? {}
          : { storage: createJSONStorage(() => config.storage as StateStorage) }),
      }),
      // The devtools connection label reuses the (registry-unique) storage key.
      { name: `${STORAGE_KEY_PREFIX}${config.name}`, enabled: STORE_DEVTOOLS_ENABLED },
    ),
  );

  const readDraft = (id: string): Readonly<Partial<TInput>> | undefined =>
    store.getState().drafts[id];

  const setDraft = (id: string, patch: Partial<TInput>): void => {
    const drafts = store.getState().drafts;
    store.setState(
      { drafts: { ...drafts, [id]: { ...drafts[id], ...patch } } },
      false,
      "draft/set",
    );
  };

  return {
    useDraft: (id): Readonly<Partial<TInput>> => useStore(store, (s) => s.drafts[id] ?? empty),
    useHasDraft: (id): boolean => useStore(store, (s) => s.drafts[id] !== undefined),
    readDraft,
    setField: (id, key, value): void => {
      const patch: Partial<TInput> = {};
      patch[key] = value;
      setDraft(id, patch);
    },
    setDraft,
    clearDraft: (id): void => {
      const drafts = { ...store.getState().drafts };
      delete drafts[id];
      store.setState({ drafts }, true, "draft/clear");
    },
    hasDraft: (id): boolean => readDraft(id) !== undefined,
  };
}
