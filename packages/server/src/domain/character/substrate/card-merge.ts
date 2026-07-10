// domain/character/substrate/card-merge — the edit-in-place merge logic (pure, zero I/O). The card is the
// flat row (D28); `update` rebuilds the whole card by merging wire edits over the current card, then
// re-flattens it to a `contentHash`. The `!== undefined` (NOT `??`) discipline is LOAD-BEARING: a nullable
// field's `null` means "clear it" (distinct from "not provided") — nullish-coalescing would swallow an
// explicit clear. The always-a-list columns (`greetings`/`regexScripts`) treat `null` as "clear to []".

import type { CharacterCard, UpdateCharacterInput } from "@orb/contracts/character";
import type { ThemeOverride } from "@orb/contracts/theme";

/** `undefined` ⇒ leave unchanged; any other value (incl. `null`) ⇒ the new value (a `null` clears). */
function keep<T>(edit: T | undefined, current: T): T {
  // biome-ignore lint/nursery/useNullishCoalescing: null means "clear the field" (distinct from undefined "keep") — ?? would swallow an explicit clear (D28).
  return edit === undefined ? current : edit;
}

/** An always-a-list column: `undefined` keeps the current list; `null`/value sets it (null ⇒ `[]`). */
function keepList<T>(edit: readonly T[] | null | undefined, current: T[]): T[] {
  if (edit === undefined) {
    return current;
  }
  return edit === null ? [] : [...edit];
}

/** Merge the wire edits over the current card → the full next card (to flatten + write). */
export function mergeCard(base: CharacterCard, input: UpdateCharacterInput): CharacterCard {
  return {
    name: keep(input.name, base.name),
    description: keep(input.description, base.description),
    personality: keep(input.personality, base.personality),
    scenario: keep(input.scenario, base.scenario),
    greetings: keepList(input.greetings, base.greetings),
    exampleMessages: keep(input.exampleMessages, base.exampleMessages),
    systemPrompt: keep(input.systemPrompt, base.systemPrompt),
    postHistoryInstructions: keep(input.postHistoryInstructions, base.postHistoryInstructions),
    depthPrompt: keep(input.depthPrompt, base.depthPrompt),
    creatorNotes: keep(input.creatorNotes, base.creatorNotes),
    creator: keep(input.creator, base.creator),
    cardVersion: keep(input.cardVersion, base.cardVersion),
    regexScripts: keepList(input.regexScripts, base.regexScripts),
    extensions: keep(input.extensions, base.extensions),
    residualData: keep(input.residualData, base.residualData ?? null),
    avatarAssetId: keep(input.avatarAssetId, base.avatarAssetId),
    refinery: base.refinery,
  };
}

// The card-CONTENT field names an edit can touch (excludes `refinery` — pipeline-derived, never authored).
// Used to report which fields an update ACTUALLY changed (audit accuracy — `undefined`/no-op edits are not
// "changed"). One home; `changedCardFields` iterates it.
const CARD_CONTENT_FIELDS = [
  "name",
  "description",
  "personality",
  "scenario",
  "greetings",
  "exampleMessages",
  "systemPrompt",
  "postHistoryInstructions",
  "depthPrompt",
  "creatorNotes",
  "creator",
  "cardVersion",
  "regexScripts",
  "extensions",
  "residualData",
  "avatarAssetId",
] as const satisfies readonly (keyof CharacterCard)[];

/** Value-equality for a single card field — primitives by `===`, the list/record fields by structural
 *  compare (both sides are plain JSON, same-shaped construction ⇒ a stable `JSON.stringify`). */
function cardFieldEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** The card-content field names whose value actually differs between the current card and the merged next
 *  card. Only PROVIDED fields can differ (`mergeCard` keeps omitted ones identical), so this is exactly the
 *  set of card fields the update really wrote — the audit lists these, never a provided-but-unchanged field. */
export function changedCardFields(before: CharacterCard, after: CharacterCard): string[] {
  return CARD_CONTENT_FIELDS.filter((key) => !cardFieldEqual(before[key], after[key]));
}

/** The identity flags from a wire edit (NOT card content) — only the keys actually present. */
export function flagEdits(input: UpdateCharacterInput): {
  starred?: boolean;
  archived?: boolean;
  forbidExternalMedia?: boolean | null;
  trustHtml?: boolean | null;
  themeOverride?: ThemeOverride | null;
} {
  return {
    ...(input.starred === undefined ? {} : { starred: input.starred }),
    ...(input.archived === undefined ? {} : { archived: input.archived }),
    ...(input.forbidExternalMedia === undefined
      ? {}
      : { forbidExternalMedia: input.forbidExternalMedia }),
    ...(input.trustHtml === undefined ? {} : { trustHtml: input.trustHtml }),
    ...(input.themeOverride === undefined ? {} : { themeOverride: input.themeOverride }),
  };
}
