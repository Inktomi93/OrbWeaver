// The preset editor's pure model — the direct-bind seam. The editor binds the nested `PromptConfig`
// directly via TanStack Form, so the form's value shape IS `PromptConfig` (no flat mapper). This file
// owns `seedConfig` (the mount seed) and `mergeOnSubmit` (normalize the edited config for persistence,
// round-tripping all-default blocks back to unset).
//
// `customParameters` is a SERVER-ONLY, custom-byo-only provider passthrough (the BYOK escape hatch): it is
// persisted through here but only the custom-byo backend applies it to the wire. OpenRouter intentionally
// ignores it (its knobs are the modeled sampling surface). This model just round-trips the blob.

import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";

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
  assignIfDefined(next, "customParameters", server.customParameters);
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
