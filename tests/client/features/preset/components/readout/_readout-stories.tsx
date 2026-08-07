// CT story module for the preset CONTEXT READOUT's D8 chat BINDING (preset-surface-redesign §7.1). A CT
// only mounts from a NON-test module (Spine-Testing §7), so the mount + the store drive live here.
//
// The REAL `<PresetReadout>` is mounted the way the composition root mounts it (the `single` context body),
// with the three axes the binding reads driven through their PRODUCTION store doors: `selectPreset` (which
// preset is open), `setPresetEditorView` ("actions" — the view whose readout consumes the binding), and
// `selectChat` (the LAST-OPEN CHAT handle the readout auto-binds to). Nothing is stubbed above the network:
// the binding is only proven if the real `useActiveChatId` read is what drives it.
//
// FOUR STORIES, one component: the ACTIONS pair — BOUND (a chat is active, the auto-bind arm) and UNBOUND
// (no chat was ever selected — the honest-token fallback, which is also where a DISMISS lands) — and the
// PROMPT pair (D121-G), where the same binding decides whether the rack's bars carry the bound chat's REAL
// materialized costs or the chat-free `~—` floor.

import { PresetReadout } from "@orb/client/features/preset";
import {
  __resetPresetSelection,
  __resetPresetTemplate,
  goToLanding,
  selectChat,
  selectPreset,
  selectPresetSection,
  selectPresetTemplate,
  setPresetEditorView,
} from "@orb/client/state";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { PromptReadout } from "../../../../../../packages/client/src/features/preset/components/readout/prompt-readout.tsx";
import { TransformsReadout } from "../../../../../../packages/client/src/features/preset/components/readout/transforms-readout.tsx";
import { CtDataProviders } from "../../../../../support/ct/ct-data-providers.tsx";

const STORY_PRESET = castId<PresetId>("preset_ct_readoutbind");
const STORY_CHAT = castId<ChatId>("chat_ct_readoutbind");

/** The rack row the PROMPT stories select — the conversation CARRIER, the row whose whole point is that the
 *  editor cannot price it chat-free (`DEFAULT_PROMPT_CONFIG`'s own pivot id). */
const STORY_SECTION = "chat-history";

/** Open the preset on `view`; `chatId` non-null also makes that chat the active (last-open) one. Every axis is
 *  driven through its PRODUCTION store door, so the CT proves the projection rather than a prop. */
function useReadoutFixture(chatId: ChatId | null, view: string): void {
  useEffect(() => {
    selectPreset(STORY_PRESET);
    setPresetEditorView(view);
    // The SELECTIONS the readout echoes (§6.1: the row body selects, the readout resolves that row) — the
    // Actions template and the Prompt rack row.
    selectPresetTemplate("impersonate");
    selectPresetSection(STORY_SECTION);
    if (chatId !== null) {
      selectChat(chatId);
    }
    return (): void => {
      __resetPresetSelection();
      __resetPresetTemplate();
      goToLanding();
    };
  }, [chatId, view]);
}

function ReadoutFrame({ chatId, view }: { readonly chatId: ChatId | null; readonly view: string }): ReactElement {
  useReadoutFixture(chatId, view);
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
      <ReadoutFrame chatId={STORY_CHAT} view="actions" />
    </CtDataProviders>
  );
}

/** UNBOUND: no chat was ever opened — the honest-token arm, which must never render as a broken pane. */
export function PresetReadoutUnboundStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={null} view="actions" />
    </CtDataProviders>
  );
}

/** PROMPT + BOUND (D121-G): the rack priced by the bound chat's own assembly — real carrier costs and the
 *  selected carrier's materialized rows. */
export function PresetReadoutPromptBoundStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={STORY_CHAT} view="prompt" />
    </CtDataProviders>
  );
}

/** PROMPT + UNBOUND: the chat-free floor — carriers read `~—` and nothing is fetched to price them. */
export function PresetReadoutPromptUnboundStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={null} view="prompt" />
    </CtDataProviders>
  );
}

/** PARAMS + BOUND: the view the binding deliberately does NOT reach (`BINDING_VIEWS.params === false`) — a
 *  chip there would claim a resolution that is not happening. */
export function PresetReadoutParamsBoundStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={STORY_CHAT} view="params" />
    </CtDataProviders>
  );
}

/** The TRANSFORMS readout — the PIPELINE, both lanes, in execution order. Mounted directly (the binding is
 *  noise here): the pin is that the printed order IS the declared one, with every switch turned ON so no row
 *  can hide behind an "off" state. */
export function TransformsReadoutStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <TransformsReadout
          config={{
            ...DEFAULT_PROMPT_CONFIG,
            postProcess: { collapseNewlines: true, trimTrailingWhitespace: true, dropIncompleteSentence: true, singleLine: true },
            reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" },
          }}
          presetId={STORY_PRESET}
        />
      </div>
    </CtDataProviders>
  );
}

/** The PROMPT readout inside a SHORT scroller, with the disclosure trigger deliberately below the fold —
 *  the F-13 / R-6 geometry (measured live: the button at y≈778 in an 800px viewport, ~935px of preview
 *  rendered under it). Mounted directly rather than through `PresetReadout` because the defect is about the
 *  disclosure's own scroll behaviour, and the chat binding is noise here. */
export function PromptReadoutDisclosureStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-readout-scroller="" style={{ height: 300, overflowY: "auto", width: 380 }}>
        <PromptReadout boundChatId={null} presetId={STORY_PRESET} sections={DEFAULT_PROMPT_CONFIG.sections} selectedSectionId={null} />
      </div>
    </CtDataProviders>
  );
}
