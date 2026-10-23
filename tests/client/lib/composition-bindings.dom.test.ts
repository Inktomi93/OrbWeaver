import type { Notify, SessionDocumentHost } from "@orb/client/lib";
import { leaseNotify, leaseSessionDocumentHost, notify, sessionDocument } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/node";

function documentHost(name: string, navigations: string[], at: number): SessionDocumentHost {
  return {
    now: (): number => at,
    currentPathname: (): string => `/${name}`,
    assign: (path): void => {
      navigations.push(`${name}:${path}`);
    },
    isVisible: (): boolean => true,
    subscribeVisibility: (): (() => void) => (): void => undefined,
  };
}

test("a document owner released before its nested mount cannot be revived by that mount's teardown", () => {
  const navigations: string[] = [];
  {
    using _baseline = leaseSessionDocumentHost(documentHost("baseline", navigations, 1000));
    expect(sessionDocument.now()).toBe(1000);
    using outer = leaseSessionDocumentHost(documentHost("outer", navigations, 2000));
    expect(sessionDocument.now()).toBe(2000);
    using inner = leaseSessionDocumentHost(documentHost("inner", navigations, 3000));
    expect(sessionDocument.currentPathname()).toBe("/inner");
    expect(sessionDocument.now()).toBe(3000);
    outer[Symbol.dispose]();
    expect(sessionDocument.now()).toBe(3000);
    sessionDocument.assign("/login");
    expect(navigations).toEqual(["inner:/login"]);
    inner[Symbol.dispose]();
    expect(sessionDocument.now()).toBe(1000);
    sessionDocument.assign("/login");
    expect(navigations).toEqual(["inner:/login", "baseline:/login"]);
    expect(sessionDocument.currentPathname()).toBe("/baseline");
  }
  expect(sessionDocument.currentPathname()).toBeNull();
});

function notifications(name: string, messages: string[]): Notify {
  return {
    info: (): void => {
      messages.push(`${name}:info`);
    },
    success: (): void => {
      messages.push(`${name}:success`);
    },
    warn: (): void => {
      messages.push(`${name}:warn`);
    },
    error: (): void => {
      messages.push(`${name}:error`);
    },
  };
}

test("scoped notification teardown restores the live owner, not a previously released owner's manager", () => {
  const messages: string[] = [];
  using _baseline = leaseNotify(notifications("baseline", messages));
  using outer = leaseNotify(notifications("outer", messages));
  using inner = leaseNotify(notifications("inner", messages));
  notify.error("during mount");
  outer[Symbol.dispose]();
  notify.warn("nested owner remains");
  inner[Symbol.dispose]();
  notify.success("back at baseline");
  expect(messages).toEqual(["inner:error", "inner:warn", "baseline:success"]);
});
