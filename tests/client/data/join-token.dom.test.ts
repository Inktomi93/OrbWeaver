import { afterEach, vi } from "vitest";
import {
  clearJoinParam,
  consumeInboundJoinToken,
  peekInboundJoinToken,
  readJoinToken,
  stashInboundJoinToken,
} from "../../../packages/client/src/data/join-token.ts";
import { expect, test } from "../../support/fixtures.ts";
import { stubTabStorage } from "../../support/tab-storage.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("clearJoinParam removes every join field without reserializing unrelated query bytes", () => {
  const replaceState = vi.fn();
  vi.stubGlobal("location", {
    pathname: "/chat/room",
    search: "?space=%20&plus=+&slash=%2f&join=secret&tag=first&join=second&tag=second&empty=&flag&%6aoin=third",
    hash: "#turn-4",
  });
  vi.stubGlobal("history", { replaceState });
  const replaceUrl = vi.fn();

  expect(readJoinToken()).toBe("secret");
  clearJoinParam(replaceUrl);

  expect(replaceUrl).toHaveBeenCalledWith("/chat/room?space=%20&plus=+&slash=%2f&tag=first&tag=second&empty=&flag#turn-4");
  expect(replaceState).not.toHaveBeenCalled();
});

// D259 — the signed-out round trip: the guard stashes the token (its redirect replaces the `/?join=` entry); after
// sign-in the app root opens the join dialog with the stashed token and spends it, exactly once.
test("a stashed token opens the join dialog after sign-in, and only once", () => {
  const tab = stubTabStorage();
  const replaceState = vi.fn();
  vi.stubGlobal("location", { pathname: "/", search: "?join=tok_invite", hash: "" });
  vi.stubGlobal("history", { replaceState });
  stashInboundJoinToken();
  // The router hears a `replaceState` inside a guard as a navigation and re-runs `/` against its own redirect.
  expect(replaceState).not.toHaveBeenCalled();

  // The post-sign-in `/` load carries no `?join=`: the dialog's token comes from the tab stash.
  vi.stubGlobal("location", { pathname: "/", search: "", hash: "" });
  expect(peekInboundJoinToken()).toBe("tok_invite");
  consumeInboundJoinToken(vi.fn());
  expect(tab.size).toBe(0);
  expect(peekInboundJoinToken()).toBeNull();
});

test("a signed-in ?join= wins over a stash, and spending it scrubs the address bar and the stash", () => {
  const tab = stubTabStorage();
  tab.set("orb:join-token", "tok_stashed");
  const replaceState = vi.fn();
  const replaceUrl = vi.fn();
  vi.stubGlobal("location", { pathname: "/", search: "?join=tok_url", hash: "" });
  vi.stubGlobal("history", { replaceState });
  expect(peekInboundJoinToken()).toBe("tok_url");
  consumeInboundJoinToken(replaceUrl);
  expect(replaceUrl).toHaveBeenCalledWith("/");
  expect(replaceState).not.toHaveBeenCalled();
  expect(tab.size).toBe(0);
});
