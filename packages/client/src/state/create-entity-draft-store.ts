// Gated Zustand draft factory — an editor's crash-survival mirror, keyed by entity id. A vanilla
// createStore per factory call, read through useStore (DI pattern for dynamically-created stores);
// a duplicate storage `name` THROWS at creation.
//
// The mirror is CACHE, not authority (retro-workboard #11 — the localStorage-brick fix). Each entity's
// slot persists an ENVELOPE `{ values, schemaVersion, baselineHash }`, and a persisted draft is handed
// back on read ONLY when it is verifiably fresh:
//   1. `schemaVersion` matches the form model's current version (a stale-shape draft is unparseable),
//   2. `validate` (the form's zod parse, threaded through config) accepts `values`, AND
//   3. `baselineHash` matches the server snapshot the form is mounting over (`readDraft(id, baselineHash)`).
// A draft failing ANY check — including an unverifiable pre-envelope (bare-values) draft — is DISCARDED on
// read (the dead slot is cleared): the server outranks a draft that can't prove it began on the same truth.
// A store with no `validate`/`schemaVersion` config and reads with no `baselineHash` degrades to a plain
// per-key KV mirror (the crash-survival contract before the gate; also the generic reactive-store use).

import { isPlainObject } from "@orb/kit/guards";
import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import { useStore } from "zustand/react";
import { createStore } from "zustand/vanilla";
import { STORE_DEVTOOLS_ENABLED } from "./create-gated-store.ts";
import type { DurableLocalPersistApi } from "./durable-local.ts";
import { durableLocalKey, registerDurableLocalStore } from "./durable-local.ts";

// Stable no-draft ref: a fresh {} per render would infinite-loop useSyncExternalStore under Object.is.
const EMPTY: Readonly<Record<string, never>> = Object.freeze({});

const STORAGE_KEY_PREFIX = "orb-draft:";
const DEFAULT_VERSION = 1;
const DEFAULT_SCHEMA_VERSION = 0;

const registeredNames = new Set<string>();

/** The persisted per-entity envelope — the values plus the two freshness stamps a mount verifies. */
interface DraftEnvelope<TInput> {
  readonly values: Readonly<Partial<TInput>>;
  /** The form-model schema version this draft was written under (mismatch = unparseable → discard). */
  readonly schemaVersion: number;
  /** The structural hash of the server snapshot the edit began on (undefined for a create/no-server). */
  readonly baselineHash?: string;
}

interface DraftsState<TInput> {
  readonly drafts: Readonly<Record<string, DraftEnvelope<TInput>>>;
}

export interface EntityDraftStoreConfig<TInput> {
  /** Unique store name — becomes the per-user localStorage key (`orb-draft:u/<userId>/<name>`). */
  readonly name: string;
  /** Bump when the ENVELOPE shape changes; `migrate` decides what survives. @defaultValue 1 */
  readonly version?: number;
  /**
   * The form-model validator (a zod `.safeParse` wrapper) — returns the validated values or `undefined`.
   * A surviving draft must pass this AND its baseline before it is handed back. Omit for a generic KV
   * mirror (crash-survival with no model gate). @defaultValue accept-as-is
   */
  readonly validate?: (values: unknown) => Readonly<Partial<TInput>> | undefined;
  /** The current form-model schema version stamped on writes and required on reads. @defaultValue 0 */
  readonly schemaVersion?: number;
  /** Injectable storage (tests). @defaultValue localStorage */
  readonly storage?: StateStorage;
}

export interface EntityDraftStore<TInput> {
  /** Reactive read — returns the frozen `EMPTY` (stable ref) when no draft exists. Unwraps the envelope
   *  to `values`; does NOT baseline-gate (a live reactive observer, not the mount-seed gate). */
  readonly useDraft: (id: string) => Readonly<Partial<TInput>>;
  readonly useHasDraft: (id: string) => boolean;
  /**
   * Non-hook read for factory seeding (the autosave form seeds draft-over-server at mount). Returns the
   * draft ONLY when it validates against the model AND its stamped baseline matches `baselineHash`; a
   * stale/unverifiable draft is DISCARDED (its dead slot cleared) and `undefined` returned.
   */
  readonly readDraft: (id: string, baselineHash?: string) => Readonly<Partial<TInput>> | undefined;
  readonly setField: <K extends keyof TInput>(id: string, key: K, value: TInput[K]) => void;
  /** Shallow-merge a patch into the id's draft, stamping the current schema version + `baselineHash`. */
  readonly setDraft: (id: string, patch: Partial<TInput>, baselineHash?: string) => void;
  readonly clearDraft: (id: string) => void;
  readonly hasDraft: (id: string) => boolean;
}

/** Any unrecognized/older persisted shape falls back to a fresh empty map — drafts are cache, not canon.
 *  A pre-envelope (bare-values) persisted shape is NOT lifted: it is unverifiable, so it starts empty. */
