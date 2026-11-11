// Ambient declarations for V8 14.6 surfaces the repo's `lib` tuple does not ship yet (es2025 +
// esnext.disposable + esnext.temporal). DELETE each block when the lib catches up — a
// duplicate-declaration error at that moment is the reminder (method-style members merge as
// overloads and stay silent, so the bump's `tsc` pass must include deleting them).
//
// ⚠️ THE Map/WeakMap MEMBERS ARE METHOD-STYLE ON PURPOSE, and the four suppressions below are the
// price. This was landed method-style, "corrected" to property-style to satisfy
// `useConsistentMethodSignatures`, and that correction BROKE THE BUILD — measured, 2026-08-03:
//
//   Method-style parameters are BIVARIANT; property-style are checked strictly under
//   `strictFunctionTypes`. Every OTHER member of lib.d.ts's `Map<K,V>` is method-style, which is
//   exactly why `Map<CharacterId, string>` is assignable to `Map<string, string>` today. MERGING a
//   strictly-checked member that mentions K and V makes the whole interface INVARIANT in both — so
//   the augmentation silently revokes an assignability the standard library grants. Three real
//   sites went red, measured: the branded-key Map assignments in domain/export/verbs/export-chat.ts
//   and the widening value Map in domain/stats/persistence/rebuild-from-canon.ts. Reverting to
//   method style: 0 errors.
//
// So the rule's usual argument ("property style is stricter, therefore safer") inverts here. On an
// AUGMENTATION of a bivariant standard interface, the strict spelling is the INCONSISTENT one — it
// makes one member disagree with the twenty around it, and the interface as a whole pays. Match the
// interface you are merging into; the rule is about OUR interfaces, and these are not ours.
//
// `ErrorConstructor.isError` and `IteratorConstructor.concat` stay property-style deliberately —
// neither interface carries a class type parameter, so there is no variance to lose and no
// suppression to justify. The narrow suppression is the honest one.
interface Map<K, V> {
  // biome-ignore lint/style/useConsistentMethodSignatures: bivariance is load-bearing — see the header. Property style makes Map<K,V> invariant and reds 3 real sites.
  getOrInsert(key: K, defaultValue: V): V;
  // biome-ignore lint/style/useConsistentMethodSignatures: bivariance is load-bearing — see the header. Property style makes Map<K,V> invariant and reds 3 real sites.
  getOrInsertComputed(key: K, callback: (key: K) => V): V;
}
interface WeakMap<K extends WeakKey, V> {
  // biome-ignore lint/style/useConsistentMethodSignatures: bivariance is load-bearing — see the header. Property style makes WeakMap<K,V> invariant, same class as Map.
  getOrInsert(key: K, defaultValue: V): V;
  // biome-ignore lint/style/useConsistentMethodSignatures: bivariance is load-bearing — see the header. Property style makes WeakMap<K,V> invariant, same class as Map.
  getOrInsertComputed(key: K, callback: (key: K) => V): V;
}
interface ErrorConstructor {
  isError: (value: unknown) => value is Error;
}
interface IteratorConstructor {
  concat: <T>(...iterables: Iterable<T>[]) => IteratorObject<T, undefined, unknown>;
}

// The ISO world omits DOM declarations; supported Node and browsers provide this pure clone.
declare function structuredClone<T>(value: T): T;
