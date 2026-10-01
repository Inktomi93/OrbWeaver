import { afterEach, vi } from "vitest";
import { useRouterUrlReplace } from "../../../packages/client/src/lib/use-router-url-replace.ts";
import { expect, test } from "../../support/fixtures.ts";

const router = vi.hoisted(() => ({
  options: { parseSearch: vi.fn(() => ({})) },
  buildLocation: vi.fn(() => ({ state: {} })),
  commitLocation: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));

afterEach(() => vi.unstubAllGlobals());

test("a rejected router commit throws the original failure on the queued error surface", async () => {
  const queued: Array<() => void> = [];
  const failure = new Error("navigation commit failed");
  vi.stubGlobal("location", { origin: "https://orb.test" });
  vi.stubGlobal("queueMicrotask", (callback: () => void): void => {
    queued.push(callback);
  });
  router.commitLocation.mockRejectedValueOnce(failure);

  useRouterUrlReplace()("/?retained=1#turn");
  await Promise.resolve();

  expect(queued).toHaveLength(1);
  const surfaced = queued.flatMap((callback) => {
    try {
      callback();
      return [];
    } catch (error) {
      return [error];
    }
  });
  expect(surfaced).toHaveLength(1);
  expect(surfaced[0]).toBe(failure);
});
