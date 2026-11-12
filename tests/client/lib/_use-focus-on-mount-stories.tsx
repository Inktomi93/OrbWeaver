import { QueryBoundary } from "@orb/client/components";
import { useSuspenseQuery, useTRPC } from "@orb/client/data";
import { useFocusOnMount } from "@orb/client/lib";
import { CtClientProviders, CtIsolation } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ARRIVAL_EVENT, DISMISS_NAME, OPEN_NAME, PENDING_NAME, SURFACE_NAME } from "./use-focus-on-mount-names.ts";

/** A surface that takes arrival focus through the production hook. */
function ArrivalSurface(): ReactElement {
  const ref = useRef<HTMLElement>(null);
  useFocusOnMount(ref);
  return (
    <section aria-label={SURFACE_NAME} ref={ref} tabIndex={-1}>
      <p>{SURFACE_NAME}</p>
    </section>
  );
}

/** A press whose own control is removed by the render that mounts the surface: a navigation the hook arrives for. */
export function PressSwapStory(): ReactElement {
  const [opened, setOpened] = useState(false);
  return (
    <CtIsolation subject="Arrival focus" isolates="The hook's body-focus rule, without the shell's sections and data">
      {opened ? (
        <ArrivalSurface />
      ) : (
        <button onClick={(): void => setOpened(true)} type="button">
          {OPEN_NAME}
        </button>
      )}
    </CtIsolation>
  );
}

/** A press that removes its own control and goes nowhere, then a surface that mounts later on no press at all. */
export function StrayMountStory(): ReactElement {
  const [dismissed, setDismissed] = useState(false);
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const arrive = (): void => setArrived(true);
    globalThis.addEventListener(ARRIVAL_EVENT, arrive);
    return (): void => globalThis.removeEventListener(ARRIVAL_EVENT, arrive);
  }, []);
  return (
    <CtIsolation subject="Arrival focus" isolates="The hook's body-focus rule, without the shell's sections and data">
      {dismissed ? null : (
        <button onClick={(): void => setDismissed(true)} type="button">
          {DISMISS_NAME}
        </button>
      )}
      {arrived ? <ArrivalSurface /> : null}
    </CtIsolation>
  );
}

/** A surface whose first render waits on a read, so the boundary above it shows its fallback until the read settles. */
function SlowArrivalSurface(): ReactElement {
  const trpc = useTRPC();
  useSuspenseQuery(trpc.refinery.listSessions.queryOptions());
  return <ArrivalSurface />;
}

/** A press whose own control is removed by the render that starts the surface's read: the surface mounts when the read settles. */
export function SlowReadSwapStory(): ReactElement {
  const [opened, setOpened] = useState(false);
  return (
    <CtClientProviders>
      {opened ? (
        <QueryBoundary fallback={<p>{PENDING_NAME}</p>} resetKeys={[]}>
          <SlowArrivalSurface />
        </QueryBoundary>
      ) : (
        <button onClick={(): void => setOpened(true)} type="button">
          {OPEN_NAME}
        </button>
      )}
    </CtClientProviders>
  );
}
