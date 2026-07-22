// The imagery quiet-extraction shaper (imagery-design/02 §2), homed in chat because it needs chat's TWO
// things: a bounded recent-history window and the ONE MacroContext ({{char}}/{{user}} resolution). A STANDALONE
// factory (not a ChatContext op) built at compose from db + summarize + getCard — the `loadTurnForClassify`
// precedent. It resolves the mode template's macros against the subject/roster card, frames the recent canon as
// context, and runs the summarize side-LLM (low temp, a small keyword budget). Returns the raw reply text +
// that call's spend; imagery normalizes it (processReply) and decides empty-is-error. Never persisted, never
// streamed — the spend is attributed by imagery to the initiating principal.

import type { ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import type { ExtractQuiet, ExtractQuietDeps, ExtractQuietParams, ExtractQuietResult } from "../contract/context";
import { loadCanonHistory } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";

/** How many recent canon rows the extractor reads as scene context (the same window `smart` arbitration uses). */
const RECENT_WINDOW = 10;
/** A low temperature for a near-deterministic keyword extraction, and a budget sized for a keyword list, not prose. */
const EXTRACT_TEMPERATURE = 0.4;
const EXTRACT_MAX_TOKENS = 320;

export function createExtractQuiet(deps: ExtractQuietDeps): ExtractQuiet {
  return async (p: ExtractQuietParams): Promise<ExtractQuietResult> => {
    // {{char}} = the subject (or the roster's first present character), read under the HOST's ownership.
    const roster = await loadRoster(deps.db, p.chatId);
    const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
    const subjectId = p.subjectCharacterId ?? roster.find((r) => r.kind === "character" && r.characterId !== null)?.characterId ?? null;
    const charName = hostUserId !== null && subjectId !== null ? ((await deps.getCard({ ownerId: hostUserId, characterId: subjectId }))?.name ?? "") : "";

    // The bounded recent-history window (prompt-excluded rows dropped), as the scene the extractor reads.
    const canon = await loadCanonHistory(deps.db, p.chatId);
    const recent = canon
      .slice(-RECENT_WINDOW)
      .filter((m) => !m.excludedFromPrompt)
      .map((m) => m.content)
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
      cast: charName.length > 0 ? [charName] : [],
      env: {},
    };
    const instruction = processMacros(p.instruction, macroOptions);

    const scene = recent.length > 0 ? recent : "(the conversation is just starting)";
    const res = await deps.summarize([{ systemPrompt: instruction, userPrompt: `Recent conversation:\n${scene}` }], {
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
    });
    const item = res.items[0];
    return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
  };
}
