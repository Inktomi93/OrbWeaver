// The canonical display pipeline every text-showing surface routes through, three steps in order:
//   1. resolveRowMacros    — {{user}}/{{char}}/{{persona}} → live values, via the shared atom also
//                            called by server assemble; the row's own characterId/personaId stamps
//                            drive the subject.
//   2. executeRegexScripts (placement: "DISPLAY") — the viewer's markdownOnly scripts, ephemeral,
//                            never canon/shared-prompt.
//   3. fixMarkdown          — LLM artifact repair.
//
// Output is a string for the @orb/ui/markdown renderer (never HTML) — not for composer/edit
// textareas (those keep {{…}} literal).

import { fixMarkdown } from "@orb/kit/fix-markdown";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { MacroEnv, ProcessMacroOptions, RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import type { RegexReplacer, RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";

// DISPLAY-tier ReDoS guard (2026-08-09 DoS audit, finding #3). The DISPLAY tier runs UNWATCHED in the
// browser — there is no node:vm lever, so unlike the server's prompt-side legs it has no per-call timeout.
// The shared `tooComplex` pre-filter (@orb/kit/regex) counts quantifier STACKS and so deliberately admits
// the canonical catastrophic-backtracking shape `(a+)+` (one stack), which on a long non-matching subject
// freezes the viewer's tab — the abuse path being a shared / imported character's DISPLAY regex rendering
// in a CO-MEMBER's browser. We inject an `applyReplace` (the same seam the server fills with its node:vm
// watchdog) that REJECTS a nested-quantifier-over-a-group pattern before it runs; the executor's per-script
// try/catch turns the throw into a silent skip (display-tier posture: never break the room render).
//
// SCOPE / RESIDUAL (flagged, NOT built): this is a stronger PRE-FILTER, not a wall-clock timeout. A
// catastrophic pattern that EVADES the nested-quantifier shape (e.g. `(a|a)+`, polynomial blowup) still
// runs unguarded. A true browser timeout requires a Web Worker + terminate() deadline, which would make
// this synchronous, render-safe function async and reshape every caller — out of scope for a hardening
// pass. This closes the documented `(a+)+` class; the Worker is the follow-up for the residual.
const DISPLAY_NESTED_QUANTIFIER_RE = /[*+?}]\)[*+?{]/;

/** True for a regex source that applies a quantifier to a group ALREADY containing a quantifier
 *  (`(a+)+`, `(a*)*`, `(a+){2,}`, `([a-z]+)+`, …) — the exponential-backtracking family. A group with no
 *  inner quantifier (`(abc)+`, `(a|b)+`) and a plain pattern (`/sword/g`) are NOT flagged. */
export function isDisplayRegexTooComplex(source: string): boolean {
  return DISPLAY_NESTED_QUANTIFIER_RE.test(source);
}

// The DISPLAY-tier applyReplace: refuse the nested-quantifier shape, else native replace (the browser's
// only synchronous lever). A throw here is caught per-script by executeRegexScripts → silent skip.
function guardedDisplayReplace(text: string, regex: RegExp, replacer: RegexReplacer): string {
  if (isDisplayRegexTooComplex(regex.source)) {
    throw new Error("regex too complex for the display tier: nested quantifier over a group");
  }
  return text.replace(regex, replacer);
}

export interface MessageRenderContext {
  /** The per-chat name producer — every id the chat references, id→name. Names only; an empty Map is
   *  legal (the kit atom's own floor still applies). */
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
  /** The turn's own `{{char}}` default — used only when a voiced row's own characterId doesn't resolve. */
  readonly speakerCharName?: string | undefined;
  /** The chat anchor persona — the null-stamp `{{user}}`/`{{persona}}` fallback (never the viewer's own
   *  active persona). Never a row's subject when its own personaId resolves. */
  readonly fallbackPersonaName?: string | undefined;
  readonly fallbackPersonaDescription?: string | undefined;
  readonly scenario?: string;
  /** The full cast names in roster order — drives \{\{group\}\} and a human-authored/narrator row's
   *  \{\{char\}\} (joined cast in multi, the one character in solo). */
  readonly cast?: readonly string[];
  /** The viewer's display-tier regex scripts (per-user, client-side, ephemeral). */
  readonly displayScripts?: readonly RegexScriptInput[];
  /** Frozen clock for \{\{time\}\}/\{\{date\}\}; omit = live clock inside kit. */
  readonly nowMs?: number;
  /** The chat's variable bag for \{\{getvar\}\}/\{\{if\}\}. Omit = empty. */
  readonly env?: MacroEnv;
  /** ST `auto_fix_generated_markdown` parity. Default off: a settled body renders as-authored, so a
   *  deliberate lone asterisk (censoring — f*ck) is not auto-closed into a stray emphasis run. */
  readonly autoFixMarkdown?: boolean;
}

/** The `{{char}}` subject for the secondary display-tier regex ProcessMacroOptions — mirrors the
 *  primary atom: a voiced row resolves its own character (or speakerCharName), a human-authored /
 *  narrator row resolves the cast (joined in multi, one in solo). Floor "". */
function regexCtxChar(ctx: MessageRenderContext, characterId: CharacterId | null): string {
  if (characterId !== null) {
    return ctx.characterNamesById.get(characterId)?.name ?? ctx.speakerCharName ?? "";
  }
  const cast = ctx.cast;
  if (cast !== undefined && cast.length > 1) {
    return cast.join(", ");
  }
  return cast?.[0] ?? ctx.speakerCharName ?? "";
}

export function renderMessageForDisplay(text: string, ctx: MessageRenderContext, rowCharacterId?: CharacterId | null, rowPersonaId?: PersonaId | null): string {
  const characterId = rowCharacterId ?? null;
  const personaId = rowPersonaId ?? null;

  const substituted = resolveRowMacros(
    text,
    { characterId, personaId },
    {
      characterNamesById: ctx.characterNamesById,
      personaNamesById: ctx.personaNamesById,
      speakerCharName: ctx.speakerCharName,
      cast: ctx.cast,
      fallbackPersonaName: ctx.fallbackPersonaName,
      fallbackPersonaDescription: ctx.fallbackPersonaDescription,
    },
  );

  const rowPersona = personaId === null ? undefined : ctx.personaNamesById.get(personaId);
  const macroCtx: ProcessMacroOptions = {
    char: regexCtxChar(ctx, characterId),
    user: rowPersona?.name ?? ctx.fallbackPersonaName ?? "",
    persona: rowPersona?.description ?? ctx.fallbackPersonaDescription ?? "",
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
          // The browser has no node:vm; this seam is the DISPLAY tier's ReDoS lever (guardedDisplayReplace).
          applyReplace: guardedDisplayReplace,
          // Display tier: a failing viewer script silently skips — never worth breaking the room render.
        });
  return ctx.autoFixMarkdown === true ? fixMarkdown(regexed, true) : regexed;
}
