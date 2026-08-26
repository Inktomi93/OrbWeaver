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

  await expect(closeProbeSession(session)).rejects.toThrow("planted context close failure");
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(browser).toHaveBeenCalledOnce();
});

test("probe cleanup reports every independent teardown failure", async () => {
  const firstFailure = new Error("first context cleanup failed");
  const secondFailure = new Error("second context cleanup failed");
  const browserFailure = new Error("browser cleanup failed");
  const session = {
    browser: { close: vi.fn(() => Promise.reject(browserFailure)) },
    contexts: [{ context: { close: vi.fn(() => Promise.reject(firstFailure)) } }, { context: { close: vi.fn(() => Promise.reject(secondFailure)) } }],
  };

  const failure = await closeProbeSession(session).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([firstFailure, secondFailure, browserFailure]);
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

test("probe ownership preserves the body failure and also surfaces cleanup failure", async () => {
  const bodyFailure = new Error("planted primary drive failure");
  const cleanupFailure = new Error("planted cleanup failure");
  const session = {
    browser: { close: vi.fn(() => Promise.reject(cleanupFailure)) },
    contexts: [{ context: { close: vi.fn(() => Promise.resolve()) } }],
  };

  const failure = await withProbeSession(session, () => Promise.reject(bodyFailure)).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toEqual([bodyFailure, cleanupFailure]);
});

test("probe ownership closes resources after an early successful return", async () => {
  const contextClose = vi.fn(() => Promise.resolve());
  const browserClose = vi.fn(() => Promise.resolve());
  const session = {
    browser: { close: browserClose },
    contexts: [{ context: { close: contextClose } }],
  };

  await expect(withProbeSession(session, async () => "early")).resolves.toBe("early");
  expect(contextClose).toHaveBeenCalledOnce();
  expect(browserClose).toHaveBeenCalledOnce();
});
