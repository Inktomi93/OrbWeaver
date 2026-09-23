// The imagery quiet-extraction shaper, homed in chat because it needs chat's TWO
// things: a bounded recent-history window and the ONE MacroContext ({{char}}/{{user}} resolution). A STANDALONE
// factory (not a ChatContext op) built at compose from db + summarize + getCard. It resolves the mode
// template's macros against the subject/roster card, frames the recent canon as
// context, and runs the summarize side-LLM (low temp, a small keyword budget). Returns the raw reply text +
// that call's spend; imagery normalizes it (processReply) and decides empty-is-error. Never persisted, never
// streamed — the spend is attributed by imagery to the initiating principal.
//
// IMGMAC (owner ruling: YES) — THE USER-MACRO PLANE REACHES HERE. This shaper called `processMacros` with the
// process default registry and NOTHING else, so an imagery mode template could resolve `{{char}}`/`{{user}}`
// and nothing a host ever authored: `{{house_style}}` survived into the image prompt as literal braces, and
// the settings surface had to carry a written exemption saying so. The template now renders against a PER-CALL
// registry built from the SAME two authoring homes and the SAME shadow policy a turn uses
// (`buildTurnUserMacros` — preset defs + game defs, game wins on a name clash), over the chat's persisted picks
// bag. It is NOT a turn: the prng is stable and no draw record is persisted (the preview posture), so two
// extractions of one scene resolve identically. A chat that declared no macros takes the null fast path and is
// byte-identical to before.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveSideGenSampling } from "@orb/inference";
import { projectBodyForSummary } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import type { MacroRegistry, ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import type { ExtractQuiet, ExtractQuietDeps, ExtractQuietParams, ExtractQuietResult } from "../contract/context.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadCanonHistory, loadStoredUserMacroValues } from "../persistence/queries.ts";
import { buildTurnUserMacros } from "../substrate/assembly-access.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";
import { isPromptEligible } from "../substrate/prompt-eligibility.ts";

/** How many recent canon rows the extractor reads as scene context (the same window `smart` arbitration uses). */
const RECENT_WINDOW = 10;

/** The `MacroSourceRef.id` the preset group carries here. Extract-quiet never SURFACES a source ref (there is
 *  no picks pane and no refusal channel on this path — a rejected def just doesn't render), so the group id is
 *  a label, and re-resolving the host's preset id for it would buy a db read for a log field. The preview
 *  builder's `presetId ?? "default"` fallback is the same literal. */
const PRESET_GROUP_ID = "default";

/** IMGMAC — the PER-CALL user-macro render registry for one imagery mode template. Builds over BOTH authoring
 *  homes with the ruled shadow (`buildTurnUserMacros` owns the policy), the chat's persisted picks bag, and a
 *  STABLE prng (`() => 0`): an extraction is not a turn — it persists no draw record, so a random-pick input
 *  must not consume a turn's entropy or vary between two extractions of the same scene (the preview builder's
 *  posture, `verbs/read.ts::buildPreviewRegistry`). `undefined` ⇒ neither home declared anything ⇒ the caller
 *  falls back to the process singleton, byte-identically to before this plane existed. */
async function resolveUserMacroRegistry(deps: ExtractQuietDeps, chatId: ChatId): Promise<MacroRegistry | undefined> {
  const defs = await deps.resolveUserMacroDefs(chatId);
  if (defs.preset.length === 0 && defs.game.length === 0) {
    return; // the null fast path — no values read, no registry allocated
  }
  const built = buildTurnUserMacros({
    preset: { id: PRESET_GROUP_ID, defs: defs.preset },
    // The game group's `MacroSourceRef.id` is the game's CHAT id (the turn build's convention).
    ...(defs.game.length > 0 ? { game: { id: chatId, defs: defs.game } } : {}),
    values: await loadStoredUserMacroValues(deps.db, chatId),
    prng: () => 0,
  });
  return built?.registry;
}

export function createExtractQuiet(deps: ExtractQuietDeps): ExtractQuiet {
  return async (p: ExtractQuietParams): Promise<ExtractQuietResult> => {
    // {{char}} = the subject (or the roster's first present character), read under the HOST's ownership.
    const participants = await loadParticipants(deps.db, p.chatId);
    const hostUserId = hostUserIdOf(participants);
    const firstPresentCharacterId = participants.flatMap((r) => {
      const actor = classifyParticipant(r);
      return actor?.kind === "character" ? [actor.characterId] : [];
    })[0];
    const subjectId = p.subjectCharacterId ?? firstPresentCharacterId ?? null;
    const charName = hostUserId !== null && subjectId !== null ? ((await deps.getCard({ ownerId: hostUserId, characterId: subjectId }))?.name ?? "") : "";

    // The bounded recent-history window (ineligible rows dropped), as the scene the extractor reads.
    // VIEWER-CLAMPED FIRST: `loadCanonHistory` is a room-plane (floorless) reader, but this product is a model
    // DISTILLATION handed back to ONE human (`imagery.extractPrompt` returns the prompt string on the wire), so
    // rows below that caller's own D16 floor must never enter the scene. Unlike a turn reply this is not one
    // shared utterance, so clamping it per reader is coherent (it forks nothing). Filtering BEFORE the window
    // slice is deliberate — a clamped caller still gets a full RECENT_WINDOW of rows they may actually see.
    // Floor 0 (the common `full` case) is inert: `messages.seq` is 1-based.
    //
    // PROMPT ELIGIBILITY IS PART OF THAT SAME "may actually see" (#1463 items 3+4), so it is resolved on the
    // same side of the slice: a tail of prompt-hidden rows must not starve the window of the ten real rows it
    // exists to carry. And the verdict is the SHARED one (`isPromptEligible` — the host's hide AND the row's
    // declared purpose), not a local re-spell: this is a prompt boundary into a side model, so a `comment` row
    // (D129 `prompt:"never"`) is no more sendable here than it is to the compaction marker.
    const canon = await loadCanonHistory(deps.db, p.chatId);
    const recent = canon
      .filter((m) => m.seq >= p.historyFloorSeq && isPromptEligible(m))
      .slice(-RECENT_WINDOW)
      // §3.6 / D106 summary-plane strip (the compaction-sink ruling): the extractor's distillation is handed
      // back on the wire (and can seed a durable, member-peekable prompt), so hidden-class spans NEVER enter the
      // model's scene — a lie's truth must not launder into an image prompt. Cards collapse to their stub too.
      .map((m) => projectBodyForSummary(m.content))
      .join("\n");

    // Resolve the template's identity macros against the ONE MacroContext. {{user}} defaults to "User" until a
    // template needs the anchor persona (criterion-to-add: a custom instruction that reads {{user}} → thread the
    // anchor-persona name here). The transcript is passed raw (its own {{macros}} are reference context, and
    // re-resolving volatile macros with a side context would misrender — the `smart` arbiter reads raw too).
    const macroOptions: ProcessMacroOptions = {
      char: charName,
      user: "User",
      persona: "",
      scenario: "",
      characterNames: charName.length > 0 ? [charName] : [],
      env: {},
    };
    const instruction = processMacros(p.instruction, macroOptions, await resolveUserMacroRegistry(deps, p.chatId));

    const scene = recent.length > 0 ? recent : "(the conversation is just starting)";
    // The side-gen sampling ladder: the `extract_quiet` floor (temp 0.4, 320 out — near-deterministic keyword
    // extraction) ← the chat host's default-preset params (extract-quiet is chat-scoped).
    const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.extract_quiet, await deps.resolveChatPresetParams(p.chatId));
    const res = await deps.summarize(p.funderUserId, [{ systemPrompt: instruction, userPrompt: `Recent conversation:\n${scene}` }], posture);
    const item = res.items[0];
    return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
  };
}
