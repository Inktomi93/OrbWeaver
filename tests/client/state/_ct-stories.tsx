// Story module for the state-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// ShellStoreProbe renders the shell store's read-hook values as text + buttons that fire its module
// actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
// assert the state machine + the toggleFocus derivation end-to-end.

import {
  closeModal,
  commitDraft,
  isCommitted,
  openModal,
  selectChat,
  setActiveSection,
  setPanelMode,
  startNewChat,
  toggleFocus,
  togglePanel,
  useActiveChatHandle,
  useActiveDraftSeed,
  useActiveSection,
  useActiveSessionKey,
  useIsImmersive,
  useOpenModal,
  usePanelMode,
} from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";

export function ShellStoreProbe(): ReactElement {
  const section = useActiveSection();
  const list = usePanelMode("list");
  const context = usePanelMode("context");
  const immersive = useIsImmersive();
  const modal = useOpenModal();
  return (
    <div>
      <output>
        {`section=${section} list=${list} context=${context} immersive=${String(immersive)} modal=${modal ?? "none"}`}
      </output>
      <button type="button" onClick={(): void => setActiveSection("corpus")}>
        go corpus
      </button>
      <button type="button" onClick={(): void => togglePanel("list")}>
        toggle list
      </button>
      <button type="button" onClick={(): void => setPanelMode("context", "docked")}>
        dock context
      </button>
      <button type="button" onClick={(): void => toggleFocus()}>
        toggle focus
      </button>
      <button type="button" onClick={(): void => openModal("settings")}>
        open settings
      </button>
      <button type="button" onClick={(): void => closeModal()}>
        close modal
      </button>
      <button
        type="button"
        onClick={(): void => {
          setActiveSection("chats");
          setPanelMode("list", "docked");
          setPanelMode("context", "collapsed");
          closeModal();
        }}
      >
        reset
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
  const handleStr = isCommitted(handle) ? `committed:${handle.id}` : `draft:${handle.draftKey}`;
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
    </div>
  );
}
