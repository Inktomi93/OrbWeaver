// Where focus goes after a rule field is removed. The Remove control and its confirm unmount with the field,
// so neither can hand focus on; the control that outlives the removal (the Add button, or the list's Add
// keyword) claims it instead. `target` is that control's ref; `arm` is called when the removal is committed, and
// `confirmed` only when it went through a confirm, so a removal with no confirm cannot leave a later Cancel's focus to the body.

import type { RefCallback } from "react";
import { useRef } from "react";

export interface RemovalFocus {
  /** Makes the ref of the control that takes focus. It may mount after `arm`, as the Add button does. */
  readonly target: () => RefCallback<HTMLElement>;
  /** Call as the removal is committed: focuses the target now, or on mount when it has none yet. */
  readonly arm: () => void;
  /** Call as a confirm is accepted, before `arm`: the confirm's `finalFocus` then leaves focus to the hook. */
  readonly confirmed: () => void;
  /** The confirm's `finalFocus`: after a committed removal this hook has placed focus, so Base UI must not. */
  readonly finalFocus: () => boolean;
}

export function useRemovalFocus(): RemovalFocus {
  const node = useRef<HTMLElement | null>(null);
  const pending = useRef(false);
  const removed = useRef(false);
  return {
    target: () => (next) => {
      node.current = next;
      if (next !== null && pending.current) {
        pending.current = false;
        next.focus();
      }
    },
    confirmed: (): void => {
      removed.current = true;
    },
    arm: (): void => {
      if (node.current === null) {
        pending.current = true;
      } else {
        node.current.focus();
      }
    },
    finalFocus: (): boolean => {
      const committed = removed.current;
      removed.current = false;
      return !committed;
    },
  };
}
