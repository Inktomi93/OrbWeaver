// Plugin client CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// Exports ONLY components (a mixed component+constant export breaks playwright-ct's named-import rewrite),
// and imports through the SAME `@orb/client/*` aliases the providers use — a relative import into
// `packages/client/src` gets a DIFFERENT React context instance and the tree mounts blank.
//
// Both stories wrap the REAL surface in `<CtDataProviders>` (Query + real tRPC over the stubbed network), so
// a CT exercises the real suspense + tRPC query-key + mutation path rather than a hand-fed prop tree. That
// matters most for the GRANT screen: the thing under test is that a person can SEE what a bundle asks for,
// and the declared list comes from a client-side manifest read of the uploaded bytes — a story that passed
// the capability list in as a prop would prove nothing about the path that actually produces it.

import { CommandPaletteSurface } from "@orb/client/features/chat";
import {
  pluginChatFlankSurface,
  pluginChatSettingsSection,
  pluginCommandPaletteSource,
  pluginDistributeSection,
  pluginMessageFooterSurface,
  pluginsInstalledSection,
  pluginsInstallSection,
  pluginToolRenderer,
  SnippetConsole,
} from "@orb/client/features/plugin";
import type { ChatSettingsSectionContribution, ChatSurfaceContribution, CommandPaletteSource, ToolRenderer } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution } from "@orb/client/state";
import {
  __resetPluginCommandArgs,
  __resetPluginDialog,
  CommandPaletteSourceRegistryProvider,
  clearPluginPage,
  openPluginCommandArgs,
  openPluginDialog,
  pluginPageKey,
  selectChat,
  selectPluginPageFromList,
  useSectionRegistry,
} from "@orb/client/state";
import type { ToolCallRecord } from "@orb/contracts/chat";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { MessageToolCalls } from "../../../../packages/client/src/features/chat/components/message-tool-calls.tsx";
// The "This chat" tab as the component it is — the same relative-into-the-package import chat's own story
// module takes for it (a story legitimately composes feature internals the front door does not re-export).
import { CommittedSettingsTab } from "../../../../packages/client/src/features/chat/components/settings-context-tab.tsx";
import { PluginCommandArgsBody } from "../../../../packages/client/src/features/plugin/components/plugin-command-args-body.tsx";
import { PluginDialogBody } from "../../../../packages/client/src/features/plugin/components/plugin-dialog-body.tsx";
import { CtChatContributorSectionRegistry, CtConfigGroupBody, CtDataProviders, CtRealSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";
import { CHAT_ID } from "../chat/fixtures.ts";

/** The settings modal's content column at its real docked width — the narrowest REAL host for this pane. */
const SETTINGS_PANE_WIDTH = 560;
/** The CONTEXT pane's docked width — the narrowest REAL host for the "This chat" console section. */
const CONTEXT_PANE_WIDTH = 384;

/** The plugins anchor's real config-section roster, assembled as at the door (config-revamp-design.md §6.8):
 *  Installed · Add-a-plugin · the admin-gated "Distribute to everyone" section. Rendered through the config
 *  host's OWN resolver (`CtConfigGroupBody`), so the distribute section's `when` gates on the CT's viewer
 *  exactly as production does — for a non-admin viewer it resolves out and the group is its two own rows. */
const pluginsSections: ReturnType<typeof createContributorRegistry<ConfigSectionContribution>> = createContributorRegistry<ConfigSectionContribution>(
  "config-sections",
  [pluginsInstalledSection, pluginsInstallSection, pluginDistributeSection],
);

/** The whole Plugins group over the stubbed network: the installed list + the install/grant card. */
export function PluginsSurfaceStory({ width = SETTINGS_PANE_WIDTH }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <CtConfigGroupBody anchor="plugins" sections={pluginsSections} />
      </div>
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

/** The Tier-C story: the same Plugins group, with whatever scripted surface the CT's `listSurfaces` stub
 *  declares. `width` matches the CONTENT pane's real docked column. */
export function PluginScriptedSurfaceStory({ width = SETTINGS_PANE_WIDTH }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <CtConfigGroupBody anchor="plugins" sections={pluginsSections} />
      </div>
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

/** The REAL `message-footer` contribution, registered exactly as the door registers it (U6, §5.4). */
const pluginFooterContributors: ReturnType<typeof createContributorRegistry<ChatSurfaceContribution>> = createContributorRegistry<ChatSurfaceContribution>(
  "chat-surface",
  [pluginMessageFooterSurface],
);

/** The room with (or, at `registered: false`, without) the plugin `message-footer` contribution at the door.
 *  Same harness as the flank story and for the same reason: the per-row strip must be measured inside a REAL
 *  transcript, because "does a plugin-less row grow a footer?" is a question about the row's own layout. */
export function PluginMessageFooterRoomStory({ registered = true }: { readonly registered?: boolean }): ReactElement {
  useEffect(() => {
    selectChat(CHAT_ID);
  }, []);
  return (
    <CtDataProviders>
      <CtChatContributorSectionRegistry surfaceContributors={registered ? pluginFooterContributors : noContributors}>
        <ChatRoomHarness />
      </CtChatContributorSectionRegistry>
    </CtDataProviders>
  );
}

// ── U3: the TOOL-CARD story (plugin-ui-plane #679, seam 7 — closes A2-F5) ──────────────────────────────────
// The subject is chat's own `MessageToolCalls` over the REAL door member (`pluginToolRenderer`), never a test
// double: what is pinned is the production path a person gets — a persisted `ToolCallRecord` → the `plugin_`
// namespace claim → `plugin.listSurfaces` → the labelled shell, or the generic block when no card claims it.

/** A transcript column at a realistic reading width. */
const TRANSCRIPT_WIDTH = 640;

/** The tool-renderer registry AS THE DOOR ASSEMBLES IT — one member, claiming the `plugin_` namespace. */
const realToolRenderers: ReturnType<typeof createContributorRegistry<ToolRenderer>> = createContributorRegistry<ToolRenderer>("tool-renderers", [
  pluginToolRenderer,
]);
/** The BASELINE arm: a build with NO plugin contribution — the generic-block rendering every byte-identity
 *  pin below compares against. */
const noToolRenderers: ReturnType<typeof createContributorRegistry<ToolRenderer>> = createContributorRegistry<ToolRenderer>("tool-renderers", []);

/** A message's tool block, with (or, at `registered: false`, without) the plugin plane's card renderer at the
 *  door. The CT drives the DATA (`plugin.listSurfaces`), so the arms differ only in what the plugin feature
 *  has to say — which is exactly the property under test. */
export function PluginToolCardStory({
  records,
  registered = true,
}: {
  readonly records: readonly ToolCallRecord[];
  readonly registered?: boolean;
}): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: TRANSCRIPT_WIDTH }}>
        <MessageToolCalls records={records} renderers={registered ? realToolRenderers : noToolRenderers} />
      </div>
    </CtDataProviders>
  );
}

