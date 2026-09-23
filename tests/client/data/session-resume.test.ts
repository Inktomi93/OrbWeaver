// The OIDC re-auth resume snapshot. The whole
// contract is "survive exactly one redirect round trip, then be gone" — a snapshot that outlived its trip
// would yank a user into a chat they left days ago, which is the staleness class this design exists to end.

import { takeSessionResume, writeSessionResume } from "@orb/client/data";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_abc");

/** A Storage stand-in over a Map — node has no sessionStorage. */
function stubTabStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  });
  return map;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session resume snapshot", () => {
  test("round-trips the open chat across the bounce", () => {
    stubTabStorage();
    writeSessionResume({ chatId: CHAT });
    expect(takeSessionResume()).toEqual({ chatId: CHAT });
  });

  // ONE-SHOT: a later reload must not resurrect the target. The read DELETES.
  test("a taken snapshot is consumed — the second read is null", () => {
    const map = stubTabStorage();
    writeSessionResume({ chatId: CHAT });
    takeSessionResume();
    expect(map.size).toBe(0);
    expect(takeSessionResume()).toBeNull();
  });

  test("no snapshot reads null (the ordinary boot)", () => {
    stubTabStorage();
    expect(takeSessionResume()).toBeNull();
  });

  // #11 autosave doctrine: an invalid persisted value is DISCARDED, never trusted, never allowed to crash.
  test("a corrupt or wrong-shaped blob is discarded, not thrown on", () => {
    const map = stubTabStorage();
    map.set("orb:session-resume", "{not json");
    expect(takeSessionResume()).toBeNull();
    map.set("orb:session-resume", JSON.stringify({ chatId: 42 }));
    expect(takeSessionResume()).toEqual({ chatId: null });
  });

  test("with no sessionStorage at all, both halves degrade quietly", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(() => writeSessionResume({ chatId: CHAT })).not.toThrow();
    expect(takeSessionResume()).toBeNull();
  });
});
