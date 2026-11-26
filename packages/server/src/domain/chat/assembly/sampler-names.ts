// domain/chat/assembly/sampler-names — the room's names where a sampler reads them as literal strings: DRY's
// sequence breakers and a word list's allow list. The server on the far side knows no `{{char}}`, so every
// breaker is rendered here through the turn's own macro context (`renderMacros`), as the prompt renders it.
//
// A name is also its words. DRY ends a repeat at a breaker it sees, and a later mention may use only "Mary" of
// "Mary Jane Watson", so a breaker that is one macro and renders to several words adds each word beside the whole
// name; the allow list carries the same parts, since a word list holds single names.
//
// A breaker may arrive in any form the sampler UIs write: a list entry, a JSON array string (SillyTavern's own
// `dry_sequence_breakers`), or text-generation-webui's comma-separated quoted strings (`"\n", ":"`). Each becomes
// its literal strings; a text that parses as neither is one literal breaker.

import type { AssembleContext } from "@orb/contracts/chat";
import { parseJsonText } from "@orb/kit/json";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { z } from "zod";
import type { RenderMacrosOptions } from "../contract/assembly-macros.ts";
import { renderMacros } from "./macros.ts";

const stringListSchema = z.array(z.string());
// A whole entry that is one macro, `{{char}}` or `{{ user }}`: its rendering is a name whose words also break.
const SINGLE_MACRO = /^\{\{[^{}]+\}\}$/u;
// Words of a rendered name: a group macro joins its names with commas.
const NAME_WORD_SEPARATOR = /[\s,]+/u;

function parsedList(text: string): readonly string[] | null {
  const parsed = stringListSchema.safeParse(parseJsonText(text));
  return parsed.success ? parsed.data : null;
}

/** One entry's literal breakers before rendering: a JSON array, the quoted comma form, or the text itself. */
function entryForms(entry: string): readonly string[] {
  const trimmed = entry.trim();
  if (trimmed.startsWith("[")) {
    return parsedList(trimmed) ?? [entry];
  }
  if (trimmed.startsWith('"')) {
    return parsedList(`[${trimmed}]`) ?? [entry];
  }
  return [entry];
}

/** A rendered name and, when it has several, each of its words. */
function nameWithParts(name: string): readonly string[] {
  const parts = name.split(NAME_WORD_SEPARATOR).filter((part) => part !== "");
  return parts.length > 1 ? [name, ...parts] : [name];
}

/** The breakers as literal strings for the wire: every input form split out, every macro rendered against the
 *  turn's context and active persona, a one-macro breaker's name words added, empties dropped and repeats removed. */
export function resolvedSequenceBreakers(breakers: readonly string[], ctx: AssembleContext, render: RenderMacrosOptions): readonly string[] {
  const literals = breakers.flatMap(entryForms).flatMap((raw) => {
    const rendered = renderMacros(raw, ctx, ctx.activePersona, render);
    return SINGLE_MACRO.test(raw.trim()) ? nameWithParts(rendered.trim()) : [rendered];
  });
  return [...new Set(literals.filter((literal) => literal !== ""))];
}

/** The names a word list must leave alone this turn: each present character's and the user's, with their words. */
export function speakerNamesOf(ctx: AssembleContext): readonly string[] {
  const names = [...(ctx.characters ?? [ctx.character]).map((character) => character.name), ctx.activePersona?.name ?? DEFAULT_PERSONA_NAME];
  return [...new Set(names.flatMap((name) => nameWithParts(name.trim())).filter((name) => name !== ""))];
}
