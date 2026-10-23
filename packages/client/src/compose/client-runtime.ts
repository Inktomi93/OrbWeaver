// Boot and isolated mounts use the same query defaults, tRPC links and options proxy.

import type { RawIdGenerator } from "@orb/kit/ids";
import { createIdSource } from "@orb/kit/ids";
import type { ClientRuntime } from "#data";
import { createAppQueryClient, createTrpcClient, createTrpcProxy } from "#data";
import type { SessionDocumentHost } from "#lib";
import { timeLib } from "#lib";

/** Each mount retains these instances until its owner clears the query cache during teardown. */
export function createClientRuntime(url?: string, generate?: RawIdGenerator): ClientRuntime {
  const queryClient = createAppQueryClient();
  const trpcClient = createTrpcClient(url);
  const trpcProxy = createTrpcProxy(trpcClient, queryClient);
  return { queryClient, trpcClient, trpcProxy, ids: createIdSource(generate) };
}

/** The production document adapter is shared by boot and isolated browser mounts. */
export function browserSessionDocumentHost(): SessionDocumentHost {
  return {
    now: timeLib.now,
    currentPathname: (): string => globalThis.location.pathname,
    assign: (path): void => globalThis.location.assign(path),
    isVisible: (): boolean => globalThis.document.visibilityState === "visible",
    subscribeVisibility: (listener): (() => void) => {
      globalThis.document.addEventListener("visibilitychange", listener);
      return (): void => globalThis.document.removeEventListener("visibilitychange", listener);
    },
  };
}
