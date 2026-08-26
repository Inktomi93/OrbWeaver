import { clearJoinParam, readJoinToken } from "@orb/client/features/chat";
import { vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

test("clearJoinParam removes only join while preserving path, unrelated query keys, and fragment", () => {
  const replaceState = vi.fn();
  vi.stubGlobal("location", {
    pathname: "/chat/room",
    search: "?mode=one&join=secret&tag=first&tag=second",
    hash: "#turn-4",
  });
  vi.stubGlobal("history", { replaceState });

  expect(readJoinToken()).toBe("secret");
  clearJoinParam();

  expect(replaceState).toHaveBeenCalledWith(null, "", "/chat/room?mode=one&tag=first&tag=second#turn-4");
});
