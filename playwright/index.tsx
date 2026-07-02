// Playwright CT bootstrap — loaded into the in-browser test page before every component mount.
// The ONE stylesheet import: @orb/ui's globals (tailwind + the generated @theme) so token
// utilities resolve inside component tests exactly as they will in the client.
import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import type { ReactElement } from "react";
import type { CtProvidersProps } from "../tests/support/ct/ct-providers";
import { CtProviders } from "../tests/support/ct/ct-providers";
import "./index.css";

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
