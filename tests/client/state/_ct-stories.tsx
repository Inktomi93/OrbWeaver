// Story module for the state-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// ShellStoreProbe renders the shell store's read-hook values as text + buttons that fire its module
// actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
// assert the store's OWN surface: section switch, PER-SECTION panel override memory (§4.2 rule 2), and
// the modal open/close read. The resolve step (override ?? default) + the toggle/focus derivations moved
// to the app-shell feature's `use-shell-layout.ts` (they need the SECTION_PANEL_DEFAULTS table the store
// can't import) — those are exercised end-to-end by app-shell.ct.tsx, the correct tier.

import {
  clearCharacterSelection,
  clearTagFilter,
  closeModal,
  commitDraft,
  goToLanding,
  isCommitted,
  isLanding,
  openModal,
  selectCharacter,
  selectChat,
  setActiveSection,
  setBulkMode,
  setCharacterSortMode,
  setCharacterViewMode,
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
  useFavoritesOnly,
  useOpenModal,
  usePanelOverride,
  useSelectedCharacterId,
  useShowArchived,
  useTagFilter,
} from "@orb/client/state";
import type { CharacterId, ChatId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";

export function ShellStoreProbe(): ReactElement {
  const section = useActiveSection();
  // The ACTIVE section's raw overrides (undefined = unset ⇒ the feature default resolves it; the store
  // itself only holds the override). "none" stands in for an unset override in the probe's text output.
  const list = usePanelOverride(section, "list") ?? "none";
  const context = usePanelOverride(section, "context") ?? "none";
  const modal = useOpenModal();
  return (
    <div>
      <output>{`section=${section} list=${list} context=${context} modal=${modal ?? "none"}`}</output>
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
      <button type="button" onClick={(): void => openModal("settings")}>
        open settings
      </button>
      <button type="button" onClick={(): void => closeModal()}>
        close modal
      </button>
    </div>
  );
}

const PROBE_CHARACTER = castId<CharacterId>("char_probe_aria");
const PROBE_SELECT_CHAT = castId<ChatId>("chat_probe_select");
const PROBE_COMMIT_CHAT = castId<ChatId>("chat_probe_commit");

/** ActiveChatStoreProbe — renders the active-chat store's read hooks as text + buttons that fire its
 *  module actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser)
 *  and assert THE KEY DISCIPLINE: sessionKey is stable across a draft→committed promotion, changes on
 *  new-chat / select. Each mount is a fresh page → the module session counter restarts at 1. */
export function ActiveChatStoreProbe(): ReactElement {
  const handle = useActiveChatHandle();
  const seed = useActiveDraftSeed();
  const sessionKey = useActiveSessionKey();
  let handleStr = "landing";
  if (isCommitted(handle)) {
    handleStr = `committed:${handle.id}`;
  } else if (!isLanding(handle)) {
    handleStr = `draft:${handle.draftKey}`;
  }
  const seedStr = seed?.characterIds?.join(",") ?? "none";
  return (
    <div>
      <output>{`handle=${handleStr} session=${sessionKey} seed=${seedStr}`}</output>
      <button type="button" onClick={(): void => startNewChat()}>
        new blank
      </button>
      <button type="button" onClick={(): void => startNewChat({ characterIds: [PROBE_CHARACTER] })}>
        new with aria
      </button>
      <button type="button" onClick={(): void => selectChat(PROBE_SELECT_CHAT)}>
        select chat
      </button>
      <button type="button" onClick={(): void => commitDraft(PROBE_COMMIT_CHAT)}>
        commit draft
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