function migrateDrafts<TInput>(persisted: unknown): DraftsState<TInput> {
  if (isPlainObject(persisted) && isPlainObject(persisted["drafts"])) {
    const drafts = persisted["drafts"] as Record<string, unknown>;
    const kept: Record<string, DraftEnvelope<TInput>> = {};
    for (const [id, entry] of Object.entries(drafts)) {
      // Keep ONLY well-formed envelopes; a bare-values (pre-#11) entry has no `values`/`schemaVersion`
      // and is dropped — it can't prove freshness, so it must never be handed back (the whole point).
      if (isPlainObject(entry) && isPlainObject(entry["values"]) && typeof entry["schemaVersion"] === "number") {
        kept[id] = entry as unknown as DraftEnvelope<TInput>;
      }
    }
    return { drafts: kept };
  }
  return { drafts: {} };
}

export function createEntityDraftStore<TInput>(config: EntityDraftStoreConfig<TInput>): EntityDraftStore<TInput> {
  if (registeredNames.has(config.name)) {
    throw new Error(
      `createEntityDraftStore: duplicate store name "${config.name}" — two stores would clobber ` +
        "one localStorage key. Every draft store needs a unique name.",
    );
  }
  registeredNames.add(config.name);

  const empty = EMPTY as Readonly<Partial<TInput>>;
  const schemaVersion = config.schemaVersion ?? DEFAULT_SCHEMA_VERSION;

  // Per-USER key (`durable-local.ts`): a draft is PROSE, so an era-changed identity must never rehydrate a
  // previous one's half-written text. The devtools label keeps the plain name.
  const storageKey = durableLocalKey(STORAGE_KEY_PREFIX, config.name);

  const store = createStore<DraftsState<TInput>>()(
    devtools(
      persist((): DraftsState<TInput> => ({ drafts: {} }), {
        name: storageKey,
        version: config.version ?? DEFAULT_VERSION,
        partialize: (s): DraftsState<TInput> => ({ drafts: s.drafts }),
        migrate: migrateDrafts<TInput>,
        ...(config.storage === undefined ? {} : { storage: createJSONStorage(() => config.storage as StateStorage) }),
      }),
      { name: storageKey, enabled: STORE_DEVTOOLS_ENABLED },
    ),
  );
  registerDurableLocalStore({ prefix: STORAGE_KEY_PREFIX, name: config.name, api: store as unknown as DurableLocalPersistApi });

  const rawEnvelope = (id: string): DraftEnvelope<TInput> | undefined => store.getState().drafts[id];

  // A well-formed envelope at the CURRENT schema version — the reactive reads (useDraft/useHasDraft/
  // hasDraft) gate on this so a bare-values or stale-schema slot that dodged `migrate` (same persist
  // `version`, so migrate never ran) reads as no-draft. Baseline-matching is the mount-seed read's job
  // (`readDraft`), not a reactive observer's — an observer has no server snapshot to compare against.
  const isCurrentEnvelope = (entry: DraftEnvelope<TInput> | undefined): entry is DraftEnvelope<TInput> =>
    entry !== undefined && isPlainObject(entry.values) && entry.schemaVersion === schemaVersion;

  /** The validated values of a well-formed, current-schema envelope, or `undefined` (any gate miss). */
  const validateEnvelope = (entry: DraftEnvelope<TInput> | undefined): Readonly<Partial<TInput>> | undefined => {
    if (!isCurrentEnvelope(entry)) {
      return;
    }
    return config.validate === undefined ? entry.values : config.validate(entry.values);
  };

  const clearDraft = (id: string): void => {
    const drafts = { ...store.getState().drafts };
    delete drafts[id];
    store.setState({ drafts }, true, "draft/clear");
  };

  const readDraft = (id: string, baselineHash?: string): Readonly<Partial<TInput>> | undefined => {
    const envelope = rawEnvelope(id);
    if (envelope === undefined) {
      return;
    }
    // Freshness gate: schema version, then the model validator, then the server-baseline match. Any miss
    // means the draft can't prove it began on the current truth — discard the dead slot, server outranks.
    const validated = validateEnvelope(envelope);
    const baselineMatches = baselineHash === undefined || envelope.baselineHash === baselineHash;
    if (validated === undefined || !baselineMatches) {
      clearDraft(id);
      return;
    }
    return validated;
  };

  const setDraft = (id: string, patch: Partial<TInput>, baselineHash?: string): void => {
    const drafts = store.getState().drafts;
    const prev = drafts[id];
    const envelope: DraftEnvelope<TInput> = {
      values: { ...prev?.values, ...patch },
      schemaVersion,
      ...(baselineHash === undefined ? {} : { baselineHash }),
    };
    store.setState({ drafts: { ...drafts, [id]: envelope } }, false, "draft/set");
  };

  return {
    useDraft: (id): Readonly<Partial<TInput>> => useStore(store, (s) => (isCurrentEnvelope(s.drafts[id]) ? s.drafts[id].values : empty)),
    useHasDraft: (id): boolean => useStore(store, (s) => isCurrentEnvelope(s.drafts[id])),
    readDraft,
    setField: (id, key, value): void => {
      const patch: Partial<TInput> = {};
      patch[key] = value;
      setDraft(id, patch);
    },
    setDraft,
    clearDraft,
    hasDraft: (id): boolean => isCurrentEnvelope(rawEnvelope(id)),
  };
}
