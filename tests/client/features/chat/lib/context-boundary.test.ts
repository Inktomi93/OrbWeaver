// Unit: the "last-in-context" boundary resolver (features/chat/lib/context-boundary, Phase 4b §B.5.2).
// Pins the current-state rule: only the MOST RECENT assistant variant's `contextBoundaryMessageId`
// reflects where the model's memory currently cuts off — an older turn's stamp is stale.

import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveContextBoundaryMessageId } from "../../../../../packages/client/src/features/chat/lib/context-boundary";
import { expect, test } from "../../../../support/fixtures";
import { makeMessageView } from "../fixtures";

test("returns null for an empty transcript", () => {
  expect(resolveContextBoundaryMessageId([])).toBeNull();
});

test("returns null when no message has ever recorded a boundary (nothing dropped yet)", () => {
  const messages = [
    makeMessageView({ id: castId<MessageId>("msg_1"), contextBoundaryMessageId: null }),
    makeMessageView({ id: castId<MessageId>("msg_2"), contextBoundaryMessageId: null }),
  ];
  expect(resolveContextBoundaryMessageId(messages)).toBeNull();
});

test("returns the boundary from the MOST RECENT stamped message, not an earlier one", () => {
  const messages = [
    makeMessageView({
      id: castId<MessageId>("msg_1"),
      contextBoundaryMessageId: castId<MessageId>("msg_0"),
    }),
    makeMessageView({
      id: castId<MessageId>("msg_2"),
      contextBoundaryMessageId: castId<MessageId>("msg_1"),
    }),
  ];
  expect(resolveContextBoundaryMessageId(messages)).toBe(castId<MessageId>("msg_1"));
});

test("walks past trailing messages with no boundary to find the latest stamped one", () => {
  const messages = [
    makeMessageView({
      id: castId<MessageId>("msg_1"),
      contextBoundaryMessageId: castId<MessageId>("msg_0"),
    }),
    // A more recent turn whose history fit entirely (nothing dropped) — no fresher stamp.
    makeMessageView({ id: castId<MessageId>("msg_2"), contextBoundaryMessageId: null }),
    makeMessageView({
      id: castId<MessageId>("msg_3"),
      role: "user",
      contextBoundaryMessageId: null,
    }),
  ];
  expect(resolveContextBoundaryMessageId(messages)).toBe(castId<MessageId>("msg_0"));
});
