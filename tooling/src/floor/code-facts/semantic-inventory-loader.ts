// One read session's fact loaders: a family reads only unasked keys, many per statement, and retains answers only while its session is pinned.

import type { DatabaseSync, StatementSync } from "node:sqlite";

/** Keys per batched statement; bounds one JSON key list and one result set, never the population a session may ask for. */
export const INVENTORY_BATCH_KEYS = 512;

/** A connection whose statements compile once per SQL text for the session's lifetime. */
export interface InventoryReadSession {
  readonly db: DatabaseSync;
  readonly statement: (sql: string) => StatementSync;
}

/** A keyed fact family answers many keys of one partition per read; a requested key without an entry has no stored row. */
export interface InventoryFactFamily<K, V> {
  readonly key: (key: K) => string;
  readonly read: (session: InventoryReadSession, partition: string, keys: readonly K[]) => ReadonlyMap<string, V>;
}

/** Answers in request order; `undefined` is a stored absence, never a skipped read. */
export interface InventoryFamilyLoader<K, V> {
  readonly load: (partition: string, keys: readonly K[]) => readonly (V | undefined)[];
}

export interface InventoryLoader extends Disposable {
  readonly family: <K, V>(family: InventoryFactFamily<K, V>) => InventoryFamilyLoader<K, V>;
}

const ABSENT = Symbol("absent");
type Answer<V> = V | typeof ABSENT;

/** A one-shot session for callers that batch within one operation and retain nothing. */
export function createInventoryReadSession(db: DatabaseSync): InventoryReadSession {
  return compiledSession(db, new Map());
}

function compiledSession(db: DatabaseSync, statements: Map<string, StatementSync>): InventoryReadSession {
  return {
    db,
    statement: (sql): StatementSync => {
      const existing = statements.get(sql);
      if (existing !== undefined) {
        return existing;
      }
      const prepared = db.prepare(sql);
      statements.set(sql, prepared);
      return prepared;
    },
  };
}

function unasked<K, V>(keys: readonly K[], ids: readonly string[], known: ReadonlyMap<string, Answer<V>>): [string, K][] {
  const missing = new Map<string, K>();
  keys.forEach((key, index) => {
    const id = ids[index];
    if (id !== undefined && !known.has(id) && !missing.has(id)) {
      missing.set(id, key);
    }
  });
  return [...missing.entries()];
}

function readMissing<K, V>(
  family: InventoryFactFamily<K, V>,
  session: InventoryReadSession,
  partition: string,
  pending: readonly [string, K][],
): Map<string, Answer<V>> {
  const found = new Map<string, Answer<V>>();
  for (let start = 0; start < pending.length; start += INVENTORY_BATCH_KEYS) {
    const chunk = pending.slice(start, start + INVENTORY_BATCH_KEYS);
    for (const [id, value] of family.read(
      session,
      partition,
      chunk.map(([, key]) => key),
    )) {
      found.set(id, value);
    }
    for (const [id] of chunk) {
      if (!found.has(id)) {
        found.set(id, ABSENT);
      }
    }
  }
  return found;
}

/** One batched, deduplicated read for a caller that holds no session; nothing is retained after it returns. */
export function readInventoryFacts<K, V>(
  db: DatabaseSync,
  family: InventoryFactFamily<K, V>,
  partition: string,
  keys: readonly K[],
): readonly (V | undefined)[] {
  using loader = createInventoryLoader(db, false, (): void => undefined);
  return loader.family(family).load(partition, keys);
}

/** `retain` is the session's pinned-snapshot claim; an unpinned session still deduplicates the keys of one load. */
export function createInventoryLoader(db: DatabaseSync, retain: boolean, assertOpen: () => void): InventoryLoader {
  const statements = new Map<string, StatementSync>();
  const session = compiledSession(db, statements);
  const clears: (() => void)[] = [
    (): void => {
      statements.clear();
    },
  ];
  return {
    family: <K, V>(family: InventoryFactFamily<K, V>): InventoryFamilyLoader<K, V> => {
      const retained = new Map<string, Map<string, Answer<V>>>();
      clears.push((): void => {
        retained.clear();
      });
      return {
        load: (partition, keys): readonly (V | undefined)[] => {
          assertOpen();
          const known = retained.get(partition) ?? new Map<string, Answer<V>>();
          const ids = keys.map(family.key);
          const pending = unasked(keys, ids, known);
          for (const [id, value] of readMissing(family, session, partition, pending)) {
            known.set(id, value);
          }
          if (retain && pending.length > 0) {
            retained.set(partition, known);
          }
          return ids.map((id) => {
            const value = known.get(id);
            return value === ABSENT ? undefined : value;
          });
        },
      };
    },
    [Symbol.dispose]: (): void => {
      for (const clear of clears) {
        clear();
      }
    },
  };
}
