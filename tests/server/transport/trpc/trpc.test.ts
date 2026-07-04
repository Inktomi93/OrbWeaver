// The procedure ladder — the 2-layer auth gates + the injected rate-limit seam, driven through the real
// `appRouter` via `createCaller` (core/Tier-4-Transport.md). Proves: authedProcedure rejects anon;
// adminProcedure rejects a plain user but passes owner ∪ admin (LAYER-1, no db); a representative router
// delegates to the injected service verb with the Principal; the CSRF gate fires on cookie mutations only;
// the injected rate-limit gate's throw maps to TOO_MANY_REQUESTS; the multi-human belt (PD-106) 404s the
// documented single-user-refused surface list and stays open in multi-user mode.

import { DomainRateLimitError } from "@orb/kit/errors";
import type { NotificationId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AdminService } from "@orb/server/domain/admin";
import type { BuddyService } from "@orb/server/domain/buddy";
import type { NotificationsService } from "@orb/server/domain/notifications";
import type { Context, PresenceRegistry, Services } from "@orb/server/transport/trpc";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";
import { caller, denyRateLimit, inertPresence, makeContext, principal } from "./_support.ts";

describe("authedProcedure", () => {
  test("rejects an anonymous caller with UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).buddy.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("admits an authenticated caller (the gate passes through to the verb)", async () => {
    const get = vi.fn<BuddyService["get"]>();
    const ctx = makeContext({ auth: principal("user"), services: { buddy: { get } } });
    await caller(ctx).buddy.get();
    expect(get).toHaveBeenCalledWith({ principal: ctx.auth });
  });
});

