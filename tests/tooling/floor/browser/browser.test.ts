import { expect, test } from "@orb/testkit/tooling";
import { buildUrl, closeProbeSession, withProbeSession } from "@orb/tooling/floor/browser/browser";
import { vi } from "vitest";
import { parseCdpFaultSpec } from "../../../../tooling/src/floor/browser/cdp-fault.ts";

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

// ── the CDP fault injector's spec grammar (#1093) ─────────────────────────────
// The INJECTION itself is proven end to end through the real protocol in
// tests/tooling/ui-audit/ops/hover.int.test.ts (both directions, plus the partial-failure arm). What is
// proven here is the half a browser cannot show: that the parser REFUSES rather than shrugging. A fault
// injector that silently ignores a spec it does not understand hands back a clean run for a fixture whose
// whole job was to fail, which turns every failure-arm pin built on it permanently green.

test("the CDP fault spec parses whole-method and occurrence-scoped rows, and trims a list", () => {
  expect(parseCdpFaultSpec("CSS.forcePseudoState")).toEqual([{ method: "CSS.forcePseudoState", occurrence: null }]);
  expect(parseCdpFaultSpec(" DOM.requestNode@2 , Page.navigate ")).toEqual([
    { method: "DOM.requestNode", occurrence: 2 },
    { method: "Page.navigate", occurrence: null },
  ]);
});

test("the CDP fault spec REFUSES anything it cannot inject, including a spec that names nothing", () => {
  // A bare method name (no domain), a zeroth occurrence and a non-numeric one are all shapes whose
  // author expected an injection; answering them with silence is the lie this parser exists to prevent.
  expect(() => parseCdpFaultSpec("forcePseudoState")).toThrow("CDP FAULT REFUSED");
  expect(() => parseCdpFaultSpec("css.forcePseudoState")).toThrow("CDP FAULT REFUSED");
  expect(() => parseCdpFaultSpec("DOM.requestNode@0")).toThrow("CDP FAULT REFUSED");
  expect(() => parseCdpFaultSpec("DOM.requestNode@first")).toThrow("CDP FAULT REFUSED");
  expect(() => parseCdpFaultSpec("  ,  ")).toThrow("names no protocol method");
});

// ── the route join ────────────────────────────────────────────────────────────
// A base that carries a token in its query is how a tokened deployment is addressed. The route belongs to the base's
// path: appended after the query it becomes part of the token's value, so the browser sends, and the scrubber notes, a
// value the page never echoes.

test("a route joins the base path, ahead of the query and fragment the base carries", () => {
  const rooted = buildUrl("http://snap.test:8080/?token=T", "/");
  expect(rooted).toBe("http://snap.test:8080/?token=T");
  expect(new URL(rooted).searchParams.get("token")).toBe("T");

  const nested = buildUrl("http://snap.test:8080/app/?token=T", "chat");
  expect(nested).toBe("http://snap.test:8080/app/chat?token=T");
  expect(new URL(nested).pathname).toBe("/app/chat");

  expect(buildUrl("http://snap.test:8080?token=T", "/chat?tab=memory")).toBe("http://snap.test:8080/chat?token=T&tab=memory");
  expect(buildUrl("http://snap.test:8080/#access_token=T", "/chat")).toBe("http://snap.test:8080/chat#access_token=T");
  expect(buildUrl("http://snap.test:8080/?token=T#access_token=U", "/chat?tab=memory#latest")).toBe("http://snap.test:8080/chat?token=T&tab=memory#latest");
});

test("a base with no query keeps exactly one slash at the join", () => {
  expect(buildUrl("http://snap.test:8080", "/")).toBe("http://snap.test:8080/");
  expect(buildUrl("http://snap.test:8080/", "/chat")).toBe("http://snap.test:8080/chat");
  expect(buildUrl("http://snap.test:8080/app", "chat?tab=memory#latest")).toBe("http://snap.test:8080/app/chat?tab=memory#latest");
});
