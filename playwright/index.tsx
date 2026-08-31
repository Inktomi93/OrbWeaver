// Playwright CT bootstrap — loaded into the in-browser test page before every component mount.
// The ONE stylesheet entry is the client's production front door, so shell, UI theme/tiers, client
// globals, product source discovery, and their load-bearing order cannot drift in component tests.
import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "@orb/client/styles";
import type { ReactElement } from "react";
import type { CtProvidersProps } from "../tests/support/ct/ct-providers.tsx";
import { CtProviders } from "../tests/support/ct/ct-providers.tsx";

// Inject the global provider chrome (Toast / Tooltip / Direction / ThemeScope) around every mounted
// component (primitive contract §4.3). Per case override the defaults via
// `mount(<C/>, { hooksConfig: { theme, direction } })`.
beforeMount<Omit<CtProvidersProps, "children">>(
  async ({ App, hooksConfig }): Promise<ReactElement> => (
    <CtProviders {...hooksConfig}>
      <App />
    </CtProviders>
  ),
);
