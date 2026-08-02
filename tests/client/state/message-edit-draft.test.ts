// The edit-in-place draft store (PD-119): presence-in-map IS the edit-mode flag, keyed by message id
// — the external-store discipline `@orb/ui/message-list`'s windowed virtualizer requires (an off-screen
// row's local `useState` would silently drop mid-edit text on scroll-back). Exercised through the
// non-hook `__readMessageEditDraftForTest` snapshot (the hooks themselves need a React render, same posture as
// `chat-stream.test.ts` exercising `subscribeTurnSlot` rather than `useTurnSlot`/`useTurnPhase`).

import { __readMessageEditDraftForTest, cancelEditingMessage, setMessageEditDraft, startEditingMessage } from "@orb/client/state";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const MSG_A = castId<MessageId>("msg_testeditdraftaaaa");
const MSG_B = castId<MessageId>("msg_testeditdraftbbbb");

describe("message-edit-draft store", () => {
  test("not editing by default — undefined is the not-editing sentinel", () => {
    expect(__readMessageEditDraftForTest(MSG_A)).toBeUndefined();
  });

  test("startEditingMessage seeds the draft from the message's current content", () => {
    startEditingMessage(MSG_A, "hello there");
    expect(__readMessageEditDraftForTest(MSG_A)).toBe("hello there");
    cancelEditingMessage(MSG_A);
  });

  test("setMessageEditDraft updates the in-progress text (every keystroke)", () => {
    startEditingMessage(MSG_A, "hello");
    setMessageEditDraft(MSG_A, "hello world");
    expect(__readMessageEditDraftForTest(MSG_A)).toBe("hello world");
    cancelEditingMessage(MSG_A);
  });

  test("cancelEditingMessage clears the draft entirely — back to the not-editing sentinel", () => {
    startEditingMessage(MSG_A, "draft text");
    expect(__readMessageEditDraftForTest(MSG_A)).toBe("draft text");
    cancelEditingMessage(MSG_A);
    expect(__readMessageEditDraftForTest(MSG_A)).toBeUndefined();
  });

  test("re-entering edit mode reseeds the draft (a second Edit click discards unsaved text)", () => {
    startEditingMessage(MSG_A, "original");
    setMessageEditDraft(MSG_A, "unsaved edit");
    startEditingMessage(MSG_A, "original"); // re-open — discards "unsaved edit"
    expect(__readMessageEditDraftForTest(MSG_A)).toBe("original");
    cancelEditingMessage(MSG_A);
  });

  test("per-message isolation — editing one message never touches another's draft", () => {
    startEditingMessage(MSG_A, "a's text");
    startEditingMessage(MSG_B, "b's text");
    expect(__readMessageEditDraftForTest(MSG_A)).toBe("a's text");
    expect(__readMessageEditDraftForTest(MSG_B)).toBe("b's text");

    cancelEditingMessage(MSG_A);
    expect(__readMessageEditDraftForTest(MSG_A)).toBeUndefined();
    expect(__readMessageEditDraftForTest(MSG_B)).toBe("b's text"); // untouched by A's cancel

    cancelEditingMessage(MSG_B);
  });

  test("an empty-string draft is a valid editing state, distinct from not-editing", () => {
    startEditingMessage(MSG_A, "");
    expect(__readMessageEditDraftForTest(MSG_A)).toBe("");
    expect(__readMessageEditDraftForTest(MSG_A) !== undefined).toBe(true); // still "editing", just empty
    cancelEditingMessage(MSG_A);
  });
});
