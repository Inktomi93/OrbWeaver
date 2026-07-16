// Character-card editor form model: the flat form value shape the editor binds + the ⇄ mappers to the
// character.update wire, plus token-count helpers. Pure logic, no JSX.
//
// Scope: draft card content only. Excludes immediate-commit identity fields (starred/archived/
// forbidExternalMedia/trustHtml/themeOverride/avatarAssetId/tags — patched outside this form) and
// read-only surfaces (refinery/importedFrom/importHash/extensions/residualData — display-only).
//
// Save = changed keys only: `characterUpdateDiff` diffs the normalized form against the normalized
// server row and emits only keys that actually changed, so a save can't silently revert a concurrent
// edit to an untouched field. Omitted = unchanged; a present `null` = clear.

import type { UpdateCharacterInput } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import { isAssistantPrefill } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";
import { estimateTokens } from "@orb/kit/tokens";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

/** The owner card read — inferred, never a contracts type import. */
type CharacterDetail = inferOutput<Trpc["character"]["get"]>;

const DEFAULT_DEPTH_PROMPT_DEPTH = 4;
const DEFAULT_DEPTH_PROMPT_ROLE: MessageRole = "system";
const PREFILL_DEPTH = 0;

/** The flat form value shape the editor binds. Nullable card text is held as `string` (`"" ⇒ null` on
 *  save); the nested `depthPrompt` is flattened to three sibling fields (re-nested on save). */
export interface CharacterCardFormValues {
  readonly name: string;
  // Mutable (not readonly): TanStack Form's array-field helpers only recognize a mutable T[].
  readonly greetings: string[];
  readonly description: string;
  readonly personality: string;
  readonly scenario: string;
  readonly exampleMessages: string;
  readonly creatorNotes: string;
  readonly systemPrompt: string;
  readonly postHistoryInstructions: string;
  /** Character's Note \@ Depth, flattened. Empty `depthPromptText` ⇒ `depthPrompt: null` on save. */
  readonly depthPromptText: string;
  /** NumberField shape: `null` = empty (mapped to a default on save when the note is non-empty). */
  readonly depthPromptDepth: number | null;
  readonly depthPromptRole: MessageRole;
  readonly regexScripts: RegexScript[];
  readonly creator: string;
  readonly cardVersion: string;
}

/** From-scratch defaults — the editor always mounts over a real row today, but the factory requires a
 *  `defaultValues` fallback. */
export const DEFAULT_CHARACTER_CARD_FORM: CharacterCardFormValues = {
  name: "",
  greetings: [""],
  description: "",
  personality: "",
  scenario: "",
  exampleMessages: "",
  creatorNotes: "",
  systemPrompt: "",
  postHistoryInstructions: "",
  depthPromptText: "",
  depthPromptDepth: DEFAULT_DEPTH_PROMPT_DEPTH,
  depthPromptRole: DEFAULT_DEPTH_PROMPT_ROLE,
  regexScripts: [],
  creator: "",
  cardVersion: "",
};

/** `null ⇒ ""` for the form; the save mapper reverses it (`"" ⇒ null`). */
function orEmpty(value: string | null): string {
  return value ?? "";
}

/** `"" ⇒ null` for a nullable card text column (null = clear the field). */
function orNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

/** Read the owner card detail into the flat form values (draft-content fields only). A card with no
 *  greetings still seeds one empty slot so the hero always has an editable "first message". */
export function characterCardFormFromDetail(card: CharacterDetail): CharacterCardFormValues {
  return {
    name: card.name,
    greetings: card.greetings.length > 0 ? [...card.greetings] : [""],
    description: orEmpty(card.description),
    personality: orEmpty(card.personality),
    scenario: orEmpty(card.scenario),
    exampleMessages: orEmpty(card.exampleMessages),
    creatorNotes: orEmpty(card.creatorNotes),
    systemPrompt: orEmpty(card.systemPrompt),
    postHistoryInstructions: orEmpty(card.postHistoryInstructions),
    depthPromptText: orEmpty(card.depthPrompt?.prompt ?? null),
    depthPromptDepth: card.depthPrompt?.depth ?? DEFAULT_DEPTH_PROMPT_DEPTH,
    depthPromptRole: card.depthPrompt?.role ?? DEFAULT_DEPTH_PROMPT_ROLE,
    regexScripts: [...card.regexScripts],
    creator: orEmpty(card.creator),
    cardVersion: orEmpty(card.cardVersion),
  };
}

