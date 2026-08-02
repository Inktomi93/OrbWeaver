// CT story module for the preset CONTEXT READOUT's D8 chat BINDING (preset-surface-redesign §7.1). A CT
// only mounts from a NON-test module (Spine-Testing §7), so the mount + the store drive live here.
//
// The REAL `<PresetReadout>` is mounted the way the composition root mounts it (the `single` context body),
// with the three axes the binding reads driven through their PRODUCTION store doors: `selectPreset` (which
// preset is open), `setPresetEditorView` ("actions" — the view whose readout consumes the binding), and
// `selectChat` (the LAST-OPEN CHAT handle the readout auto-binds to). Nothing is stubbed above the network:
// the binding is only proven if the real `useActiveChatId` read is what drives it.
//
// TWO STORIES, one component: BOUND (a chat is active — the auto-bind arm) and UNBOUND (no chat was ever
// selected — the honest-token fallback, which is also where a DISMISS lands).

import { PresetReadout } from "@orb/client/features/preset";
import { clearPresetSelection, clearPresetTemplate, goToLanding, selectChat, selectPreset, selectPresetTemplate, setPresetEditorView } from "@orb/client/state";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { CtDataProviders } from "../../../../support/ct/ct-data-providers";

const STORY_PRESET = castId<PresetId>("preset_ct_readoutbind");
const STORY_CHAT = castId<ChatId>("chat_ct_readoutbind");

/** Open the preset on the ACTIONS view; `chatId` non-null also makes that chat the active (last-open) one. */
function useReadoutFixture(chatId: ChatId | null): void {
  useEffect(() => {
    selectPreset(STORY_PRESET);
    setPresetEditorView("actions");
    // The SELECTION the readout echoes (§6.1: the Actions row body selects, the readout resolves that row).
    // Driven through the production store door, so the CT proves the projection rather than a prop.
    selectPresetTemplate("impersonate");
    if (chatId !== null) {
      selectChat(chatId);
    }
    return (): void => {
      clearPresetSelection();
      clearPresetTemplate();
      goToLanding();
    };
  }, [chatId]);
}

function ReadoutFrame({ chatId }: { readonly chatId: ChatId | null }): ReactElement {
  useReadoutFixture(chatId);
  return (
    <div style={{ height: 720, width: 380 }}>
      <PresetReadout />
    </div>
  );
}

/** BOUND: a chat is open, so the readout auto-binds to it and the Actions panel resolves for real. */
export function PresetReadoutBoundStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={STORY_CHAT} />
    </CtDataProviders>
  );
}

/** UNBOUND: no chat was ever opened — the honest-token arm, which must never render as a broken pane. */
export function PresetReadoutUnboundStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={null} />
    </CtDataProviders>
  );
}
