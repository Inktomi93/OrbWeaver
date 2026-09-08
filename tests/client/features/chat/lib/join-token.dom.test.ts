import { clearJoinParam, readJoinToken } from "@orb/client/features/chat";
import { vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

test("clearJoinParam removes every join field without reserializing unrelated query bytes", () => {
  const replaceState = vi.fn();
  vi.stubGlobal("location", {
    pathname: "/chat/room",
    search: "?space=%20&plus=+&slash=%2f&join=secret&tag=first&join=second&tag=second&empty=&flag&%6aoin=third",
    hash: "#turn-4",
  });
  vi.stubGlobal("history", { replaceState });

  expect(readJoinToken()).toBe("secret");
  clearJoinParam();

  expect(replaceState).toHaveBeenCalledWith(null, "", "/chat/room?space=%20&plus=+&slash=%2f&tag=first&tag=second&empty=&flag#turn-4");
});
