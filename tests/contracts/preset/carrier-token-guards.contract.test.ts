// @orb/contracts/preset — the write-boundary guards on carrier format strings and the shared injection-template cap.

import {
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_PROMPT_CONFIG,
  guidedActionConfigSchema,
  MAX_INJECTION_TEMPLATE_LENGTH,
  parsePromptConfig,
  promptConfigSchema,
  promptConfigWriteSchema,
} from "@orb/contracts/preset";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { z } from "zod";

// ── The OWNER GUARD (2026-08-02): a carrier format string may not silently drop its payload ────────
test("the write boundary REFUSES a wiFormat that dropped {{entry}}, naming the token", () => {
  const result = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    formatStrings: { wiFormat: "Lore: (nothing here)" },
  });
  expect(result.success).toBe(false);
  const refusal = result.success ? "" : z.prettifyError(result.error);
  expect(refusal).toContain("→ at formatStrings.wiFormat");
  expect(refusal).toContain("{{entry}}");
});

test("blank-means-default survives the guard: an empty (or absent) wiFormat is accepted", () => {
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "" } }).success).toBe(true);
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "   " } }).success).toBe(true);
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: {} }).success).toBe(true);
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "Lore: {{entry}}" } }).success).toBe(true);
});

test("the guard is a WRITE boundary only — a stored broken wrapper still LOADS (never degraded to default)", () => {
  // PROSE-1's `requiredMacros` posture stays a lint, and a read-side refusal would nuke the WHOLE preset
  // (parsePromptConfig degrades a failed parse to DEFAULT_PROMPT_CONFIG) over one bad field.
  const stored = { ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "broken" } };
  const parsed = parsePromptConfig(stored);
  expect(parsed.formatStrings?.wiFormat).toBe("broken");
  expect(parsed.sections).toHaveLength(DEFAULT_PROMPT_CONFIG.sections.length);
});

test("a NUDGE missing its recommended macros is NOT refused (a lint, never a block — PROSE-1 §6.3)", () => {
  const result = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    formatStrings: { impersonateNudge: "Write as me." },
  });
  expect(result.success).toBe(true);
});

// ── THE SECOND CARRIER ENUMERATION (owner ruling 2026-08-08, option C of) ──
// `{{note}}` carries the injection's ENTIRE payload: `spliceProseTokens` is a replace, so a frame override
// that dropped it ships `[Note from user: ]` with the author's note gone — the `{{entry}}` failure exactly.
// The frames store in `promptConfig.prose`, not `formatStrings`, which is why they need their own list and
// why the divergence survived unnoticed: the enforcement split tracked storage plumbing, not the failure.
const NOTE_CARRIER_SLOTS = ["chat.injection.userNote"] as const;
/** A stored override as the write schema takes it — `baseVersion` is the slot version it was authored at. */
const CARRIER_BASE_VERSION = 1;
function withProse(slotId: string, text: string): Record<string, unknown> {
  return { ...DEFAULT_PROMPT_CONFIG, prose: { [slotId]: { text, baseVersion: CARRIER_BASE_VERSION } } };
}

test("the write boundary REFUSES a note frame that dropped {{note}}, naming the token", () => {
  for (const slotId of NOTE_CARRIER_SLOTS) {
    const result = promptConfigWriteSchema.safeParse(withProse(slotId, "[A note from the operator.]"));
    expect(result.success, slotId).toBe(false);
    const refusal = result.success ? "" : z.prettifyError(result.error);
    expect(refusal, slotId).toContain(`→ at prose["${slotId}"].text`);
    expect(refusal, slotId).toContain("{{note}}");
  }
});

// The game-notes frame's `{{reminder}}` carries the whole rpg reminder, so an override without it is refused too.
test("the write boundary REFUSES a game-notes frame that dropped {{reminder}}, and takes one that keeps it", () => {
  const dropped = promptConfigWriteSchema.safeParse(withProse("rpg.reminder.frame", "[Game notes.]"));
  expect(dropped.success).toBe(false);
  const refusal = dropped.success ? "" : z.prettifyError(dropped.error);
  expect(refusal).toContain('→ at prose["rpg.reminder.frame"].text');
  expect(refusal).toContain("{{reminder}}");
  expect(promptConfigWriteSchema.safeParse(withProse("rpg.reminder.frame", "<<{{reminder}}>>")).success).toBe(true);
});

