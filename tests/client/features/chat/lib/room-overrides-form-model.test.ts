// The room-overrides wire↔form mapping (lib/room-overrides-form-model.ts — the PURE half of the room-
// overrides autosave form; the boundary is the module-scope const in components/room-overrides-form.tsx).
// The load-bearing
// invariants: (1) empty text ⇒ INHERIT, so `fromRoomOverridesForm` OMITS the key entirely (a stored `""`
// is not nullish → the assembler would treat it as override-to-empty, not inherit); (2) the send-guard
// WITHHOLDS an invalid authorsNote (assistant-at-depth-0 prefill) so an unrelated sibling edit still
// saves; (3) `isAuthorsNotePrefill` aligns with the save's depth coercion — a CLEARED (null) depth lands
// at AUTHORS_NOTE_DEFAULT_DEPTH (≥1), NOT 0, so it is NOT a prefill and shows no false warning. Deep-
// imports the pure model (NOT the hook — its `#forms` import drags browser TSX into typecheck:graph).

import { AUTHORS_NOTE_DEFAULT_DEPTH, AUTHORS_NOTE_DEFAULT_ROLE } from "@orb/contracts/chat";
import type { RoomOverridesFormValues } from "../../../../../packages/client/src/features/chat/lib/room-overrides-form-model";
import {
  fromRoomOverridesForm,
  isAuthorsNotePrefill,
  toRoomOverridesForm,
} from "../../../../../packages/client/src/features/chat/lib/room-overrides-form-model";
import { expect, test } from "../../../../support/fixtures";

function form(overrides: Partial<RoomOverridesFormValues> = {}): RoomOverridesFormValues {
  return {
    scenario: "",
    mainPrompt: "",
    postHistory: "",
    authorsNote: "",
    authorsNoteDepth: AUTHORS_NOTE_DEFAULT_DEPTH,
    authorsNoteRole: AUTHORS_NOTE_DEFAULT_ROLE,
    ...overrides,
  };
}

// ── toRoomOverridesForm ──────────────────────────────────────────────────────────────────────────

test("toRoomOverridesForm: absent text ⇒ '' and an unset authorsNote ⇒ the house depth/role defaults", () => {
  const values = toRoomOverridesForm({});

  expect(values.scenario).toBe("");
  expect(values.mainPrompt).toBe("");
  expect(values.postHistory).toBe("");
  expect(values.authorsNote).toBe("");
  expect(values.authorsNoteDepth).toBe(AUTHORS_NOTE_DEFAULT_DEPTH);
  expect(values.authorsNoteRole).toBe(AUTHORS_NOTE_DEFAULT_ROLE);
});

test("toRoomOverridesForm: present values (incl. the authorsNote directive) pass through", () => {
  const values = toRoomOverridesForm({
    scenario: "a rainy alley",
    authorsNote: { prompt: "stay noir", depth: 2, role: "assistant" },
  });

  expect(values.scenario).toBe("a rainy alley");
  expect(values.authorsNote).toBe("stay noir");
  expect(values.authorsNoteDepth).toBe(2);
  expect(values.authorsNoteRole).toBe("assistant");
});

// ── fromRoomOverridesForm ────────────────────────────────────────────────────────────────────────

test("fromRoomOverridesForm: an emptied text field OMITS the key (empty ⇒ inherit, never a stored '')", () => {
  const out = fromRoomOverridesForm(form({ scenario: "", mainPrompt: "   " }));

  // Load-bearing: the KEY must be absent, not present-as-"" (a `""` would override-to-empty, not inherit).
  expect("scenario" in out).toBe(false);
  expect("mainPrompt" in out).toBe(false);
  expect(out).toEqual({});
});

test("fromRoomOverridesForm: non-empty text is carried; a non-empty authorsNote carries its depth/role", () => {
  const out = fromRoomOverridesForm(
    form({
      scenario: "a rainy alley",
      authorsNote: "stay noir",
      authorsNoteDepth: 3,
      authorsNoteRole: "user",
    }),
  );

  expect(out.scenario).toBe("a rainy alley");
  expect(out.authorsNote).toEqual({ prompt: "stay noir", depth: 3, role: "user" });
});

test("fromRoomOverridesForm: a cleared (null) authorsNote depth writes the house default, not 0", () => {
  const out = fromRoomOverridesForm(form({ authorsNote: "stay noir", authorsNoteDepth: null, authorsNoteRole: "system" }));

  expect(out.authorsNote?.depth).toBe(AUTHORS_NOTE_DEFAULT_DEPTH);
});

test("fromRoomOverridesForm SEND-GUARD: an invalid note (assistant@depth-0) is WITHHELD; siblings still save", () => {
  const out = fromRoomOverridesForm(
    form({
      scenario: "a rainy alley",
      authorsNote: "prefill me",
      authorsNoteDepth: 0,
      authorsNoteRole: "assistant",
    }),
  );

  // The sibling edit lands; the invalid note is dropped from the wire (so the whole-blob write doesn't 400).
  expect(out.scenario).toBe("a rainy alley");
  expect("authorsNote" in out).toBe(false);
});

// ── isAuthorsNotePrefill (the null-depth alignment) ────────────────────────────────────────────────

test("isAuthorsNotePrefill: assistant role AT depth 0 with a note ⇒ true (the guarded combination)", () => {
  expect(isAuthorsNotePrefill(form({ authorsNote: "note", authorsNoteRole: "assistant", authorsNoteDepth: 0 }))).toBe(true);
});

test("isAuthorsNotePrefill: a CLEARED (null) depth ⇒ false — it coerces to the default (≥1), not 0", () => {
  // The F5 alignment: null depth saves as AUTHORS_NOTE_DEFAULT_DEPTH, so no false prefill warning.
  expect(isAuthorsNotePrefill(form({ authorsNote: "note", authorsNoteRole: "assistant", authorsNoteDepth: null }))).toBe(false);
});

test("isAuthorsNotePrefill: assistant at the default depth, a non-assistant role, or an empty note ⇒ false", () => {
  expect(isAuthorsNotePrefill(form({ authorsNote: "note", authorsNoteRole: "assistant", authorsNoteDepth: 4 }))).toBe(false);
  expect(isAuthorsNotePrefill(form({ authorsNote: "note", authorsNoteRole: "system", authorsNoteDepth: 0 }))).toBe(false);
  expect(isAuthorsNotePrefill(form({ authorsNote: "", authorsNoteRole: "assistant", authorsNoteDepth: 0 }))).toBe(false);
});