// ── U5: the EXTENSIONS section (plugin-ui-plane #679, §4.5b / seam 16) ─────────────────────────────────────
// Both halves render through the REAL section registry — `registry.get("extensions").list()` / `.content()`,
// the exact calls the shell's own `SectionList`/`SectionContent` make — so what the CT exercises is the
// production path a person gets, not a hand-mounted surface. The CT drives the DATA (`plugin.listSurfaces` +
// `plugin.list`), which is the only input that decides between the teaching empty, the switcher, and a page.

/** The LIST pane's real docked width — the narrowest REAL host for the page switcher. */
const SWITCHER_PANE_WIDTH = 320;
/** A CONTENT region a page-scale shell can fill; fixed, so the band's geometry compares like with like. */
const PAGE_REGION = { width: 900, height: 600 };

/** The Extensions section's LIST pane, through the real registry (`CtRealSectionRegistry` mirrors the door). */
export function ExtensionsSwitcherStory({ width = SWITCHER_PANE_WIDTH }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ width }}>
          <ExtensionsListHarness />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function ExtensionsListHarness(): ReactElement {
  const registry = useSectionRegistry();
  const list = registry.get("extensions").list;
  if (typeof list !== "function") {
    throw new Error("ct-stories: the extensions section declares no list pane");
  }
  return <>{list()}</>;
}

/** The Extensions section's LIST chrome-band, through the real registry (`registry.get("extensions").listHeader`)
 *  — the exact call the shell's `.shell-panel-header` band makes (#1190). */
export function ExtensionsListHeaderStory({ width = SWITCHER_PANE_WIDTH }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ width }}>
          <ExtensionsListHeaderHarness />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function ExtensionsListHeaderHarness(): ReactElement {
  const registry = useSectionRegistry();
  const listHeader = registry.get("extensions").listHeader;
  if (typeof listHeader !== "function") {
    throw new Error("ct-stories: the extensions section declares no list header");
  }
  return <>{listHeader()}</>;
}

/** The Extensions section's CONTENT pane, through the real registry. `selectKey` drives the module-singleton
 *  drill store through the production switcher door (`pluginPageKey` → `selectPluginPageFromList`) — `null`
 *  is the no-selection arm, which is a DIFFERENT state from "there are no pages" and must read differently. */
