// Gated Zustand draft factory — an editor's crash-survival mirror, keyed by entity id. A vanilla
// createStore per factory call, read through useStore (DI pattern for dynamically-created stores);
// a duplicate storage `name` THROWS at creation.

import { isPlainObject } from "@orb/kit/guards";
import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { useStore } from "zustand/react";
import { createStore } from "zustand/vanilla";
import { STORE_DEVTOOLS_ENABLED } from "./create-gated-store";

// Stable no-draft ref: a fresh {} per render would infinite-loop useSyncExternalStore under Object.is.
const EMPTY: Readonly<Record<string, never>> = Object.freeze({});

const STORAGE_KEY_PREFIX = "orb-draft:";
const DEFAULT_VERSION = 1;

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

/** Any unrecognized/older persisted shape falls back to a fresh empty map — drafts are cache, not canon. */
function migrateDrafts<TInput>(persisted: unknown): DraftsState<TInput> {
  if (isPlainObject(persisted) && isPlainObject(persisted["drafts"])) {
    return persisted as unknown as DraftsState<TInput>;
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
        partialize: (s): DraftsState<TInput> => ({ drafts: s.drafts }),
        migrate: migrateDrafts<TInput>,
        ...(config.storage === undefined
          ? {}
          : { storage: createJSONStorage(() => config.storage as StateStorage) }),
      }),
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
