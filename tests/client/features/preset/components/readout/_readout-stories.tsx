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
  useActiveChatId,
  useActiveSection,
} from "@orb/client/state";
import type { PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { PromptReadout } from "../../../../../../packages/client/src/features/preset/components/readout/prompt-readout.tsx";
import { CapabilityCard, EffectiveProfile } from "../../../../../../packages/client/src/features/preset/components/readout/readout-parts.tsx";
import { TransformsReadout } from "../../../../../../packages/client/src/features/preset/components/readout/transforms-readout.tsx";
import { CtDataProviders } from "../../../../../support/browser/ct-data-providers.tsx";
import { makeGenerationCapability } from "../../../../../support/factories/resolved-connection.ts";

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

/** {@link PresetReadoutParamsBoundStory} with FOCUS-REFETCH OFF — for the pin that Retry itself issues the
 *  re-read. An errored query is stale, so react-query's `refetchOnWindowFocus` (v5 default `true`) would heal
 *  the panel on any focus event between the failure barrier and the assertion, passing the test without the
 *  affordance ever working. Its own story rather than a flag on the shared one: every OTHER readout pin
 *  should keep production's default. */
export function PresetReadoutRetryStory(): ReactElement {
  return (
    <CtDataProviders refetchOnWindowFocus={false}>
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

// A thrown read, shaped the way the tRPC CLIENT hands one to a caller: `message` plus the structured
// `data.code` the server's own DomainError→code mapper produced. The failure band discriminates on that
// code (`lib/resolve-failure.ts`), so the arms below differ ONLY in the code — a story that flattened the
// error to a string could not exercise the discrimination at all.
function readError(code: string | undefined, message: string): unknown {
  return code === undefined ? { message } : { message, data: { code } };
}

/** Records that Retry actually fired — the affordance is only real if the click reaches the caller. */
function RetryProbe({ error }: { readonly error: unknown }): ReactElement {
  const [retries, setRetries] = useState(0);
  return (
    <div style={{ width: 380 }}>
      <EffectiveProfile
        effective={undefined}
        error={error}
        onRetry={(): void => {
          setRetries((n) => n + 1);
        }}
      />
      <span data-testid="retry-count">{retries}</span>
    </div>
  );
}

function noRetry(): void {
  // The PENDING and SETTLED arms never render the failure band, so nothing can call this.
}

/** PENDING — an absent profile with NO error: the read has not landed, and the panel must claim nothing. */
export function EffectiveProfilePendingStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <EffectiveProfile effective={undefined} error={null} onRetry={noRetry} />
      </div>
    </CtDataProviders>
  );
}

/** FAILED (ROUTING) — the `BAD_REQUEST` the capability resolution refuses with. This is the ONE code that
 *  earns the "routing problem, not a missing connection" verdict, and it must still print it verbatim. */
export function EffectiveProfileFailedStory(): ReactElement {
  return (
    <CtDataProviders>
      <RetryProbe error={readError("BAD_REQUEST", "incoherent routing (agent-sdk × local-light)")} />
    </CtDataProviders>
  );
}

/** FAILED (PRESET GONE) — `NOT_FOUND`: the preset row itself is unreadable (deleted in another tab). The
 *  routing verdict is simply false here, which is the 2026-08-08 defect. */
export function EffectiveProfileMissingPresetStory(): ReactElement {
  return (
    <CtDataProviders>
      <RetryProbe error={readError("NOT_FOUND", "preset not found")} />
    </CtDataProviders>
  );
}

/** FAILED (TRANSPORT) — a raw thrown value with NO tRPC `data` at all: a dropped socket / a 500. We know
 *  the read failed and nothing else, so the band may name no cause. */
export function EffectiveProfileTransportFailureStory(): ReactElement {
  return (
    <CtDataProviders>
      <RetryProbe error={readError(undefined, "Failed to fetch")} />
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
          onRetry={noRetry}
        />
      </div>
    </CtDataProviders>
  );
}

/** A SELF-HOSTED engine's model identifier: a 106-character local weights path (#115). Spelled here AND in
 *  the CT (a `_ct-stories` module may export only components — playwright-ct rewrites named imports into
 *  generated component consts, so a shared constant cannot cross this boundary). */
const LOCAL_WEIGHTS_PATH = "/mnt/models/storage/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token";

/** THE #115 PANEL — both places that name the model, in one 380px CONTEXT-panel column, driven by the model
 *  identifier that broke it. `EffectiveProfile` signs its numbers with `resolved for …`; `CapabilityCard`
 *  carries the `model` datum row ~100px above it. Before the display derivation the panel printed all 106
 *  characters TWICE and wrapped the capability row onto four lines. */
export function LongModelPathReadoutStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <CapabilityCard capability={makeGenerationCapability()} model={LOCAL_WEIGHTS_PATH} />
        <EffectiveProfile
          contextWindow={32_768}
          effective={{
            model: LOCAL_WEIGHTS_PATH,
            knobs: { maxOutputTokens: { value: 2048, provenance: "floor" } },
            stale: [],
            qualityMapping: null,
          }}
          error={null}
          onRetry={noRetry}
        />
        {/* The NO-OP arm, in the same mount (playwright-ct allows one `mount` per test): a hosted id is
            already its own display name, so the row must carry NO gloss. */}
        <div data-testid="hosted-id-panel">
          <CapabilityCard capability={makeGenerationCapability()} model="claude-opus-4-8" />
        </div>
      </div>
    </CtDataProviders>
  );
}

