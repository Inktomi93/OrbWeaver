import { takePersonaEditorFocus } from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { __readPersonaEditorFocusForTest, dropPersonaEditorFocusExcept, requestPersonaEditorFocus } from "#client/state/persona-editor-focus-store.ts";

// The focus request is one-shot: raised by the Edit door, taken by the editor, and never left behind for a
// later expand to trip over.

test("taking the request clears it, so a later expand finds nothing to focus", () => {
  const personaId = mintTypeId(ID_PREFIX.persona);
  requestPersonaEditorFocus(personaId);
  expect(__readPersonaEditorFocusForTest()).toBe(personaId);
  takePersonaEditorFocus();
  expect(__readPersonaEditorFocusForTest()).toBeNull();
});

test("a request for another persona is dropped, and one for the same persona is kept", () => {
  const first = mintTypeId(ID_PREFIX.persona);
  const second = mintTypeId(ID_PREFIX.persona);
  requestPersonaEditorFocus(first);
  dropPersonaEditorFocusExcept(first);
  expect(__readPersonaEditorFocusForTest()).toBe(first);
  dropPersonaEditorFocusExcept(second);
  expect(__readPersonaEditorFocusForTest()).toBeNull();
});

test("clearing the selection (null) drops every request", () => {
  requestPersonaEditorFocus(mintTypeId(ID_PREFIX.persona));
  dropPersonaEditorFocusExcept(null);
  expect(__readPersonaEditorFocusForTest()).toBeNull();
});

test("a repeat request for the same persona is a fresh request after it was taken", () => {
  const personaId = mintTypeId(ID_PREFIX.persona);
  requestPersonaEditorFocus(personaId);
  takePersonaEditorFocus();
  requestPersonaEditorFocus(personaId);
  expect(__readPersonaEditorFocusForTest()).toBe(personaId);
});