export function ExtensionsPageStory({
  selectKey = null,
}: {
  readonly selectKey?: { readonly pluginId: PluginId; readonly surfaceId: string } | null;
}): ReactElement {
  useEffect(() => {
    if (selectKey === null) {
      clearPluginPage();
    } else {
      selectPluginPageFromList(pluginPageKey(selectKey.pluginId, selectKey.surfaceId));
    }
  }, [selectKey]);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <div style={{ height: PAGE_REGION.height, width: PAGE_REGION.width }}>
          <ExtensionsContentHarness />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function ExtensionsContentHarness(): ReactElement {
  const registry = useSectionRegistry();
  const content = registry.get("extensions").content;
  if (typeof content !== "function") {
    throw new Error("ct-stories: the extensions section content is a planned stub, not a body");
  }
  return <>{content()}</>;
}

/** The command palette wired to the U8 DYNAMIC plugin-command source (plugin-ui-plane #679 §4.5/§5 row 9).
 *  `sourced` toggles whether the first-party `pluginCommandPaletteSource` is registered: `true` proves a
 *  plugin's registered commands become first-class, searchable palette rows; `false` (an EMPTY source
 *  registry) proves the byte-identical absence — a build/caller with no plugin commands shows only the native
 *  groups. Wrapped in `CtToastSurface` so a picked row's SUCCESS OUTCOME (`applyPluginUiOutcome` →
 *  `notify.success`, the guest-handler round-trip's user-visible result) reaches a real Toaster. */
export function PluginCommandPaletteStory({ sourced = true }: { readonly sourced?: boolean }): ReactElement {
  const sources: readonly CommandPaletteSource[] = sourced ? [pluginCommandPaletteSource] : [];
  const registry = createContributorRegistry<CommandPaletteSource>("command-palette-sources", sources);
  return (
    <CtDataProviders>
      <CtToastSurface>
        <CommandPaletteSourceRegistryProvider value={registry}>
          <div style={{ height: 480, width: 560 }}>
            <CommandPaletteSurface goToSections={[]} />
          </div>
        </CommandPaletteSourceRegistryProvider>
      </CtToastSurface>
    </CtDataProviders>
  );
}

const ARGS_PLUGIN_ID = castId<PluginId>("plugin_ct_argmodal0000001");

/** The #791 command-args modal BODY over the stubbed network — seeds the intent store with a command that
 *  declares a required enum arg, then mounts the real body so a CT drives the production collect → coerce →
 *  dispatch path (typed input renders, submit sends the TYPED value, a missing required blocks with a message).
 *  The `plugin.listCommands` route must carry the same command so the shared runner can resolve + dispatch it. */
function ArgsModalSeed(): ReactElement {
  useEffect(() => {
    openPluginCommandArgs({
      pluginId: ARGS_PLUGIN_ID,
      slug: "oracle-deck",
      name: "cast",
      describe: "Cast a spell",
      args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }],
      chatId: null,
    });
    return (): void => __resetPluginCommandArgs();
  }, []);
  return <PluginCommandArgsBody />;
}

export function PluginCommandArgsStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtToastSurface>
        <div style={{ width: 420 }}>
          <ArgsModalSeed />
        </div>
      </CtToastSurface>
    </CtDataProviders>
  );
}

// ── U7 FRAME at the DIALOG anchor (plugin-ui-plane #679 §6.2 / #787) ──────────────────────────────────────────
// The subject is the REAL `PluginDialogBody` over the stubbed network, seeded through the SAME `openPluginDialog`
// round-trip channel a plugin's own action outcome uses (there is no affordance that opens a plugin dialog
// directly — the §4.5a wall). The CT drives the DATA (`plugin.listSurfaces`), so a `dialog`-anchored `frame`
// registration renders the plugin's isolated document inside the house modal shell through the production path.

const DIALOG_PLUGIN_ID = castId<PluginId>("plugin_ct_dialog00000001");

/** The dialog modal's BODY at its docked width, its subject seeded to the frame surface the CT's `listSurfaces`
 *  stub declares. */
function DialogBodySeed(): ReactElement {
  useEffect(() => {
    openPluginDialog({ pluginId: DIALOG_PLUGIN_ID, surfaceId: "board" });
    return (): void => __resetPluginDialog();
  }, []);
  return <PluginDialogBody />;
}

export function PluginDialogBodyStory({ width = SETTINGS_PANE_WIDTH }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <DialogBodySeed />
      </div>
    </CtDataProviders>
  );
}
