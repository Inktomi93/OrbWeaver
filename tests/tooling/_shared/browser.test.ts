import { closeProbeSession, withProbeSession } from "@orb/tooling/_shared/browser";
import { vi } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

test("probe cleanup attempts every context and the browser when one context close throws", async () => {
  const first = vi.fn(() => Promise.reject(new Error("planted context close failure")));
  const second = vi.fn(async () => undefined);
  const browser = vi.fn(async () => undefined);
  const session = {
    browser: { close: browser },
    contexts: [{ context: { close: first } }, { context: { close: second } }],
  };

  await closeProbeSession(session);
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(browser).toHaveBeenCalledOnce();
});

test("probe ownership closes resources when the driven body throws", async () => {
  const contextClose = vi.fn(() => Promise.resolve());
  const browserClose = vi.fn(() => Promise.resolve());
  const session = {
    browser: { close: browserClose },
    contexts: [{ context: { close: contextClose } }],
  };
  await expect(withProbeSession(session, () => Promise.reject(new Error("planted drive failure")))).rejects.toThrow("planted drive failure");
  expect(contextClose).toHaveBeenCalledOnce();
  expect(browserClose).toHaveBeenCalledOnce();
});
