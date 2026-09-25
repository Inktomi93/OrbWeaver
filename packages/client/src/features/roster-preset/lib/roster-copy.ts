// The saved-roster surfaces' host-facing COPY — one home, because the same two translations were being
// spelled (or skipped) in three places at once (side-eye 2026-08-29, #811/#812):
//
//   · THE APPLY REPORT. Three doors apply a roster — the picker's "Start a chat with…", the picker's "Add to
//     this chat", and the editor's "Start chat" — and they reported at three different levels: a toast, a
//     member-skips-only line, and total silence on the headline path B10's own acceptance test names
//     ("save a roster + rules; one click into a new chat"). The build record §6.4 requires that a refused
//     rule be REPORTED WITH ITS REASON (the lore presets' book-attachment consent gate refuses in a room
//     without the book); on two of the three doors the reason and the count were both discarded. And the
//     sentence led unconditionally with "Added N", so the idempotency the feature is proud of announced
//     itself as "Added 0" — a success that reads like a failure.
//   · THE KNOB GLOSS. A roster's rules stored a RESOLVED knob bag per rule and every surface collapsed it to
//     a title (or to a count), so two rosters carrying "Periodic pacing nudge" at `everyN: 8` and `everyN:
//     12` rendered byte-identically. The bag is the entire reason the rider stores more than an id.
//
// VOCABULARY (owner ruling, #599): bare "preset" means a GENERATION preset in this app, so nothing here
// says it — these are rule presets, and a rule is a "rule".
//
// The gloss is built from the CATALOGUE's own knob labels (`RulePresetView.knobs`), never hand-spelled per
// preset: a new preset, or a renamed knob, carries its own copy through with no edit here. A knob whose
// descriptor the catalogue no longer offers is dropped rather than printed as a raw key — and a preset the
// catalogue has lost entirely degrades to its stored id, visible but plainly degraded, which is exactly
// what the apply reports as a skip.

import type { RulePresetId, RulePresetKnobDescriptor, RulePresetKnobValue, RulePresetKnobView, RulePresetView } from "@orb/contracts/automation";
import type { ApplyRosterPresetResult } from "@orb/contracts/roster-preset";

/** A stored knob bag as either surface holds it — the view's RESOLVED bag or the wire INPUT bag (whose
 *  `string[]` arm assigns into this readonly one). */
type RosterKnobBag = Readonly<Record<string, RulePresetKnobValue | undefined>>;

/** How long a free-text knob value may run inside a one-line gloss before it stops being a gloss. */
const TEXT_KNOB_EXCERPT = 32;

