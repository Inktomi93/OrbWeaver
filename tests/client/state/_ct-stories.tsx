import { stampAppearanceBootHint } from "../../../packages/client/src/compose/stamp-appearance-boot-hint.ts";
// Story module for the state-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// ShellStoreProbe renders the shell store's read-hook values as text + buttons that fire its module
// actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
// assert the store's OWN surface: section switch, PER-SECTION panel override memory (§4.2 rule 2), and
// the modal open/close read. The resolve step (override ?? the registry's panelDefaults) + the
// toggle/focus derivations moved to the app-shell feature's `use-shell-layout.ts` — those are exercised
// end-to-end by app-shell.ct.tsx, the correct tier. `SectionRegistryProbe` reads the section registry
// context (useSectionRegistry) so the context+provider primitives carry a behavioral test.

import type { ContributorRegistry } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution, SectionDefinition } from "@orb/client/state";
import {
  __dismissPresetSectionForTest,
  __migrateActiveChatForTest,
  __readComposerDraftsForTest,
  __resetAppearanceBootHint,
  __resetChatContextSections,
  __resetComposerDrafts,
  __resetConfigFocus,
  __resetConfigGroupOpen,
  __resetConfigNav,
  __resetConfigSearch,
  __resetDeploymentBootHint,
  __resetPresetSection,
  __resetPresetSelection,
  __resetTagFilter,
  activeChatId,
  announceStatus,
  COMPOSER_DRAFT_CAP,
  ConfigSectionRegistryProvider,
  chatDeletedFromList,
  clearActiveConfigGroup,
  clearAnalyticsSelection,
  clearCharacterFacet,
  clearCharacterFilters,
  clearCharacterSelection,
  clearChatListCharacterFilter,
  clearCollectionSelection,
  clearConfigFocus,
  clearCorpusSelection,
  clearDatabankPhaseFilter,
  clearNewChatIntent,
  clearRoomInvite,
  clearSectionSaveStatus,
  clearWorldEntrySelection,
  closeConfigGroup,
  closeModal,
  collapseListPanel,
  compareCorpusPair,
  cycleTagFilter,
  dockListPanel,
  enterCreatedChat,
  getActiveConfigGroup,
  getAvailableContextTabIds,
  getAvailableContextTabs,
  getContextTab,
  goToLanding,
  hideContextPanel,
  isCommitted,
  onGameModeStarted,
  onGameModeStopped,
  openConfigGroup,
  openConfigTo,
  openImageDetail,
  openModal,
  openNewChatPicker,
  openRoomInvite,
  publishContextTabs,
  publishNoticeBand,
  readComposerDraft,
  registerListFlipCarry,
  rememberAppearanceBootHint,
  rememberDataThemeHint,
  rememberMultiHumanCapable,
  reportSectionSaveStatus,
  requestComposerFocus,
  requestRefineryLandingFocus,
  resumeChat,
  revealContextPanel,
  revealContextPanelBesideContent,
  SECTION_IDS,
  selectAnalyticsCharacter,
  selectCharacter,
  selectCharacterFacet,
  selectChat,
  selectChatFromList,
  selectCollectionMember,
  selectCollectionMemberFromList,
  selectConfigGroup,
  selectConfigSub,
  selectCorpusCharacter,
  selectPreset,
  selectPresetFromList,
  selectPresetSection,
  selectWorldEntry,
  setActiveConfigSub,
  setActiveSection,
  setAnalyticsSearchQuery,
  setBulkMode,
  setCharacterSearch,
  setCharacterSortMode,
  setCharacterViewMode,
  setChatContextSectionOpen,
  setChatListCharacterFilter,
  setChatListMonth,
  setChatListSearch,
  setComposerDraft,
  setConfigFocus,
  setConfigSearchMatch,
  setConfigSearchQuery,
  setContextTab,
  setCorpusCompareA,
  setCorpusCompareB,
  setCorpusSearchQuery,
  setCorpusSearchTarget,
  setDatabankPhaseFilter,
  setFocusMode,
  setMobileViewport,
  setNarrowViewport,
  setOpenOverlayPanel,
  setPanelMode,
  setPresetEditorView,
  setPresetSearchQuery,
  setTagPruneConfirmOpen,
  setTagSortMode,
  subscribeConfigNav,
  subscribeHuskAbandoned,
  subscribeShellState,
  toggleFavoritesOnly,
  toggleFiltersOpen,
  toggleShowArchived,
  toggleSpoilerBlur,
  useActiveChatHandle,
  useActiveConfigGroup,
  useActiveConfigSub,
  useActiveSection,
  useAggregateSaveStatus,
  useAnalyticsSearchQuery,
  useAppearanceBootHint,
  useBlockedSaveSections,
  useCharacterBulkMode,
  useCharacterSearch,
  useCharacterSortMode,
  useCharacterViewMode,
  useChatContextSectionOpen,
  useChatListCharacterFilter,
  useChatListMonth,
  useChatListSearch,
  useChromeRegistry,
  useCollectionSelection,
  useComposerDraft,
  useComposerFocusRequest,
  useConfigFocus,
  useConfigGroupOpen,
  useConfigSearchMatch,
  useConfigSearchQuery,
  useConfigSectionRegistry,
  useConfigSections,
  useConfigTarget,
  useContextTab,
  useCorpusCompareA,
  useCorpusCompareAName,
  useCorpusCompareB,
  useCorpusCompareBName,
  useCorpusSearchQuery,
  useCorpusSearchTargetId,
  useDatabankPhaseFilter,
  useErroredSaveSections,
  useFavoritesOnly,
  useFiltersOpen,
  useFocusMode,
  useModalRegistry,
  useMultiHumanCapableHint,
  useNarrowViewport,
  useNewChatIntent,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  usePresetEditorView,
  usePresetSearchQuery,
  useRefineryLandingFocusRequest,
  useRoomInviteRequest,
  useSectionListIsScreen,
  useSectionListMode,
  useSectionRegistry,
  useSelectedAnalyticsCharacterId,
  useSelectedCharacterFacetId,
  useSelectedCharacterId,
  useSelectedCorpusCharacterId,
  useSelectedPresetId,
  useSelectedPresetSectionId,
  useSelectedWorldEntryId,
  useShowArchived,
  useSpoilerBlur,
  useStatusAnnouncement,
  useTagFilter,
  useTagPruneConfirmOpen,
  useTagSortMode,
  useVisibleConfigSettings,
  withContentSwap,
} from "@orb/client/state";
import type { AssetId, CharacterId, ChatId, PresetId, TagId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
// Deep, not the app-shell barrel: `NoticeBand` is the store's only in-app writer and the probe drives the
// REAL component, so publishing and releasing are exercised exactly as the shell does them.
import { ModalHost } from "../../../packages/client/src/features/app-shell/components/modal-host.tsx";
import { NoticeBand } from "../../../packages/client/src/features/app-shell/components/notice-band.tsx";
import { notify } from "../../../packages/client/src/lib/notify.ts";
import { CtDataProviders, CtFakeSectionRegistry, CtRealSectionRegistry } from "../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../lib/_ct-stories.tsx";

// ── section-list-projection: the #state answers to "is my LIST docked / is it the mobile SCREEN?" ──────
// Mounted over the REAL config selection seam (`CtFakeSectionRegistry` passes `REAL[id].selection` through
// whenever a story injects a `list`), so the projection is proven against the production store rather than
// a double — and beside a section that declares NO list, which must never enter the list-as-screen arm.

/** The projection probe: config (a list-bearing section, real seam) vs home (no list at all — the one
 *  section that stayed list-less after refinery graduated in R3). */
export function SectionListProjectionProbe(): ReactElement {
  return (
    <CtFakeSectionRegistry sections={{ config: { list: <p>config roster</p> } }}>
      <SectionListProjectionBody />
    </CtFakeSectionRegistry>
  );
}

function SectionListProjectionBody(): ReactElement {
  const configIsScreen = useSectionListIsScreen("config");
  const homeIsScreen = useSectionListIsScreen("home");
  const configDocked = useSectionListMode("config") === "docked";
  const overlay = useOpenOverlayPanel();
  return (
    <div>
      <output>{`config-screen=${configIsScreen} home-screen=${homeIsScreen} config-docked=${configDocked} overlay=${overlay ?? "none"}`}</output>
      <button type="button" onClick={(): void => setOpenOverlayPanel("list")}>
        open list overlay
      </button>
      <button type="button" onClick={(): void => selectCollectionMember("tags", "tag-projection-probe")}>
        open member
      </button>
      <button type="button" onClick={(): void => clearCollectionSelection()}>
        clear member
      </button>
      <button type="button" onClick={(): void => setMobileViewport(true)}>
        enter mobile viewport
      </button>
      <button type="button" onClick={(): void => setMobileViewport(false)}>
        enter desktop viewport
      </button>
    </div>
  );
}

/** Walks the REAL section registry and renders each section's own `useSelectionTitle` answer — the
 *  totality pin for the field: EVERY section declares one (a list-less section declares
 *  `NO_SELECTION_TITLE`), so the shell can call it unconditionally, and none of the nine throws when its
 *  own cache is cold. Each section gets its OWN keyed child, which is exactly how the shell calls it. */
export function SectionTitleTotalityProbe(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <SectionTitleRows />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function SectionTitleRows(): ReactElement {
  const registry = useSectionRegistry();
  return (
    <div>
      {SECTION_IDS.map((id) => (
        <SectionTitleRow definition={registry.get(id)} key={id} />
      ))}
    </div>
  );
}

function SectionTitleRow({ definition }: { readonly definition: SectionDefinition }): ReactElement {
  const title = definition.useSelectionTitle();
  return <output data-section={definition.id}>{`${definition.id}=${title ?? "none"}`}</output>;
}

/** The probe under a section registry — the provider must be ABOVE the hooks that read it, so the body is
 *  its own component (a provider rendered by the same component that calls `useSectionRegistry` is not in
 *  its own context, and the whole probe rendered nothing). */
export function ShellStoreProbe(): ReactElement {
  // The registry is load-bearing since the mobile ONE-SHELL rule: `useSectionListMode` reads the section's
  // declared SELECTION seam (a list-bearing section with nothing open is `docked` on a phone) AND its
  // `panelDefaults`, and both answers have ONE home — the registry. The fake's sections inject no `list`, so
  // they declare no seam and this probe exercises the pre-existing algebra over the REAL section defaults.
  return (
    <CtFakeSectionRegistry>
      <ShellStoreProbeBody />
    </CtFakeSectionRegistry>
  );
}

function ShellStoreProbeBody(): ReactElement {
  const section = useActiveSection();
  // The ACTIVE section's raw overrides (undefined = unset ⇒ the feature default resolves it; the store
  // itself only holds the override). "none" stands in for an unset override in the probe's text output.
  const list = usePanelOverride(section, "list") ?? "none";
  const context = usePanelOverride(section, "context") ?? "none";
  const modal = useOpenModal();
  const settingsTarget = useConfigTarget()?.group ?? null;
  const contextTab = useContextTab();
  const openOverlayPanel = useOpenOverlayPanel();
  // `useSectionListMode` — the narrow #state projection a feature reads instead of `useShellLayout`. The
  // OWN-DEFAULT is the registry's now (#434), not a literal the caller carries, so what this prints is the
  // ACTIVE section's real resolved mode: `home` declares no list at all and can never be docked, while
  // `chats`/`corpus` default `docked` — which is why the docked assertions below drive a section first.
  const docked = useSectionListMode(section) === "docked";
  const narrowViewport = useNarrowViewport();
  // The ONE focus flag (item 20) — the probe prints it BESIDE the raw overrides so a CT can assert the two
  // never disagree, and that focus mode never writes into the overrides it is hiding.
  const focus = useFocusMode();
  // The context-tab REGISTRY the mounted surface publishes for the dev bridge — read back through the
  // non-reactive getter right after a publish, so a CT proves the store held what was written. A `p`, not
  // the `<output>` line, so the exact-text layout assertions above are untouched.
  const [ctxTabIds, setCtxTabIds] = useState("unread");
  // The DEV-BRIDGE WATCHER PAIR (#656): `subscribeShellState` is the store's own change signal and
  // `getContextTab` its non-reactive read. Together they are how `agent-nav`'s contextTab arm waits for a
  // CONTEXT panel to publish/land instead of sleeping — so this probe drives them the way that arm does:
  // subscribe once, and on every store write read the stored tab back imperatively.
  const [watchedTab, setWatchedTab] = useState("idle");
  useEffect((): (() => void) => subscribeShellState((): void => setWatchedTab(`tab=${getContextTab() ?? "none"}`)), []);
  return (
    <div>
      <output>
        {`section=${section} list=${list} context=${context} modal=${modal ?? "none"} docked=${docked} settingsTarget=${settingsTarget ?? "none"} contextTab=${contextTab ?? "none"} openOverlayPanel=${openOverlayPanel ?? "none"} narrowViewport=${narrowViewport} focus=${focus}`}
      </output>
      <p>{`ctxTabIds=${ctxTabIds}`}</p>
      <p>{`watchedTab=${watchedTab}`}</p>
      <button
        type="button"
        onClick={(): void => {
          publishContextTabs([
            { id: "runs", label: "Runs" },
            { id: "setup", label: "Setup" },
            { id: "versions", label: "Versions" },
          ]);
          setCtxTabIds(
            `${getAvailableContextTabIds().join(",")}|${getAvailableContextTabs()
              .map((tab) => `${tab.id}:${tab.label}`)
              .join(",")}`,
          );
        }}
      >
        publish context tabs
      </button>
      <button type="button" onClick={(): void => setActiveSection("corpus")}>
        go corpus
      </button>
      <button type="button" onClick={(): void => setActiveSection("chats")}>
        go chats
      </button>
      <button type="button" onClick={(): void => setPanelMode("list", "collapsed")}>
        collapse list
      </button>
      <button type="button" onClick={(): void => setPanelMode("context", "docked")}>
        dock context
      </button>
      <button type="button" onClick={(): void => setPanelMode("list", "docked")}>
        dock list
      </button>
      <button type="button" onClick={(): void => openModal("newChat")}>
        open a modal
      </button>
      <button type="button" onClick={(): void => openConfigTo("personas")}>
        open settings to personas
      </button>
      <button type="button" onClick={(): void => closeModal()}>
        close modal
      </button>
      <button type="button" onClick={(): void => setContextTab("members")}>
        set context tab
      </button>
      <button type="button" onClick={(): void => revealContextPanel("field")}>
        reveal context panel
      </button>
      <button type="button" onClick={(): void => revealContextPanelBesideContent("field")}>
        reveal context beside content
      </button>
      <button type="button" onClick={(): void => setMobileViewport(true)}>
        enter mobile viewport
      </button>
      <button type="button" onClick={(): void => setMobileViewport(false)}>
        enter desktop viewport
      </button>
      <button type="button" onClick={(): void => setNarrowViewport(true)}>
        enter narrow viewport
      </button>
      <button type="button" onClick={(): void => setNarrowViewport(false)}>
        enter wide viewport
      </button>
      <button type="button" onClick={(): void => setFocusMode(true)}>
        enter focus
      </button>
      <button type="button" onClick={(): void => setFocusMode(false)}>
        exit focus
      </button>
      <button type="button" onClick={(): void => setOpenOverlayPanel("context")}>
        open context overlay
      </button>
      <button type="button" onClick={(): void => collapseListPanel()}>
        nav-bridge close list
      </button>
      <button type="button" onClick={(): void => hideContextPanel()}>
        nav-bridge close context
      </button>
    </div>
  );
}

const PROBE_CHARACTER = castId<CharacterId>("char_probe_aria");
const PROBE_SELECT_CHAT = castId<ChatId>("chat_probe_select");
const PROBE_MIGRATED_CHAT = castId<ChatId>("chat_01m02xhnwkeh7s32mxccy1x17f");
const PROBE_CREATED_CHAT = castId<ChatId>("chat_probe_created");
const PROBE_LIST_CHAT = castId<ChatId>("chat_probe_list");
const PROBE_OTHER_CHAT = castId<ChatId>("chat_probe_other");
const PROBE_IMAGE_ASSET = castId<AssetId>("asset_probe_image");
// A 1x1 transparent GIF — the lightbox renders a real <img>, and the row is about the float's LIFETIME,
// so the bytes are inlined rather than fetched.
const PROBE_IMAGE_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** ActiveChatStoreProbe — renders the active-chat store's read hooks as text + buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser).
 *
 *  THE LOAD-BEARING SEAM is now the HUSK one (D166): a room
 *  ENTERED via `enterCreatedChat` is remembered as the reap candidate, and leaving it publishes that id to
 *  `subscribeHuskAbandoned` — unless its composer holds unsent text. The probe subscribes to the seam and
 *  prints what it heard, so a CT asserts the PUBLICATION rather than a network call the store never makes.
 *  (The old sessionKey/commitDraft discipline is gone with draft mode — there is no promotion to survive.) */
export function ActiveChatStoreProbe(): ReactElement {
  const handle = useActiveChatHandle();
  const openOverlayPanel = useOpenOverlayPanel();
  const activeSection = useActiveSection();
  const intent = useNewChatIntent();
  const modal = useOpenModal();
  const inviteRequest = useRoomInviteRequest();
  const [reaped, setReaped] = useState<string[]>([]);
  const [inspection, setInspection] = useState("unread");
  useEffect(() => subscribeHuskAbandoned((chatId) => setReaped((prev) => [...prev, chatId])), []);
  const handleStr = isCommitted(handle) ? `committed:${handle.id}` : "landing";
  return (
    <div>
      <output>{`handle=${handleStr} openOverlayPanel=${openOverlayPanel ?? "none"} reaped=${reaped.join(",") || "none"}`}</output>
      {/* A `p`, not a second `<output>` — the store CTs read the state line as `locator("output")`. */}
      <p data-testid="new-chat-intent">{`modal=${modal ?? "none"} temporary=${intent === undefined ? "none" : String(intent.temporary === true)}`}</p>
      <p data-testid="active-chat-inspection">{inspection}</p>
      {/* A SEPARATE line, never folded into `<output>`: the store CTs assert that line's exact text and a
          new field in it would rewrite every one of them. `resumeChat` is the only action here whose whole
          point is the SECTION it lands in, so the section is read where that action is proved. */}
      <p data-testid="active-section">{`section=${activeSection}`}</p>
      <p data-testid="room-invite-request">{`invite=${inviteRequest ?? "none"}`}</p>
      <button type="button" onClick={(): void => setInspection(`active=${activeChatId() ?? "none"}`)}>
        inspect active chat
      </button>
      <button
        type="button"
        onClick={(): void => {
          const migrated = __migrateActiveChatForTest({ handle: { kind: "committed", id: PROBE_MIGRATED_CHAT } });
          setInspection(`migrated=${isCommitted(migrated.handle) ? migrated.handle.id : migrated.handle.kind}`);
        }}
      >
        migrate active chat
      </button>
      <button type="button" onClick={(): void => enterCreatedChat(PROBE_CREATED_CHAT)}>
        enter created chat
      </button>
      <button type="button" onClick={(): void => selectChat(PROBE_SELECT_CHAT)}>
        select chat
      </button>
      {/* #1662 — the cross-section RESUME intent: make the room active AND land in Chats. The Characters
          plane's two resume doors (the library row's Chat CTA, the landing's Recently-chatted faces) both
          call it, and a `selectChat` that forgot the section change would leave the reader looking at the
          library with a room quietly active behind it. */}
      <button type="button" onClick={(): void => resumeChat(PROBE_SELECT_CHAT)}>
        resume chat
      </button>
      {/* The Share card's room picker: land in the room and ask its Members tab to open the invite dialog. */}
      <button type="button" onClick={(): void => openRoomInvite(PROBE_SELECT_CHAT)}>
        open room invite
      </button>
      <button type="button" onClick={(): void => clearRoomInvite()}>
        clear room invite
      </button>
      {/* Types into the CREATED room's composer scope — the reap SKIP condition (unsent text means the
          user may come back; the TTL belt covers them if they do not). */}
      <button type="button" onClick={(): void => setComposerDraft(PROBE_CREATED_CHAT, "half a thought")}>
        type in created room
      </button>
      {/* Open the LIST slide-over first so `selectChatFromList`'s dual-write close is observable. */}
      <button type="button" onClick={(): void => setOpenOverlayPanel("list")}>
        open list sheet
      </button>
      <button type="button" onClick={(): void => selectChatFromList(PROBE_LIST_CHAT)}>
        select from list
      </button>
      <button type="button" onClick={(): void => chatDeletedFromList(PROBE_OTHER_CHAT)}>
        delete other chat
      </button>
      <button type="button" onClick={(): void => chatDeletedFromList(PROBE_LIST_CHAT)}>
        delete active chat
      </button>
      <button type="button" onClick={(): void => chatDeletedFromList(PROBE_CREATED_CHAT)}>
        delete created chat
      </button>
      <button type="button" onClick={(): void => goToLanding()}>
        go landing
      </button>
      {/* The ONE creation ceremony (side-eye F9): an opener with a creation-only parameter PRE-ARMS the
          shared picker instead of creating anything of its own. The picker clears it on unmount, which
          `clear intent` stands in for here. */}
      <button type="button" onClick={(): void => openNewChatPicker({ temporary: true })}>
        open picker temp
      </button>
      <button type="button" onClick={(): void => clearNewChatIntent()}>
        clear intent
      </button>
    </div>
  );
}

/** CharacterSelectionProbe — renders the character-selection store's read hooks as text + buttons that
 *  fire its module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a
 *  browser) and assert select → clear (J9: LIST selection drives the CONTENT detail card) AND the facet
 *  drill-in (a card-content facet row reveals the CONTEXT Field inspector, mirrors selectPresetSection). */
export function CharacterSelectionProbe(): ReactElement {
  const selected = useSelectedCharacterId();
  const facet = useSelectedCharacterFacetId();
  return (
    <div>
      <output>{`selected=${selected ?? "none"} facet=${facet ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectCharacter(PROBE_CHARACTER)}>
        select aria
      </button>
      <button type="button" onClick={(): void => clearCharacterSelection()}>
        clear selection
      </button>
      <button type="button" onClick={(): void => selectCharacterFacet("facet_probe")}>
        select facet
      </button>
      <button type="button" onClick={(): void => clearCharacterFacet()}>
        clear facet
      </button>
    </div>
  );
}

const PROBE_FILTER_CHARACTER = castId<CharacterId>("char_ct_filter");

/** ChatListFilterProbe — drives the chat-list-filter store (the character hero "N chats ›" → filtered
 *  Chats LIST seam) through its module actions + read hook, so a CT asserts set → clear on the real
 *  hook-backed store (useSyncExternalStore needs a browser). The stored value carries the character NAME
 *  beside the id (the LIST's "filtered by [name] ✕" chip label). */
export function ChatListFilterProbe(): ReactElement {
  const filter = useChatListCharacterFilter();
  return (
    <div>
      <output>{`filter=${filter === null ? "none" : `${filter.id}:${filter.name}`}`}</output>
      <button type="button" onClick={(): void => setChatListCharacterFilter({ avatarHash: null, id: PROBE_FILTER_CHARACTER, name: "Aria" })}>
        set filter
      </button>
      <button type="button" onClick={(): void => clearChatListCharacterFilter()}>
        clear filter
      </button>
    </div>
  );
}

/** ChatListNarrowingProbe — the OTHER two axes (#490). They were `useState` inside `ChatListSurface`, which
 *  is why `CHATS 896` sat above twelve filtered rows: the chrome BAND is a sibling shell region with no
 *  shared React ancestor, so it could not see them. They joined the character filter in this store for the
 *  reason the store exists, and this probe drives each transition on the real hook-backed store. */
export function ChatListNarrowingProbe(): ReactElement {
  const search = useChatListSearch();
  const month = useChatListMonth();
  return (
    <div>
      <output>{`search=${search === "" ? "none" : search} month=${month === "" ? "none" : month}`}</output>
      <button onClick={(): void => setChatListSearch("hikari")} type="button">
        type a search
      </button>
      <button onClick={(): void => setChatListSearch("")} type="button">
        clear the search
      </button>
      <button onClick={(): void => setChatListMonth("2026-06")} type="button">
        anchor a month
      </button>
      <button onClick={(): void => setChatListMonth("")} type="button">
        clear the month
      </button>
    </div>
  );
}

/** DatabankFilterProbe — drives the databank phase-scope store (home's ingest-health chips → the scoped
 *  Databank LIST) through its module actions + read hook. A CT, not a unit test, for the same reason its
 *  chat-list twin is one: the store's only read surface is a `useSyncExternalStore` hook. */
export function DatabankFilterProbe(): ReactElement {
  const phase = useDatabankPhaseFilter();
  return (
    <div>
      <output>{`phase=${phase ?? "none"}`}</output>
      <button onClick={(): void => setDatabankPhaseFilter("stalled")} type="button">
        scope to stalled
      </button>
      <button onClick={(): void => setDatabankPhaseFilter("empty")} type="button">
        scope to empty
      </button>
      <button onClick={(): void => clearDatabankPhaseFilter()} type="button">
        clear scope
      </button>
    </div>
  );
}

const PROBE_PRESET = castId<PresetId>("preset_ct_probe");

/** PresetSelectionProbe — renders the preset-selection store's read hooks as text + buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
 *  assert select → clear for BOTH the open preset (W10) and the rack SECTION (The Assembly §2.2): selecting
 *  a section reveals the inspector; opening a different preset clears a stale section. Also drives the
 *  LIST-callback dual-writes `selectPresetFromList`/`__dismissPresetSectionForTest`, which additionally close the
 *  shell's open CONTEXT/LIST slide-over (mirrors ActiveChatStoreProbe's `selectChatFromList` posture). */
export function PresetSelectionProbe(): ReactElement {
  const selected = useSelectedPresetId();
  const section = useSelectedPresetSectionId();
  const openOverlayPanel = useOpenOverlayPanel();
  return (
    <div>
      <output>{`selected=${selected ?? "none"} section=${section ?? "none"} openOverlayPanel=${openOverlayPanel ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectPreset(PROBE_PRESET)}>
        select preset
      </button>
      <button type="button" onClick={(): void => selectPresetSection("sec_probe")}>
        select section
      </button>
      <button type="button" onClick={(): void => __resetPresetSection()}>
        clear section
      </button>
      <button type="button" onClick={(): void => __resetPresetSelection()}>
        clear preset selection
      </button>
      {/* Open the LIST slide-over first so `selectPresetFromList`'s dual-write close is observable. */}
      <button type="button" onClick={(): void => setOpenOverlayPanel("list")}>
        open list sheet
      </button>
      <button type="button" onClick={(): void => selectPresetFromList(PROBE_PRESET)}>
        select preset from list
      </button>
      {/* Open the CONTEXT slide-over first so `__dismissPresetSectionForTest`'s dual-write close is observable. */}
      <button type="button" onClick={(): void => setOpenOverlayPanel("context")}>
        open context sheet
      </button>
      <button type="button" onClick={(): void => __dismissPresetSectionForTest()}>
        dismiss section
      </button>
    </div>
  );
}

/** PresetEditorViewProbe — the preset editor's VIEW axis. The view moved out of local `Tabs` state into section state so CONTEXT can project per-view,
 *  which makes "unset reads as null" and "the writer is the only mover" real invariants rather than
 *  component detail. A CT, not a unit test: the read surface is the reactive hook (useSyncExternalStore
 *  needs a browser) — the preset-selection-store.ct.tsx posture. */
export function PresetEditorViewProbe(): ReactElement {
  const view = usePresetEditorView();
  return (
    <div>
      <output>{`view=${view ?? "unset"}`}</output>
      <button type="button" onClick={(): void => setPresetEditorView("actions")}>
        set actions view
      </button>
      <button type="button" onClick={(): void => setPresetEditorView("params")}>
        set params view
      </button>
    </div>
  );
}

const PROBE_TAG = castId<TagId>("tag_ct_probe");

/** Drives the character-library VIEW-PREFS store (FINAL-Character §4/§12) through its module actions and
 *  renders every read hook — a CT asserts sort/view/filter/bulk transitions on the real persisted store
 *  (localStorage needs a browser). */
export function CharacterLibraryStoreProbe(): ReactElement {
  const sort = useCharacterSortMode();
  const view = useCharacterViewMode();
  const favoritesOnly = useFavoritesOnly();
  const showArchived = useShowArchived();
  const bulk = useCharacterBulkMode();
  const tags = useTagFilter();
  const spoilerBlur = useSpoilerBlur();
  const filtersOpen = useFiltersOpen();
  const search = useCharacterSearch();
  return (
    <div>
      <output>
        {`sort=${sort} view=${view} fav=${favoritesOnly} archived=${showArchived} bulk=${bulk} tags=${tags.map((entry) => `${entry.id}:${entry.state}`).join(",") || "none"} blur=${spoilerBlur} filtersOpen=${filtersOpen} search=${search === "" ? "none" : search}`}
      </output>
      <button type="button" onClick={(): void => setCharacterSortMode("alpha")}>
        sort alpha
      </button>
      <button type="button" onClick={(): void => setCharacterViewMode("categorized")}>
        view categorized
      </button>
      <button type="button" onClick={(): void => toggleFavoritesOnly()}>
        toggle favorites
      </button>
      <button type="button" onClick={(): void => toggleShowArchived()}>
        toggle archived
      </button>
      <button type="button" onClick={(): void => setBulkMode(true)}>
        enter bulk
      </button>
      <button type="button" onClick={(): void => cycleTagFilter(PROBE_TAG)}>
        cycle tag
      </button>
      <button type="button" onClick={(): void => __resetTagFilter()}>
        clear tags
      </button>
      <button type="button" onClick={(): void => clearCharacterFilters()}>
        clear filters
      </button>
      <button type="button" onClick={(): void => toggleSpoilerBlur()}>
        toggle spoiler blur
      </button>
      <button type="button" onClick={(): void => toggleFiltersOpen()}>
        toggle filters open
      </button>
      {/* #518 — the pane's search text is STORE state now, because the LIST chrome band prints the census
          and cannot see the pane's props. */}
      <button type="button" onClick={(): void => setCharacterSearch("hikari")}>
        search hikari
      </button>
      <button type="button" onClick={(): void => setCharacterSearch("")}>
        clear search
      </button>
    </div>
  );
}

const PROBE_ENTRY = castId<WorldEntryId>("world_entry_ct_probe");

/** WorldEntrySelectionProbe — renders the world-ENTRY selection store's read hook as text + buttons that
 *  fire its module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a
 *  browser) and assert select → clear. The BOOK half moved to the config workspace's kinded selection when
 *  World Info left the rail (R2), so this store is the entry drill and nothing else. */
export function WorldEntrySelectionProbe(): ReactElement {
  const entry = useSelectedWorldEntryId();
  return (
    <div>
      <output>{`entry=${entry ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectWorldEntry(PROBE_ENTRY)}>
        select entry
      </button>
      <button type="button" onClick={(): void => clearWorldEntrySelection()}>
        clear entry
      </button>
    </div>
  );
}

/** ConfigSelectionProbe — the KINDED selection store (the config workspace's ONE selection across N
 *  sibling collections): select a member of one kind, select a member of ANOTHER kind, clear, and the
 *  LIST dual-write that also closes the slide-over. `openConfigTo` is the ONE deep-link intent for every
 *  kind of group — for a collection it clears the selection AND switches the
 *  rail, so the probe reads the active section too. */
export function ConfigSelectionProbe(): ReactElement {
  const selection = useCollectionSelection();
  const openOverlayPanel = useOpenOverlayPanel();
  const section = useActiveSection();
  const tagsOpen = useConfigGroupOpen("tags");
  return (
    <div>
      <output>
        {`selection=${selection === null ? "none" : `${selection.kind}:${selection.memberId}`} openOverlayPanel=${openOverlayPanel ?? "none"} section=${section} tagsOpen=${String(tagsOpen)}`}
      </output>
      <button type="button" onClick={(): void => selectCollectionMember("tags", "tag_probe")}>
        select tag member
      </button>
      <button type="button" onClick={(): void => selectCollectionMember("regex", "regex_probe")}>
        select regex member
      </button>
      <button type="button" onClick={(): void => clearCollectionSelection()}>
        clear collection selection
      </button>
      <button type="button" onClick={(): void => setOpenOverlayPanel("list")}>
        open config list sheet
      </button>
      <button type="button" onClick={(): void => selectCollectionMemberFromList("regex", "regex_probe")}>
        select member from list
      </button>
      <button type="button" onClick={(): void => setActiveSection("chats")}>
        go to chats
      </button>
      <button type="button" onClick={(): void => openConfigTo("tags")}>
        go to the tags collection
      </button>
    </div>
  );
}

/** ChatContextSectionOpenProbe — the "This chat" tab's per-device SECTION disclosure memory (#830). The
 *  property that is not visible from the pane's own CT: the stored map is SPARSE, so an untouched section
 *  answers with ITS OWN default (which differs per section — the two write surfaces open, the racks and the
 *  host band closed), and an explicit answer beats that default in BOTH directions. */
export function ChatContextSectionOpenProbe(): ReactElement {
  const injections = useChatContextSectionOpen("injections", true);
  const documents = useChatContextSectionOpen("documents", false);
  return (
    <div>
      <output>{`injections=${String(injections)} documents=${String(documents)}`}</output>
      <button type="button" onClick={(): void => setChatContextSectionOpen("documents", true)}>
        open documents section
      </button>
      <button type="button" onClick={(): void => setChatContextSectionOpen("injections", false)}>
        close injections section
      </button>
      <button type="button" onClick={(): void => __resetChatContextSections()}>
        reset chat context sections
      </button>
    </div>
  );
}

/** ConfigGroupOpenProbe — the per-device group DISCLOSURE store. Groups start COLLAPSED (owner ruling),
 *  `openConfigGroup` is idempotent, and `closeConfigGroup` only undoes the named auto-open. */
export function ConfigGroupOpenProbe(): ReactElement {
  const tagsOpen = useConfigGroupOpen("tags");
  const regexOpen = useConfigGroupOpen("regex");
  return (
    <div>
      <output>{`tags=${String(tagsOpen)} regex=${String(regexOpen)}`}</output>
      <button type="button" onClick={(): void => openConfigGroup("tags")}>
        open tags group
      </button>
      <button type="button" onClick={(): void => closeConfigGroup("tags")}>
        close tags group
      </button>
      <button type="button" onClick={(): void => __resetConfigGroupOpen()}>
        reset collection groups
      </button>
    </div>
  );
}

/** CorpusSelectionProbe — renders the corpus-selection store's read hook as text + buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
 *  assert select → clear (LIST/dossier selection drives the Corpus CONTENT; separate from the Characters
 *  editor selection). */
export function CorpusSelectionProbe(): ReactElement {
  const selected = useSelectedCorpusCharacterId();
  return (
    <div>
      <output>{`corpus=${selected ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectCorpusCharacter(castId<CharacterId>("char_corpus_probe"))}>
        select corpus character
      </button>
      <button type="button" onClick={(): void => clearCorpusSelection()}>
        clear corpus selection
      </button>
    </div>
  );
}

/** CorpusComparePairProbe — the corpus-COMPARE store's two read hooks as text plus the three actions that
 *  write it. A CT, not a unit test, for its two siblings' reason: the read surface is a hook and
 *  `useSyncExternalStore` needs a real browser render.
 *
 *  WHAT THIS PINS THAT THE SURFACE CT CANNOT (#554). The pair is written by TWO surfaces that never render
 *  together in the shell — the Similarity tab seeds it whole from a pair row, the Compare tab's own pickers
 *  write one slot at a time — and the CONTEXT tab body is unmounted on the switch between them. So the two
 *  facts this store exists for are that a whole-pair seed is ONE transition (a half-filled pair would fire a
 *  diff for a pair nobody asked for) and that a single-slot write leaves its sibling alone. The end-to-end
 *  hand-off is pinned at the surfaces, in
 *  `tests/client/features/discovery/components/corpus-similarity-tab.ct.tsx`. */
export function CorpusComparePairProbe(): ReactElement {
  const a = useCorpusCompareA();
  const b = useCorpusCompareB();
  // The NAME travels with the id (#563) — the picker cannot name a selection outside its own catalog page,
  // so the writer supplies it. The probe reads both back to prove the pairing survives each write shape.
  const aName = useCorpusCompareAName();
  const bName = useCorpusCompareBName();
  return (
    <div>
      <output>{`a=${a === "" ? "none" : a} b=${b === "" ? "none" : b}`}</output>
      <output>{`aName=${aName === "" ? "none" : aName} bName=${bName === "" ? "none" : bName}`}</output>
      <button onClick={(): void => compareCorpusPair({ id: "character_freya", name: "Freya" }, { id: "character_frida", name: "Frida" })} type="button">
        seed corpus pair
      </button>
      <button onClick={(): void => setCorpusCompareA("character_yuki", "Yuki")} type="button">
        set corpus compare a
      </button>
      <button onClick={(): void => setCorpusCompareB("", "")} type="button">
        clear corpus compare b
      </button>
    </div>
  );
}

/** CorpusSearchProbe — renders the corpus-SEARCH store's two read hooks as text plus buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
 *  assert what the omnibox depends on: the query and the target are remembered independently of any
 *  component, which is what survives the rail bounce. */
export function CorpusSearchProbe(): ReactElement {
  const query = useCorpusSearchQuery();
  const target = useCorpusSearchTargetId();
  return (
    <div>
      <output>{`q=${query === "" ? "none" : query} target=${target === "" ? "none" : target}`}</output>
      <button type="button" onClick={(): void => setCorpusSearchQuery("forest")}>
        set corpus query
      </button>
      <button type="button" onClick={(): void => setCorpusSearchTarget("digests")}>
        set corpus target
      </button>
      <button type="button" onClick={(): void => setCorpusSearchQuery("")}>
        clear corpus query
      </button>
    </div>
  );
}

/** AnalyticsSelectionProbe — renders the analytics-selection store's read hook as text + buttons that fire
 *  its module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser)
 *  and assert select → clear (the Analytics leaderboard drill drives the Analytics CONTENT; separate from
 *  the Corpus / Characters selections). */
/** PresetSearchProbe — the preset LIST's search store as text plus the buttons that fire its one action.
 *  A CT, not a unit test, for its corpus sibling's reason: the read surface is a hook and
 *  `useSyncExternalStore` needs a real render. What this pins that the surface CT cannot: the query is
 *  MODULE-scoped — it outlives any one component, which is what lets the shell's chrome band and the rows
 *  (two renderers with no common parent) count the same filtered list. */
export function PresetSearchProbe(): ReactElement {
  const query = usePresetSearchQuery();
  return (
    <div>
      <output>{`presetQuery=${query === "" ? "none" : query}`}</output>
      <button type="button" onClick={(): void => setPresetSearchQuery("roleplay")}>
        set preset query
      </button>
      <button type="button" onClick={(): void => setPresetSearchQuery("")}>
        clear preset query
      </button>
    </div>
  );
}

/** AnalyticsSearchProbe — the Analytics LIST's search store as text plus the buttons that fire its one
 *  action. A CT, not a unit test, for its preset/corpus siblings' reason: the read surface is a hook and
 *  `useSyncExternalStore` needs a real render. What this pins that the surface CT cannot: the query is
 *  MODULE-scoped — it outlives any one component, which is what lets the shell's chrome band ("N of M")
 *  and the leaderboard rows (two renderers with no common parent) narrow off the same filtered page. */
export function AnalyticsSearchProbe(): ReactElement {
  const query = useAnalyticsSearchQuery();
  return (
    <div>
      <output>{`analyticsQuery=${query === "" ? "none" : query}`}</output>
      <button type="button" onClick={(): void => setAnalyticsSearchQuery("dragons")}>
        set analytics query
      </button>
      <button type="button" onClick={(): void => setAnalyticsSearchQuery("")}>
        clear analytics query
      </button>
    </div>
  );
}

export function AnalyticsSelectionProbe(): ReactElement {
  const selected = useSelectedAnalyticsCharacterId();
  return (
    <div>
      <output>{`analytics=${selected ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectAnalyticsCharacter(castId<CharacterId>("char_analytics_probe"))}>
        select analytics character
      </button>
      <button type="button" onClick={(): void => clearAnalyticsSelection()}>
        clear analytics selection
      </button>
    </div>
  );
}

/** SectionRegistryProbe — reads the section registry via `useSectionRegistry` inside its provider (the
 *  CtFakeSectionRegistry helper), rendering the delivered vocabulary as text so a CT proves the context
 *  delivers the ordered, total section list and `get()` resolves a member. */
export function SectionRegistryProbe(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <SectionRegistryReader />
    </CtFakeSectionRegistry>
  );
}

function SectionRegistryReader(): ReactElement {
  const registry = useSectionRegistry();
  const ids = registry
    .list()
    .map((d) => d.id)
    .join(",");
  return (
    <div>
      <output>{`ids=${ids} chats=${registry.get("chats").rail.label}`}</output>
    </div>
  );
}

/** ModalRegistryProbe — reads the modal registry via `useModalRegistry` inside its provider (the mirror
 *  of SectionRegistryProbe), rendering the delivered vocabulary as text so a CT proves the context
 *  delivers the ordered, total modal list and `get()` resolves a member's title. */
export function ModalRegistryProbe(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <ModalRegistryReader />
    </CtFakeSectionRegistry>
  );
}

function ModalRegistryReader(): ReactElement {
  const registry = useModalRegistry();
  const ids = registry
    .list()
    .map((d) => d.id)
    .join(",");
  return (
    <div>
      <output>{`ids=${ids} newChat=${registry.get("newChat").title}`}</output>
    </div>
  );
}

/** ChromeRegistryProbe — reads the chrome registry via `useChromeRegistry` inside its provider (the
 *  mirror of ModalRegistryProbe), rendering the delivered `topbar.trail` widget ids as text so a CT
 *  proves the context delivers the real registered widgets (notifications-bell/fullscreen-toggle/
 *  context-toggle) assembled at the door. */
export function ChromeRegistryProbe(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <ChromeRegistryReader />
    </CtFakeSectionRegistry>
  );
}

function ChromeRegistryReader(): ReactElement {
  const registry = useChromeRegistry();
  // The registry now also carries the derived rail.nav/rail.end entries; this probe asserts the
  // topbar.trail widgets (the consumed zone), so it filters to that zone.
  const ids = registry
    .list()
    .filter((e) => e.zone === "topbar.trail")
    .map((e) => e.id)
    .join(",");
  return (
    <div>
      <output>{`ids=${ids}`}</output>
    </div>
  );
}

/** ComposerDraftProbe — drives the composer-draft store (D70 commons) through its module actions and
 *  reads the reactive `useComposerDraft` hook, so a CT can prove the item-12 restoration: the typed draft
 *  is MODULE-scoped state, so it survives a component REMOUNT (the papercut this store exists to kill).
 *  A CT (not a unit test) because the store's only read surface is the reactive hook (useSyncExternalStore
 *  needs a browser render).
 *
 *  The `migrate to committed` arm is GONE with `migrateComposerDraft` (D166
 *  .md §4.1, R1): a room is keyed by its real ChatId from the creation click, so there is no draftKey→ChatId
 *  scope flip left to carry text across. `read snapshot` stands in — the non-hook read the husk-reap skip
 *  uses to decide whether an abandoned room still holds unsent text. */
export function ComposerDraftProbe(): ReactElement {
  // A local mount toggle so the test can unmount+remount the reader and prove the store outlives it.
  const [mounted, setMounted] = useState(true);
  // The LIVE map's size, surfaced as text — the cap is a PERSIST bound, so the session map and the stored
  // blob are two different numbers and the CT must be able to read both.
  const [liveCount, setLiveCount] = useState(0);
  return (
    <div>
      <button type="button" onClick={(): void => setComposerDraft("cd_scope", "typed but not sent")}>
        type draft
      </button>
      <button type="button" onClick={(): void => setComposerDraft("cd_committed", readComposerDraft("cd_scope"))}>
        read snapshot
      </button>
      {/* The SEND-CLEAR (an empty `onChange("")`) — the arm that must leave NOTHING behind in the persisted
          blob, so a reload after sending does not resurrect the message the user already sent. */}
      <button type="button" onClick={(): void => setComposerDraft("cd_scope", "")}>
        clear draft
      </button>
      {/* Types in three MORE rooms than the persist cap, oldest first, so the CT can read the real stored
          blob and see which rooms the bound evicted. Reports the LIVE map's size beside it: the cap is a
          persist bound, and every draft typed this session must still be readable while the tab is alive. */}
      <button
        type="button"
        onClick={(): void => {
          for (let i = 0; i < COMPOSER_DRAFT_CAP + 3; i++) {
            setComposerDraft(`cd_flood_${i}`, `flood ${i}`);
          }
          setLiveCount(Object.keys(__readComposerDraftsForTest()).length);
        }}
      >
        flood drafts
      </button>
      {/* Now that drafts PERSIST, a probe's "starts empty" reading is storage-dependent — the reset is the
          hygiene that makes it a statement about the store rather than about the previous test. */}
      <button
        type="button"
        onClick={(): void => {
          __resetComposerDrafts();
          setLiveCount(0);
        }}
      >
        reset drafts
      </button>
      {/* A plain <p>, not an <output>: the reader below is the probe's ONE `output` and every test in this
          suite addresses it as such. */}
      <p>{`live=${String(liveCount)}`}</p>
      <button type="button" onClick={(): void => setMounted(false)}>
        unmount reader
      </button>
      <button type="button" onClick={(): void => setMounted(true)}>
        remount reader
      </button>
      {mounted ? <ComposerDraftReader /> : <output>reader unmounted</output>}
    </div>
  );
}

function ComposerDraftReader(): ReactElement {
  const draft = useComposerDraft("cd_scope");
  const committed = useComposerDraft("cd_committed");
  return <output>{`draft=${draft === "" ? "empty" : draft} committed=${committed === "" ? "empty" : committed}`}</output>;
}

/** SettingsSaveStatusProbe — drives the settings save-status store (SET-SEAMS §3) through its module
 *  actions and reads the aggregate + errored ids through its reactive hooks, so a CT can prove the
 *  precedence fold (error > saving > saved), the "nothing reported ⇒ nothing to render" null, and that an
 *  unmount CLEARS a section's report (no ghost "saving" in the footer after a pane swap). A CT, not a unit
 *  test: the store's only read surface is the reactive hook (useSyncExternalStore needs a browser render). */
export function SettingsSaveStatusProbe(): ReactElement {
  return (
    <div>
      <button type="button" onClick={(): void => reportSectionSaveStatus("probe-a", "saved")}>
        a saved
      </button>
      <button type="button" onClick={(): void => reportSectionSaveStatus("probe-a", "error")}>
        a error
      </button>
      <button type="button" onClick={(): void => reportSectionSaveStatus("probe-a", "blocked")}>
        a blocked
      </button>
      <button type="button" onClick={(): void => reportSectionSaveStatus("probe-b", "saving")}>
        b saving
      </button>
      <button type="button" onClick={(): void => reportSectionSaveStatus("probe-b", "saved")}>
        b saved
      </button>
      <button
        type="button"
        onClick={(): void => {
          clearSectionSaveStatus("probe-a");
          clearSectionSaveStatus("probe-b");
        }}
      >
        clear both
      </button>
      <SettingsSaveStatusReader />
    </div>
  );
}

function SettingsSaveStatusReader(): ReactElement {
  const aggregate = useAggregateSaveStatus();
  const errored = useErroredSaveSections();
  const blocked = useBlockedSaveSections();
  return (
    <output>{`aggregate=${aggregate ?? "none"} errored=${errored.length === 0 ? "none" : errored.join(",")} blocked=${blocked.length === 0 ? "none" : blocked.join(",")}`}</output>
  );
}

/** SettingsSectionRegistryProbe — reads the settings-SECTION registry through `useConfigSectionRegistry`
 *  + `useConfigSections` inside its provider (SET-SEAMS §5.2), rendering what a host pane would get: the
 *  sections anchored at ONE pane, in declared order, `when`-filtered by the supplied viewer. */
export function SettingsSectionRegistryProbe({ isAdmin }: { readonly isAdmin: boolean }): ReactElement {
  return (
    <ConfigSectionRegistryProvider value={probeSections}>
      <SettingsSectionRegistryReader isAdmin={isAdmin} />
    </ConfigSectionRegistryProvider>
  );
}

const probeSections: ContributorRegistry<ConfigSectionContribution> = createContributorRegistry<ConfigSectionContribution>("probe-settings-sections", [
  { id: "probe-chat", anchor: "chat-behavior", nav: { id: "probe-chat", label: "Probe chat" }, body: (): ReactElement => <output>chat body</output> },
  {
    id: "probe-admin",
    anchor: "chat-behavior",
    nav: { id: "probe-admin", label: "Probe admin" },
    when: (viewer): boolean => viewer.isAdmin,
    body: (): ReactElement => <output>admin body</output>,
  },
  { id: "probe-other", anchor: "appearance", nav: { id: "probe-other", label: "Probe other" }, body: (): ReactElement => <output>other body</output> },
]);

function SettingsSectionRegistryReader({ isAdmin }: { readonly isAdmin: boolean }): ReactElement {
  const registry = useConfigSectionRegistry();
  const { primary, advanced } = useConfigSections("chat-behavior", { isAdmin, isOwner: isAdmin });
  const sections = [...primary, ...advanced];
  return (
    <div>
      <output>{`all=${registry
        .list()
        .map((c) => c.id)
        .join(",")} chat-behavior=${sections.map((x) => x.id).join(",")}`}</output>
      {sections.map((section) => (
        <Fragment key={section.id}>{section.node}</Fragment>
      ))}
    </div>
  );
}

/** ComposerFocusProbe — drives the composer-FOCUS store (the P5 CYOA compose-mode focus signal): a caller
 *  bumps a room's focus nonce (`requestComposerFocus`); a subscriber reads the reactive
 *  `useComposerFocusRequest` hook and focuses on change. A CT because the read is the reactive hook
 *  (useSyncExternalStore needs a browser render — the composer-draft-store.ct posture). The probe surfaces
 *  the nonce as text so the CT proves each request bumps it (0 → 1 → 2 for the same scope). */
export function ComposerFocusProbe(): ReactElement {
  const nonce = useComposerFocusRequest("cf_scope");
  const other = useComposerFocusRequest("cf_other");
  return (
    <div>
      <button type="button" onClick={(): void => requestComposerFocus("cf_scope")}>
        request focus
      </button>
      <button type="button" onClick={(): void => requestComposerFocus("cf_other")}>
        request other
      </button>
      <output>{`nonce=${nonce} other=${other}`}</output>
    </div>
  );
}

/** GameModeTransitionProbe — drives the game-mode transition seam (#862/#863): the ONE home for what a
 *  USER-INITIATED game-mode start/stop announces and reveals, shared by two doors that live in different
 *  client features and may not import each other. A CT because both reads are reactive hooks (the live
 *  region's message and the shell's context landing) — `useSyncExternalStore` needs a browser render, the
 *  composer-focus-store.ct posture. The probe surfaces both as text so the CT proves what a screen reader
 *  hears and where the panel lands, without reaching into store internals. */
export function GameModeTransitionProbe(): ReactElement {
  const announcement = useStatusAnnouncement();
  const contextTab = useContextTab();
  const panel = usePanelOverride(useActiveSection(), "context");
  return (
    <div>
      <button type="button" onClick={onGameModeStarted}>
        start game mode
      </button>
      <button type="button" onClick={onGameModeStopped}>
        stop game mode
      </button>
      <button type="button" onClick={(): void => announceStatus("Loaded chat.")}>
        announce route
      </button>
      <output>{`say=${announcement} tab=${contextTab ?? "none"} panel=${panel ?? "unset"}`}</output>
    </div>
  );
}

/** RefineryLandingFocusProbe — drives the refinery-landing-focus store (#307): a caller bumps the ONE
 *  global focus nonce (`requestRefineryLandingFocus`, no scope key — there is exactly one landing picker
 *  on screen); a subscriber reads the reactive `useRefineryLandingFocusRequest` hook and focuses on
 *  change. A CT because the read is the reactive hook (useSyncExternalStore needs a browser render — the
 *  composer-focus-store.ct posture). The probe surfaces the nonce as text so the CT proves each request
 *  bumps it (0 → 1 → 2). */
export function RefineryLandingFocusProbe(): ReactElement {
  const nonce = useRefineryLandingFocusRequest();
  return (
    <div>
      <button type="button" onClick={(): void => requestRefineryLandingFocus()}>
        request focus
      </button>
      <output>{`nonce=${nonce}`}</output>
    </div>
  );
}

/** TagLibraryProbe — the tag library's per-device UI state. Its sort default is the thing that matters:
 *  the roster opens on MOST-USED, not on the authored order, at the owner's ~400-tag library. The prune
 *  confirm's open flag rides the same store because the verb and its question live in two fibers since
 *  #1725 (the host draws the overflow item, the rows own the dialog); it is TRANSIENT — excluded from
 *  `partialize`, so a reload never restores an open destructive dialog. */
export function TagLibraryProbe(): ReactElement {
  const mode = useTagSortMode();
  const pruneOpen = useTagPruneConfirmOpen();
  return (
    <div>
      <output>{`sort=${mode}`}</output>
      <output>{`prune=${String(pruneOpen)}`}</output>
      <button type="button" onClick={(): void => setTagPruneConfirmOpen(true)}>
        open prune
      </button>
      <button type="button" onClick={(): void => setTagPruneConfirmOpen(false)}>
        close prune
      </button>
      <button type="button" onClick={(): void => setTagSortMode("alpha")}>
        sort alpha
      </button>
      <button type="button" onClick={(): void => setTagSortMode("manual")}>
        sort manual
      </button>
      <button type="button" onClick={(): void => setTagSortMode("used")}>
        sort used
      </button>
    </div>
  );
}

/** AppearanceBootHintProbe — the #188/#231 boot replay, at the tier a CT can see it: the probe calls
 *  `stampAppearanceBootHint()` in RENDER (the real caller is `main.tsx`, before React exists at all), so
 *  the page's <html> carries whatever this device remembered before anything else paints. It renders both
 *  the remembered values and the RESULTING root state, because "the hint said X" and "X reached the
 *  document" are two different claims and only the second one silences an animation, sizes the shell, or
 *  paints the right palette. */
export function AppearanceBootHintProbe(): ReactElement {
  stampAppearanceBootHint();
  const hint = useAppearanceBootHint();
  const root = document.documentElement;
  const stamped = [
    `motion=${root.getAttribute("data-reduced-motion") ?? "absent"}`,
    `scale=${root.style.getPropertyValue("--font-scale") === "" ? "absent" : root.style.getPropertyValue("--font-scale")}`,
    `theme=${root.getAttribute("data-theme") ?? "absent"}`,
  ].join(" ");
  return (
    <div>
      <output>{`hint motion=${String(hint.reducedMotion)} scale=${String(hint.fontScale)} density=${hint.density} theme=${hint.dataTheme ?? "none"} | stamped ${stamped}`}</output>
      {/* `rememberAppearanceBootHint`/`rememberDataThemeHint` are what the SERVER values write back
          (`useAppearance`/`useSelectedTheme` call them the moment their reads resolve); the buttons stand
          in for that authoritative landing. */}
      <button type="button" onClick={(): void => rememberAppearanceBootHint({ reducedMotion: true, fontScale: 1.25, density: "compact" })}>
        server says loud
      </button>
      <button type="button" onClick={(): void => rememberAppearanceBootHint({ reducedMotion: false, fontScale: 1, density: "comfortable" })}>
        server says default
      </button>
      <button type="button" onClick={(): void => rememberDataThemeHint("light")}>
        server says light
      </button>
      <button type="button" onClick={(): void => __resetAppearanceBootHint()}>
        forget device
      </button>
    </div>
  );
}

/** DeploymentBootHintProbe — the #476 capability hint at the tier a CT can see it. Unlike the appearance
 *  hint there is nothing to stamp on `<html>`: this hint's whole job is to be READABLE at first paint, so
 *  the claim is the value the very first render observes, and a persisted store rehydrates off localStorage
 *  at MODULE INIT (hence the seed-then-reload CT). The buttons stand in for `useMultiHumanCapable`'s
 *  authoritative write-back the instant `/api/auth/config` lands. */
export function DeploymentBootHintProbe(): ReactElement {
  const multiHumanCapable = useMultiHumanCapableHint();
  return (
    <div>
      <output>{`multiHuman=${multiHumanCapable === null ? "unknown" : String(multiHumanCapable)}`}</output>
      <button type="button" onClick={(): void => rememberMultiHumanCapable(true)}>
        server says capable
      </button>
      <button type="button" onClick={(): void => rememberMultiHumanCapable(false)}>
        server says single-human
      </button>
      <button type="button" onClick={(): void => __resetDeploymentBootHint()}>
        forget device
      </button>
    </div>
  );
}

/**
 * The notice-band store's WHOLE contract, in the shape that made it necessary (#193): the band and the
 * toast outlet are NOT in the same subtree, so a context could never carry this — the outlet is mounted at
 * the composition root, above the router and outside the error boundary, while the band is a row deep
 * inside the shell. The probe reproduces exactly that: `NoticeBand` (the real writer) and `AppToaster`
 * (inside `CtToastSurface`, the real reader) are siblings, and the band can be UNMOUNTED mid-life —
 * which is the app-level crash-boundary swap, the one case a "is a shell mounted?" flag would go stale on.
 */
export function NoticeBandProbe(): ReactElement {
  const [banded, setBanded] = useState(true);
  // A SECOND host, published by hand: the store's re-target path. A shell swap (a route change that
  // rebuilds the frame) hands the outlet a different node while a notice is already up, and the stack has
  // to follow the live one — nothing about the band component itself can produce that case.
  const spare = useRef<HTMLDivElement>(null);
  return (
    <CtToastSurface>
      <div>
        {banded ? <NoticeBand /> : null}
        <div data-testid="spare-host" ref={spare} />
        <button type="button" onClick={(): void => notify.error("Lost the live connection")}>
          raise notice
        </button>
        <button type="button" onClick={(): void => setBanded(false)}>
          drop the shell
        </button>
        <button type="button" onClick={(): void => publishNoticeBand(spare.current)}>
          publish the spare host
        </button>
      </div>
    </CtToastSurface>
  );
}

/** THE LIST-FLIP CARRY SEAM (#391, state/list-flip-carry.ts) — a stand-in for `useShellLayout`, which is
 *  the only production registrant. It registers through an EFFECT WITH NO DEP ARRAY on purpose: that is
 *  exactly what the hook does, so the registered closure is re-published every commit and always sees the
 *  CURRENT override. A closure captured once (in a click handler) would go stale and could not witness the
 *  ordering the CT is here to pin. The carry records what it was HANDED and what the store still SAID at
 *  that moment — the two halves of "the carry runs before the write". */
export function ListFlipCarryProbe(): ReactElement {
  const section = useActiveSection();
  const listOverride = usePanelOverride(section, "list");
  const [carryOn, setCarryOn] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!carryOn) {
      return;
    }
    registerListFlipCarry((next): void => {
      setLog((prev) => [...prev, `${next}@${listOverride ?? "none"}`]);
    });
    return (): void => {
      registerListFlipCarry(null);
    };
  });
  return (
    <div>
      <p data-testid="list-override">{listOverride ?? "none"}</p>
      <p data-testid="carry-log">{log.length === 0 ? "none" : log.join(" | ")}</p>
      <button type="button" onClick={(): void => setCarryOn(true)}>
        mount the carry
      </button>
      <button type="button" onClick={(): void => setCarryOn(false)}>
        unmount the carry
      </button>
      <button type="button" onClick={(): void => dockListPanel()}>
        dock the list
      </button>
      <button type="button" onClick={(): void => setPanelMode("list", "collapsed")}>
        collapse the list
      </button>
      <button type="button" onClick={(): void => collapseListPanel()}>
        nav-bridge close the list
      </button>
    </div>
  );
}

/** ConfigNavProbe — drives the config NAV store (#866 S1): the ONE
 *  deep-link intent `openConfigTo(group, sub?, setting?)` for every kind of group, the LIST's band/row
 *  clicks, the spy's write, and the derived EFFECTIVE active group (an open member's kind wins over the
 *  explicitly activated group). A CT because every read surface is a reactive hook. Prints the target's
 *  nonce so a repeated request is provably a NEW landing (a second click on the row you are on re-scrolls). */
export function ConfigNavProbe(): ReactElement {
  const group = useActiveConfigGroup();
  // The SECTION SEAM's non-reactive pair (`makeConfigSection`'s `SectionSelection`): the same fact through
  // subscribe + getState, so the shell's "is anything open?" answer can never disagree with the hook. Spelled
  // as the explicit calls the seam makes, not a bare reference pair, so the pin drives them by name.
  const seam = useSyncExternalStore(
    (listener) => subscribeConfigNav(listener),
    () => getActiveConfigGroup(),
  );
  const sub = useActiveConfigSub();
  const target = useConfigTarget();
  const section = useActiveSection();
  const tagsOpen = useConfigGroupOpen("tags");
  const selection = useCollectionSelection();
  // The spy's OTHER write (#926): the setting rows currently in the CONTENT viewport — the teacher roster's
  // population. Printed as its membership so the pin can prove BOTH that it lands and that an identical
  // re-write is a no-op (the coalescing the rAF-per-scroll rate depends on).
  const visible = useVisibleConfigSettings();
  return (
    <div>
      <output>
        {`group=${group ?? "none"} seam=${seam ?? "none"} sub=${sub ?? "none"} target=${target === null ? "none" : `${target.group}/${target.sub ?? "-"}/${target.setting ?? "-"}#${target.nonce}`} section=${section} tagsOpen=${String(tagsOpen)} selection=${selection === null ? "none" : `${selection.kind}:${selection.memberId}`} visible=${visible.length === 0 ? "none" : visible.map((row) => `${row.sub}/${row.setting}`).join("+")}`}
      </output>
      <button type="button" onClick={(): void => openConfigTo("appearance")}>
        open appearance
      </button>
      <button type="button" onClick={(): void => openConfigTo("appearance", "motion")}>
        open appearance motion
      </button>
      <button type="button" onClick={(): void => openConfigTo("chat-behavior", "prose", "prose-arbiter")}>
        open prose leaf
      </button>
      <button type="button" onClick={(): void => openConfigTo("tags")}>
        open tags
      </button>
      <button type="button" onClick={(): void => selectConfigGroup("workloads", "jobs")}>
        band click workloads
      </button>
      <button type="button" onClick={(): void => selectConfigSub("workloads", "schedules")}>
        row click schedules
      </button>
      <button type="button" onClick={(): void => setActiveConfigSub("analysis")}>
        spy analysis
      </button>
      <button
        type="button"
        onClick={(): void =>
          setActiveConfigSub("jobs", [
            { sub: "jobs", setting: "poll" },
            { sub: "jobs", setting: "retries" },
          ])
        }
      >
        spy visible two
      </button>
      {/* A DISTINCT ARRAY WITH THE SAME MEMBERSHIP — the coalescing arm: the store must treat it as a no-op
          rather than publishing a new identity, or the teacher re-renders on every scroll frame. */}
      <button
        type="button"
        onClick={(): void =>
          setActiveConfigSub("jobs", [
            { sub: "jobs", setting: "poll" },
            { sub: "jobs", setting: "retries" },
          ])
        }
      >
        spy visible two again
      </button>
      <button type="button" onClick={(): void => setActiveConfigSub("jobs", [{ sub: "jobs", setting: "retries" }])}>
        spy visible one
      </button>
      {/* The LEAVE arm: `undefined` reports rows without touching the section a jump named. */}
      <button type="button" onClick={(): void => setActiveConfigSub(undefined, [{ sub: "jobs", setting: "poll" }])}>
        spy visible only
      </button>
      <button type="button" onClick={(): void => selectCollectionMember("regex", "regex_nav_probe")}>
        select regex member
      </button>
      <button type="button" onClick={(): void => clearActiveConfigGroup()}>
        clear group
      </button>
      <button type="button" onClick={(): void => setActiveSection("chats")}>
        go to chats
      </button>
      <button type="button" onClick={(): void => __resetConfigNav()}>
        reset nav
      </button>
    </div>
  );
}

/** ConfigSearchProbe — drives the config SEARCH store (#866 S2): the live query, the selected match, and the
 *  clear-empties-both rule (a mark whose query is gone would be unexplainable). A CT because the reads are
 *  reactive hooks. */
/** The FOCUSED-SETTING seam (#866 S3): keep-last on writes, cleared by a NAVIGATION (the nav store's
 *  land/clear both fire `clearConfigFocus` — a lesson about a row that left the screen would be a lie). */
export function ConfigFocusProbe(): ReactElement {
  const focus = useConfigFocus();
  return (
    <div>
      <output>{`focus=${focus === null ? "none" : `${focus.group}/${focus.sub}/${focus.setting ?? "-"}`}`}</output>
      <button type="button" onClick={(): void => setConfigFocus({ group: "appearance", sub: "sizing", setting: "density" })}>
        focus density
      </button>
      <button type="button" onClick={(): void => setConfigFocus({ group: "appearance", sub: "sizing", setting: null })}>
        focus the section
      </button>
      <button type="button" onClick={(): void => selectConfigGroup("connections", null)}>
        navigate away
      </button>
      <button type="button" onClick={(): void => clearConfigFocus()}>
        clear focus
      </button>
      <button
        type="button"
        onClick={(): void => {
          __resetConfigFocus();
          __resetConfigNav();
        }}
      >
        reset focus
      </button>
    </div>
  );
}

/** THE CONTENT-SWAP FLOAT LIFETIME (#1795) — the shell's real ModalHost over the real modal registry, plus
 *  the two content-swap doors a person actually crosses with a float open (a rail section change and a room
 *  change). The CONTENT-only View Transition captures `.shell-content` alone, and every modal portals to a
 *  root that is a SIBLING of the shell grid — so a float is neither captured nor hidden by a swap, and the
 *  lifetime rule is a product rule this probe pins rather than something the browser does for us.
 *
 *  Both arms mount together because they are ONE rule with two answers: the imagery lightbox is a
 *  CONTENT-scoped float (its subject is an image inside the room being left), and the ingest ceremony is a
 *  GLOBAL one (reachable from home, the databank band and its empty state — its meaning does not depend on
 *  which section you stand in). The observable is the rendered dialog's accessible name, not the store's
 *  `openModal` field: what the row is about is whether a person is still looking at it. */
export function ContentSwapFloatProbe(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <ContentSwapFloatBody />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

function ContentSwapFloatBody(): ReactElement {
  const open = useOpenModal();
  const section = useActiveSection();
  return (
    <div>
      <output>{`section=${section} modal=${open ?? "none"}`}</output>
      {/* The real opener, not `openModal("imageDetail")`: the subject channel is what makes this float
          content-scoped, so the probe uses the same action a message image click calls. */}
      <button
        type="button"
        onClick={(): void =>
          openImageDetail({
            assetId: PROBE_IMAGE_ASSET,
            chatId: PROBE_SELECT_CHAT,
            url: PROBE_IMAGE_URL,
            alt: "A room image",
          })
        }
      >
        view the room image
      </button>
      <button type="button" onClick={(): void => openModal("addDocument")}>
        add a document
      </button>
      {/* THE SWAP DOORS CARRY TESTIDS, NOT JUST NAMES, because an open house modal makes this whole
          background `inert` + `aria-hidden`: with a dialog up there is no POINTER route to a section
          change at all, so a swap that strands a float is always a PROGRAMMATIC one — the `__orb.nav`
          bridge, an async mutation completion, a slash/plugin runner, or the session-recovery ladder's
          resume. The CT drives these the same way those callers do: a dispatched click, not a user press. */}
      <button data-testid="ct-go-corpus" type="button" onClick={(): void => setActiveSection("corpus")}>
        go corpus
      </button>
      <button data-testid="ct-go-chats" type="button" onClick={(): void => setActiveSection("chats")}>
        go chats
      </button>
      <button data-testid="ct-open-room" type="button" onClick={(): void => selectChat(PROBE_SELECT_CHAT)}>
        open another room
      </button>
      {/* A launcher that navigates and THEN opens a content-scoped float for where it is going — an
          ordinary intent, and the ordering trap: `withViewTransition` defers its callback to a later task,
          so a naive dismissal read inside that callback would swallow this modal one tick after it opened. */}
      <button
        data-testid="ct-navigate-then-open"
        type="button"
        onClick={(): void => {
          setActiveSection("corpus");
          openImageDetail({ assetId: PROBE_IMAGE_ASSET, chatId: PROBE_SELECT_CHAT, url: PROBE_IMAGE_URL, alt: "A room image" });
        }}
      >
        go corpus and open the lightbox
      </button>
      {/* The door itself, with an EMPTY update — the dismissal is `withContentSwap`'s OWN contribution, not
          something a caller's write does, so one arm drives it with nothing else happening. */}
      <button data-testid="ct-bare-swap" type="button" onClick={(): void => withContentSwap(() => undefined)}>
        swap content with no other write
      </button>
      <ModalHost onClose={closeModal} openModal={open ?? null} />
    </div>
  );
}

export function ConfigSearchProbe(): ReactElement {
  const query = useConfigSearchQuery();
  const match = useConfigSearchMatch();
  return (
    <div>
      <output>{`query=${query === "" ? "none" : query} match=${match === null ? "none" : `${match.group}/${match.sub ?? "-"}/${match.setting ?? "-"}/${match.memberId ?? "-"}`}`}</output>
      <button type="button" onClick={(): void => setConfigSearchQuery("avatar @shelf:user")}>
        type a query
      </button>
      <button type="button" onClick={(): void => setConfigSearchMatch({ group: "appearance", sub: "avatars", setting: "avatar-size", memberId: null })}>
        select a hit
      </button>
      <button type="button" onClick={(): void => setConfigSearchQuery("")}>
        empty the input
      </button>
      <button type="button" onClick={(): void => __resetConfigSearch()}>
        reset search
      </button>
    </div>
  );
}
