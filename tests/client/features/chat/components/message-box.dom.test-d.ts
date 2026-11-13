// Only the filled card paints a portrait or a tick, so the reading boxes (flat's plate, the document's page) cannot be handed art.

import { createElement } from "react";
import { expectTypeOf, test } from "vitest";
import { MessageBox } from "#client/features/chat/components/message-box.tsx";
import type { MessageBoxFacts } from "#client/features/chat/lib/message-box-facts.ts";

const SHARED = {
  role: "assistant",
  shape: "stack",
  phoneCap: false,
  corners: "card",
  lastRowFloor: false,
  headerOverlaid: true,
  editing: false,
  receded: false,
  positioned: false,
  children: null,
} as const;

test("a reading box takes no art decoration, and a bubble card does", () => {
  createElement(MessageBox, { ...SHARED, box: "bubble", artDecoration: "portraitStart" });
  createElement(MessageBox, { ...SHARED, box: "plate" });
  createElement(MessageBox, { ...SHARED, box: "page" });
  // @ts-expect-error a plate paints no art
  createElement(MessageBox, { ...SHARED, box: "plate", artDecoration: "portraitStart" });
  // @ts-expect-error a page paints no art
  createElement(MessageBox, { ...SHARED, box: "page", artDecoration: "portraitEnd" });
  expectTypeOf<Extract<MessageBoxFacts, { readonly box: "plate" | "page" }>>().not.toHaveProperty("artDecoration");
  expectTypeOf<Extract<MessageBoxFacts, { readonly box: "bubble" }>>().toHaveProperty("artDecoration");
});
