// The character-card editor form MODEL (FINAL-Character §6 · mirrors persona-editor-model.ts /
// theme-editor-model.ts): the flat form value shape the §6 editor binds + the ⇄ mappers to the
// `character.update` wire, plus the §6.3/§6.5 token-count helpers. Pure logic, no JSX.
//
// SCOPE — DRAFT CARD CONTENT ONLY (§2 commit-model law). This model carries the fields under the CONTENT
// save-bar: the card text, greetings, exampleMessages, the flattened depthPrompt, regexScripts, and the
// editable provenance (creator/cardVersion). It DELIBERATELY excludes the immediate-commit identity fields
// (`starred`/`archived`/`forbidExternalMedia`/`trustHtml`/`themeOverride`/`avatarAssetId`/tags) — those
// fire their own single-key `character.update` patches OUTSIDE this form (§2/§6.1), never lighting the pill.
// It also excludes the read-only surfaces (`refinery`/`importedFrom`/`importHash`/`extensions`/
// `residualData`) — display-only, never round-tripped through form state (§6.4).
//
// The card READ view is inferred through tRPC — never a cross-package type import (the persona-editor-model
// precedent); the alias stays FILE-LOCAL (a mappers-only shape, consumers infer their own from the proxy).
//
// null-vs-empty (§2 wire discipline): a nullable card text field maps `"" ⇒ null` on save (null = clear);
// the always-a-list columns (`greetings`/`regexScripts`) ride as arrays, never null, so they never clear
// spuriously. depthPrompt re-nests from the three flat siblings; an empty prompt ⇒ `null` (no note).

import type { UpdateCharacterInput } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import type { MessageRole } from "@orb/kit/message-role";
import { estimateTokens } from "@orb/kit/tokens";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";

/** The owner card read (`character.get`/`update` return) — inferred, never a contracts type import. */
type CharacterDetail = inferOutput<Trpc["character"]["get"]>;

const DEFAULT_DEPTH_PROMPT_DEPTH = 4;
const DEFAULT_DEPTH_PROMPT_ROLE: MessageRole = "system";
const PREFILL_DEPTH = 0;

/** The flat form value shape the §6 editor binds. Nullable card text is held as `string` (`"" ⇒ null` on
 *  save); the nested `depthPrompt` is flattened to three sibling fields (re-nested on save). */
export interface CharacterCardFormValues {
  // ── §6.1 hero (draft) ──
  readonly name: string;
  // Mutable arrays (NOT `readonly`): TanStack Form's array-field helpers (`pushFieldValue`/`removeFieldValue`)
  // only recognise a field as an array when its type is a mutable `T[]` — a `readonly T[]` drops out of the
  // array-key union (§6.1 greeting alternates + §6.4 regexScripts both need the helpers).
  readonly greetings: string[];
  // ── §6.3 Main tab (draft) ──
  readonly description: string;
  readonly personality: string;
  readonly scenario: string;
  readonly exampleMessages: string;
  readonly creatorNotes: string;
  // ── §6.4 Advanced tab (draft) ──
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

/** From-scratch defaults (a create with no server row yet — the editor always mounts over a real row today,
 *  but the factory requires a `defaultValues` fallback). */
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

/** `"" ⇒ null` for a nullable card text column (§2 wire discipline: null = clear the field). */
function orNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

/** Read the owner card detail into the flat form values (draft-content fields only — identity/read-only
 *  fields are handled outside the form, §2/§6.4). A card with no greetings still seeds one empty slot so the
 *  hero always has an editable "first message". */
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

/** Build the `character.update` PARTIAL card patch from the form values (the CONTENT-save payload). Sends
 *  the full authored card (not a per-key diff — a Save is an explicit whole-card write); nullable text maps
 *  `"" ⇒ null` (clear), the list columns ride as arrays, and the three depthPrompt siblings re-nest into the
 *  `{prompt, depth, role}` directive (empty prompt ⇒ `null`). Identity fields are NEVER sent from here. */
export function characterUpdateFromForm(values: CharacterCardFormValues): UpdateCharacterInput {
  return {
    name: values.name,
    // The always-a-list column: an empty first message is still a real (empty) greeting slot; drop trailing
    // empties beyond the first so a card never persists blank alternates the author didn't write.
    greetings: normalizeGreetings(values.greetings),
    // `description` is NON-nullable in the card create/update schema (unlike the other text fields) — send
    // the string as-is, never null.
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

/** The write guard mirror (contract `cardDepthPromptWriteSchema`): assistant-role at depth 0 is a response
 *  prefill — unsupported across providers. The editor SURFACES this (§6.4), never silently drops it. Only
 *  meaningful while the note has text (an empty note saves as `null`). */
export function isDepthPromptPrefill(values: CharacterCardFormValues): boolean {
  return (
    values.depthPromptText.trim() !== "" &&
    values.depthPromptRole === "assistant" &&
    (values.depthPromptDepth ?? 0) === PREFILL_DEPTH
  );
}

// ── §6.3/§6.5 token counts (live, off the draft — the ONE kit estimator, never a second) ──────────────
// PERMANENT (§6.5) = OUR assembly's every-turn set: description · personality · scenario · systemPrompt ·
// postHistoryInstructions · exampleMessages · depthPrompt.prompt. greetings are NON-permanent (a one-time
// history seed — they cost history tokens after send, never card tokens). NOTHING that never reaches the
// model (creatorNotes/creator/cardVersion/provenance) is counted.

/** Sum the estimator over the §6.5 PERMANENT fields (the every-turn assembly set). */
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

/** The §6.5 TOTAL: PERMANENT + the prompt-bearing non-permanent fields (name + the ACTIVE greeting). The
 *  active greeting is the one the hero is previewing/editing (§6.1 pill-tabs) — the ST "N total" number. */
export function totalTokenCount(
  values: CharacterCardFormValues,
  activeGreetingIndex: number,
): number {
  const activeGreeting = values.greetings[activeGreetingIndex] ?? values.greetings[0] ?? "";
  return permanentTokenCount(values) + estimateTokens(values.name) + estimateTokens(activeGreeting);
}

/** The macro catalog card free-text completes against (the `{{ }}` trigger). Cards self-reference the
 *  character with `{{char}}` and the human with `{{user}}`; the list feeds the macro-aware textarea
 *  (ui imports no registry — the field takes `suggestions`). */
export const CHARACTER_CARD_MACROS: readonly MacroSuggestion[] = [
  { name: "char", category: "character", description: "This character's name" },
  { name: "user", category: "persona", description: "The active persona's name" },
];
