// The ONE browser-connectivity read. Derives from TanStack Query's `onlineManager` — the EXACT signal
// `networkMode: "online"` (query-client.ts, LAW) pauses queries on — so "offline" here is by
// construction the same state that freezes every suspense fallback. Never re-listen to raw
// window online/offline events in a feature; consume this hook (QueryBoundary already does, so every
// suspending surface inherits the offline affordance for free).

import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  return onlineManager.subscribe(onChange);
}

function getSnapshot(): boolean {
  return onlineManager.isOnline();
}

// SSR/first-paint snapshot: assume online — the pessimistic arm would flash the offline line on boot.
function getServerSnapshot(): boolean {
  return true;
}

/** Whether the query layer considers the browser online (`onlineManager`), live via the browser
 *  online/offline events. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