/** PENDING **beside** the SETTLED panel it is standing in for — ONE story, because playwright-ct allows one
 *  `mount` per test and the pin is a COMPARISON (side-eye 2026-08-08 P2). `PENDING_ROWS` is 4, so the settled
 *  half carries three resolved knobs plus the window row: the four `DatumRow`s the four placeholder rows
 *  claim to be holding space for. Same 380px width, so only the vertical anatomy differs. */
export function EffectiveProfileShapeMatchStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", gap: 24 }}>
        <div data-testid="pending-panel" style={{ width: 380 }}>
          <EffectiveProfile effective={undefined} error={null} onRetry={noRetry} />
        </div>
        <div data-testid="settled-panel" style={{ width: 380 }}>
          <EffectiveProfile
            contextWindow={32_768}
            effective={{
              model: "qwen3-32b",
              knobs: {
                temperature: { value: 0.8, provenance: "explicit" },
                topP: { value: 0.95, provenance: "explicit" },
                maxOutputTokens: { value: 2048, provenance: "floor" },
              },
              stale: [],
              qualityMapping: null,
            }}
            error={null}
            onRetry={noRetry}
          />
        </div>
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

/**
 * The readout with the BACKWARD-BINDINGS block in play (#279), on the PARAMS view and with NO chat bound.
 *
 * The view is `params` on purpose: the usage block is deliberately outside the per-view `BINDING_VIEWS`
 * table (what depends on this preset is a property of the preset, not of the hand you are using), so
 * pinning it on the one view the chat binding explicitly does NOT reach proves it is not riding the binding.
 * Unbound for the same reason the door assertion needs it: with no chat ever selected, `section`/`chat`
 * below start at their idle values, so a click that changes them is the door's own write and nothing else's.
 */
export function PresetReadoutUsageStory(): ReactElement {
  return (
    <CtDataProviders>
      <PresetNavProbe />
      <ReadoutFrame chatId={null} view="params" />
    </CtDataProviders>
  );
}

/** The two stores a room door writes — asserted at the STORE ACTION, because this story mounts no chats
 *  section to echo the navigation. */
function PresetNavProbe(): ReactElement {
  return (
    <output>
      section={useActiveSection()} chat={useActiveChatId() ?? "none"}
    </output>
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

/** THE SKEWED BUDGET the meter column has to survive (side-eye 2026-08-22 P2-7) — the live shape, minted
 *  rather than sampled so it cannot drift: ONE section owning the scale (`Instructions`, ~400 of ~505
 *  tokens — the report measured ~393 of ~896), several two-and-three-token rows whose linear fill rounds to
 *  a 0.7px sliver on the 146px rail, and one DISABLED row that is far from negligible. The last is the
 *  finding's core: "off" and "costs almost nothing" drew the same empty track, and they are opposite
 *  decisions.
 *
 *  The width is the disclosure story's (380px) because that is the CONTEXT panel's real docked width, which
 *  is what makes the rail 146px and the sliver sub-pixel. */
const METER_SECTIONS: readonly PromptSection[] = [
  { type: "literal", id: "sec_big", name: "Instructions", role: "system", content: "x".repeat(1600), enabled: true },
  { type: "literal", id: "sec_tiny_a", name: "Tiny A", role: "system", content: "12345678", enabled: true },
  { type: "literal", id: "sec_tiny_b", name: "Tiny B", role: "system", content: "123456789012", enabled: true },
  { type: "literal", id: "sec_off", name: "Off big", role: "system", content: "y".repeat(400), enabled: false },
  { type: "marker", id: "sec_pivot", name: "Chat history", marker: "chat_history", role: "system", enabled: true },
];

export function PromptReadoutMeterStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 380 }}>
        <PromptReadout boundChatId={null} presetId={STORY_PRESET} sections={METER_SECTIONS} selectedSectionId={null} />
      </div>
    </CtDataProviders>
  );
}
