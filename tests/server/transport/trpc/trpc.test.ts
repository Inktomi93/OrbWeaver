// The procedure ladder — the 2-layer auth gates + the injected rate-limit seam, driven through the real
// `appRouter` via `createCaller` (core/Tier-4-Transport.md). Proves: authedProcedure rejects anon;
// adminProcedure rejects a plain user but passes owner ∪ admin (LAYER-1, no db); a representative router
// delegates to the injected service verb with the Principal; the CSRF gate fires on cookie mutations only;
// the injected rate-limit gate's throw maps to TOO_MANY_REQUESTS; the multi-human belt (PD-106) 404s the
// documented single-user-refused surface list and stays open in multi-user mode; and the errorFormatter's
// PROD-LEAK belt keeps `stack` off the wire shape in EVERY env.

import { DomainOperationError, DomainRateLimitError } from "@orb/kit/errors";
import type { CharacterId, ChatId, ChatInviteId, NotificationId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AdminService } from "@orb/server/domain/admin";
import type { ChatService } from "@orb/server/domain/chat";
import type { NotificationsService } from "@orb/server/domain/notifications";
import type { PersonaService } from "@orb/server/domain/persona";
import type { SettingsService } from "@orb/server/domain/settings";
import type { Context, PresenceRegistry, Services } from "@orb/server/transport/trpc";
import { appRouter, classifyDomainError } from "@orb/server/transport/trpc";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { caller, denyRateLimit, inertPresence, makeContext, principal } from "./_support.ts";

