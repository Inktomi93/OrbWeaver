import type { RefObject } from "react";
import { useEffect } from "react";

export function useFocusOnMount(ref: RefObject<{ readonly focus: () => void } | null>): void {
  useEffect(() => {
    ref.current?.focus();
  }, [ref]);
}
