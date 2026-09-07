// Playwright CT bootstrap — loaded into the in-browser test page before every component mount.
// The ONE stylesheet entry is the client's production front door, so shell, UI theme/tiers, client
// globals, product source discovery, and their load-bearing order cannot drift in component tests.
import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "@orb/client/styles";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import type { CtProvidersProps } from "../tests/support/browser/ct-providers.tsx";
import { CtProviders } from "../tests/support/browser/ct-providers.tsx";

// THE FONT SETTLE (#1000). The app faces load with `font-display: swap`, and a face only STARTS
// loading when its first in-range glyph paints — which is AFTER mount. So any CT reading
// font-metric-dependent geometry in two separate evaluates races the swap window (badge.ct.tsx:443
// measured 18px fallback metrics in one read and 17px Geist metrics in the next, on one tree, one
// run). `document.fonts.ready` ALONE is vacuous here: before any glyph has painted nothing is
// loading, so it resolves instantly and the swap still lands mid-test — do not "simplify" this back
// to a bare ready await. `fonts.load()` forces the fetch pre-mount (both token stacks, upright and
// italic; the variable faces cover every weight), and the ready await is the settle backstop, so the
// component's FIRST paint already uses the real faces and every later geometry read is deterministic.
async function settleAppFaces(): Promise<void> {
  const stacks = [TOKENS["font.sans"].value, TOKENS["font.mono"].value];
  await Promise.all(stacks.flatMap((stack) => [document.fonts.load(`13px ${stack}`), document.fonts.load(`italic 13px ${stack}`)]));
  await document.fonts.ready;
}

// Inject the global provider chrome (Toast / Tooltip / Direction / ThemeScope) around every mounted
// component (primitive contract §4.3). Per case override the defaults via
// `mount(<C/>, { hooksConfig: { theme, direction } })`.
beforeMount<Omit<CtProvidersProps, "children">>(async ({ App, hooksConfig }): Promise<ReactElement> => {
  await settleAppFaces();
  return (
    <CtProviders {...hooksConfig}>
      <App />
    </CtProviders>
  );
});
