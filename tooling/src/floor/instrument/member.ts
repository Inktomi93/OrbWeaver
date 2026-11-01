/** One member of an object as `unknown`. `Reflect.get` is typed `any`, which leaks into every caller; narrow the result at the use site. */
export function readMember(target: object, key: PropertyKey): unknown {
  return Reflect.get(target, key);
}
