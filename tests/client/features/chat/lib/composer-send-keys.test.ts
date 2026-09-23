// Unit: `shouldSendOnEnter` (features/chat/lib/composer-send-keys) — the composer's Enter-to-send
// decision (enterSends). Pins neo's modifier grammar for both pref states.

import { shouldSendOnEnter } from "../../../../../packages/client/src/features/chat/lib/composer-send-keys.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const base = { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false };

test("enterSends ON: plain Enter sends", () => {
  expect(shouldSendOnEnter(base, true)).toBe(true);
});

test("enterSends ON: Shift+Enter is a newline (never sends)", () => {
  expect(shouldSendOnEnter({ ...base, shiftKey: true }, true)).toBe(false);
});

test("enterSends ON: ⌘/Ctrl+Enter still sends", () => {
  expect(shouldSendOnEnter({ ...base, metaKey: true }, true)).toBe(true);
  expect(shouldSendOnEnter({ ...base, ctrlKey: true }, true)).toBe(true);
});

test("enterSends OFF: plain Enter is a newline (does not send)", () => {
  expect(shouldSendOnEnter(base, false)).toBe(false);
});

test("enterSends OFF: ⌘/Ctrl+Enter sends", () => {
  expect(shouldSendOnEnter({ ...base, metaKey: true }, false)).toBe(true);
  expect(shouldSendOnEnter({ ...base, ctrlKey: true }, false)).toBe(true);
});

test("enterSends OFF: Shift+Enter is a newline", () => {
  expect(shouldSendOnEnter({ ...base, shiftKey: true }, false)).toBe(false);
});

test("a non-Enter key never sends", () => {
  expect(shouldSendOnEnter({ ...base, key: "a" }, true)).toBe(false);
});

test("an IME candidate-confirm Enter (isComposing) never sends", () => {
  expect(shouldSendOnEnter({ ...base, isComposing: true }, true)).toBe(false);
});
