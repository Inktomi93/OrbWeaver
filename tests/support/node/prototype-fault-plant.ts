// Shared plant-and-restore for a test fault control that installs a property on a prototype. The restore puts back
// the exact prior own descriptor, or removes the key when it had none. No lint rule follows a prototype through this
// call, so routing every plant here is a convention, not an enforced home.

/** Plant `descriptor` at `key` on `target` for one fault control; call the returned function to restore it. */
export function plantPrototypeFault(target: object, key: PropertyKey, descriptor: PropertyDescriptor): () => void {
  const prior = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, descriptor);
  return (): void => {
    if (prior === undefined) {
      Reflect.deleteProperty(target, key);
    } else {
      Object.defineProperty(target, key, prior);
    }
  };
}
