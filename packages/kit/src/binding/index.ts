/** A late graph reference retains the bound object, including later mutations and rebinding. */
export interface Binding<T extends object> {
  readonly bind: (value: T) => void;
  readonly read: () => T;
}

/** Refuse an early read with the caller's exact composition error. */
export function createBinding<T extends object>(beforeBindMessage: string): Binding<T> {
  let value: T | null = null;
  return {
    bind: (next): void => {
      value = next;
    },
    read: (): T => {
      if (value === null) {
        throw new Error(beforeBindMessage);
      }
      return value;
    },
  };
}
