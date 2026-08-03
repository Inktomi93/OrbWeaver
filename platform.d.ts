// Ambient declarations for V8 14.6 surfaces TypeScript's libs do not ship yet (probe 2026-08-03:
// absent even under lib:["esnext"] on ts7 7.0.2). DELETE each block when the lib catches up —
// the duplicate-declaration error at that moment is the reminder.
interface Map<K, V> {
  getOrInsert(key: K, defaultValue: V): V;
  getOrInsertComputed(key: K, callback: (key: K) => V): V;
}
interface WeakMap<K extends WeakKey, V> {
  getOrInsert(key: K, defaultValue: V): V;
  getOrInsertComputed(key: K, callback: (key: K) => V): V;
}
interface ErrorConstructor {
  isError(value: unknown): value is Error;
}
interface IteratorConstructor {
  concat<T>(...iterables: Iterable<T>[]): IteratorObject<T, undefined, unknown>;
}
