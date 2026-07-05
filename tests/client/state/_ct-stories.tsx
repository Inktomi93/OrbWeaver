// Story module for the state-tier CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// ShellStoreProbe renders the shell store's read-hook values as text + buttons that fire its module
// actions, so a CT can drive the real hook-backed store (useSyncExternalStore needs a browser) and
// assert the state machine + the toggleFocus derivation end-to-end.

import {
  closeModal,
  openModal,
  setActiveSection,
  setPanelMode,
  toggleFocus,
  togglePanel,
  useActiveSection,
  useIsImmersive,
  useOpenModal,
  usePanelMode,
} from "@orb/client/state";
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
