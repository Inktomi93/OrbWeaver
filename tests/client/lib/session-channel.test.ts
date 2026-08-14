// The cross-tab session channel + its Web-Locks single-flight (staleness-and-session-freshness.md §4.3).
// Both primitives are stubbed with DETERMINISTIC fakes rather than exercised for real: the property under
// test is the protocol (who runs, who follows, what is trusted off the wire), and a real BroadcastChannel
// in a node lane tests the platform, not this module.
//
// The FAKE is a real multi-"tab" fan: every instance sees every other instance's post, so a sibling tab is
// just a second `new BroadcastChannel(...)` created directly in the test.

import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const MODULE = "../../../packages/client/src/lib/session-channel.ts";

type Listener = (event: { readonly data: unknown }) => void;

/** A same-process BroadcastChannel: N instances, everyone hears everyone else (never themselves). */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  private readonly listeners: Listener[] = [];
  private closed = false;

  readonly name: string;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: "message", listener: Listener): void {
    this.listeners.push(listener);
  }

  postMessage(data: unknown): void {
    for (const peer of FakeBroadcastChannel.instances) {
      if (peer === this || peer.closed) {
        continue;
      }
      for (const listener of peer.listeners) {
        listener({ data });
      }
    }
  }

  close(): void {
    this.closed = true;
  }
}

/** A Web Locks stand-in with the ONE semantic the module depends on: `ifAvailable` hands `null` to a
 *  contender instead of queueing it. */
function fakeLocks(): { readonly request: (name: string, options: { readonly ifAvailable: true }, cb: (lock: unknown) => Promise<void>) => Promise<void> } {
  let held = false;
  return {
    request: async (name, _options, callback): Promise<void> => {
      if (held) {
        await callback(null);
        return;
      }
      held = true;
      try {
        await callback({ name });
      } finally {
        held = false;
      }
    },
  };
}

type Channel = typeof import("../../../packages/client/src/lib/session-channel.ts");

async function freshModule(): Promise<Channel> {
  vi.resetModules();
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  vi.stubGlobal("navigator", { locks: fakeLocks() });
  return (await import(MODULE)) as Channel;
}

let channel: Channel;

beforeEach(async () => {
  channel = await freshModule();
});

afterEach(() => {
  // `freshModule()` re-imports through `vi.resetModules()`, so the module's page-scoped channel/listeners
  // are dropped wholesale between cases — no reset seam to keep in sync with them.
  vi.unstubAllGlobals();
});

describe("session channel — the wire", () => {
  test("a post reaches a sibling tab, and a sibling's post reaches this one", () => {
    const sibling = new FakeBroadcastChannel("orb:session");
    const heard: unknown[] = [];
    sibling.addEventListener("message", (event) => heard.push(event.data));
    const mine: unknown[] = [];
    channel.onSessionMessage((message) => mine.push(message));

    channel.postSessionMessage({ kind: "signed-out" });
    sibling.postMessage({ kind: "session-recovered", handle: "owner" });

    expect(heard).toEqual([{ kind: "signed-out" }]);
    expect(mine).toEqual([{ kind: "session-recovered", handle: "owner" }]);
  });

  // A BroadcastChannel is an ORIGIN-wide bus: an extension, a stale tab from a previous deploy, or another
  // app on the same origin can put anything on it. The module must parse, never trust.
  test("an unknown or malformed payload is ignored, not fanned to listeners", () => {
    const sibling = new FakeBroadcastChannel("orb:session");
    const mine: unknown[] = [];
    channel.onSessionMessage((message) => mine.push(message));

    sibling.postMessage({ kind: "drop-database" });
    sibling.postMessage("signed-out");
    sibling.postMessage(null);
    sibling.postMessage({ kind: "durable-local-written" }); // no storeName

    expect(mine).toEqual([]);
  });

  test("unsubscribing stops delivery", () => {
    const sibling = new FakeBroadcastChannel("orb:session");
    const mine: unknown[] = [];
    const off = channel.onSessionMessage((message) => mine.push(message));
    off();

    sibling.postMessage({ kind: "signed-out" });

    expect(mine).toEqual([]);
  });
});

describe("session channel — single-flight", () => {
  // THE claim the design rests on: N tabs seeing one dead session run ONE recovery. A queueing lock would
  // make the follower re-run the ladder after the leader finished, which is the stampede with extra steps.
  test("two contenders: exactly one RUNS, the other FOLLOWS without running the work", async () => {
    let runs = 0;
    let releaseLeader: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseLeader = resolve;
    });
    const leader = channel.runSessionRecoverySingleFlight(async () => {
      runs += 1;
      await gate;
    });
    // The contender arrives while the leader still holds the lock.
    const follower = await channel.runSessionRecoverySingleFlight((): Promise<void> => {
      runs += 1;
      return Promise.resolve();
    });
    releaseLeader?.();

    expect(follower).toBe("followed");
    expect(await leader).toBe("ran");
    expect(runs).toBe(1);
  });

  test("sequential calls each RUN — the lock is released on the verdict, not held forever", async () => {
    const noop = (): Promise<void> => Promise.resolve();
    const first = await channel.runSessionRecoverySingleFlight(noop);
    const second = await channel.runSessionRecoverySingleFlight(noop);
    expect([first, second]).toEqual(["ran", "ran"]);
  });

  // Web Locks needs a secure context; a plain-HTTP LAN deployment (the owner's own shape) has none. The
  // guarantee must narrow to this tab rather than vanish, or a 401 burst re-enters the ladder per error.
  test("with NO Web Locks, single-flight still holds WITHIN the tab", async () => {
    vi.stubGlobal("navigator", undefined);
    let runs = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const leader = channel.runSessionRecoverySingleFlight(async () => {
      runs += 1;
      await gate;
    });
    const follower = await channel.runSessionRecoverySingleFlight((): Promise<void> => {
      runs += 1;
      return Promise.resolve();
    });
    release?.();

    expect(follower).toBe("followed");
    expect(await leader).toBe("ran");
    expect(runs).toBe(1);
  });

  test("with no BroadcastChannel at all, posting is a no-op instead of a throw", async () => {
    vi.resetModules();
    vi.stubGlobal("BroadcastChannel", undefined);
    const fresh = (await import(MODULE)) as Channel;
    expect(() => fresh.postSessionMessage({ kind: "signed-out" })).not.toThrow();
    expect(() => fresh.onSessionMessage(() => undefined)()).not.toThrow();
  });
});
