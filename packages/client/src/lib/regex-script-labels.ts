// The one home for how a regex script's two axes read: what text it changes (`RegexTarget`) and when it runs
// (`RegexPass`), as labels, glyphs, pipeline step names and the row scents. Every presentation keys off the kit's
// own tuples, so a new member fails `tsc` in all of them at once. `lib/` is the home because the library feature,
// the room's Regex section and the preset readout all read it, and features cannot import each other.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { RegexPass, RegexTarget } from "@orb/kit/regex";
import { REGEX_PASSES, REGEX_TARGETS, regexPassReadsTarget } from "@orb/kit/regex";
import type { LucideIcon } from "@orb/ui/icons";
import { BookOpen, BrainCircuit, Eye, Pencil, ScrollText, Send, Sparkles } from "@orb/ui/icons";

/** What each target is called. "People" is the room's word for its humans (`docs/law/vocabulary-map.md`). */
export const REGEX_TARGET_LABELS: Record<RegexTarget, string> = {
  ["USER_INPUT"]: "People's messages",
  ["AI_OUTPUT"]: "Replies",
  ["WORLD_INFO"]: "World info",
  ["REASONING"]: "Reasoning",
};

/** Each target as a glyph for a narrow row; the label above is its accessible name. */
export const REGEX_TARGET_GLYPHS: Record<RegexTarget, LucideIcon> = {
  ["USER_INPUT"]: Send,
  ["AI_OUTPUT"]: Sparkles,
  ["WORLD_INFO"]: BookOpen,
  ["REASONING"]: BrainCircuit,
};

/** What each pass is called on its own. `On screen` is the room roster's word for the display pass. */
export const REGEX_PASS_LABELS: Record<RegexPass, string> = {
  save: "When saved",
  display: "On screen",
  prompt: "In the prompt",
};

/** Each pass as a glyph; the label above is its accessible name. */
export const REGEX_PASS_GLYPHS: Record<RegexPass, LucideIcon> = {
  save: Pencil,
  display: Eye,
  prompt: ScrollText,
};

/** A script's targets in the kit's order, which is the order every glyph strip and phrase uses. */
export function regexTargetStages(targets: readonly RegexTarget[]): readonly RegexTarget[] {
  return REGEX_TARGETS.filter((target) => targets.includes(target));
}

/** A script's passes in the kit's order. */
export function regexPassStages(passes: readonly RegexPass[]): readonly RegexPass[] {
  return REGEX_PASSES.filter((pass) => passes.includes(pass));
}

/** Whether a script can run at all: it needs at least one target and one pass. An imported script can arrive with
 *  neither, so the empty state is reachable and every list says it in words. */
export function regexRunsNowhere(script: { readonly targets: readonly RegexTarget[]; readonly passes: readonly RegexPass[] }): boolean {
  return script.targets.length === 0 || script.passes.length === 0;
}

/** Whether any of these passes reads a target (the kit's {@link regexPassReadsTarget}). */
export function regexPassesRead(passes: readonly RegexPass[], target: RegexTarget): boolean {
  return passes.some((pass) => regexPassReadsTarget(pass, target));
}

/**
 * The chosen targets none of the script's passes reads, in the kit's order. A stored script can hold one (a
 * save-time script with world info among its targets); it is kept, and every surface shows it as not applying.
 */
export function regexUnreadTargets(script: { readonly targets: readonly RegexTarget[]; readonly passes: readonly RegexPass[] }): readonly RegexTarget[] {
  return script.passes.length === 0 ? [] : regexTargetStages(script.targets).filter((target) => !regexPassesRead(script.passes, target));
}

/** The words an unread target carries wherever it is listed. */
const REGEX_UNREAD_TARGET_WORDS = "not applying";

/** An unread target's accessible name on a glyph. */
export function regexUnreadTargetName(target: RegexTarget): string {
  return `${REGEX_TARGET_LABELS[target]}, ${REGEX_UNREAD_TARGET_WORDS}`;
}

/** The text a pipeline step with several targets names: a step over every row target is the chat itself. */
const STEP_WHOLE_CHAT = "the chat";

