import { afterEach, vi } from "vitest";
import { bindSessionDocumentHost, sessionDocument } from "../../../packages/client/src/lib/session-document-host.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  bindSessionDocumentHost(null);
});

test("the unbound host is inert except navigation, which fails loudly", () => {
  const listener = vi.fn();

  expect(sessionDocument.currentPathname()).toBeNull();
  expect(sessionDocument.isVisible()).toBe(false);
  expect(() => sessionDocument.assign("/login")).toThrow("Session document host is not bound");
  expect(() => sessionDocument.subscribeVisibility(listener)()).not.toThrow();
  expect(listener).not.toHaveBeenCalled();
});

test("the stable facade delegates to the current composition binding", () => {
  const events: string[] = [];
  const visibilityListeners: (() => void)[] = [];
  bindSessionDocumentHost({
    currentPathname: (): string => "/chat",
    assign: (path): void => {
      events.push(`assign:${path}`);
    },
    isVisible: (): true => true,
    subscribeVisibility: (listener): (() => void) => {
      visibilityListeners.push(listener);
      events.push("subscribe");
      return (): void => {
        events.push("unsubscribe");
      };
    },
  });

  expect(sessionDocument.currentPathname()).toBe("/chat");
  expect(sessionDocument.isVisible()).toBe(true);
  sessionDocument.assign("/login");
  const unsubscribe = sessionDocument.subscribeVisibility(() => events.push("visible"));
  expect(visibilityListeners).toHaveLength(1);
  visibilityListeners[0]?.();
  unsubscribe();
  expect(events).toEqual(["assign:/login", "subscribe", "visible", "unsubscribe"]);

  bindSessionDocumentHost({
    currentPathname: (): string => "/replacement",
    assign: (): void => undefined,
    isVisible: (): false => false,
    subscribeVisibility: (): (() => void) => (): void => undefined,
  });
  expect(sessionDocument.currentPathname()).toBe("/replacement");
});