// The two teaching-note frames carry their note's whole payload the same way, so each refuses a dropped token.
test("the write boundary REFUSES a teaching-note frame that dropped its token, and takes one that keeps it", () => {
  for (const [slotId, token] of [
    ["chat.teach.choicesFrame", "{{teach}}"],
    ["automation.guidance.frame", "{{guidance}}"],
  ] as const) {
    const dropped = promptConfigWriteSchema.safeParse(withProse(slotId, "[A note for the model.]"));
    expect(dropped.success, slotId).toBe(false);
    const refusal = dropped.success ? "" : z.prettifyError(dropped.error);
    expect(refusal, slotId).toContain(`→ at prose["${slotId}"].text`);
    expect(refusal, slotId).toContain(token);
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, `<<${token}>>`)).success, slotId).toBe(true);
  }
});

test("blank-means-default survives the note guard, and the SPLICE's own spellings are accepted", () => {
  for (const slotId of NOTE_CARRIER_SLOTS) {
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "")).success, slotId).toBe(true);
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "   ")).success, slotId).toBe(true);
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "<<{{note}}>>")).success, slotId).toBe(true);
    // The refusal may never be STRICTER than the renderer: `spliceProseTokens`' regex is whitespace-tolerant
    // and case-insensitive, so both of these really do get filled and neither may bounce.
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "<<{{ note }}>>")).success, slotId).toBe(true);
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "<<{{NOTE}}>>")).success, slotId).toBe(true);
  }
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, prose: {} }).success).toBe(true);
});

test("the note guard is a WRITE boundary only — a stored broken frame still LOADS (the {{entry}} precedent)", () => {
  const stored = withProse("chat.injection.userNote", "[broken]");
  const parsed = parsePromptConfig(stored);
  expect(parsed.prose["chat.injection.userNote"]?.text).toBe("[broken]");
  expect(parsed.sections).toHaveLength(DEFAULT_PROMPT_CONFIG.sections.length);
});

test("the guard did NOT widen to PROSE-1's requiredMacros: another slot's missing macro still saves", () => {
  // `chat.group.characterHeading` carries `{{name}}` in `requiredMacros` — VOICE guidance whose absence weakens
  // prose rather than deleting payload. Its posture is the unchanged ruling: a lint in the editor, never a
  // block. (Since the F4 re-home it is a PRESET-homed group framing with its own Templates-tab row, so this
  // is a real `promptConfig.prose` write target — proving the note guard reads the two carrier slots and
  // nothing else, not even another preset-homed framing that drops its own required token.)
  const result = promptConfigWriteSchema.safeParse(withProse("chat.group.characterHeading", "A character is present."));
  expect(result.success).toBe(true);
});

test("every declared note carrier really is a carrier: the token rides its slot's default AND requiredMacros", () => {
  // The carrier list spells the token beside the guard; the SLOT spells it in `text`/`requiredMacros`. Nothing
  // in the type system pairs them (contracts/preset cannot import chat's prose table — it would close the
  // `#prose → #preset → #prose` cycle the prose-slot split exists to prevent), so this census is the pairing.
  for (const slotId of NOTE_CARRIER_SLOTS) {
    expect(PROSE_SLOTS[slotId].text, slotId).toContain("{{note}}");
    expect(PROSE_SLOTS[slotId].requiredMacros, slotId).toContain("{{note}}");
  }
});

// ── C8: THE SHARED INJECTION-TEMPLATE CAP (owner ruling 2026-08-08, option 2 of parked-options §2) ─────
// `guidedActions.*.prompt` was the one authored text field in this contract with no ceiling, reaching both
// the preset row and the model's system block unbounded. It now wears the SAME number its functional sibling
// `formatStrings` always did — one constant, one class.
const AT_CAP_PROMPT = "x".repeat(MAX_INJECTION_TEMPLATE_LENGTH);
const OVER_CAP_PROMPT = `${AT_CAP_PROMPT}x`;

test("C8: the guided prompt is capped at the SHARED constant, which is the format strings' cap too", () => {
  expect(guidedActionConfigSchema.safeParse({ prompt: OVER_CAP_PROMPT }).success).toBe(false);
  expect(guidedActionConfigSchema.safeParse({ prompt: AT_CAP_PROMPT }).success).toBe(true);
  // The SAME number bounds `formatStrings` — a second constant here would be the drift the shared one prevents.
  expect(promptConfigSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { continueNudge: OVER_CAP_PROMPT } }).success).toBe(false);
});

test("C8: the write boundary REFUSES an over-cap guided prompt and accepts one exactly at the cap", () => {
  const over = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: OVER_CAP_PROMPT, role: "system" } },
  });
  expect(over.success).toBe(false);
  expect(over.success ? "" : z.prettifyError(over.error)).toContain("→ at guidedActions.response.prompt");
  const at = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: AT_CAP_PROMPT, role: "system" } },
  });
  expect(at.success).toBe(true);
});
