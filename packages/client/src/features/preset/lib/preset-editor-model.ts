// The preset EDITOR's pure MODEL (W10 Panel A / preset-form-mapper-elimination.md) — the DIRECT-BIND seam.
// The editor binds the nested `PromptConfig` DIRECTLY via TanStack Form (`name="params.temperature"`), so
// the form's value shape IS `PromptConfig` — there is NO flat `PresetFormValues` and NO
// `toPresetFormValues`/`toPromptConfig` mapper (both DELETED from @orb/contracts, 2026-07-11). This file
// owns only the two seams the direct-bind still needs:
//   1. `seedConfig` — the mount seed: the loaded server `PromptConfig` verbatim (every nested path present,
//      so TanStack binds `params.*`, `guidedActions.*.*`, `postProcess.*`, `reasoningParse.*` cleanly).
//   2. `mergeOnSubmit` — normalize the edited config back to a persistable `PromptConfig`: server-only
//      fields the panel never edits (`advanced`/`logitBias`/`stop`/`customParameters`) survive (they rode
//      the seed untouched); `regexScripts`/`variables` ARE panel-edited now (the Regex + Variables tabs,
//      BUILD-SPEC §8) so they carry from `edited`, and an all-default `postProcess`/`reasoningParse` block
//      round-trips to UNSET (`assignIfDefined` — the absent-field-round-trips-to-unset discipline that used
//      to live in the contract mapper now lives HERE, at the client save seam).
//
// The numeric-knob BOUNDS are NOT re-typed here — the descriptor's `Range`s + `generationKnobSchemas`
// (spread by the router's `promptConfigSchema` validation) own them (the one-bounds-source discipline).

import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";

/** Assign `value` to `target[key]` only when defined — the absent-field-round-trips-to-unset one-liner the
 *  merge leans on (moved here from the deleted contract mapper; keeps the merge branch-free). */
function assignIfDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

/**
 * The mount seed — the loaded server `PromptConfig` verbatim. Every nested block the editor binds must be
 * PRESENT so TanStack Form binds each nested path (a nested `params.temperature` on an absent `params`
 * parent is undefined-path churn). `params` is always present on a parsed `PromptConfig` (schema
 * `.default({})`), and `postProcess`/`reasoningParse`/`guidedActions` are filled with their schema
 * defaults so their sub-fields bind; the ORIGINAL server blocks are what `mergeOnSubmit` merges against.
 */
export function seedConfig(server: PromptConfig): PromptConfig {
  return {
    ...server,
    // Bind-friendly blocks: present with the server value or the schema default, so every sub-path binds.
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
  return (
    pp.collapseNewlines || pp.trimTrailingWhitespace || pp.dropIncompleteSentence || pp.singleLine
  );
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
    compaction.mode !== undefined ||
    compaction.thresholdPct !== undefined ||
    (compaction.instructions !== undefined && compaction.instructions.trim() !== "");
  if (hasCompaction) {
    return params;
  }
  // Strip the empty compaction block (round-trips to unset).
  const next: UserIntent = { ...params };
  next.compaction = undefined;
  return next;
}

/**
 * The submit merge — normalize the edited `PromptConfig` into a persistable one. The whole config was
 * bound + seeded from the server, so server-only fields (`advanced`/`logitBias`/`stop`/`customParameters`)
 * already survive in `edited`. `regexScripts`/`variables` are NOW panel-edited (the Regex + Variables
 * tabs, BUILD-SPEC §8), so they carry through from `edited` — the earlier hardcoded `server.*` carry
 * silently discarded every tab edit on save. This pass only:
 *   • strips an all-default `postProcess`/`reasoningParse`/`compaction` block back to UNSET (so the schema
 *     default applies and the blob stays minimal — the absent-round-trips-to-unset invariant), and
 *   • re-anchors `schemaVersion` to the SERVER's (a version bump is a lift concern, never a form edit).
 * The router re-validates against `promptConfigSchema` (bounds enforced there — one source), so this need
 * not re-clamp; it only shapes the persistence blob.
 */
export function mergeOnSubmit(edited: PromptConfig, server: PromptConfig): PromptConfig {
  const next: PromptConfig = {
    schemaVersion: server.schemaVersion,
    sections: edited.sections,
    params: normalizeParams(edited.params),
    regexScripts: edited.regexScripts,
    variables: edited.variables,
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
