// Mounts a heavy subtree in a deferred render after its host's commit. Entering a room commits inside a
// view-transition update callback, which holds the main thread for the whole sync commit; the fallback lands
// there and the children in a later, yielding render. `stage` puts siblings in separate commits.

import type { ReactElement, ReactNode } from "react";
import { useDeferredValue } from "react";

export interface DeferredMountProps {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
  /** How many deferred renders to wait: 1 mounts in the first one after the host's commit. */
  readonly stage: number;
}

export function DeferredMount({ fallback, children, stage }: DeferredMountProps): ReactElement {
  // A hook MOUNTED inside a deferred render claims the next one, so each nesting level lands a render later.
  const mounted: boolean = useDeferredValue(true, false);
  if (!mounted) {
    return <>{fallback}</>;
  }
  if (stage > 1) {
    return (
      <DeferredMount fallback={fallback} stage={stage - 1}>
        {children}
      </DeferredMount>
    );
  }
  return <>{children}</>;
}