/** The full normalized card payload from the form values (every draft key, wire-normalized). Not the
 *  save payload directly — `characterUpdateDiff` narrows it to only the changed keys, building both
 *  sides (desired + server baseline) through this one normalizer so only genuine edits differ. */
export function characterUpdateFromForm(values: CharacterCardFormValues): UpdateCharacterInput {
  return {
    name: values.name,
    // Drop trailing empties beyond the first greeting so a card never persists blank alternates.
    greetings: normalizeGreetings(values.greetings),
    // description is non-nullable in the card schema (unlike the other text fields).
    description: values.description,
    personality: orNull(values.personality),
    scenario: orNull(values.scenario),
    exampleMessages: orNull(values.exampleMessages),
    creatorNotes: orNull(values.creatorNotes),
    systemPrompt: orNull(values.systemPrompt),
    postHistoryInstructions: orNull(values.postHistoryInstructions),
    depthPrompt: depthPromptFromForm(values),
    regexScripts: values.regexScripts,
    creator: orNull(values.creator),
    cardVersion: orNull(values.cardVersion),
  };
}

/** The changed-keys diff: emits a key only when the user's edit genuinely differs from the server row,
 *  never a full-object PUT that could silently revert a concurrent edit to an untouched field. */
export function characterUpdateDiff(values: CharacterCardFormValues, card: CharacterDetail): UpdateCharacterInput {
  const desired = characterUpdateFromForm(values);
  const baseline = characterUpdateFromForm(characterCardFormFromDetail(card));
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(desired) as (keyof UpdateCharacterInput)[]) {
    if (!deepEqual(desired[key], baseline[key])) {
      patch[key] = desired[key];
    }
  }
  return patch as UpdateCharacterInput;
}

/** A structural equality for the diff's field values. File-local — the compared shapes are plain JSON
 *  (primitives, arrays, plain objects), so no Map/Set/Date handling is needed. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** Keep `[0]` always (the first message, even when empty), drop only trailing empty ALTERNATES. */
function normalizeGreetings(greetings: readonly string[]): string[] {
  const [first = "", ...rest] = greetings;
  return [first, ...rest.filter((g) => g.trim() !== "")];
}

/** Re-nest the flat depthPrompt siblings, or `null` when the note text is empty (no note). */
function depthPromptFromForm(values: CharacterCardFormValues): UpdateCharacterInput["depthPrompt"] {
  if (values.depthPromptText.trim() === "") {
    return null;
  }
  return {
    prompt: values.depthPromptText,
    depth: values.depthPromptDepth ?? DEFAULT_DEPTH_PROMPT_DEPTH,
    role: values.depthPromptRole,
  };
}

/** Assistant-role at depth 0 is a response prefill — unsupported across providers. The editor surfaces
 *  this, never silently drops it. Only meaningful while the note has text. */
export function isDepthPromptPrefill(values: CharacterCardFormValues): boolean {
  return values.depthPromptText.trim() !== "" && isAssistantPrefill(values.depthPromptRole, values.depthPromptDepth ?? PREFILL_DEPTH);
}

// Token counts, live off the draft. Permanent = every-turn assembly set: description/personality/
// scenario/systemPrompt/postHistoryInstructions/exampleMessages/depthPrompt.prompt. greetings are a
// one-time history seed, not counted here.

/** Sum the estimator over the permanent fields. */
export function permanentTokenCount(values: CharacterCardFormValues): number {
  return (
    estimateTokens(values.description) +
    estimateTokens(values.personality) +
    estimateTokens(values.scenario) +
    estimateTokens(values.systemPrompt) +
    estimateTokens(values.postHistoryInstructions) +
    estimateTokens(values.exampleMessages) +
    estimateTokens(values.depthPromptText)
  );
}

/** The total: permanent + the prompt-bearing non-permanent fields (name + the active greeting). */
export function totalTokenCount(values: CharacterCardFormValues, activeGreetingIndex: number): number {
  const activeGreeting = values.greetings[activeGreetingIndex] ?? values.greetings[0] ?? "";
  return permanentTokenCount(values) + estimateTokens(values.name) + estimateTokens(activeGreeting);
}
