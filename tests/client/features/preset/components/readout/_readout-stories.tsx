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
import { EffectiveProfile } from "../../../../../../packages/client/src/features/preset/components/readout/readout-parts.tsx";
import { TransformsReadout } from "../../../../../../packages/client/src/features/preset/components/readout/transforms-readout.tsx";
import { CtDataProviders } from "../../../../../support/ct/ct-data-providers.tsx";

const STORY_PRESET = castId<PresetId>("preset_ct_readoutbind");
const STORY_CHAT = castId<ChatId>("chat_ct_readoutbind");

/** The rack row the PROMPT stories select — the conversation CARRIER, the row whose whole point is that the
 *  editor cannot price it chat-free (`DEFAULT_PROMPT_CONFIG`'s own pivot id). */
const STORY_SECTION = "chat-history";

/** Open the preset on `view`; `chatId` non-null also makes that chat the active (last-open) one. Every axis is
 *  driven through its PRODUCTION store door, so the CT proves the projection rather than a prop. `templateId`
 *  is the Actions selection the readout echoes — `impersonate` unless a story is about the per-KIND delivery
 *  dispatch (the Actions-tab IA §2.3), which is exactly a claim about which row is selected. */
function useReadoutFixture(chatId: ChatId | null, view: string, templateId = "impersonate"): void {
  useEffect(() => {
    selectPreset(STORY_PRESET);
    setPresetEditorView(view);
    // The SELECTIONS the readout echoes (§6.1: the row body selects, the readout resolves that row) — the
    // Actions template and the Prompt rack row.
    selectPresetTemplate(templateId);
    selectPresetSection(STORY_SECTION);
    if (chatId !== null) {
      selectChat(chatId);
    }
    return (): void => {
      __resetPresetSelection();
      __resetPresetTemplate();
      goToLanding();
    };
  }, [chatId, view, templateId]);
}

function ReadoutFrame({ chatId, view, templateId }: { readonly chatId: ChatId | null; readonly view: string; readonly templateId?: string }): ReactElement {
  useReadoutFixture(chatId, view, templateId);
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

/** A GAME-TURN TEACH selected (per-kind delivery, IA §2.3): the readout must state the steering-reminder
 *  truth, never the guided marker's. Unbound — the delivery dispatch is chat-free. */
export function PresetReadoutTeachSelectedStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={null} templateId="rpg.reminder.deceptionTeach" view="actions" />
    </CtDataProviders>
  );
}

/** An EXTRACTION row selected (per-kind delivery, IA §2.3): the state-round truth — these bytes never enter
 *  the chat prompt, and the braced tokens are seam-spliced DATA, not chat macros. */
export function PresetReadoutExtractSelectedStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={null} templateId="rpg.extract.tool.updateParty" view="actions" />
    </CtDataProviders>
  );
}

/** An EXTRACTION row selected WITH a bound chat: the bound gloss's deferred-token tail must state the
 *  state-round splice, never the guided family's "when you fire the action". */
export function PresetReadoutExtractBoundStory(): ReactElement {
  return (
    <CtDataProviders>
      <ReadoutFrame chatId={STORY_CHAT} templateId="rpg.extract.tool.updateParty" view="actions" />
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

// ── The EFFECTIVE-GENERATION panel's THREE ARMS, mounted PROP-DIRECT ────────────────────────────────────
// `EffectiveProfile` is a pure projection of `(effective, error)`, so each arm is a SETTLED rendered state
// with nothing in flight — the only shape that can pin the PENDING arm honestly. The obvious alternative
// (hold `preset.resolveEffective` open through the real readout) cannot work here: tRPC batches
// `preset.get` with it, so holding one holds both and the panel never mounts at all — it renders the
// enclosing "Loading the readout…" instead, and the assertion would be chasing a state the story cannot
// produce. The CALLER's half (that `preset-readout.tsx` hands the resolve's error down rather than only
// its data) is pinned separately, through the real readout, by the FAILED integration arm.

/** PENDING — an absent profile with NO error: the read has not landed, and the panel must claim nothing. */
export function EffectiveProfilePendingStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <EffectiveProfile effective={undefined} error={null} />
      </div>
    </CtDataProviders>
  );
}

/** FAILED — an absent profile WITH the server's message: a routing fault, stated as one. */
export function EffectiveProfileFailedStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <EffectiveProfile effective={undefined} error="incoherent routing (agent-sdk × local-light)" />
      </div>
    </CtDataProviders>
  );
}

/** SETTLED — the funnel's own row, its provenance rung, and the window the capability read supplied. */
export function EffectiveProfileSettledStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <EffectiveProfile
          contextWindow={32_768}
          effective={{
            model: "qwen3-32b",
            knobs: { maxOutputTokens: { value: 2048, provenance: "floor" } },
            stale: [],
            qualityMapping: null,
          }}
          error={null}
        />
      </div>
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
          attachable={true}
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

/** The TRANSFORMS readout on the SYSTEM DEFAULT preset — the one every new user has selected. It carries a
 *  null owner, so the attachment read refuses it by design; the readout must not fire that query at all and
 *  must say "off" as a KNOWN fact rather than as the residue of a 404. */
export function TransformsReadoutSystemDefaultStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <TransformsReadout attachable={false} config={DEFAULT_PROMPT_CONFIG} presetId={STORY_PRESET} />
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
