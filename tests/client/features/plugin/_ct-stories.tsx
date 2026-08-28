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

import {
  PluginsSettingsSurface,
  pluginChatFlankSurface,
  pluginChatSettingsSection,
  pluginDistributeSection,
  SnippetConsole,
} from "@orb/client/features/plugin";
import type { ChatSettingsSectionContribution, ChatSurfaceContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import type { SettingsSectionContribution } from "@orb/client/state";
import { selectChat, useSectionRegistry } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
// The "This chat" tab as the component it is — the same relative-into-the-package import chat's own story
// module takes for it (a story legitimately composes feature internals the front door does not re-export).
import { CommittedSettingsTab } from "../../../../packages/client/src/features/chat/components/settings-context-tab.tsx";
import { CtChatContributorSectionRegistry, CtDataProviders, CtSettingsSectionRegistry } from "../../../support/ct/ct-data-providers.tsx";
import { CHAT_ID } from "../chat/fixtures.ts";

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

// ── U2: the CHAT-ANCHOR stories (plugin-ui-plane #679, seam 7) ─────────────────────────────────────────────
// Both mount the REAL first-party contribution the door assembles — never a test double — so what the CT
// proves is the production path: `plugin.listSurfaces` → the anchor fan-out → the labelled shell.

/** The height the room harness is given: enough for a bounded transcript (the virtualizer needs a real scroll
 *  window) and fixed, so a geometry pin compares like with like across arms. */
const ROOM_HARNESS_HEIGHT = 480;

/** The REAL flank contribution, registered exactly as the door registers it. */
const pluginFlankContributors: ReturnType<typeof createContributorRegistry<ChatSurfaceContribution>> = createContributorRegistry<ChatSurfaceContribution>(
  "chat-surface",
  [pluginChatFlankSurface],
);
/** The BASELINE arm: the same room with NO surface contributors at all — what "a build without the plugin
 *  seam" renders, and the geometry every silent arm must match byte for byte. */
const noContributors: ReturnType<typeof createContributorRegistry<ChatSurfaceContribution>> = createContributorRegistry<ChatSurfaceContribution>(
  "chat-surface",
  [],
);

/** The REAL "This chat" plugin-panel section, registered exactly as the door registers it. */
const pluginChatSections: ReturnType<typeof createContributorRegistry<ChatSettingsSectionContribution>> =
  createContributorRegistry<ChatSettingsSectionContribution>("chat-settings-sections", [pluginChatSettingsSection]);

/** The chats section's CONTENT through the REAL registry (`registry.get("chats").content()`) — the same call
 *  the shell's `SectionContent` makes, so the flank renders on the production path. */
function ChatRoomHarness(): ReactElement {
  const registry = useSectionRegistry();
  const content = registry.get("chats").content;
  if (typeof content !== "function") {
    throw new Error("ct-stories: chats section content is a planned stub, not a body");
  }
  return <div style={{ height: ROOM_HARNESS_HEIGHT }}>{content()}</div>;
}

/** The room with (or, at `registered: false`, without) the plugin `chat-flank` contribution at the door. The
 *  CT drives the DATA — `plugin.listSurfaces` empty / a registered surface / a disabled plugin — so the two
 *  arms differ only in what the plugin feature has to say, which is exactly the property under test. */
export function PluginChatFlankRoomStory({ registered = true }: { readonly registered?: boolean }): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <CtChatContributorSectionRegistry surfaceContributors={registered ? pluginFlankContributors : noContributors}>
        <ChatRoomHarness />
      </CtChatContributorSectionRegistry>
    </CtDataProviders>
  );
}

// ── U4: the TIER-C (scripted) story ────────────────────────────────────────────────────────────────────────
// It mounts the REAL Plugins pane, exactly as `PluginsSurfaceStory` does, and differs ONLY in the data the CT
// stubs: a `tier: "scripted"` registration instead of a `tier: "static"` one with a spec. That is deliberate —
// the thing under test is that a scripted surface reaches the screen through the SAME production path (the pane
// → the row → the surfaces panel → the labelled shell), driven by nothing but what `listSurfaces` says. A
// dedicated harness component would have proved a component works; this proves the app does.
//
// Everything else the tier needs — the `ui.js` bytes over the owner-gated route, `plugin.uiHostCall`,
// `plugin.reportUiCrash` — is stubbed by the CT at the NETWORK, so the worker, the interpreter, the wall-clock
// timer and the publish guard are all the real ones.

/** The Tier-C story: the same Plugins pane, with whatever scripted surface the CT's `listSurfaces` stub
 *  declares. `width` matches the settings modal's real docked column. */
export function PluginScriptedSurfaceStory({ width = SETTINGS_PANE_WIDTH }: { readonly width?: number }): ReactElement {
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

/** The "This chat" tab with the REAL plugin-panel section grafted at the host band — the CT drives whether the
 *  caller has any `chat-settings-section` surface, and therefore whether the grafted Section paints at all. */
export function PluginChatSettingsSectionStory({ width = CONTEXT_PANE_WIDTH }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <CommittedSettingsTab background={null} chatId={CHAT_ID} isHost={true} roomOverrides={{}} sections={pluginChatSections} showGroup={false} />
      </div>
    </CtDataProviders>
  );
}
