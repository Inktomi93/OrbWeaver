// The canonical display pipeline every text-showing surface routes through, three steps in order:
//   1. resolveRowMacros    — {{user}}/{{char}}/{{persona}} → live values, via the shared atom also
//                            called by server assemble; the row's own characterId/personaId stamps
//                            drive the subject.
//   2. executeRegexScripts (placement: "DISPLAY") — the viewer's display scripts, ephemeral,
//                            never canon/shared-prompt.
//   3. fixMarkdown          — LLM artifact repair.
//
// Output is a string for the @orb/ui/markdown renderer (never HTML) — not for composer/edit
// textareas (those keep {{…}} literal).
//
// SCRIPTS NEVER RUN ON THE BROWSER'S MAIN THREAD. A display script is untrusted input written by someone else
// (an imported preset, a card, a host's broadcast) running on text written by yet other people, and the
// browser has no per-call regex timeout. So step 2 runs in the display-pass Worker
// (`display-pass.worker.ts`), which the main thread can terminate on a deadline (`display-pass-runner.ts`).
// This module holds the pure pieces both sides call: steps 1 and 3 run on the main thread around the Worker,
// and `applyDisplayScript` is the kit executor call the Worker makes, one script at a time. A browser surface
// reads the whole pipeline through `useDisplayText` (`#data`); `renderMessageForDisplay` runs every step on
// the calling thread and is therefore for Node callers and for a context with no scripts only, which is why
// the `#lib` barrel does not export it.

import type { RegexScriptRow } from "@orb/contracts/regex";
import { fixMarkdown } from "@orb/kit/fix-markdown";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { MacroEnv, ProcessMacroOptions, RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import { executeRegexScripts } from "@orb/kit/regex";

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
  /** The full character names in roster order — drives \{\{group\}\} and a human-authored/narrator row's
   *  \{\{char\}\} (joined characters in multi, the one character in solo). */
  readonly characterNames?: readonly string[];
  /** The viewer's display-tier regex scripts in run order (per-user, client-side, ephemeral). The row identity
   *  rides along so a script the deadline stops can be named and kept stopped. */
  readonly displayScripts?: readonly RegexScriptRow[];
  /** Frozen clock for \{\{time\}\}/\{\{date\}\}; omit = live clock inside kit. */
  readonly nowMs?: number;
  /** The chat's variable bag for \{\{getvar\}\}/\{\{if\}\}. Omit = empty. */
  readonly env?: MacroEnv;
  /** ST `auto_fix_generated_markdown` parity. Default off: a settled body renders as-authored, so a
   *  deliberate lone asterisk (censoring — f*ck) is not auto-closed into a stray emphasis run. */
  readonly autoFixMarkdown?: boolean;
}

/** Step 2's whole input, as plain data: it crosses to the Worker by structured clone. */
export interface DisplayPass {
  /** The row text after step 1. */
  readonly text: string;
  readonly scripts: readonly RegexScriptRow[];
  /** The macro context for the scripts' find and replace templates. */
  readonly macroCtx: ProcessMacroOptions;
}

const NO_SCRIPTS: readonly RegexScriptRow[] = [];

/** The `{{char}}` subject for the secondary display-tier regex ProcessMacroOptions — mirrors the
 *  primary atom: a voiced row resolves its own character (or speakerCharName), a human-authored /
 *  narrator row resolves the characters (joined in multi, one in solo). Floor "". */
function regexCtxChar(ctx: MessageRenderContext, characterId: CharacterId | null): string {
  if (characterId !== null) {
    return ctx.characterNamesById.get(characterId)?.name ?? ctx.speakerCharName ?? "";
  }
  const characterNames = ctx.characterNames;
  if (characterNames !== undefined && characterNames.length > 1) {
    return characterNames.join(", ");
  }
  return characterNames?.[0] ?? ctx.speakerCharName ?? "";
}

/** Step 1, and the plain-data input of step 2. */
export function prepareDisplayPass(text: string, ctx: MessageRenderContext, rowCharacterId?: CharacterId | null, rowPersonaId?: PersonaId | null): DisplayPass {
  const characterId = rowCharacterId ?? null;
  const personaId = rowPersonaId ?? null;

  const substituted = resolveRowMacros(
    text,
    { characterId, personaId },
    {
      characterNamesById: ctx.characterNamesById,
      personaNamesById: ctx.personaNamesById,
      speakerCharName: ctx.speakerCharName,
      characterNames: ctx.characterNames,
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
    ...(ctx.characterNames === undefined ? {} : { characterNames: ctx.characterNames }),
    ...(ctx.nowMs === undefined ? {} : { nowMs: ctx.nowMs }),
  };
  return { text: substituted, scripts: ctx.displayScripts ?? NO_SCRIPTS, macroCtx };
}

/** One script of step 2 through the kit executor. The executor is a fold over its script list, so a call per
 *  script gives the same text as one call over the whole list; the Worker calls it per script so the main
 *  thread learns which script is running. A script that fails to compile or throws is skipped silently: a
 *  viewer's broken script is never worth breaking the room render. */
export function applyDisplayScript(text: string, script: RegexScriptRow, macroCtx: ProcessMacroOptions): string {
  return executeRegexScripts({ text, scripts: [script], placement: "DISPLAY", ctx: macroCtx });
}

/** Step 3. */
export function finishDisplayPass(text: string, ctx: MessageRenderContext): string {
  return ctx.autoFixMarkdown === true ? fixMarkdown(text, true) : text;
}

/** All three steps on the calling thread. In the browser this is only correct for a context with no display
 *  scripts; `useDisplayText` is the browser door. */
export function renderMessageForDisplay(text: string, ctx: MessageRenderContext, rowCharacterId?: CharacterId | null, rowPersonaId?: PersonaId | null): string {
  const pass = prepareDisplayPass(text, ctx, rowCharacterId, rowPersonaId);
  return finishDisplayPass(
    pass.scripts.reduce((running, script) => applyDisplayScript(running, script, pass.macroCtx), pass.text),
    ctx,
  );
}