function knobValueText(knob: RulePresetKnobView, value: RulePresetKnobValue): string {
  // A switch over an INTERSECTION type (`Descriptor & {key}`) makes biome mark every case after the first
  // unreachable; the plain-union local is the house workaround (`rule-preset-knob-model.ts`'s idiom).
  const descriptor: RulePresetKnobDescriptor = knob;
  switch (descriptor.kind) {
    case "number":
      return String(value);
    case "choice":
      // The host vocabulary, never the wire discriminator (`optionLabels` exists for exactly this).
      return typeof value === "string" ? (descriptor.optionLabels[value] ?? value) : String(value);
    case "textList":
      return typeof value === "string" || typeof value === "number" ? String(value) : value.join(", ");
    case "text": {
      const text = String(value);
      return `“${text.length > TEXT_KNOB_EXCERPT ? `${text.slice(0, TEXT_KNOB_EXCERPT).trimEnd()}…` : text}”`;
    }
    case "entityRef":
      // The stored value IS an id and the roster surfaces hold no chooser to resolve it — degraded but
      // visible (the same posture the editor takes for an unknown rule preset), never silently dropped.
      return String(value);
    default: {
      const exhaustive: never = descriptor;
      throw new Error(`unhandled rule-preset knob kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/** One saved rule's resolved knobs as a one-line gloss ("Every N beats: 12 · Nudge: “Take stock…”"), or
 *  `null` when the catalogue cannot say what the bag means (an unknown preset, or a knobless one). */
export function rosterRuleKnobGloss(preset: RulePresetView | undefined, knobs: RosterKnobBag): string | null {
  if (preset === undefined) {
    return null;
  }
  const parts: string[] = [];
  for (const knob of preset.knobs) {
    const value = knobs[knob.key];
    if (value === undefined) {
      continue;
    }
    parts.push(`${knob.label}: ${knobValueText(knob, value)}`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

/** A saved rule as ONE line — title plus its knobs in parentheses. The picker's include-line renders this
 *  inline; the editor splits the two halves across two type steps. */
export function rosterRuleLine(preset: RulePresetView | undefined, rulePresetId: RulePresetId, knobs: RosterKnobBag): string {
  const title = preset?.title ?? rulePresetId;
  const gloss = rosterRuleKnobGloss(preset, knobs);
  return gloss === null ? title : `${title} (${gloss})`;
}

/** The apply outcome as ONE sentence, led by the roster's name so a fast hand with several rosters can tell
 *  which one answered. Every door says this same sentence.
 *
 *  The "Added N" clause is DROPPED at zero rather than printed: nothing landing is the idempotent re-apply
 *  succeeding, and "Added 0 · 3 already here" reported that success as a failure. Each refused rule is
 *  named WITH automation's own reason (build record §6.4) — a count would tell a host that something did
 *  not happen without ever saying what. */
function applySentence(args: {
  readonly rosterName: string;
  readonly result: ApplyRosterPresetResult;
  readonly ruleTitleOf: (id: RulePresetId) => string;
}): string {
  const { rosterName, result, ruleTitleOf } = args;
  const parts: string[] = [];
  if (result.added.length > 0) {
    parts.push(`added ${characterCountPhrase(result.added.length)}`);
  } else if (result.alreadyPresent.length > 0) {
    parts.push(result.skipped.length === 0 ? "everything is already here" : `${result.alreadyPresent.length} already here`);
  }
  if (result.skipped.length > 0) {
    parts.push(`${characterCountPhrase(result.skipped.length)} skipped — a character was deleted`);
  }
  const rulesOn = result.rulesMinted.length + result.rulesAlreadyPresent.length;
  if (rulesOn > 0) {
    parts.push(`${rulesOn} rule${rulesOn === 1 ? "" : "s"} on`);
  }
  for (const skip of result.rulesSkipped) {
    parts.push(`${ruleTitleOf(skip.rulePresetId)} skipped — ${skip.reason}`);
  }
  return `${rosterName}: ${parts.length === 0 ? "nothing to change" : parts.join(" · ")}`;
}

/** THE apply report — every one of the three doors says this and nothing else. The CHANNEL rides with the
 *  sentence (the `runOutcomeNotice` precedent in the automation feature's `rule-copy.ts`): `warn` is the
 *  honest degrade — the apply worked, but not all of what the roster promised landed — and a skipped member
 *  or a refused rule announced on the SUCCESS channel is the same under-report in a friendlier colour. */
export function applyNotice(args: {
  readonly rosterName: string;
  readonly result: ApplyRosterPresetResult;
  readonly ruleTitleOf: (id: RulePresetId) => string;
}): { readonly channel: "success" | "warn"; readonly line: string } {
  const degraded = args.result.skipped.length > 0 || args.result.rulesSkipped.length > 0;
  return { channel: degraded ? "warn" : "success", line: applySentence(args) };
}

/** A roster's seats counted in one word everywhere: characters. A member is a human in a room (the vocabulary map). */
export function characterCountPhrase(count: number): string {
  return `${count} ${count === 1 ? "character" : "characters"}`;
}

/** The row controls' accessible names carry what the badges only SHOW (side-eye P2-1: nine tab stops and
 *  not one announced that applying this roster switches automation on in the room).
 *
 *  #1032 adds the THIRD thing an apply carries. `RosterPresetSummary.hasGroupConfig` was served by
 *  `rosterPreset.list` and read by no client file, so a roster whose apply also rewrites the room's reply
 *  mode, speaker labels and card visibility looked identical to one that only adds seats — the same
 *  under-report P2-1 filed for the rules, one field over. "Group behavior" is the SETTINGS SECTION's own
 *  word for that blob (`settings-context-tab.tsx`), so a host reads the same name in both places. */
export function rosterCountsSuffix(characterCount: number, ruleCount: number, hasGroupConfig: boolean): string {
  const parts = [characterCountPhrase(characterCount)];
  if (ruleCount > 0) {
    parts.push(`${ruleCount} rule${ruleCount === 1 ? "" : "s"}`);
  }
  if (hasGroupConfig) {
    parts.push("group behavior");
  }
  return ` — ${parts.join(", ")}`;
}
