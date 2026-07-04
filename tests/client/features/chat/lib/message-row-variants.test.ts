// Unit: the chatStyle variant table (features/chat/lib/message-row-variants). Pins the ONE-surface,
// three-appearance dispatch — the table covers EXACTLY the render-side chatStyle vocabulary (so a new
// member can't ship unpainted) and each skin emits the role-correct token utilities.

import { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { MESSAGE_ROW_SKINS } from "../../../../../packages/client/src/features/chat/lib/message-row-variants";
import { expect, test } from "../../../../support/fixtures";

test("the skin table covers exactly the chatStyle vocabulary", () => {
  expect(Object.keys(MESSAGE_ROW_SKINS).sort()).toEqual([...THEME_SCOPE_CHAT_STYLES].sort());
});

test("bubble skin paints role-specific bubble tokens + alignment", () => {
  const bubble = MESSAGE_ROW_SKINS.bubble;
  expect(bubble.inner("user")).toContain("bg-user-bubble");
  expect(bubble.inner("assistant")).toContain("bg-ai-bubble");
  expect(bubble.inner("system")).toContain("bg-system-bubble");
  expect(bubble.outer("user")).toContain("items-end");
  expect(bubble.outer("assistant")).toContain("items-start");
});

test("document skin uses the prose-body treatment, not bubbles", () => {
  const doc = MESSAGE_ROW_SKINS.document;
  expect(doc.inner("assistant")).toContain("text-prose-body");
  expect(doc.inner("assistant")).not.toContain("bg-ai-bubble");
});
