// The canonical DISPLAY pipeline (UI-Arch §2.1 `lib/message-render` — carried from neo, where every
// text-showing surface routed through it). Three steps, one order, one home:
//
//   1. resolveRowMacros(text, stamps, ctx)             ← {{user}}/{{char}}/{{persona}} → live values,
//        via the ONE shared atom (`@orb/kit/macro`, Chat-Macro-Resolution.md §2) also called by server
//        ASSEMBLE — the row's OWN `characterId`/`personaId` stamps drive the subject, never a
//        caller-supplied "current" default except as the documented last resort.
//   2. executeRegexScripts(placement: "DISPLAY")      ← the D53 per-user CLIENT display tier:
//        the viewer's `markdownOnly` scripts, ephemeral, never canon/shared-prompt (host-tier
//        prompt regex ran server-side; promptOnly scripts are skipped ON the DISPLAY placement
//        by the engine itself)
//   3. fixMarkdown(text, forDisplay: true)            ← LLM artifact repair
//
// Output is a STRING for the `@orb/ui/markdown` renderer (Streamdown owns sanitize — this pipeline
// never emits HTML). NOT for composer/edit textareas (those keep `{{…}}` literal). Per-speaker
// `<speaker>` span splitting is a separate render step (§12.4) — spans survive this pipeline
// untouched and are consumed by the narrator renderer.

import { fixMarkdown } from "@orb/kit/fix-markdown";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type {
  MacroEnv,
  ProcessMacroOptions,
  RowCharacterName,
  RowPersonaName,
} from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";

export interface MessageRenderContext {
  /** The per-chat name PRODUCER (Chat-Macro-Resolution.md §1) — every id the chat references, id→name.
   *  Names only (never denormalized onto a row); a caller with no roster at all passes an empty Map
   *  (the kit atom's own "Character" floor still applies, never a blank erasure). */
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  /** The turn's own `{{char}}` default (the solo character / narrator cast-join) — used only when the
   *  ROW's own `characterId` doesn't resolve via the producer (§2). */
  readonly speakerCharName?: string | undefined;
  /** The speaking participant's CURRENT persona name — the null-stamp `{{user}}` fallback ONLY (§4);
   *  never a row's `{{user}}` subject when its own `personaId` resolves. */
  readonly activePersonaName?: string | undefined;
  readonly scenario?: string;
  /** The full cast names (drives `{{group}}`); omit for solo (cast-of-one falls out of `char`). */
  readonly cast?: readonly string[];
  /** The VIEWER's display-tier regex scripts (D53: per-user, client-side, ephemeral). */
  readonly displayScripts?: readonly RegexScriptInput[];
  /** Frozen clock for `{{time}}`/`{{date}}` (client-determinism; omit = live clock inside kit). */
  readonly nowMs?: number;
  /** The chat's variable bag for `{{getvar}}`/`{{if}}` (the D46 config/runtime planes). Omit = empty. */
  readonly env?: MacroEnv;
}

/**
 * Render a stored/authored/LLM message body for display. `rowCharacterId`/`rowPersonaId` are the
 * ROW's OWN stamps (`MessageView.characterId`/`.personaId`) — the same two ids that drive the #21
 * attribution chrome also drive the macro subject (Chat-Macro-Resolution.md §0), fed straight to
 * `resolveRowMacros` (the ONE atom server ASSEMBLE also calls, so DISPLAY == ASSEMBLE by construction).
 *
 * The subsequent DISPLAY-tier regex step also runs against a `ProcessMacroOptions` (a script's own
 * pattern/replacement may itself reference `{{char}}`/`{{user}}`) — resolved here via the SAME two
 * producer maps + the row's OWN stamps, mirroring `resolveRowMacros`'s lookup order. Its ultimate floor
 * is "" rather than kit's private "Character"/"User" literals (that floor is an unexported engine
 * constant): a fully-unresolved regex-ctx subject is a cosmetic nuance of that secondary, rarely-used
 * capability, never the primary substitution (which always goes through the real atom).
 */
export function renderMessageForDisplay(
  text: string,
  ctx: MessageRenderContext,
  rowCharacterId?: CharacterId | null,
  rowPersonaId?: PersonaId | null,
): string {
  const characterId = rowCharacterId ?? null;
  const personaId = rowPersonaId ?? null;

  const substituted = resolveRowMacros(
    text,
    { characterId, personaId },
    {
      characterNamesById: ctx.characterNamesById,
      personaNamesById: ctx.personaNamesById,
      speakerCharName: ctx.speakerCharName,
      activePersonaName: ctx.activePersonaName,
    },
  );

  const rowPersona = personaId === null ? undefined : ctx.personaNamesById.get(personaId);
  const macroCtx: ProcessMacroOptions = {
    char:
      (characterId === null ? undefined : ctx.characterNamesById.get(characterId)?.name) ??
      ctx.speakerCharName ??
      "",
    user: rowPersona?.name ?? ctx.activePersonaName ?? "",
    persona: rowPersona?.description ?? "",
    scenario: ctx.scenario ?? "",
    env: ctx.env ?? {},
    ...(ctx.cast === undefined ? {} : { cast: ctx.cast }),
    ...(ctx.nowMs === undefined ? {} : { nowMs: ctx.nowMs }),
  };

  const regexed =
    ctx.displayScripts === undefined || ctx.displayScripts.length === 0
      ? substituted
      : executeRegexScripts({
          text: substituted,
          scripts: ctx.displayScripts,
          placement: "DISPLAY",
          ctx: macroCtx,
          // Display tier: a failing viewer script silently skips (their own local transform —
          // never worth breaking the room render). The native replace default is "the browser's
          // lot" (D53 — the node:vm watchdog is a SERVER concern).
        });
  return fixMarkdown(regexed, true);
}
