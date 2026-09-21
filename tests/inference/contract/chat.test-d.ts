// contract/chat — `ChatDeltaEvent` always names a real chat, so the callback request arm must carry that
// identity too. The runtime backstop is exercised across every chat wire in streaming-completion.suite.

import type { ChatId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { ChatDeltaEvent, ChatDeltaSubscription } from "../../../packages/inference/src/contract/index.ts";

type Callback = (event: ChatDeltaEvent) => void;

test("a delta callback requires a ChatId in the same request arm", () => {
  expectTypeOf<{ readonly chatId: ChatId; readonly onDelta: Callback }>().toExtend<ChatDeltaSubscription>();
  expectTypeOf<{ readonly onDelta: Callback }>().not.toExtend<ChatDeltaSubscription>();
  expectTypeOf<{ readonly chatId?: undefined; readonly onDelta: Callback }>().not.toExtend<ChatDeltaSubscription>();
  expectTypeOf<{ readonly chatId?: ChatId; readonly onDelta?: undefined }>().toExtend<ChatDeltaSubscription>();
});
