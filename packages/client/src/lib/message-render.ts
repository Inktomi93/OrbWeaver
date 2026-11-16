// The canonical display pipeline every text-showing surface routes through, three steps in order:
//   1. resolveRowMacros    — {{user}}/{{char}}/{{persona}} → live values, via the shared atom also
//                            called by server assemble; the row's own characterId/personaId stamps
//                            drive the subject. A name resolves as HTML data. Steps 1 and 3 leave code a frame runs as written.
//   2. executeRegexScripts (the display pass) — the viewer's display scripts over the row's target, author
//                            stamps, depth and room; ephemeral, never canon or the shared prompt. It also
//                            reports whether a script's own template drew markup (`display-styled.ts`).
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
// reads the whole pipeline through `useDisplayText` (`features/chat/hooks/use-display-text.ts`); `renderMessageForDisplay` runs every step on
// the calling thread and is therefore for Node callers and for a context with no scripts only, which is why
// the `#lib` barrel does not export it.

import type { RegexScriptRow } from "@orb/contracts/regex";
import { escapeHtmlData, mapOutsideCode } from "@orb/kit/content";
import { fixMarkdown } from "@orb/kit/fix-markdown";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { MacroEnv, ProcessMacroOptions, RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import type { RoomStanding } from "@orb/kit/message-author";
import type { RegexPass, RegexPassCall, RegexRowStamps } from "@orb/kit/regex";
import { regexSkipReason } from "@orb/kit/regex";
import type { StyledDisplayText } from "./display-styled.ts";
import { executeDisplayScripts } from "./display-styled.ts";

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
  /** The viewer's display scripts in run order, already narrowed to enabled scripts whose passes include the
   *  display pass. The row identity rides along so a script the deadline stops can be named and kept stopped. */
  readonly displayScripts?: readonly RegexScriptRow[];
  /** The room's display scripts have not arrived yet, so a settled row holds rather than draw its raw text. */
  readonly displayScriptsLoading?: true;
  /** The room's present human seats, which a display script scoped by its author's standing reads. */
  readonly room: RoomStanding;
  /** Frozen clock for \{\{time\}\}/\{\{date\}\}; omit = live clock inside kit. */
  readonly nowMs?: number;
  /** The chat's variable bag for \{\{getvar\}\}/\{\{if\}\}. Omit = empty. */
  readonly env?: MacroEnv;
  /** ST `auto_fix_generated_markdown` parity. Default off: a settled body renders as-authored, so a
   *  deliberate lone asterisk (censoring — f*ck) is not auto-closed into a stray emphasis run. */
  readonly autoFixMarkdown?: boolean;
}

/** The executor's display call over one row's text: its target (the body's, or `REASONING`), the row's own author
 *  stamps, its depth among the rows the count admits, and the room. */
export type DisplayCall = Extract<RegexPassCall, { readonly row: RegexRowStamps }> & { readonly pass: typeof DISPLAY_PASS };

/** What a caller says about the row it renders. Every part is required, so no call site can run an author- or
 *  depth-scoped script on every row; the room comes from the render context. */
export type DisplayRowCall = Pick<DisplayCall, "target" | "row" | "depth">;

/** Step 2's whole input, as plain data: it crosses to the Worker by structured clone. */
export interface DisplayPass {
  /** The row text after step 1. */
  readonly text: string;
  /** The scripts that run on this call, in order: the context's set through the executor's own gate. */
  readonly scripts: readonly RegexScriptRow[];
  /** Each running script's index in the context's set. The output depends on the call only through which scripts
   *  run, so this, not the call, is what a cache key needs: a depth shift that changes no script's verdict keeps
   *  the cached answer. */
  readonly running: readonly number[];
  /** The macro context for the scripts' find and replace templates. */
  readonly macroCtx: ProcessMacroOptions;
  readonly call: DisplayCall;
}

const DISPLAY_PASS = "display" satisfies RegexPass;

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

/** Step 1, and the plain-data input of step 2. The row's own stamps are the macro subjects too. */
export function prepareDisplayPass(text: string, ctx: MessageRenderContext, display: DisplayRowCall): DisplayPass {
  const { characterId, personaId } = display.row;

  const names = {
    characterNamesById: ctx.characterNamesById,
    personaNamesById: ctx.personaNamesById,
    speakerCharName: ctx.speakerCharName,
    characterNames: ctx.characterNames,
    fallbackPersonaName: ctx.fallbackPersonaName,
    fallbackPersonaDescription: ctx.fallbackPersonaDescription,
  };
  // A name is another reader's text, so it is data, never markup: resolved escaped, and never inside code a frame runs.
  const substituted = mapOutsideCode(text, (piece) => resolveRowMacros(piece, { characterId, personaId }, names, escapeHtmlData));

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
  const call: DisplayCall = { pass: DISPLAY_PASS, ...display, room: ctx.room };
  const scripts: RegexScriptRow[] = [];
  const running: number[] = [];
  for (const [index, script] of (ctx.displayScripts ?? []).entries()) {
    if (regexSkipReason(script, call) === null) {
      scripts.push(script);
      running.push(index);
    }
  }
  return { text: substituted, scripts, running, macroCtx, call };
}

/** One script of step 2 through the kit executor. The executor is a fold over its script list, so a call per
 *  script gives the same text as one call over the whole list; the Worker calls it per script so the main
 *  thread learns which script is running. A script that fails to compile or throws is skipped silently: a
 *  viewer's broken script is never worth breaking the room render. */
export function applyDisplayScript(text: string, script: RegexScriptRow, macroCtx: ProcessMacroOptions, call: DisplayCall): StyledDisplayText {
  return executeDisplayScripts({ text, scripts: [script], call, ctx: macroCtx });
}

/** Step 3. A style or script body is code, not Markdown, so the repair leaves it as written. */
export function finishDisplayPass(text: string, ctx: MessageRenderContext): string {
  return ctx.autoFixMarkdown === true ? mapOutsideCode(text, (piece) => fixMarkdown(piece, true)) : text;
}

/** All three steps on the calling thread, and whether a script's own template drew markup. In the browser this is
 *  only correct for a context with no display scripts; `useDisplayText` is the browser door. */
export function renderStyledMessageForDisplay(text: string, ctx: MessageRenderContext, display: DisplayRowCall): StyledDisplayText {
  const pass = prepareDisplayPass(text, ctx, display);
  const scripted = pass.scripts.reduce<StyledDisplayText>(
    (running, script) => {
      const next = applyDisplayScript(running.text, script, pass.macroCtx, pass.call);
      return { text: next.text, styled: running.styled || next.styled };
    },
    { text: pass.text, styled: false },
  );
  return { text: finishDisplayPass(scripted.text, ctx), styled: scripted.styled };
}

/** {@link renderStyledMessageForDisplay}'s text. */
export function renderMessageForDisplay(text: string, ctx: MessageRenderContext, display: DisplayRowCall): string {
  return renderStyledMessageForDisplay(text, ctx, display).text;
}
