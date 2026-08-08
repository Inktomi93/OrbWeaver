// The Prose settings-section form model (PROSE-1 S2) — the projection/patch/footer helpers the section's
// read and write paths both run through. The CT drives the rendered round-trip; this pins the pure halves:
// the leaf-`null` clear contract (the bug class that makes "reset" not reset), the baseVersion stamp, and
// the warn-never-block lint's honest scope.

import { PROSE_MAX_CHARS, PROSE_SLOTS, USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import {
  projectProseForm,
  proseFieldName,
  proseSlotPatch,
  toProsePatch,
  validateProseLengths,
} from "../../../../../packages/client/src/features/chat/lib/prose-settings-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// A user-home slot carrying a required pre-substitution token — the lint's subject.
const NUDGE = "chat.group.roundNudge";
const ARBITER = "chat.arbiter.system";

test("the editable cohort is every user-home slot EXCEPT the legacy-adapted imagery template/caption fields", () => {
  expect(USER_PROSE_SLOT_IDS.length).toBeGreaterThan(0);
  for (const id of USER_PROSE_SLOT_IDS) {
    expect(PROSE_SLOTS[id].home).toBe("user");
  }
  // Those six keep their own storage (`UserSettings.imagery`) and their own editor — a second door here
  // would write an override the resolver never reads.
  expect(USER_PROSE_SLOT_IDS).not.toContain("imagery.template.character");
  expect(USER_PROSE_SLOT_IDS).not.toContain("imagery.caption.faceMultimodal");
  // …while the negative base, which IS stored in `UserSettings.prose`, is editable.
  expect(USER_PROSE_SLOT_IDS).toContain("imagery.negative.base");
});

test("field names swap the slot id's dots for dashes (a dotted name would be read as a form PATH)", () => {
  expect(proseFieldName(ARBITER)).toBe("chat-arbiter-system");
  for (const id of USER_PROSE_SLOT_IDS) {
    expect(proseFieldName(id)).not.toContain(".");
  }
});

test("a virgin blob projects every slot to an empty field (empty = using the shipped default)", () => {
  const form = projectProseForm({});
  expect(Object.keys(form)).toHaveLength(USER_PROSE_SLOT_IDS.length);
  expect(Object.values(form).every((value) => value === "")).toBe(true);
});

test("a stored override projects into its own field only", () => {
  const form = projectProseForm({ [ARBITER]: { text: "pick the quiet one", baseVersion: 1 } });
  expect(form[proseFieldName(ARBITER)]).toBe("pick the quiet one");
  expect(form[proseFieldName(NUDGE)]).toBe("");
});

test("a typed field is stamped with the CURRENT slot version; a blank one is the leaf null (a real reset)", () => {
  expect(proseSlotPatch(ARBITER, "  pick the quiet one  ")).toEqual({ text: "pick the quiet one", baseVersion: PROSE_SLOTS[ARBITER].version });
  expect(proseSlotPatch(ARBITER, "   ")).toBeNull();
});

test("the patch spells EVERY slot — an untouched slot rides as null, so clearing a field clears the override", () => {
  const patch = toProsePatch({ ...projectProseForm({}), [proseFieldName(ARBITER)]: "pick the quiet one" });
  expect(Object.keys(patch)).toHaveLength(USER_PROSE_SLOT_IDS.length);
  expect(patch[ARBITER]).toEqual({ text: "pick the quiet one", baseVersion: PROSE_SLOTS[ARBITER].version });
  expect(patch[NUDGE]).toBeNull();
});

// The footer-state tests MOVED to `tests/contracts/prose/index.contract.test.ts` with `proseFooterState`
// itself (2026-08-07): the preset Templates drill-in renders the same footer, so the derivation went down to
// `@orb/contracts/prose` and its tests follow the source under the mirror rule.

// ── The over-cap SAVE REFUSAL (the twin of `validatePresetProse`) ─────────────────────────────────────
// `proseOverridesSchema` heals an over-cap override to ABSENT: the patch "succeeds", the key disappears, and
// the host's wording is replaced by the shipped default with nothing having said so. This validator makes the
// autosave form invalid instead, which is the seam the factory's save driver and teardown flush both gate on.
// The rendered half (the field's own aria-invalid + message) is pinned in the section CT.

test("validateProseLengths refuses exactly what the schema would heal away, keyed by FIELD name so the card shows it", () => {
  const under = projectProseForm({ [ARBITER]: { text: "y".repeat(PROSE_MAX_CHARS), baseVersion: 1 } });
  expect(validateProseLengths(projectProseForm({}))).toBeUndefined();
  // The boundary is the schema's, exactly — `.max(PROSE_MAX_CHARS)` keeps this one.
  expect(validateProseLengths(under)).toBeUndefined();

  const over = projectProseForm({ [ARBITER]: { text: "y".repeat(PROSE_MAX_CHARS + 12), baseVersion: 1 } });
  // Keyed by the DASHED field name, not the slot id (this form's values are the flat bag — dots are TanStack
  // value paths), which is what lands the message on the offending card instead of nowhere. Asserted as the
  // WHOLE record so the exclusivity rides too: an over-cap override must not paint its innocent siblings red.
  expect(validateProseLengths(over)?.fields).toStrictEqual({ [proseFieldName(ARBITER)]: "12 characters over the limit — trim it to save" });
});

test("validateProseLengths measures the TRIMMED text — the bytes the patch actually carries", () => {
  // `proseSlotPatch` trims before it stamps, so padding must never be what refuses a save whose real payload
  // fits (nor what excuses one that does not).
  const padded = { [proseFieldName(ARBITER)]: `   ${"y".repeat(PROSE_MAX_CHARS)}   ` };
  expect(validateProseLengths(padded)).toBeUndefined();
  expect(proseSlotPatch(ARBITER, padded[proseFieldName(ARBITER)] ?? "")?.text.length).toBe(PROSE_MAX_CHARS);
});
