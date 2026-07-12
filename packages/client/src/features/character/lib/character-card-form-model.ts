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
//
// SAVE = CHANGED KEYS ONLY (§2, LOAD-BEARING): `characterUpdateDiff` — not `characterUpdateFromForm` — is
// the save payload. It diffs the normalized form against the normalized SERVER row and emits only the keys
// the user actually changed, so a Save never re-sends untouched fields and can't silently revert a
// concurrent edit (the two-tab data-loss bug §2 forbids). Omitted = unchanged; a present `null` = clear.

import type { UpdateCharacterInput } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import { isAssistantPrefill } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";
import { estimateTokens } from "@orb/kit/tokens";
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

/** The full NORMALIZED card payload from the form values (every draft key, wire-normalized). Nullable text
 *  maps `"" ⇒ null` (clear), the list columns ride as arrays, and the three depthPrompt siblings re-nest into
 *  the `{prompt, depth, role}` directive (empty prompt ⇒ `null`). Identity fields are NEVER sent from here.
 *  NOT the save payload directly — `characterUpdateDiff` narrows it to only the CHANGED keys (§2 wire
 *  discipline: omitted = unchanged), which is what the save-bar actually sends. Kept separate because the
 *  diff builds BOTH sides (desired + server baseline) through this ONE normalizer, so only genuine edits
 *  differ. */
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

/** The §2 CHANGED-KEYS diff (the LOAD-BEARING save discipline — FINAL-Character §2: "send only changed
 *  keys … do not hand-roll a full-object PUT"). Both the desired payload and the server row's baseline are
 *  built through the SAME `characterUpdateFromForm` normalizer, so a key is emitted ONLY when the user's
 *  edit genuinely differs from what the server holds — never a full-object PUT that would silently revert a
 *  concurrent edit to an untouched field (the two-tab data-loss bug). `"" ⇒ null` clears survive as a
 *  present `null` key (distinct from omitted); an untouched nullable field is omitted, not sent as `null`. */
export function characterUpdateDiff(
  values: CharacterCardFormValues,
  card: CharacterDetail,
): UpdateCharacterInput {
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

/** A structural equality for the diff's field values (strings/null, string[], regexScript objects, the
 *  depthPrompt directive). File-local — the compared shapes are exactly the `characterUpdateFromForm`
 *  outputs (plain JSON: primitives, arrays, plain objects), so no Map/Set/Date handling is needed. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) =>
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
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

/** The write guard mirror (contract `cardDepthPromptWriteSchema`, the shared `isAssistantPrefill` —
 *  `@orb/kit/injection`): assistant-role at depth 0 is a response prefill — unsupported across providers.
 *  The editor SURFACES this (§6.4), never silently drops it. Only meaningful while the note has text (an
 *  empty note saves as `null`). */
export function isDepthPromptPrefill(values: CharacterCardFormValues): boolean {
  return (
    values.depthPromptText.trim() !== "" &&
    isAssistantPrefill(values.depthPromptRole, values.depthPromptDepth ?? PREFILL_DEPTH)
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
