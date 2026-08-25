// Plugin client CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// Exports ONLY components (a mixed component+constant export breaks playwright-ct's named-import rewrite),
// and imports through the SAME `@orb/client/*` aliases the providers use — a relative import into
// `packages/client/src` gets a DIFFERENT React context instance and the tree mounts blank.
//
// Both stories wrap the REAL surface in `<CtDataProviders>` (Query + real tRPC over the stubbed network), so
// a CT exercises the real suspense + tRPC query-key + mutation path rather than a hand-fed prop tree. That
// matters most for the GRANT screen: the thing under test is that a person can SEE what a bundle asks for,
// and the declared list comes from a client-side manifest read of the uploaded bytes — a story that passed
// the capability list in as a prop would prove nothing about the path that actually produces it.

import { PluginsSettingsSurface, pluginDistributeSection, SnippetConsole } from "@orb/client/features/plugin";
import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { CtDataProviders, CtSettingsSectionRegistry } from "../../../support/ct/ct-data-providers.tsx";

/** The settings modal's content column at its real docked width — the narrowest REAL host for this pane. */
const SETTINGS_PANE_WIDTH = 560;
/** The CONTEXT pane's docked width — the narrowest REAL host for the "This chat" console section. */
const CONTEXT_PANE_WIDTH = 384;

/** The plugins anchor's real settings-section roster (SET-SEAMS §5.2): the admin-gated "Distribute to
 *  everyone" section is the only contribution at this anchor. The surface reads the registry from context now
 *  that the pane factories' prop threading is gone, so a surface-outside-shell story MUST supply it (mirrors
 *  main.tsx's door). Its `when` gates on admin, so for these non-admin stories it resolves to nothing and the
 *  surface renders byte-identically to before the fan-out. */
const pluginsSettingsSections: ReturnType<typeof createContributorRegistry<SettingsSectionContribution>> =
  createContributorRegistry<SettingsSectionContribution>("settings-sections", [pluginDistributeSection]);

/** The whole Plugins pane over the stubbed network: the installed list + the install/grant card. */
export function PluginsSurfaceStory({ width = SETTINGS_PANE_WIDTH }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <CtSettingsSectionRegistry sections={pluginsSettingsSections}>
        <div style={{ width }}>
          <PluginsSettingsSurface />
        </div>
      </CtSettingsSectionRegistry>
    </CtDataProviders>
  );
}

/** The inline-snippet console at the CONTEXT pane's width, where the "This chat" section renders it. */
export function SnippetConsoleStory({ chatId, width = CONTEXT_PANE_WIDTH }: { readonly chatId: ChatId; readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <SnippetConsole chatId={chatId} />
      </div>
    </CtDataProviders>
  );
}
