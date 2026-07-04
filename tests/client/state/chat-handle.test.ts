// `ChatHandle` (the true `this_chid` successor — state/chat-handle.ts header): the discriminated
// union that makes "did I forget the draft/committed branch" a `tsc` error instead of a runtime
// surprise. Pins the three exported builders/guards behaviorally: `committedChat`/`draftChat`
// produce the right variant shape (never leaking the other variant's field), and `isCommitted`
// narrows correctly both ways (the type-guard's actual runtime behavior, not just its declared
// type — a `h is Extract<...>` signature lies for free if the runtime check itself is wrong).

import { committedChat, draftChat, isCommitted } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const CHAT_ID = castId<ChatId>("chat_handletest0001");

describe("ChatHandle builders + discriminant", () => {
  test("committedChat carries the id under kind:'committed', no draftKey field", () => {
    const handle = committedChat(CHAT_ID);
    expect(handle).toEqual({ kind: "committed", id: CHAT_ID });
    expect("draftKey" in handle).toBe(false);
  });

  test("draftChat carries the draftKey under kind:'draft', no id field", () => {
    const handle = draftChat("draft_abc123");
    expect(handle).toEqual({ kind: "draft", draftKey: "draft_abc123" });
    expect("id" in handle).toBe(false);
  });

  test("isCommitted narrows true for a committed handle, false for a draft", () => {
    expect(isCommitted(committedChat(CHAT_ID))).toBe(true);
    expect(isCommitted(draftChat("draft_xyz"))).toBe(false);
  });

  test("two draft handles with different keys are never confused with each other or a committed handle", () => {
    const draftA = draftChat("draft_a");
    const draftB = draftChat("draft_b");
    expect(draftA).not.toEqual(draftB);
    expect(draftA).not.toEqual(committedChat(CHAT_ID));
  });
});
