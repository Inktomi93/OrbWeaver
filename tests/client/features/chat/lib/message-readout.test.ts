// Unit: the metadata row's two #1032 readouts (features/chat/lib/message-readout) — the end-of-reply
// OUTCOME notice and the per-turn CACHE economics.
//
// The load-bearing pin is the outcome derivation's NARROWNESS. `finishReason` carries the normalized
// cross-backend vocab whose `other` arm is a catch-all for any raw word the map does not know, so a
// derivation that spoke for `other` would park a permanent notice under every reply on a backend whose
// healthy terminal string happens to be unmapped. These tests pin that `stop`/`tool`/`other` say NOTHING,
// that `length`/`filter` say something, and that the raw provider words stay provenance (the `title`)
// rather than becoming the copy — except in the one case where they are the only answer anyone has.

import type { MessageView } from "@orb/contracts/chat";
import { cacheTokensLabel, messageOutcomeNotice } from "../../../../../packages/client/src/features/chat/lib/message-readout.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The outcome derivation's whole input surface — spelled here so a test never depends on the rest of the view. */
function outcome(
  over: Partial<Pick<MessageView, "finishReason" | "stopReason" | "terminalReason">> = {},
): Pick<MessageView, "finishReason" | "stopReason" | "terminalReason"> {
  return { finishReason: null, stopReason: null, terminalReason: null, ...over };
}

test("a clean finish says nothing — stop, tool and a bare null are all silent", () => {
  expect(messageOutcomeNotice(outcome({ finishReason: "stop", stopReason: "end_turn" }))).toBeNull();
  expect(messageOutcomeNotice(outcome({ finishReason: "tool", stopReason: "tool_use" }))).toBeNull();
  expect(messageOutcomeNotice(outcome())).toBeNull();
});

// The blast radius this narrowness exists to prevent: `other` is the normalizer's catch-all, so speaking
// for it would put a notice under EVERY reply from a backend with an unmapped-but-healthy terminal word.
test("the catch-all `other` arm stays silent — it names no real problem", () => {
  expect(messageOutcomeNotice(outcome({ finishReason: "other", stopReason: "some_backend_word" }))).toBeNull();
});

test("a length-capped reply says it was cut off, with the raw provider word as provenance", () => {
  expect(messageOutcomeNotice(outcome({ finishReason: "length", stopReason: "max_tokens" }))).toEqual({
    text: "cut off — length cap",
    title: "max_tokens",
  });
});

test("a filtered reply says the provider stopped it", () => {
  expect(messageOutcomeNotice(outcome({ finishReason: "filter", stopReason: "content_filter" }))).toEqual({
    text: "stopped — content filter",
    title: "content_filter",
  });
});

test("both raw words ride the provenance when they differ, and collapse to one when they agree", () => {
  expect(messageOutcomeNotice(outcome({ finishReason: "length", stopReason: "max_tokens", terminalReason: "api_error" }))?.title).toBe(
    "max_tokens · api_error",
  );
  expect(messageOutcomeNotice(outcome({ finishReason: "length", stopReason: "max_tokens", terminalReason: "max_tokens" }))?.title).toBe("max_tokens");
  expect(messageOutcomeNotice(outcome({ finishReason: "length" }))?.title).toBeUndefined();
});

// The one case where the raw word IS the answer: a turn that died on a provider terminal condition never
// reached a normalized finish, so there is nothing else to say and a tooltip would say it to nobody.
test("a terminal-only failure promotes the backend's own word into the copy", () => {
  expect(messageOutcomeNotice(outcome({ terminalReason: "api_error" }))).toEqual({ text: "ended — api_error", title: undefined });
});

test("an empty-string reason is absence, not a word (a blank notice would be worse than none)", () => {
  expect(messageOutcomeNotice(outcome({ terminalReason: "" }))).toBeNull();
  expect(messageOutcomeNotice(outcome({ finishReason: "length", stopReason: "" }))?.title).toBeUndefined();
});

test("cache economics render only the side the backend actually reported", () => {
  expect(cacheTokensLabel(1024, 512)).toBe("cache 1024 read / 512 written");
  expect(cacheTokensLabel(1024, null)).toBe("cache 1024 read");
  expect(cacheTokensLabel(null, 512)).toBe("cache 512 written");
});

// A zero is "this turn used no cache", which is the same statement as absence — printing "cache 0 read"
// would spend a datum on nothing.
test("no cache activity is no datum — nulls and zeroes alike", () => {
  expect(cacheTokensLabel(null, null)).toBeNull();
  expect(cacheTokensLabel(0, 0)).toBeNull();
  expect(cacheTokensLabel(0, null)).toBeNull();
});
