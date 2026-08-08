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
import type { SectionDefinition, SettingsSectionContribution } from "@orb/client/state";
import {
  __dismissPresetSectionForTest,
  __resetCollectionGroupOpen,
  __resetPresetSection,
  __resetPresetSelection,
  __resetTagFilter,
  chatDeletedFromList,
  clearAnalyticsSelection,
  clearCharacterFacet,
  clearCharacterSelection,
  clearChatListCharacterFilter,
  clearCollectionSelection,
  clearCorpusSelection,
  clearDatabankPhaseFilter,
  clearNewChatPreset,
  clearSectionSaveStatus,
  clearWorldEntrySelection,
  closeModal,
  commitDraft,
  cycleTagFilter,
  goToCollection,
  goToLanding,
  isCommitted,
  isLanding,
  migrateComposerDraft,
  openCollectionGroup,
  openModal,
  openNewChatPicker,
  openSettingsTo,
  reportSectionSaveStatus,
  requestComposerFocus,
  revealContextPanel,
  revealContextPanelBesideContent,
  SECTION_IDS,
  SettingsSectionRegistryProvider,
  selectAnalyticsCharacter,
  selectCharacter,
  selectCharacterFacet,
  selectChat,
  selectChatFromList,
  selectCollectionMember,
  selectCollectionMemberFromList,
  selectCorpusCharacter,
  selectPreset,
  selectPresetFromList,
  selectPresetSection,
  selectWorldEntry,
  setActiveSection,
  setBulkMode,
  setCharacterSortMode,
  setCharacterViewMode,
  setChatListCharacterFilter,
  setComposerDraft,
  setContextTab,
  setDatabankPhaseFilter,
  setFocusMode,
  setMobileViewport,
  setNarrowViewport,
  setOpenOverlayPanel,
  setPanelMode,
  setPresetEditorView,
  setTagSortMode,
  startNewChat,
  toggleCollectionGroup,
  toggleFavoritesOnly,
  toggleShowArchived,
  toggleSpoilerBlur,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSection,
  useActiveSessionKey,
  useAggregateSaveStatus,
  useBlockedSaveSections,
  useCharacterBulkMode,
  useCharacterSortMode,
  useCharacterViewMode,
  useChatListCharacterFilter,
  useChromeRegistry,
  useCollectionGroupOpen,
  useCollectionSelection,
  useComposerDraft,
  useComposerFocusRequest,
  useContextTab,
  useDatabankPhaseFilter,
  useErroredSaveSections,
  useFavoritesOnly,
  useFocusMode,
  useListDocked,
  useModalRegistry,
  useNarrowViewport,
  useNewChatPreset,
  useOpenModal,
  useOpenOverlayPanel,
  usePanelOverride,
  usePresetEditorView,
  useSectionListIsScreen,
  useSectionRegistry,
  useSelectedAnalyticsCharacterId,
  useSelectedCharacterFacetId,
  useSelectedCharacterId,
  useSelectedCorpusCharacterId,
  useSelectedPresetId,
  useSelectedPresetSectionId,
  useSelectedWorldEntryId,
  useSettingsPaneRegistry,
  useSettingsSectionRegistry,
  useSettingsSections,
  useSettingsTarget,
  useShowArchived,
  useSpoilerBlur,
  useTagFilter,
  useTagSortMode,
} from "@orb/client/state";
import type { CharacterId, ChatId, PresetId, TagId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { Fragment, useState } from "react";
import { CtDataProviders, CtFakeSectionRegistry, CtRealSectionRegistry } from "../../support/ct/ct-data-providers.tsx";

// ── section-list-projection: the #state answers to "is my LIST docked / is it the mobile SCREEN?" ──────
// Mounted over the REAL config selection seam (`CtFakeSectionRegistry` passes `REAL[id].selection` through
// whenever a story injects a `list`), so the projection is proven against the production store rather than
// a double — and beside a section that declares NO list, which must never enter the list-as-screen arm.

/** The projection probe: config (a list-bearing section, real seam) vs refinery (no list at all). */
export function SectionListProjectionProbe(): ReactElement {
  return (
    <CtFakeSectionRegistry sections={{ config: { list: <p>config roster</p> } }}>
      <SectionListProjectionBody />
    </CtFakeSectionRegistry>
  );
}

function SectionListProjectionBody(): ReactElement {
  const configIsScreen = useSectionListIsScreen("config");
  const refineryIsScreen = useSectionListIsScreen("refinery");
  const configDocked = useListDocked("config", "docked");
  const overlay = useOpenOverlayPanel();
  return (
    <div>
      <output>{`config-screen=${configIsScreen} refinery-screen=${refineryIsScreen} config-docked=${configDocked} overlay=${overlay ?? "none"}`}</output>
      <button type="button" onClick={(): void => setOpenOverlayPanel("list")}>
        open list overlay
      </button>
      <button type="button" onClick={(): void => selectCollectionMember("tag", "tag-projection-probe")}>
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
  // The registry is load-bearing since the mobile ONE-SHELL rule: `useListDocked` reads the section's
  // declared SELECTION seam (a list-bearing section with nothing open is `docked` on a phone), and that
  // answer has ONE home — the registry. The fake's sections inject no `list`, so they declare no seam and
  // this probe exercises the pre-existing algebra unchanged.
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
  const settingsTarget = useSettingsTarget();
  const contextTab = useContextTab();
  const openOverlayPanel = useOpenOverlayPanel();
  // `useListDocked` — the narrow #state projection a section definition reads instead of
  // `useShellLayout` (chats-section.tsx's landing showRecents). Fed a literal "docked" own-default here
  // so the probe exercises the override-priority logic, independent of any real section's actual default.
  const docked = useListDocked(section, "docked");
  const narrowViewport = useNarrowViewport();
  // The ONE focus flag (item 20) — the probe prints it BESIDE the raw overrides so a CT can assert the two
  // never disagree, and that focus mode never writes into the overrides it is hiding.
  const focus = useFocusMode();
  return (
    <div>
      <output>
        {`section=${section} list=${list} context=${context} modal=${modal ?? "none"} docked=${docked} settingsTarget=${settingsTarget ?? "none"} contextTab=${contextTab ?? "none"} openOverlayPanel=${openOverlayPanel ?? "none"} narrowViewport=${narrowViewport} focus=${focus}`}
      </output>
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
      <button type="button" onClick={(): void => openModal("settings")}>
        open settings
      </button>
      <button type="button" onClick={(): void => openSettingsTo("personas")}>
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
    </div>
  );
}

const PROBE_CHARACTER = castId<CharacterId>("char_probe_aria");
const PROBE_SELECT_CHAT = castId<ChatId>("chat_probe_select");
const PROBE_COMMIT_CHAT = castId<ChatId>("chat_probe_commit");
const PROBE_LIST_CHAT = castId<ChatId>("chat_probe_list");
const PROBE_OTHER_CHAT = castId<ChatId>("chat_probe_other");

/** ActiveChatStoreProbe — renders the active-chat store's read hooks as text + buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser)
 *  and assert THE KEY DISCIPLINE: sessionKey is stable across a draft→committed promotion, changes on
 *  new-chat / select. Each mount is a fresh page → the module session counter restarts at 1. Also drives
 *  the LIST-callback intent actions (`selectChatFromList`'s openOverlayPanel dual-write,
 *  `chatDeletedFromList`'s active-chat-only goToLanding). */
export function ActiveChatStoreProbe(): ReactElement {
  const handle = useActiveChatHandle();
  const seed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  const openOverlayPanel = useOpenOverlayPanel();
  const preset = useNewChatPreset();
  const modal = useOpenModal();
  let handleStr = "landing";
  if (isCommitted(handle)) {
    handleStr = `committed:${handle.id}`;
  } else if (!isLanding(handle)) {
    handleStr = `draft:${handle.draftKey}`;
  }
  const seedStr = seed?.characterIds?.join(",") ?? "none";
  return (
    <div>
      <output>{`handle=${handleStr} session=${sessionKey} seed=${seedStr} openOverlayPanel=${openOverlayPanel ?? "none"}`}</output>
      {/* A `p`, not a second `<output>` — the store CTs read the state line as `locator("output")`. */}
      <p data-testid="new-chat-preset">{`modal=${modal ?? "none"} preset=${preset === undefined ? "none" : String(preset.temporary === true)}`}</p>
      <button type="button" onClick={(): void => startNewChat()}>
        new blank
      </button>
      <button type="button" onClick={(): void => startNewChat({ characterIds: [PROBE_CHARACTER] })}>
        new with aria
      </button>
      <button type="button" onClick={(): void => selectChat(PROBE_SELECT_CHAT)}>
        select chat
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
      {/* Commit the CURRENTLY-active draft — reads its draftKey off the live handle (the real send
          seam threads `initialHandle.draftKey`). A committed/landing handle passes "" ⇒ the guard
          no-ops, exactly as commitDraft rejects a non-draft slot. */}
      <button type="button" onClick={(): void => commitDraft(PROBE_COMMIT_CHAT, handle.kind === "draft" ? handle.draftKey : "")}>
        commit draft
      </button>
      {/* Commit a STALE draftKey (`draft-2`, the FIRST draft minted per fresh page) — reproduces a
          late-resolving `commitDraft(chatA)` for a draft the user already navigated away from. The
          guard must reject it whenever the active slot is a newer draft / landing / committed chat. */}
      <button type="button" onClick={(): void => commitDraft(PROBE_COMMIT_CHAT, "draft-2")}>
        commit stale draft-2
      </button>
      <button type="button" onClick={(): void => goToLanding()}>
        go landing
      </button>
      {/* The ONE creation ceremony (side-eye F9): an opener with a creation-only intent PRESETS the seed
          and opens the shared picker, instead of minting a draft of its own. The picker clears the preset
          on unmount, which `clear preset` stands in for here. */}
      <button type="button" onClick={(): void => openNewChatPicker({ temporary: true })}>
        open picker temp
      </button>
      <button type="button" onClick={(): void => clearNewChatPreset()}>
        clear preset
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
      <button type="button" onClick={(): void => setChatListCharacterFilter({ id: PROBE_FILTER_CHARACTER, name: "Aria" })}>
        set filter
      </button>
      <button type="button" onClick={(): void => clearChatListCharacterFilter()}>
        clear filter
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

/** PresetEditorViewProbe — the preset editor's VIEW axis (preset-surface-redesign.md §7 mechanics / §16
 *  row 10). The view moved out of local `Tabs` state into section state so CONTEXT can project per-view,
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
  return (
    <div>
      <output>
        {`sort=${sort} view=${view} fav=${favoritesOnly} archived=${showArchived} bulk=${bulk} tags=${tags.map((entry) => `${entry.id}:${entry.state}`).join(",") || "none"} blur=${spoilerBlur}`}
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
      <button type="button" onClick={(): void => toggleSpoilerBlur()}>
        toggle spoiler blur
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
 *  LIST dual-write that also closes the slide-over. `goToCollection` is the deep-link intent the retired
 *  `openSettingsTo("tags"|"regex")` call sites became — it expands the group, clears the selection AND
 *  switches the rail, so the probe reads the active section too. */
export function ConfigSelectionProbe(): ReactElement {
  const selection = useCollectionSelection();
  const openOverlayPanel = useOpenOverlayPanel();
  const section = useActiveSection();
  const tagsOpen = useCollectionGroupOpen("tags");
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
      <button type="button" onClick={(): void => goToCollection("tags")}>
        go to the tags collection
      </button>
    </div>
  );
}

/** ConfigGroupOpenProbe — the per-device group DISCLOSURE store. Groups start COLLAPSED (owner ruling), a
 *  toggle flips one group without touching its siblings, and `openCollectionGroup` is the idempotent
 *  deep-link arm (it may never collapse a group the user has open). */
export function ConfigGroupOpenProbe(): ReactElement {
  const tagsOpen = useCollectionGroupOpen("tags");
  const regexOpen = useCollectionGroupOpen("regex");
  return (
    <div>
      <output>{`tags=${String(tagsOpen)} regex=${String(regexOpen)}`}</output>
      <button type="button" onClick={(): void => toggleCollectionGroup("tags")}>
        toggle tags group
      </button>
      <button type="button" onClick={(): void => openCollectionGroup("tags")}>
        open tags group
      </button>
      <button type="button" onClick={(): void => __resetCollectionGroupOpen()}>
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

/** AnalyticsSelectionProbe — renders the analytics-selection store's read hook as text + buttons that fire
 *  its module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser)
 *  and assert select → clear (the Analytics leaderboard drill drives the Analytics CONTENT; separate from
 *  the Corpus / Characters selections). */
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
      <output>{`ids=${ids} theme=${registry.get("theme").title}`}</output>
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

/** SettingsPaneRegistryProbe — reads the settings-pane registry via `useSettingsPaneRegistry` inside its
 *  provider (the mirror of ModalRegistryProbe), rendering the delivered vocabulary as text so a CT proves
 *  the context delivers the ordered, total pane list and `get()` resolves a member's label. */
export function SettingsPaneRegistryProbe(): ReactElement {
  return (
    <CtFakeSectionRegistry>
      <SettingsPaneRegistryReader />
    </CtFakeSectionRegistry>
  );
}

function SettingsPaneRegistryReader(): ReactElement {
  const registry = useSettingsPaneRegistry();
  const ids = registry
    .list()
    .map((d) => d.id)
    .join(",");
  return (
    <div>
      <output>{`ids=${ids} appearance=${registry.get("appearance").label}`}</output>
    </div>
  );
}

/** ComposerDraftProbe — drives the composer-draft store (D70 commons) through its module actions and
 *  reads the reactive `useComposerDraft` hook, so a CT can prove the item-12 restoration: the typed draft
 *  is MODULE-scoped state, so it survives a component REMOUNT (the papercut this store exists to kill), and
 *  a draft→committed promotion MIGRATES the text across the scope-key flip. A CT (not a unit test) because
 *  the store's only read surface is the reactive hook (useSyncExternalStore needs a browser render). */
export function ComposerDraftProbe(): ReactElement {
  // A local mount toggle so the test can unmount+remount the reader and prove the store outlives it.
  const [mounted, setMounted] = useState(true);
  return (
    <div>
      <button type="button" onClick={(): void => setComposerDraft("cd_scope", "typed but not sent")}>
        type draft
      </button>
      <button type="button" onClick={(): void => migrateComposerDraft("cd_scope", "cd_committed")}>
        migrate to committed
      </button>
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

/** SettingsSectionRegistryProbe — reads the settings-SECTION registry through `useSettingsSectionRegistry`
 *  + `useSettingsSections` inside its provider (SET-SEAMS §5.2), rendering what a host pane would get: the
 *  sections anchored at ONE pane, in declared order, `when`-filtered by the supplied viewer. */
export function SettingsSectionRegistryProbe({ isAdmin }: { readonly isAdmin: boolean }): ReactElement {
  return (
    <SettingsSectionRegistryProvider value={probeSections}>
      <SettingsSectionRegistryReader isAdmin={isAdmin} />
    </SettingsSectionRegistryProvider>
  );
}

const probeSections: ContributorRegistry<SettingsSectionContribution> = createContributorRegistry<SettingsSectionContribution>("probe-settings-sections", [
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
  const registry = useSettingsSectionRegistry();
  const sections = useSettingsSections("chat-behavior", { isAdmin });
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

/** TagLibraryProbe — the tag roster's per-device SORT MODE store. Its default is the thing that matters:
 *  the roster opens on MOST-USED, not on the authored order, at the owner's ~400-tag library. */
export function TagLibraryProbe(): ReactElement {
  const mode = useTagSortMode();
  return (
    <div>
      <output>{`sort=${mode}`}</output>
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
