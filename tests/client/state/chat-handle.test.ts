// chat-handle unit test — `ChatHandle` is the compile-time discipline: a two-arm discriminated union that
// makes "did I forget the landing branch" a `tsc` error instead of a runtime surprise. Pins the builders +
// guards behaviorally.
//
// THE `draft` ARM IS GONE (D166): a chat row exists from the
// creation click, so a rowless "chat that exists only in the composer" is unrepresentable. What replaced it
// is a SERVER fact (an unclaimed husk), not a client phase — do not re-add an arm here to model it.

import { committedChat, isCommitted, isLanding, landingChat } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_handle_unit");

describe("chat-handle", () => {
  test("committedChat carries the id under kind:'committed'", () => {
    const handle = committedChat(CHAT_ID);
    expect(handle).toEqual({ kind: "committed", id: CHAT_ID });
  });

  test("landingChat carries only kind:'landing' (no id) — the at-rest state (J1)", () => {
    const handle = landingChat();
    expect(handle).toEqual({ kind: "landing" });
    expect("id" in handle).toBe(false);
  });

  test("isCommitted narrows true for an open room, false for landing", () => {
    expect(isCommitted(committedChat(CHAT_ID))).toBe(true);
    expect(isCommitted(landingChat())).toBe(false);
  });

  test("isLanding narrows true for landing, false for an open room", () => {
    expect(isLanding(landingChat())).toBe(true);
    expect(isLanding(committedChat(CHAT_ID))).toBe(false);
  });
});