describe("adminProcedure (LAYER-1, owner ∪ admin, no db round-trip)", () => {
  test("rejects a plain user with FORBIDDEN", async () => {
    const ctx = makeContext({ auth: principal("user") });
    await expect(caller(ctx).admin.vllmEngines()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("rejects an anonymous caller with UNAUTHORIZED (auth gate fires first)", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).admin.vllmEngines()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("passes an owner through to the verb", async () => {
    const vllmEngines = vi.fn<AdminService["vllmEngines"]>();
    const ctx = makeContext({ auth: principal("owner"), services: { admin: { vllmEngines } } });
    await caller(ctx).admin.vllmEngines();
    expect(vllmEngines).toHaveBeenCalledTimes(1);
  });

  test("passes a delegated admin through to the verb", async () => {
    const vllmEngines = vi.fn<AdminService["vllmEngines"]>();
    const ctx = makeContext({ auth: principal("admin"), services: { admin: { vllmEngines } } });
    await caller(ctx).admin.vllmEngines();
    expect(vllmEngines).toHaveBeenCalledTimes(1);
  });
});

describe("a representative router delegates to the injected service verb", () => {
  test("admin.vllmEngines calls ctx.services.admin.vllmEngines with the Principal (PD-3)", async () => {
    const vllmEngines = vi.fn<AdminService["vllmEngines"]>();
    const ctx = makeContext({ auth: principal("admin"), services: { admin: { vllmEngines } } });
    await caller(ctx).admin.vllmEngines();
    expect(vllmEngines).toHaveBeenCalledWith({ principal: ctx.auth });
  });
});

describe("CSRF gate (cookie-authed mutations only)", () => {
  test("a cookie mutation WITHOUT the custom header → FORBIDDEN", async () => {
    const setAgency = vi.fn<BuddyService["setAgency"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: false,
      services: { buddy: { setAgency } },
    });
    await expect(caller(ctx).buddy.setAgency({ enabled: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(setAgency).not.toHaveBeenCalled();
  });

  test("a cookie mutation WITH the custom header passes", async () => {
    const setAgency = vi.fn<BuddyService["setAgency"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: true,
      services: { buddy: { setAgency } },
    });
    await caller(ctx).buddy.setAgency({ enabled: true });
    expect(setAgency).toHaveBeenCalledWith({ principal: ctx.auth, enabled: true });
  });

  test("a header-authed mutation is exempt (no cross-site surface)", async () => {
    const setAgency = vi.fn<BuddyService["setAgency"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "header" }),
      csrfHeaderPresent: false,
      services: { buddy: { setAgency } },
    });
    await caller(ctx).buddy.setAgency({ enabled: true });
    expect(setAgency).toHaveBeenCalledTimes(1);
  });

  test("a query is never CSRF-gated (even cookie-authed without the header)", async () => {
    const get = vi.fn<BuddyService["get"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: false,
      services: { buddy: { get } },
    });
    await caller(ctx).buddy.get();
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("the injected rate-limit gate", () => {
  test("a DomainRateLimitError from the gate maps to TOO_MANY_REQUESTS", async () => {
    const ctx = makeContext({
      auth: principal("user"),
      rateLimit: denyRateLimit(new DomainRateLimitError("slow down")),
    });
    await expect(caller(ctx).buddy.get()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

const notificationId = castId<NotificationId>("notification_1");

/** One documented single-user-refused surface (Tier-4 §"multi-human surface"). `probe` proves the
 *  multi-user path got through the belt: the domain verb for the CRUD trio, the `presence.connect` spy
 *  for the subscription (its handler ref-counts presence before streaming — no domain verb to observe). */
interface BeltSurface {
  readonly path: string;
  readonly make: () => {
    readonly services: { [K in keyof Services]?: Partial<Services[K]> };
    readonly presence: PresenceRegistry;
    readonly probe: Mock;
  };
  readonly drive: (ctx: Context) => Promise<unknown>;
}

// The full multi-human surface list at transport today — the notifications CRUD trio + the notifications
// subscription (the chat-P5 invite/roster procedures adopt the same rung as they land).
const beltSurfaces: readonly BeltSurface[] = [
  {
    path: "notifications.list",
    make: () => {
      const list = vi.fn<NotificationsService["list"]>();
      return { services: { notifications: { list } }, presence: inertPresence, probe: list };
    },
    drive: (ctx) => caller(ctx).notifications.list(),
  },
  {
    path: "notifications.markRead",
    make: () => {
      const markRead = vi.fn<NotificationsService["markRead"]>();
      return {
        services: { notifications: { markRead } },
        presence: inertPresence,
        probe: markRead,
      };
    },
    drive: (ctx) => caller(ctx).notifications.markRead({ notificationId }),
  },
  {
    path: "notifications.dismiss",
    make: () => {
      const dismiss = vi.fn<NotificationsService["dismiss"]>();
      return { services: { notifications: { dismiss } }, presence: inertPresence, probe: dismiss };
    },
    drive: (ctx) => caller(ctx).notifications.dismiss({ notificationId }),
  },
  {
    path: "notifications.notifications (subscription)",
    make: () => {
      const connect = vi.fn<PresenceRegistry["connect"]>();
      return { services: {}, presence: { connect, read: inertPresence.read }, probe: connect };
    },
    drive: async (ctx) => {
      // A first subscribe (no lastEventId) attaches straight to the live bus; tear it down immediately.
      const sub = await caller(ctx).notifications.notifications({});
      await sub[Symbol.asyncIterator]().return?.(undefined);
    },
  },
];

describe("multiHumanProcedure — the single-user 404 belt (PD-106)", () => {
  for (const surface of beltSurfaces) {
    test(`${surface.path}: single-user mode → NOT_FOUND (the surface looks unmounted)`, async () => {
      const { services, presence, probe } = surface.make();
      const ctx = makeContext({
        auth: principal("user"),
        singleUserMode: true,
        services,
        presence,
      });
      await expect(surface.drive(ctx)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(probe).not.toHaveBeenCalled();
    });

    test(`${surface.path}: multi-user mode → reachable`, async () => {
      const { services, presence, probe } = surface.make();
      const ctx = makeContext({
        auth: principal("user"),
        singleUserMode: false,
        services,
        presence,
      });
      await surface.drive(ctx);
      expect(probe).toHaveBeenCalledTimes(1);
    });
  }

  test("fires BEFORE the auth gate: an anonymous probe in single-user mode sees NOT_FOUND, not UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null, singleUserMode: true });
    await expect(caller(ctx).notifications.list()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("multi-user mode still requires auth (the belt adds no anonymous bypass)", async () => {
    const ctx = makeContext({ auth: null, singleUserMode: false });
    await expect(caller(ctx).notifications.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
