import { expect, test } from "@orb/testkit/node";
import type { EnterKeyInput } from "#client/features/chat/lib/composer-send-keys.ts";
import { shouldSendOnEnter } from "#client/features/chat/lib/composer-send-keys.ts";

const PLAIN_ENTER: EnterKeyInput = { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false };

test("plain Enter sends only while enterSends is on", () => {
  expect(shouldSendOnEnter(PLAIN_ENTER, true)).toBe(true);
  expect(shouldSendOnEnter(PLAIN_ENTER, false)).toBe(false);
});

test("Control or Meta with Enter sends under either preference", () => {
  for (const enterSends of [true, false]) {
    expect(shouldSendOnEnter({ ...PLAIN_ENTER, ctrlKey: true }, enterSends)).toBe(true);
    expect(shouldSendOnEnter({ ...PLAIN_ENTER, metaKey: true }, enterSends)).toBe(true);
  }
});

test("Shift+Enter is a newline under either preference, even with a send modifier held", () => {
  for (const enterSends of [true, false]) {
    expect(shouldSendOnEnter({ ...PLAIN_ENTER, shiftKey: true }, enterSends)).toBe(false);
    expect(shouldSendOnEnter({ ...PLAIN_ENTER, shiftKey: true, ctrlKey: true }, enterSends)).toBe(false);
  }
});

test("an IME candidate-confirm Enter never sends", () => {
  for (const enterSends of [true, false]) {
    expect(shouldSendOnEnter({ ...PLAIN_ENTER, isComposing: true }, enterSends)).toBe(false);
    expect(shouldSendOnEnter({ ...PLAIN_ENTER, isComposing: true, ctrlKey: true }, enterSends)).toBe(false);
  }
});

test("a key other than Enter never sends", () => {
  for (const enterSends of [true, false]) {
    expect(shouldSendOnEnter({ ...PLAIN_ENTER, key: "a", ctrlKey: true }, enterSends)).toBe(false);
  }
});
