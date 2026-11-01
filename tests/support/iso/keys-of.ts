// `Object.keys` returns `string[]`; a const record's own keys are its `keyof` type, which the guard checks per key.

/** The own keys of a record, typed as the record's key union. */
export function keysOf<T extends object>(record: T): (keyof T)[] {
  return Object.keys(record).filter((key): key is Extract<keyof T, string> => Object.hasOwn(record, key));
}
