// Story module for the app-shell CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// The stories compose the shell through its FRONT DOOR (@orb/client/features/app-shell) with plain
// text content in the section slots, and the Rail leaf via a relative package path (a story may reach
// feature internals the front door doesn't re-export).
//
// DATA PROVIDERS (Query + tRPC): required since AppShell reads the synced density pref via
// `useDensity` (a non-suspense `useQuery(settings.getUserSettings)` — the §11.0 sanctioned cross-cutting
// display read). The query is UNSTUBBED here (no backend in CT): the hook is designed to degrade — a
// pending/errored read falls back to `DEFAULT_APPEARANCE_SETTINGS.density`, so the shell renders
// immediately with the default density and never suspends. Without the provider AppShell throws
// "No QueryClient set" and renders nothing (the beforeMount chrome only stacks Toast/Tooltip/Theme).
// The Rail leaf alone needs no data layer (RailStory stays bare).
//
// SHELL.CSS (L6/J12): the rail renders BOTH layouts — the desktop icon column + the mobile bottom tab
// bar — and shell.css's `@media` shows exactly one (`display:none` on the other, which also removes it
// from the a11y tree). AppShell imports shell.css itself, but the bare RailStory does not, so import it
// HERE too — otherwise both blocks render and every section name resolves to TWO buttons. At the CT's
// desktop viewport (1280px > 48rem) this hides the mobile bar, matching production.

import { AppShell, YouSheet } from "@orb/client/features/app-shell";
import type { ReactElement } from "react";
import { CustomThemeStyle } from "../../../../packages/client/src/features/app-shell/components/custom-theme-style";
import { Rail } from "../../../../packages/client/src/features/app-shell/components/rail";
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The full shell with a chats CONTENT slot + a corpus LIST/CONTENT slot; other sections fall back. */
export function AppShellStory(): ReactElement {
  return (
    <CtDataProviders>
      <AppShell
        sections={{
          chats: { content: <p>chats content pane</p> },
          corpus: { list: <p>corpus list pane</p>, content: <p>corpus content pane</p> },
        }}
        // The route composes the real "You" bottom-sheet body over the `you` modal slot (L6/J12) — mirror
        // that here so the mobile CT exercises the real sheet (account/settings/theme + overflow), not the
        // placeholder fallback.
        modals={{ you: <YouSheet /> }}
      />
    </CtDataProviders>
  );
}

/** The Rail in isolation — a11y + keyboard nav over real <button>s, registry-driven. */
export function RailStory(): ReactElement {
  return (
    <Rail
      activeSection="chats"
      onSelectSection={(): void => undefined}
      onOpenModal={(): void => undefined}
    />
  );
}

/** CustomThemeStyle in isolation — the owner's custom-CSS injection (Layer 1). The css prop is injected
 *  unlayered + last-in-<head>; the probes prove it wins: `.shell-rail` (shell.css already styles it) and
 *  `.bg-primary` (a `@layer utilities` class reading `var(--color-primary)`, which a `:root` redefine in
 *  the injected CSS overrides). */
export function CustomThemeStyleStory({ css }: { readonly css: string }): ReactElement {
  return (
    <div>
      <CustomThemeStyle css={css} />
      <div className="shell-rail" data-testid="rail-probe" style={{ width: 20, height: 20 }} />
      <div className="bg-primary" data-testid="primary-probe" style={{ width: 20, height: 20 }} />
    </div>
  );
}
