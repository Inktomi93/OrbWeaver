// The authenticated graph is reached only after the router auth gate; boot never imports its feature graph.
import type { ReactElement } from "react";
import { AppRoot } from "../routes/app-root.tsx";
import { queryClient, trpcProxy } from "./app-singletons.ts";
import { createAuthedComposition } from "./authed-composition.tsx";
import { AuthedProviders } from "./authed-providers.tsx";

const composition = createAuthedComposition({ queryClient, trpcProxy });

/** The lazy authenticated route uses the production registry and provider door. */
export function AuthedApp(): ReactElement {
  return (
    <AuthedProviders composition={composition}>
      <AppRoot />
    </AuthedProviders>
  );
}
