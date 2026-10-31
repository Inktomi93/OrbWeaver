// D336: the message bubble and the transcript plate left Card for MessageBubble and the layout plate, so Card refuses them.
import type { MessageRole } from "@orb/kit/message-role";
import { Card } from "@orb/ui/card";
import { MessageBubble } from "@orb/ui/message-bubble";
import { createElement } from "react";
import { expectTypeOf, test } from "vitest";

test("Card refuses the bubble tones, the bubble and plate shapes and the backdrop tone", () => {
  // @ts-expect-error a bubble fill is a MessageBubble role
  createElement(Card, { tone: "bubble" }, "x");
  // @ts-expect-error a bubble fill is a MessageBubble role
  createElement(Card, { tone: "userBubble" }, "x");
  // @ts-expect-error a bubble fill is a MessageBubble role
  createElement(Card, { tone: "systemBubble" }, "x");
  // @ts-expect-error the bubble box is a MessageBubble shape
  createElement(Card, { shape: "bubble" }, "x");
  // @ts-expect-error the transcript plate is the layout plate
  createElement(Card, { shape: "plate" }, "x");
  // @ts-expect-error the transcript plate is the layout plate
  createElement(Card, { tone: "backdrop" }, "x");
  expectTypeOf<Extract<NonNullable<Parameters<typeof Card>[0]["tone"]>, "bubble" | "userBubble" | "systemBubble" | "backdrop">>().toBeNever();
});

test("MessageBubble names its role, from the message roles", () => {
  createElement(MessageBubble, { messageRole: "user", shape: "bubble" }, "x");
  // @ts-expect-error the speaker is required
  createElement(MessageBubble, {}, "x");
  // @ts-expect-error the role is a message role
  createElement(MessageBubble, { messageRole: "narrator" }, "x");
  expectTypeOf<Parameters<typeof MessageBubble>[0]["messageRole"]>().toEqualTypeOf<MessageRole>();
});
