// The editor's "When it runs" choice as data: the four pass sets a script may hold, and which chosen targets each one
// reaches. The choice is the ruled form of the pass axis: the save pass stands alone, because it rewrites the stored
// text and an ephemeral pass beside it would rewrite the copy a second time.
//
// AN UNREAD TARGET IS KEPT. A stored script may hold a target none of its passes reads (a migrated save-time script
// with world info among its targets, or a prompt-only script over reasoning). It stays selected and is shown as not applying, with the reason, so its owner
// can fix it by changing when it runs; nothing clears it on open or on save. Which pass reads which target is the
// kit's `regexPassReadsTarget`, read through `#lib`'s `regexPassesRead`.

import type { RegexPass, RegexTarget } from "@orb/kit/regex";
import { REGEX_TARGET_LABELS, regexPassesRead, regexUnreadTargets } from "#lib";
import { REGEX_WHEN_CHOICE_NAMES } from "./regex-names.ts";

const REGEX_WHEN_CHOICES = ["save", "display", "prompt", "displayAndPrompt"] as const;
export type RegexWhenChoice = (typeof REGEX_WHEN_CHOICES)[number];

const WHEN_PASSES: Record<RegexWhenChoice, readonly RegexPass[]> = {
  save: ["save"],
  display: ["display"],
  prompt: ["prompt"],
  displayAndPrompt: ["display", "prompt"],
};

/** Each choice's description: what stays untouched, then the SillyTavern box it matches. */
const WHEN_DESCRIPTIONS: Record<RegexWhenChoice, string> = {
  save: "Changes the stored chat for good. The original words are not kept. In SillyTavern: neither box ticked.",
  display: "The stored message and the prompt keep the original words. In SillyTavern: Alter Chat Display.",
  prompt: "The stored message and the screen keep the original words. In SillyTavern: Alter Outgoing Prompt.",
  displayAndPrompt: "The stored message keeps the original words. In SillyTavern: both boxes ticked.",
};

/** Why the passes that leave a target unread leave it so. Which pairs are unread is the kit's; a target every pass
 *  reads has no reason. */
const UNREAD_REASONS: Record<RegexTarget, string | null> = {
  ["USER_INPUT"]: null,
  ["AI_OUTPUT"]: null,
  ["WORLD_INFO"]: "World info is only read when the prompt is built. It is never saved or shown.",
  ["REASONING"]: "The model's earlier reasoning is sent back exactly as the provider signed it, so a script cannot change it in the prompt.",
};

/** The reasons the given targets go unread, one sentence per target. */
export function regexUnreadReasons(targets: readonly RegexTarget[]): string {
  return targets.flatMap((target) => UNREAD_REASONS[target] ?? []).join(" ");
}

/** The passes a choice stores. */
export function regexWhenPasses(choice: RegexWhenChoice): RegexPass[] {
  return [...WHEN_PASSES[choice]];
}

/** The choice a stored pass set spells, or null for a set no choice spells: none, or save beside another pass. */
export function regexWhenOf(passes: readonly RegexPass[]): RegexWhenChoice | null {
  return (
    REGEX_WHEN_CHOICES.find((choice) => WHEN_PASSES[choice].length === passes.length && WHEN_PASSES[choice].every((pass) => passes.includes(pass))) ?? null
  );
}

/** The line that names the unread targets and how to make them apply, or null when every target applies. */
export function regexUnreadTargetsNote(targets: readonly RegexTarget[], passes: readonly RegexPass[]): string | null {
  const unread = regexUnreadTargets({ targets, passes });
  if (unread.length === 0) {
    return null;
  }
  const names = unread.map((target) => REGEX_TARGET_LABELS[target]).join(", ");
  return `${names}: selected, but this script does not change it at this time. ${regexUnreadReasons(unread)} Change when it runs for it to apply.`;
}

/**
 * The four options as the when select renders them. A choice is disabled, with the reason as its description, only
 * when it would read none of the chosen targets; a choice that leaves some unread is offered, and the targets field
 * names the ones it leaves.
 */
export function regexWhenItems(
  targets: readonly RegexTarget[],
): readonly { readonly value: RegexWhenChoice; readonly label: string; readonly description: string; readonly disabled: boolean }[] {
  return REGEX_WHEN_CHOICES.map((choice) => {
    const reachesNone = targets.length > 0 && targets.every((target) => !regexPassesRead(WHEN_PASSES[choice], target));
    return {
      value: choice,
      label: REGEX_WHEN_CHOICE_NAMES[choice],
      description: reachesNone ? regexUnreadReasons(targets) : WHEN_DESCRIPTIONS[choice],
      disabled: reachesNone,
    };
  });
}

/** Whether a choice runs on a pass that can carry depth and an author scope. */
export function regexWhenIsEphemeral(choice: RegexWhenChoice | null): boolean {
  return choice !== null && choice !== "save";
}
