import type { Ref, RefCallback } from "react";

/** Share a DOM ref while preserving each caller's React cleanup. */
export function mergeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    const cleanups = refs.map((ref): (() => void) | undefined => {
      if (typeof ref === "function") {
        const cleanup = ref(node);
        return typeof cleanup === "function"
          ? cleanup
          : (): void => {
              ref(null);
            };
      }
      if (ref === null || ref === undefined) {
        return undefined;
      }
      ref.current = node;
      return (): void => {
        ref.current = null;
      };
    });
    return (): void => {
      for (const cleanup of cleanups) {
        cleanup?.();
      }
    };
  };
}
