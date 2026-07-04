// The canonical DISPLAY pipeline (UI-Arch §2.1 `lib/message-render` — carried from neo, where every
// text-showing surface routed through it). Three steps, one order, one home:
//
//   1. processMacros(text, ctx)                       ← {{user}}/{{char}}/… → live values
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
import type { CharacterId } from "@orb/kit/ids";
import type { MacroEnv, ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";

export interface MessageRenderContext {
  /** The DEFAULT `{{char}}` — the solo character / the fallback for rows with no known speaker. */
  readonly characterName: string;
  /** Group cast names by id: a row voiced by a cast member resolves `{{char}}` to THAT name. */
  readonly characterNamesById?: ReadonlyMap<CharacterId, string>;
  /** The viewer's persona display name — fills `{{user}}`. */
  readonly userName: string;
  /** The viewer's persona description — fills `{{persona}}`. */
  readonly personaDescription?: string;
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
 * Render a stored/authored/LLM message body for display. `rowCharacterId` is the row's voiced
 * speaker (group chats) — it re-targets `{{char}}` per row; solo callers omit it.
 */
export function renderMessageForDisplay(
  text: string,
  ctx: MessageRenderContext,
  rowCharacterId?: CharacterId | null,
): string {
  const rowName =
    rowCharacterId === undefined || rowCharacterId === null
      ? undefined
      : ctx.characterNamesById?.get(rowCharacterId);

  const macroCtx: ProcessMacroOptions = {
    char: rowName ?? ctx.characterName,
    user: ctx.userName,
    persona: ctx.personaDescription ?? "",
    scenario: ctx.scenario ?? "",
    env: ctx.env ?? {},
    ...(ctx.cast === undefined ? {} : { cast: ctx.cast }),
    ...(ctx.nowMs === undefined ? {} : { nowMs: ctx.nowMs }),
  };

  const substituted = processMacros(text, macroCtx);
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
