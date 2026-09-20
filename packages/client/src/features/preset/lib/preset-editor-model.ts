// The preset editor's pure model — the direct-bind seam. The editor binds the nested `PromptConfig`
// directly via TanStack Form, so the form's value shape IS `PromptConfig` (no flat mapper). This file
// owns `seedConfig` (the mount seed) and `mergeOnSubmit` (normalize the edited config for persistence,
// round-tripping all-default blocks back to unset).
//
// `customParameters` is the provider escape hatch, AUTHORED here (D143a): the local vLLM engine and a
// custom OpenAI-compatible endpoint send it verbatim, OpenRouter ignores it. It rides the merge like every
// other edited block, and its unfinished rows are one of the two save refusals below.

import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { proseCarrierMisses, THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";
import { isProseSlotId, PROSE_SLOTS, proseOverBy } from "@orb/contracts/prose";

/** Assign `value` to `target[key]` only when defined — keeps the merge branch-free. */
function assignIfDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/** The mount seed — every nested block the editor binds must be present so TanStack Form binds each path. */
export function seedConfig(server: PromptConfig): PromptConfig {
  return {
    ...server,
    postProcess: server.postProcess ?? {
      collapseNewlines: false,
      trimTrailingWhitespace: false,
      dropIncompleteSentence: false,
      singleLine: false,
    },
    reasoningParse: server.reasoningParse ?? {
      autoParse: false,
      prefix: THINK_PREFIX_DEFAULT,
      suffix: THINK_SUFFIX_DEFAULT,
    },
  };
}

/** `true` when a postProcess block does something (any flag on) — else it round-trips to unset. */
function hasPostProcess(pp: NonNullable<PromptConfig["postProcess"]>): boolean {
  return pp.collapseNewlines || pp.trimTrailingWhitespace || pp.dropIncompleteSentence || pp.singleLine;
}

/** `true` when a reasoningParse block was engaged (autoParse on, or a non-default tag set) — else unset. */
function hasReasoningParse(rp: NonNullable<PromptConfig["reasoningParse"]>): boolean {
  return rp.autoParse || rp.prefix !== THINK_PREFIX_DEFAULT || rp.suffix !== THINK_SUFFIX_DEFAULT;
}

/** Drop `undefined`/empty compaction so an all-empty compaction block round-trips to unset. */
function normalizeParams(params: UserIntent): UserIntent {
  const compaction = params.compaction;
  if (compaction === undefined) {
    return params;
  }
  const hasCompaction =
    compaction.mode !== undefined || compaction.thresholdPct !== undefined || (compaction.instructions !== undefined && compaction.instructions.trim() !== "");
  if (hasCompaction) {
    return params;
  }
  // Strip the empty compaction block (round-trips to unset).
  const next: UserIntent = { ...params };
  next.compaction = undefined;
  return next;
}

/** The framing overrides, normalized for persistence: each text TRIMMED, and a blank one DROPPED.
 *
 *  This is the whole trim boundary for `promptConfig.prose`, and it is here rather than in the keystroke
 *  handler on purpose: the drill-in's textarea is CONTROLLED, so trimming per keystroke fed the trimmed
 *  string straight back into the field and made the editor untypeable (no spaces, no newlines — see
 *  `proseTemplateDraft`). A trim at SAVE gets the same stored bytes with none of that.
 *
 *  Dropping the blank is what makes "clear the field" mean RESET: an absent key resolves to the slot's
 *  shipped default, while a stored `{text:""}` would resolve to empty bytes — a note frame that deletes the
 *  injection it was supposed to wrap. (`resolveProse` heals that shape too, for blobs that never came
 *  through this editor; this is the half that keeps our own writes clean.) */
function normalizePresetProse(prose: PromptConfig["prose"]): PromptConfig["prose"] {
  return Object.fromEntries(
    Object.entries(prose).flatMap(([id, override]) => {
      const text = override?.text.trim() ?? "";
      return override === undefined || text === "" ? [] : [[id, { ...override, text }]];
    }),
  );
}

/**
 * THE SAVE REFUSAL for framing overrides that cannot survive the wire — the `onDynamic` form validator the
 * editor mounts. TWO arms, one signalling vocabulary: an over-cap override, and a note-frame override that
 * dropped its `{{note}}` carrier.
 *
 * THE CARRIER ARM (owner ruling 2026-08-08, option C of `docs/design/note-token-intent-history.md`).
 * `promptConfigWriteSchema` REFUSES a non-blank `chat.injection.*Note` override missing `{{note}}` — the token
 * carries the injection's entire payload, so the frame would ship as `[Note from user: ]` with the host's note
 * gone. Without this arm the autosave would FIRE and bounce off the server, leaving the header reading "Saved"
 * over a write that never landed: the same fail-shape the over-cap arm below exists to prevent. The membership
 * test is `proseCarrierMisses` — the contract's own predicate, not a second spelling of it, so the field's
 * statement and the server's refusal can never disagree. The server guard stays the floor: an import, a
 * foreign API write and a preset file never pass through this editor.
 *
 * WHY A REFUSAL AND NOT A TRUNCATION. `proseOverridesSchema` wraps each key in `.catch(undefined)`, so an
 * over-cap override does not bounce off the server, it SELF-HEALS TO ABSENT: the row disappears, the shipped
 * default rides, and the host's text is gone with nothing on screen having said so. That self-heal is right
 * at the contract (one bad row must not nuke its siblings) and stays. This is the other half — the editor
 * stops the loss before the wire. Truncating instead would be the same data loss with a nicer name, on text
 * this editor did not author.
 *
 * REACHABLE ONLY FROM PRE-EXISTING DATA. The drill-in's textarea carries `maxLength={PROSE_MAX_CHARS}`, so
 * nothing typed here can trip this; what trips it is a blob that predates the cap — an imported preset, a
 * direct API write. The author sees the real text, the over-cap badge, and a save that waits for them.
 *
 * The refusal MECHANISM is the autosave factory's own: `createAutosaveEntityForm`'s save driver and its
 * teardown flush both gate on `form.state.isValid`, and `handleSubmit` runs this before `onSubmit` — so an
 * invalid form is three independent no-writes, not a hand-rolled guard at one call site.
 */
export function validatePresetConfig(config: PromptConfig): { fields: Record<string, string> } | undefined {
  return validatePresetProse(config);
}

/** The framing-override half of {@link validatePresetConfig} — see that function for the mount seam.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function validatePresetProse(config: PromptConfig): { fields: Record<string, string> } | undefined {
  // `isProseSlotId` rather than a cast: `Object.entries` erases the key to `string`, and the registry lookup
  // needs the union. It also correctly skips a RETIRED id left in a stored blob (the same key class
  // `proseOverridesSchema`'s preprocess strips) instead of indexing the registry with it.
  const over = Object.entries(config.prose).flatMap(([id, override]) =>
    override !== undefined && isProseSlotId(id) && proseOverBy(override.text) > 0 ? [PROSE_SLOTS[id].title] : [],
  );
  const dropped = proseCarrierMisses(config.prose).map((carrier) => `${PROSE_SLOTS[carrier.slotId].title} (${carrier.token})`);
  if (over.length === 0 && dropped.length === 0) {
    return;
  }
  // Keyed at the `prose` path — the record IS the bound value (a slot id contains dots, which TanStack reads
  // as a value path, so there is no per-slot field to hang this on; see `proseTemplateDraft`). Nothing
  // renders this string today: the drill-in's own over-cap badge and missing-token chip are the author-facing
  // statements, and this exists to make `isValid` false. It still NAMES the templates, so a future surface
  // has the fact — and it names BOTH reasons, because a config can carry one of each.
  const reasons = [
    ...(over.length === 0 ? [] : [`Too long to save: ${over.join(", ")}`]),
    ...(dropped.length === 0 ? [] : [`Missing its payload token: ${dropped.join(", ")}`]),
  ];
  return { fields: { prose: reasons.join(" · ") } };
}

/** Normalize the edited `PromptConfig` for persistence: strips all-default blocks back to unset, and
 *  re-anchors `schemaVersion` to the server's (a version bump is a lift concern, never a form edit). */
export function mergeOnSubmit(edited: PromptConfig, server: PromptConfig): PromptConfig {
  const next: PromptConfig = {
    schemaVersion: server.schemaVersion,
    sections: edited.sections,
    params: normalizeParams(edited.params),
    variables: edited.variables,
    userMacros: edited.userMacros,
    prose: normalizePresetProse(edited.prose),
  };
  assignIfDefined(next, "namesBehavior", edited.namesBehavior);
  assignIfDefined(next, "continuePostfix", edited.continuePostfix);
  assignIfDefined(next, "formatStrings", edited.formatStrings);
  assignIfDefined(next, "guidedActions", edited.guidedActions);
  if (edited.postProcess !== undefined && hasPostProcess(edited.postProcess)) {
    next.postProcess = edited.postProcess;
  }
  if (edited.reasoningParse !== undefined && hasReasoningParse(edited.reasoningParse)) {
    next.reasoningParse = edited.reasoningParse;
  }
  return next;
}
