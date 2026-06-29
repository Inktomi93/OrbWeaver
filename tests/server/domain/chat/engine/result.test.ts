// engine/result — the pure TurnOutcome builders.

import type { MessageView } from "@orb/contracts/chat";
import { describe, expect, test } from "vitest";
import {
  abortedOutcome,
  committedOutcome,
} from "../../../../../packages/server/src/domain/chat/engine/result";

const view = { id: "message_1", content: "hi" } as unknown as MessageView;

describe("engine/result", () => {
  test("committedOutcome wraps the rows, not aborted", () => {
    expect(committedOutcome([view])).toEqual({
      messages: [view],
      aborted: false,
      abortReason: undefined,
    });
  });

  test("abortedOutcome carries the reason + no messages", () => {
    expect(abortedOutcome("error")).toEqual({
      messages: [],
      aborted: true,
      abortReason: "error",
    });
  });

  test("abortedOutcome preserves a 'user' cancel reason", () => {
    expect(abortedOutcome("user").abortReason).toBe("user");
  });
});
