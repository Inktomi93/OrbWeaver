// The room-overrides wire↔form mapping (lib/room-overrides-form-model.ts — the PURE half of the room-
// overrides autosave form; the boundary is the module-scope const in components/room-overrides-form.tsx).
// The load-bearing invariants: (1) empty text ⇒ INHERIT, so `fromRoomOverridesForm` OMITS the key entirely
// (a stored `""` is not nullish → the assembler would treat it as override-to-empty, not inherit);
// (2) the projection is exactly THREE section-text fields — the author's-note arm was retired (owner ruling
// 2026-08-01: it was a second home for what `chat_injections` owns), so nothing here maps at-depth
// directives. It exercises the pure wire/model mapping independently of the browser editor composition.

import type { RoomOverridesFormValues } from "../../../../../packages/client/src/features/chat/lib/room-overrides-form-model.ts";
import {
  EMPTY_ROOM_OVERRIDES_FORM,
  fromRoomOverridesForm,
  toRoomOverridesForm,
} from "../../../../../packages/client/src/features/chat/lib/room-overrides-form-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function form(overrides: Partial<RoomOverridesFormValues> = {}): RoomOverridesFormValues {
  return { ...EMPTY_ROOM_OVERRIDES_FORM, ...overrides };
}

// ── toRoomOverridesForm ──────────────────────────────────────────────────────────────────────────

test("toRoomOverridesForm: absent text ⇒ '' across exactly the three override slots", () => {
  const values = toRoomOverridesForm({});

  expect(values).toEqual({ scenario: "", mainPrompt: "", postHistory: "" });
  // The retired author's-note keys are gone from the projection entirely.
  expect(Object.keys(values).sort()).toEqual(["mainPrompt", "postHistory", "scenario"]);
});

test("toRoomOverridesForm: present values pass through", () => {
  const values = toRoomOverridesForm({ scenario: "a rainy alley", postHistory: "stay noir" });

  expect(values.scenario).toBe("a rainy alley");
  expect(values.postHistory).toBe("stay noir");
});

// ── fromRoomOverridesForm ────────────────────────────────────────────────────────────────────────

test("fromRoomOverridesForm: an emptied text field OMITS the key (empty ⇒ inherit, never a stored '')", () => {
  const out = fromRoomOverridesForm(form({ scenario: "", mainPrompt: "   " }));

  // Load-bearing: the KEY must be absent, not present-as-"" (a `""` would override-to-empty, not inherit).
  expect("scenario" in out).toBe(false);
  expect("mainPrompt" in out).toBe(false);
  expect(out).toEqual({});
});

test("fromRoomOverridesForm: non-empty text is carried on each of the three slots", () => {
  const out = fromRoomOverridesForm(form({ scenario: "a rainy alley", mainPrompt: "be terse", postHistory: "stay noir" }));

  expect(out).toEqual({ scenario: "a rainy alley", mainPrompt: "be terse", postHistory: "stay noir" });
  // No at-depth arm can reach the wire: a room note is a chat INJECTION now, not an override field.
  expect("authorsNote" in out).toBe(false);
});