/** A regex step's name in the preset's pipeline readout. */
export function regexStepLabel(pass: RegexPass, targets: readonly RegexTarget[]): string {
  const [only] = targets;
  const text = targets.length === 1 && only !== undefined ? REGEX_TARGET_LABELS[only].toLowerCase() : STEP_WHOLE_CHAT;
  return `Regex · ${text} · ${REGEX_PASS_LABELS[pass].toLowerCase()}`;
}

/** How much of a find pattern the picker's scent shows before it stops being scannable. */
const SCENT_PATTERN_CHARS = 32;

/** The scent's words for a script that cannot run. */
const SCENT_NO_RUN = "runs nowhere";
const SCENT_NO_PATTERN = "no pattern yet";

function axesPhrase(script: Readonly<Pick<RegexScriptRow, "targets" | "passes">>): string {
  if (regexRunsNowhere(script)) {
    return SCENT_NO_RUN;
  }
  const unread = regexUnreadTargets(script);
  const targets = regexTargetStages(script.targets).map((target) => {
    const label = REGEX_TARGET_LABELS[target].toLowerCase();
    return unread.includes(target) ? `${label} (${REGEX_UNREAD_TARGET_WORDS})` : label;
  });
  const passes = regexPassStages(script.passes).map((pass) => REGEX_PASS_LABELS[pass].toLowerCase());
  return [...targets, ...passes].join(" · ");
}

// The picker's dialog line has no `truncate` of its own, so its projection clips the pattern itself.
function patternHead(findRegex: string): string {
  const pattern = findRegex.trim();
  if (pattern === "") {
    return SCENT_NO_PATTERN;
  }
  return pattern.slice(0, SCENT_PATTERN_CHARS) + (pattern.length > SCENT_PATTERN_CHARS ? "…" : "");
}

function patternWhole(findRegex: string): string {
  const pattern = findRegex.trim();
  return pattern === "" ? SCENT_NO_PATTERN : pattern;
}

/** The scent's lead words for a script that needs fixing: it runs nowhere, or a target it holds is not read. */
function scentWarning(script: Readonly<Pick<RegexScriptRow, "targets" | "passes">>): string {
  if (regexRunsNowhere(script)) {
    return `${SCENT_NO_RUN} · `;
  }
  const unread = regexUnreadTargets(script).map((target) => REGEX_TARGET_LABELS[target].toLowerCase());
  return unread.length === 0 ? "" : `${unread.join(", ")} ${REGEX_UNREAD_TARGET_WORDS} · `;
}

/**
 * A library roster row's subtitle: the pattern leads, because the row's glyph strip already shows the axes and the
 * pattern is what tells two same-named rows apart; the edit stamp closes it. The row's own `truncate` cuts it, so
 * the pattern is not clipped here. `runs nowhere` and an unread target stay as words ahead of the pattern, because
 * a glyph alone does not say a script needs fixing.
 */
export function regexRowScent(
  script: Readonly<Pick<RegexScriptRow, "enabled" | "findRegex" | "targets" | "passes" | "updatedAt">>,
  formatRelative: (epochMs: number) => string,
): string {
  const scent = `${scentWarning(script)}${patternWhole(script.findRegex)} · edited ${formatRelative(script.updatedAt)}`;
  return script.enabled ? scent : `off · ${scent}`;
}

/** A picker row's subtitle, where the dialog has room for the axes in words: axes, pattern head, edit stamp. */
export function regexScriptScent(
  script: Readonly<Pick<RegexScriptRow, "findRegex" | "targets" | "passes" | "updatedAt">>,
  formatRelative: (epochMs: number) => string,
): string {
  return `${axesPhrase(script)} · ${patternHead(script.findRegex)} · edited ${formatRelative(script.updatedAt)}`;
}

/** A script's name, with the empty-name case spelled once for every list, heading and confirm. */
export function regexScriptTitle(script: Readonly<Pick<RegexScriptRow, "name">>): string {
  return script.name === "" ? "Unnamed script" : script.name;
}

/** The target multi-toggle's options. */
export const REGEX_TARGET_ITEMS: readonly { readonly value: RegexTarget; readonly label: string }[] = REGEX_TARGETS.map((value) => ({
  value,
  label: REGEX_TARGET_LABELS[value],
}));
