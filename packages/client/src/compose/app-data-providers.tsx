import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { IdsContext, TRPCProvider } from "#data";
import type { createClientRuntime } from "./client-runtime.ts";

/** The boot data stack also mounts isolated trees without creating a second client or cache. */
export function AppDataProviders({
  runtime,
  children,
}: {
  readonly runtime: ReturnType<typeof createClientRuntime>;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <QueryClientProvider client={runtime.queryClient}>
      <TRPCProvider trpcClient={runtime.trpcClient} queryClient={runtime.queryClient}>
        <IdsContext value={runtime.ids}>{children}</IdsContext>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
