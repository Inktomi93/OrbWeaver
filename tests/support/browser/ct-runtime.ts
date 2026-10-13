// Client helpers share one production runtime per mount; the UI-only bootstrap never imports this module.
import type { SessionDocumentHost } from "@orb/client/lib";
import { leaseSessionDocumentHost } from "@orb/client/lib";
import type { QueryClient } from "@tanstack/react-query";
import { createContext, use, useLayoutEffect, useState } from "react";
import { browserSessionDocumentHost, createClientRuntime } from "./ct-door.ts";

export interface CtRuntimeOptions {
  readonly configureQueryClient?: (queryClient: QueryClient) => void;
  readonly refetchOnWindowFocus?: boolean;
  readonly sessionDocumentHost?: SessionDocumentHost;
}

export const CtRuntimeContext = createContext<ReturnType<typeof createClientRuntime> | null>(null);

/** Nested helpers reuse their root runtime; only its owner binds and releases document and cache resources. */
export function useCtRuntime(options?: CtRuntimeOptions): ReturnType<typeof createClientRuntime> {
  const parent = use(CtRuntimeContext);
  const [runtime] = useState(() => {
    if (parent !== null) {
      return parent;
    }
    const created = createClientRuntime();
    if (options?.refetchOnWindowFocus !== undefined) {
      const defaults = created.queryClient.getDefaultOptions();
      created.queryClient.setDefaultOptions({
        ...defaults,
        queries: { ...defaults.queries, retry: false, refetchOnWindowFocus: options.refetchOnWindowFocus },
      });
    }
    options?.configureQueryClient?.(created.queryClient);
    return created;
  });
  const [host] = useState(() => (parent === null ? (options?.sessionDocumentHost ?? browserSessionDocumentHost()) : null));
  useLayoutEffect(() => {
    if (host === null) {
      return;
    }
    const releaseDocument = leaseSessionDocumentHost(host)[Symbol.dispose];
    return (): void => {
      runtime.queryClient.clear();
      releaseDocument();
    };
  }, [host, runtime]);
  return runtime;
}
