// The Prose settings-section form model (PROSE-1 S2) — the projection/patch/footer helpers the section's
// read and write paths both run through. The CT drives the rendered round-trip; this pins the pure halves:
// the leaf-`null` clear contract (the bug class that makes "reset" not reset), the baseVersion stamp, and
// the warn-never-block lint's honest scope.

import type { ProseOverride } from "@orb/contracts/prose";
import { PROSE_SLOTS, USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import {
  projectProseForm,
  proseFieldName,
  proseFooterState,
  proseSlotPatch,
  toProsePatch,
} from "../../../../../packages/client/src/features/chat/lib/prose-settings-model";
import { expect, test } from "../../../../support/fixtures";

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

test("the footer reads Default while the field is empty, whatever is still stored (the next save clears it)", () => {
  const stored: ProseOverride = { text: "an override about to be cleared", baseVersion: 1 };
  expect(proseFooterState(ARBITER, "", stored)).toEqual({ isDefault: true, stale: false, missing: [] });
});

test("the required-token lint bites only text the host actually wrote, and names the missing token", () => {
  expect(proseFooterState(NUDGE, "Write the next reply.", undefined).missing).toEqual(["{{name}}"]);
  expect(proseFooterState(NUDGE, "[Write the next reply only as {{name}}.]", undefined).missing).toEqual([]);
  // The shipped default carries every required token by construction, so an empty field never lints.
  expect(proseFooterState(NUDGE, "", undefined).missing).toEqual([]);
});

test("stale = the shipped default moved on since this override was authored, and only while it is unedited", () => {
  // Every slot ships at version 1 today, so `baseVersion: 0` is the only way to express "authored against an
  // older version" until a default is first revised — which is exactly the state a real `baseVersion: 1`
  // override lands in the day a slot bumps to 2.
  const older: ProseOverride = { text: "my own director prompt", baseVersion: 0 };
  expect(proseFooterState(ARBITER, older.text, older).stale).toBe(true);
  // Mid-edit the pending save re-stamps the version, so the chip must not linger over unsaved text.
  expect(proseFooterState(ARBITER, `${older.text} plus a thought`, older).stale).toBe(false);
  expect(proseFooterState(ARBITER, older.text, { text: older.text, baseVersion: PROSE_SLOTS[ARBITER].version }).stale).toBe(false);
});
