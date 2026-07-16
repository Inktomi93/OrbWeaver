// domain/character/substrate/card-merge — the edit-in-place merge logic (pure, zero I/O). update rebuilds
// the whole card by merging wire edits over the current card. The !== undefined (not ??) discipline is
// load-bearing: null means "clear it", distinct from "not provided". List columns treat null as "clear to []".

import type { CharacterCard, UpdateCharacterInput } from "@orb/contracts/character";
import type { ThemeOverride } from "@orb/contracts/theme";

function keep<T>(edit: T | undefined, current: T): T {
  // biome-ignore lint/nursery/useNullishCoalescing: null means "clear the field" (distinct from undefined "keep") — ?? would swallow an explicit clear.
  return edit === undefined ? current : edit;
}

function keepList<T>(edit: readonly T[] | null | undefined, current: T[]): T[] {
  if (edit === undefined) {
    return current;
  }
  return edit === null ? [] : [...edit];
}

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

// Excludes refinery — pipeline-derived, never authored.
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

function cardFieldEqual(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** Only provided fields can differ; the audit lists these, never a provided-but-unchanged field. */
export function changedCardFields(before: CharacterCard, after: CharacterCard): string[] {
  return CARD_CONTENT_FIELDS.filter((key) => !cardFieldEqual(before[key], after[key]));
}

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
    ...(input.forbidExternalMedia === undefined ? {} : { forbidExternalMedia: input.forbidExternalMedia }),
    ...(input.trustHtml === undefined ? {} : { trustHtml: input.trustHtml }),
    ...(input.themeOverride === undefined ? {} : { themeOverride: input.themeOverride }),
  };
}