describe("authedProcedure", () => {
  test("rejects an anonymous caller with UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).persona.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("admits an authenticated caller (the gate passes through to the verb)", async () => {
    const list = vi.fn<PersonaService["list"]>();
    const ctx = makeContext({ auth: principal("user"), services: { persona: { list } } });
    await caller(ctx).persona.list();
    expect(list).toHaveBeenCalledWith({ principal: ctx.auth });
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
  const patch = { displayName: "x" };
  test("a cookie mutation WITHOUT the custom header → FORBIDDEN", async () => {
    const updateUserSettingsSection = vi.fn<SettingsService["updateUserSettingsSection"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: false,
      services: { settings: { updateUserSettingsSection } },
    });
    await expect(caller(ctx).settings.updateUserSettingsSection({ section: "profile", patch })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(updateUserSettingsSection).not.toHaveBeenCalled();
  });

  test("a cookie mutation WITH the custom header passes", async () => {
    const updateUserSettingsSection = vi.fn<SettingsService["updateUserSettingsSection"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: true,
      services: { settings: { updateUserSettingsSection } },
    });
    await caller(ctx).settings.updateUserSettingsSection({ section: "profile", patch });
    expect(updateUserSettingsSection).toHaveBeenCalledWith({ principal: ctx.auth, input: { section: "profile", patch } });
  });

  test("a header-authed mutation is exempt (no cross-site surface)", async () => {
    const updateUserSettingsSection = vi.fn<SettingsService["updateUserSettingsSection"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "header" }),
      csrfHeaderPresent: false,
      services: { settings: { updateUserSettingsSection } },
    });
    await caller(ctx).settings.updateUserSettingsSection({ section: "profile", patch });
    expect(updateUserSettingsSection).toHaveBeenCalledTimes(1);
  });

  test("a query is never CSRF-gated (even cookie-authed without the header)", async () => {
    const list = vi.fn<PersonaService["list"]>();
    const ctx = makeContext({
      auth: principal("user", { via: "cookie" }),
      csrfHeaderPresent: false,
      services: { persona: { list } },
    });
    await caller(ctx).persona.list();
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe("the injected rate-limit gate", () => {
  test("a DomainRateLimitError from the gate maps to TOO_MANY_REQUESTS", async () => {
    const ctx = makeContext({
      auth: principal("user"),
      rateLimit: denyRateLimit(new DomainRateLimitError("slow down")),
    });
    await expect(caller(ctx).persona.list()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

const notificationId = castId<NotificationId>("notification_1");
const chatId = castId<ChatId>("chat_1");
const inviteId = castId<ChatInviteId>("chatinvite_1");
const kickTarget = castId<UserId>("user_target");

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

/** A belt row for one invites-router verb: the probe is the chat-service verb mock — proving both the
 *  belt refusal (never called) and the capable-path wiring (called once). */
function inviteSurface(verb: keyof ChatService, drive: (ctx: Context) => Promise<unknown>): BeltSurface {
  return {
    path: `invites.${verb}`,
    make: (): ReturnType<BeltSurface["make"]> => {
      const fn = vi.fn(async () => ({}) as never);
      return { services: { chat: { [verb]: fn } }, presence: inertPresence, probe: fn };
    },
    drive,
  };
}

// The full multi-human surface list at transport today — the notifications CRUD trio + the
// invites/membership router (FINAL-Auth-Modes §7 P1 — the PD-106 burn-down).
//
// The inbox STREAM is no longer on this list, and its belt did not weaken: at SSE-1 S3 it folded into the
// multiplexed socket, so the belt moved off `multiHumanProcedure` onto the `notifications` room's
// `authorizeAttach` (the socket itself must stay `authedProcedure` — a single-user deployment still needs its
// user/chat/rpg rooms). Both arms of the same refusal are pinned where the verdict now lives:
// tests/server/transport/trpc/stream/sources/notifications.test.ts.
const beltSurfaces: readonly BeltSurface[] = [
  inviteSurface("createInvite", (ctx) => caller(ctx).invites.createInvite({ chatId, input: {} })),
  inviteSurface("previewInvite", (ctx) => caller(ctx).invites.previewInvite({ token: "tok" })),
  inviteSurface("redeemInvite", (ctx) => caller(ctx).invites.redeemInvite({ token: "tok" })),
  inviteSurface("acceptInvite", (ctx) => caller(ctx).invites.acceptInvite({ inviteId })),
  inviteSurface("revokeInvite", (ctx) => caller(ctx).invites.revokeInvite({ chatId, inviteId })),
  inviteSurface("declineInvite", (ctx) => caller(ctx).invites.declineInvite({ inviteId })),
  inviteSurface("kick", (ctx) => caller(ctx).invites.kick({ chatId, userId: kickTarget })),
  inviteSurface("selfLeave", (ctx) => caller(ctx).invites.selfLeave({ chatId })),
  inviteSurface("nominateHostHandoff", (ctx) => caller(ctx).invites.nominateHostHandoff({ chatId, userId: kickTarget })),
  inviteSurface("acceptHostHandoff", (ctx) => caller(ctx).invites.acceptHostHandoff({ chatId })),
  {
    path: "notifications.list",
    make: () => {
      const list = vi.fn<NotificationsService["list"]>();
      return { services: { notifications: { list } }, presence: inertPresence, probe: list };
    },
    drive: (ctx) => caller(ctx).notifications.list(),
  },
  {
    path: "notifications.dismiss",
    make: () => {
      const dismiss = vi.fn<NotificationsService["dismiss"]>();
      return { services: { notifications: { dismiss } }, presence: inertPresence, probe: dismiss };
    },
    drive: (ctx) => caller(ctx).notifications.dismiss({ notificationId }),
  },
];

describe("multiHumanProcedure — the multi-human capability 404 belt (PD-106 / B4)", () => {
  for (const surface of beltSurfaces) {
    test(`${surface.path}: not multi-human capable → NOT_FOUND (the surface looks unmounted)`, async () => {
      const { services, presence, probe } = surface.make();
      const ctx = makeContext({
        auth: principal("user"),
        multiHumanCapable: false,
        services,
        presence,
      });
      await expect(surface.drive(ctx)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(probe).not.toHaveBeenCalled();
    });

    test(`${surface.path}: multi-human capable → reachable`, async () => {
      const { services, presence, probe } = surface.make();
      const ctx = makeContext({
        auth: principal("user"),
        multiHumanCapable: true,
        services,
        presence,
      });
      await surface.drive(ctx);
      expect(probe).toHaveBeenCalledTimes(1);
    });
  }

  test("fires BEFORE the auth gate: an anonymous probe while not capable sees NOT_FOUND, not UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null, multiHumanCapable: false });
    await expect(caller(ctx).notifications.list()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("multi-human capable still requires auth (the belt adds no anonymous bypass)", async () => {
    const ctx = makeContext({ auth: null, multiHumanCapable: true });
    await expect(caller(ctx).notifications.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  // §9 ruling 3 (CRUCIAL): the belt gates only the second-HUMAN seat. Multi-CHARACTER group chat —
  // founding a room and seating characters — must work while NOT multi-human capable (single-user AND
  // local-single-human). A regression here breaks the product for every local/single-user install.
  test("multi-CHARACTER chat is NOT gated: startChat + addCharacterToChat reachable while not capable", async () => {
    const startChat = vi.fn<ChatService["startChat"]>();
    const addCharacterToChat = vi.fn<ChatService["addCharacterToChat"]>();
    const ctx = makeContext({
      auth: principal("user"),
      multiHumanCapable: false,
      services: { chat: { startChat, addCharacterToChat } },
    });
    await caller(ctx).chat.startChat({ characterIds: [] });
    await caller(ctx).chat.addCharacterToChat({
      chatId,
      characterId: castId<CharacterId>("character_1"),
    });
    expect(startChat).toHaveBeenCalledTimes(1);
    expect(addCharacterToChat).toHaveBeenCalledTimes(1);
  });
});

// ── PROD-LEAK: the errorFormatter stack belt ────────────────────────────────────────────────────────────
//
// Live incident 2026-08-09: the public deployment was being served by a DEV process, so tRPC's
// `config.isDev` (= `NODE_ENV !== "production"`, resolved ONCE at `initTRPC.create()`) was true and
// `getErrorShape` attached `data.stack` to EVERY error — absolute host paths, the OS username and exact dep
// versions, to any anonymous caller. `NODE_ENV` was the stopgap; the belt in `trpc.ts` is the fix, so the
// leak is unrepresentable in every env.
//
// The formatter is the LAST hop before serialization: `getErrorShape` builds `shape.data`, attaches `stack`
// when `config.isDev`, then hands the shape to the configured formatter. These drive the REAL router's own
// configured formatter with exactly that input. (`createCaller` re-throws the raw TRPCError and never runs
// the formatter at all, so a leak assertion against the caller would be vacuous by construction; the WIRE
// proof — an anonymous HTTP GET through the mounted app — lives in tests/server/entry/app.test.ts, because
// `@trpc/server`'s fetch adapter resolves only inside packages/server, not from a root test file.)

/** A leaking `shape.data` exactly as `getErrorShape` builds it under `isDev` (the frames are the real
 *  incident's shape: absolute host paths + the OS username + the dep version). */
const LEAKING_STACK =
  "TRPCError: Authentication required.\n    at /home/inktomi/orbweaver/packages/server/src/transport/trpc/trpc.ts:91:11\n    at /home/inktomi/node_modules/.pnpm/@trpc+server@11.18.0/dist/index.mjs:1:1";

/** The classifier-mapped TRPCError the formatter receives in production (the DomainError rides as `.cause`,
 *  which is what `domainReason` reads). Sourced from the real classifier — never hand-built. */
function mappedError(err: Error): NonNullable<ReturnType<typeof classifyDomainError>> {
  const result = classifyDomainError(err);
  if (result === null) {
    throw new Error("expected the classifier to map this error");
  }
  return result;
}

describe("errorFormatter — `stack` never reaches the wire (PROD-LEAK belt)", () => {
  const { errorFormatter, isDev } = appRouter._def._config;

  // POSITIVE CONTROL. Without it this block could be a false green: under NODE_ENV=production tRPC omits
  // `stack` on its own and the strip would be untested. `isDev` true means this run IS the leaking regime,
  // so the belt — not the ambient env — is what the assertions below are proving.
  test("CONTROL: the router is configured isDev — this run is the regime that WOULD leak", () => {
    expect(isDev).toBe(true);
  });

  test("strips `stack` from the shape getErrorShape hands it (the incident's exact shape)", () => {
    const shaped = errorFormatter({
      error: mappedError(new DomainOperationError("bad_input", "no")),
      type: "query",
      path: "persona.list",
      input: undefined,
      ctx: undefined,
      shape: {
        message: "Authentication required.",
        code: -32_001,
        data: { code: "UNAUTHORIZED", httpStatus: 401, path: "persona.list", stack: LEAKING_STACK },
      },
    });
    expect(Object.keys(shaped.data)).not.toContain("stack");
  });

  test("the honest domain `reason` and the client-facing keys still ride (the strip drops ONLY stack)", () => {
    const shaped = errorFormatter({
      error: mappedError(new DomainOperationError("bad_input", "no")),
      type: "query",
      path: "persona.list",
      input: undefined,
      ctx: undefined,
      shape: {
        message: "no",
        code: -32_600,
        data: { code: "BAD_REQUEST", httpStatus: 400, path: "persona.list", stack: LEAKING_STACK },
      },
    });
    expect(shaped.data).toMatchObject({ code: "BAD_REQUEST", httpStatus: 400, path: "persona.list", reason: "bad_input" });
  });
});
