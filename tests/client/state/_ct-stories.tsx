// Story module for the state-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// ShellStoreProbe renders the shell store's read-hook values as text + buttons that fire its module
// actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
// assert the store's OWN surface: section switch, PER-SECTION panel override memory (§4.2 rule 2), and
// the modal open/close read. The resolve step (override ?? default) + the toggle/focus derivations moved
// to the app-shell feature's `use-shell-layout.ts` (they need the SECTION_PANEL_DEFAULTS table the store
// can't import) — those are exercised end-to-end by app-shell.ct.tsx, the correct tier.

import {
  chatDeletedFromList,
  clearAnalyticsSelection,
  clearCharacterSelection,
  clearChatListCharacterFilter,
  clearCorpusSelection,
  clearPresetSection,
  clearPresetSelection,
  clearTagFilter,
  clearWorldBookSelection,
  clearWorldEntrySelection,
  closeModal,
  commitDraft,
  dismissImportOnboarding,
  goToLanding,
  isCommitted,
  isLanding,
  openModal,
  selectAnalyticsCharacter,
  selectCharacter,
  selectChat,
  selectChatFromList,
  selectCorpusCharacter,
  selectPreset,
  selectPresetSection,
  selectWorldBook,
  selectWorldEntry,
  setActiveSection,
  setBulkMode,
  setCharacterSortMode,
  setCharacterViewMode,
  setChatListCharacterFilter,
  setMobileSheet,
  setMobileViewport,
  setPanelMode,
  startNewChat,
  toggleFavoritesOnly,
  toggleShowArchived,
  toggleTagFilter,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSection,
  useActiveSessionKey,
  useCharacterBulkMode,
  useCharacterSortMode,
  useCharacterViewMode,
  useChatListCharacterFilter,
  useFavoritesOnly,
  useImportOnboardingDismissed,
  useListDocked,
  useMobileSheet,
  useOpenModal,
  usePanelOverride,
  useSelectedAnalyticsCharacterId,
  useSelectedCharacterId,
  useSelectedCorpusCharacterId,
  useSelectedPresetId,
  useSelectedPresetSectionId,
  useSelectedWorldBookId,
  useSelectedWorldEntryId,
  useShowArchived,
  useTagFilter,
} from "@orb/client/state";
import type { CharacterId, ChatId, PresetId, TagId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";

export function ShellStoreProbe(): ReactElement {
  const section = useActiveSection();
  // The ACTIVE section's raw overrides (undefined = unset ⇒ the feature default resolves it; the store
  // itself only holds the override). "none" stands in for an unset override in the probe's text output.
  const list = usePanelOverride(section, "list") ?? "none";
  const context = usePanelOverride(section, "context") ?? "none";
  const modal = useOpenModal();
  // `useListDocked` — the narrow #state projection a section definition reads instead of
  // `useShellLayout` (chats-section.tsx's landing showRecents). Fed a literal "docked" own-default here
  // so the probe exercises the override-priority logic, independent of any real section's actual default.
  const docked = useListDocked(section, "docked");
  return (
    <div>
      <output>
        {`section=${section} list=${list} context=${context} modal=${modal ?? "none"} docked=${docked}`}
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
      <button type="button" onClick={(): void => closeModal()}>
        close modal
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

const PROBE_CHARACTER = castId<CharacterId>("char_probe_aria");
const PROBE_SELECT_CHAT = castId<ChatId>("chat_probe_select");
const PROBE_COMMIT_CHAT = castId<ChatId>("chat_probe_commit");
const PROBE_LIST_CHAT = castId<ChatId>("chat_probe_list");
const PROBE_OTHER_CHAT = castId<ChatId>("chat_probe_other");

/** ActiveChatStoreProbe — renders the active-chat store's read hooks as text + buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser)
 *  and assert THE KEY DISCIPLINE: sessionKey is stable across a draft→committed promotion, changes on
 *  new-chat / select. Each mount is a fresh page → the module session counter restarts at 1. Also drives
 *  the LIST-callback intent actions (`selectChatFromList`'s mobileSheet dual-write,
 *  `chatDeletedFromList`'s active-chat-only goToLanding). */
export function ActiveChatStoreProbe(): ReactElement {
  const handle = useActiveChatHandle();
  const seed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  const mobileSheet = useMobileSheet();
  let handleStr = "landing";
  if (isCommitted(handle)) {
    handleStr = `committed:${handle.id}`;
  } else if (!isLanding(handle)) {
    handleStr = `draft:${handle.draftKey}`;
  }
  const seedStr = seed?.characterIds?.join(",") ?? "none";
  return (
    <div>
      <output>
        {`handle=${handleStr} session=${sessionKey} seed=${seedStr} mobileSheet=${mobileSheet ?? "none"}`}
      </output>
      <button type="button" onClick={(): void => startNewChat()}>
        new blank
      </button>
      <button type="button" onClick={(): void => startNewChat({ characterIds: [PROBE_CHARACTER] })}>
        new with aria
      </button>
      <button type="button" onClick={(): void => selectChat(PROBE_SELECT_CHAT)}>
        select chat
      </button>
      {/* Open the LIST mobile sheet first so `selectChatFromList`'s dual-write close is observable. */}
      <button type="button" onClick={(): void => setMobileSheet("list")}>
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
      <button
        type="button"
        onClick={(): void =>
          commitDraft(PROBE_COMMIT_CHAT, handle.kind === "draft" ? handle.draftKey : "")
        }
      >
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
    </div>
  );
}

/** CharacterSelectionProbe — renders the character-selection store's read hook as text + buttons that
 *  fire its module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a
 *  browser) and assert select → clear (J9: LIST selection drives the CONTENT detail card). */
export function CharacterSelectionProbe(): ReactElement {
  const selected = useSelectedCharacterId();
  return (
    <div>
      <output>{`selected=${selected ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectCharacter(PROBE_CHARACTER)}>
        select aria
      </button>
      <button type="button" onClick={(): void => clearCharacterSelection()}>
        clear selection
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
      <button
        type="button"
        onClick={(): void =>
          setChatListCharacterFilter({ id: PROBE_FILTER_CHARACTER, name: "Aria" })
        }
      >
        set filter
      </button>
      <button type="button" onClick={(): void => clearChatListCharacterFilter()}>
        clear filter
      </button>
    </div>
  );
}

const PROBE_PRESET = castId<PresetId>("preset_ct_probe");

/** PresetSelectionProbe — renders the preset-selection store's read hooks as text + buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
 *  assert select → clear for BOTH the open preset (W10) and the rack SECTION (The Assembly §2.2): selecting
 *  a section reveals the inspector; opening a different preset clears a stale section. */
export function PresetSelectionProbe(): ReactElement {
  const selected = useSelectedPresetId();
  const section = useSelectedPresetSectionId();
  return (
    <div>
      <output>{`selected=${selected ?? "none"} section=${section ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectPreset(PROBE_PRESET)}>
        select preset
      </button>
      <button type="button" onClick={(): void => selectPresetSection("sec_probe")}>
        select section
      </button>
      <button type="button" onClick={(): void => clearPresetSection()}>
        clear section
      </button>
      <button type="button" onClick={(): void => clearPresetSelection()}>
        clear preset selection
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
  return (
    <div>
      <output>
        {`sort=${sort} view=${view} fav=${favoritesOnly} archived=${showArchived} bulk=${bulk} tags=${tags.join(",") || "none"}`}
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
      <button type="button" onClick={(): void => toggleTagFilter(PROBE_TAG)}>
        toggle tag
      </button>
      <button type="button" onClick={(): void => clearTagFilter()}>
        clear tags
      </button>
    </div>
  );
}

const PROBE_BOOK = castId<WorldBookId>("world_book_ct_probe");
const PROBE_ENTRY = castId<WorldEntryId>("world_entry_ct_probe");

/** WorldInfoSelectionProbe — renders the world-info-selection store's read hooks as text + buttons that fire
 *  its module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser)
 *  and assert select → clear for BOTH the open book (LIST drives CONTENT) and the drilled entry: selecting an
 *  entry reveals its editor; opening a different book clears a stale entry. */
export function WorldInfoSelectionProbe(): ReactElement {
  const book = useSelectedWorldBookId();
  const entry = useSelectedWorldEntryId();
  return (
    <div>
      <output>{`book=${book ?? "none"} entry=${entry ?? "none"}`}</output>
      <button type="button" onClick={(): void => selectWorldBook(PROBE_BOOK)}>
        select book
      </button>
      <button type="button" onClick={(): void => selectWorldEntry(PROBE_ENTRY)}>
        select entry
      </button>
      <button type="button" onClick={(): void => clearWorldEntrySelection()}>
        clear entry
      </button>
      <button type="button" onClick={(): void => clearWorldBookSelection()}>
        clear book selection
      </button>
    </div>
  );
}

/** ImportOnboardingProbe — renders the first-run import-card dismiss latch as text + a dismiss button, so
 *  a CT can drive the persisted store's module action + read hook (import-onboarding-store). */
export function ImportOnboardingProbe(): ReactElement {
  const dismissed = useImportOnboardingDismissed();
  return (
    <div>
      <output>{`dismissed=${String(dismissed)}`}</output>
      <button type="button" onClick={(): void => dismissImportOnboarding()}>
        dismiss card
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
      <button
        type="button"
        onClick={(): void => selectCorpusCharacter(castId<CharacterId>("char_corpus_probe"))}
      >
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
      <button
        type="button"
        onClick={(): void => selectAnalyticsCharacter(castId<CharacterId>("char_analytics_probe"))}
      >
        select analytics character
      </button>
      <button type="button" onClick={(): void => clearAnalyticsSelection()}>
        clear analytics selection
      </button>
    </div>
  );
}
