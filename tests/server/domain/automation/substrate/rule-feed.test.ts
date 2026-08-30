// substrate/rule-feed — "announce this rule-set change to whom?". Pure. Pins the header's whole claim: a
// chat-scoped change notifies that chat, and a chat-less (owner-global) change notifies NOBODY rather than
// inventing a room — the gap the header says is named, not papered over.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { notifyRulesChanged } from "../../../../../packages/server/src/domain/automation/substrate/rule-feed.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a chat-scoped rule change announces rulesChanged on that chat", () => {
  const events: AutomationBusEvent[] = [];
  const chatId = castId<ChatId>("chat_x");
  notifyRulesChanged({ notify: (event): void => void events.push(event) }, chatId);
  expect(events).toEqual([{ type: "rulesChanged", chatId }]);
});

test("an owner-global (null chatId) rule change emits NOTHING — no room to invent", () => {
  const events: AutomationBusEvent[] = [];
  notifyRulesChanged({ notify: (event): void => void events.push(event) }, null);
  expect(events).toEqual([]);
});
