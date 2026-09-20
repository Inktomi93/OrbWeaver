// The procedure ladder — the 2-layer auth gates + the injected rate-limit seam, driven through the real
// `appRouter` via `createCaller` (core/Tier-4-Transport.md). Proves: authedProcedure rejects anon;
// adminProcedure rejects a plain user but passes owner ∪ admin (LAYER-1, no db); a representative router
// delegates to the injected service verb with the Principal; the CSRF gate fires on cookie mutations only;
// the injected rate-limit gate's throw maps to TOO_MANY_REQUESTS; the multi-human belt (PD-106) 404s the
// documented single-user-refused surface list (the invites router + `notifications.presence` — the inbox
// CRUD trio LEFT that list with #1627) and stays open in multi-user mode; the errorFormatter's
// PROD-LEAK belt keeps `stack` off the wire shape in EVERY env; and its UNCLASSIFIED-MESSAGE belt keeps an
// unmodelled throw's own text off the wire while a classified error keeps both its message and its reason.

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../support/composed-real.ts";
import { ProviderError, providerErrorFromHttp, resolvedScrubSet } from "@orb/inference";
import { DomainOperationError, DomainRateLimitError } from "@orb/kit/errors";
import type { CharacterId, ChatId, ChatInviteId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AdminService } from "@orb/server/domain/admin";
import type { ChatService } from "@orb/server/domain/chat";
import type { PersonaService } from "@orb/server/domain/persona";
import type { SettingsService } from "@orb/server/domain/settings";
import { logger } from "@orb/server/foundation/observability";
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
    await expect(caller(ctx).admin.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("rejects an anonymous caller with UNAUTHORIZED (auth gate fires first)", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).admin.listUsers()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("passes an owner through to the verb", async () => {
    const listUsers = vi.fn<AdminService["listUsers"]>();
    const ctx = makeContext({ auth: principal("owner"), services: { admin: { listUsers } } });
    await caller(ctx).admin.listUsers();
    expect(listUsers).toHaveBeenCalledTimes(1);
  });

  test("passes a delegated admin through to the verb", async () => {
    const listUsers = vi.fn<AdminService["listUsers"]>();
    const ctx = makeContext({ auth: principal("admin"), services: { admin: { listUsers } } });
    await caller(ctx).admin.listUsers();
    expect(listUsers).toHaveBeenCalledTimes(1);
  });
});

describe("a representative router delegates to the injected service verb", () => {
  test("admin.listUsers calls ctx.services.admin.listUsers with the Principal (PD-3)", async () => {
    const listUsers = vi.fn<AdminService["listUsers"]>();
    const ctx = makeContext({ auth: principal("admin"), services: { admin: { listUsers } } });
    await caller(ctx).admin.listUsers();
    expect(listUsers).toHaveBeenCalledWith({ principal: ctx.auth });
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

// ── THE SILENT 500 (docs/design/streaming-shape-churn.md §7.5) ──────────────────────────────────────────
//
// A live turn threw a provider fault, tRPC serialised it as an INTERNAL_SERVER_ERROR, and the whole ladder
// logged NOTHING of its own: `classifyDomainError` returned null, `domainErrorMiddleware` just returned the
// result, and the caller got a bare 500 with no server-side trace. `/api/_debug/errors` had nothing to show
// because nothing was written for it. Every 500 now lands one error line naming the procedure.
//
// Pino is silenced in the test env (`LOG_LEVEL: "silent"`), so — the `securityEvent` idiom in this suite's
// sibling — the assertion is on the CALL, not on the ring.
describe("the unmapped-error 500 log (silent-500 belt)", () => {
  /** A verb that throws something the domain classifier does not model — the genuine-fault shape. */
  function faultingCaller(err: Error): { ctx: Context; log: ReturnType<typeof vi.spyOn> } {
    const list = vi.fn<PersonaService["list"]>().mockRejectedValue(err);
    return {
      ctx: makeContext({ auth: principal("user"), services: { persona: { list } } }),
      log: vi.spyOn(logger, "error"),
    };
  }

  test("an unmapped throw logs ONE error line naming the procedure, and still surfaces as a 500", async () => {
    const boom = new Error("provider exploded");
    const { ctx, log } = faultingCaller(boom);
    await expect(caller(ctx).persona.list()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(log).toHaveBeenCalledOnce();
    const [bindings] = log.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(bindings["event"]).toBe("trpc.unhandled");
    expect(bindings["path"]).toBe("persona.list");
    // The CAUSE, not tRPC's wrapper — the wrapper's message is generic, the cause is the actual failure.
    expect(bindings["err"]).toBe(boom);
  });

  test("a MAPPED domain error is NOT logged as a fault — it is a modelled outcome, not a bug", async () => {
    const { ctx, log } = faultingCaller(new DomainOperationError("no_continuation", "nothing to continue"));
    await expect(caller(ctx).persona.list()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(log).not.toHaveBeenCalled();
  });

  test("an expected GATE refusal is NOT logged either — 401 noise would bury the real faults", async () => {
    const log = vi.spyOn(logger, "error");
    await expect(caller(makeContext({ auth: null })).persona.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(log).not.toHaveBeenCalled();
  });

  // A CLASSIFIED PROVIDER FAULT IS NOT A BUG, SO NOT `error` — but it still owes a trace, and this is now
  // the ONLY place its real message exists: the classifier sends host copy for every kind but `invalid`.
  // Without this line a dead key, a rate-limit or an upstream 5xx would leave nothing behind anywhere.
  test("a classified PROVIDER fault logs one WARN carrying toLog(), and is NOT counted as an unmapped fault", async () => {
    const fault = new ProviderError({ kind: "auth_failed", retryable: false, message: "openrouter chat: HTTP 401 — bad key", apiErrorStatus: 401 });
    const list = vi.fn<PersonaService["list"]>().mockRejectedValue(fault);
    const ctx = makeContext({ auth: principal("user"), services: { persona: { list } } });
    const warn = vi.spyOn(logger, "warn");
    const error = vi.spyOn(logger, "error");

    await expect(caller(ctx).persona.list()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    const [bindings] = warn.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(bindings).toMatchObject({ event: "trpc.provider", path: "persona.list", kind: "auth_failed", apiErrorStatus: 401 });
    // The message the WIRE did not get is exactly what the log did.
    expect(bindings["message"]).toBe("openrouter chat: HTTP 401 — bad key");
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

const chatId = castId<ChatId>("chat_1");
const inviteId = castId<ChatInviteId>("chatinvite_1");
const kickTarget = castId<UserId>("user_target");

/** One documented single-user-refused surface (Tier-4 §"multi-human surface"). `probe` proves the
 *  multi-user path got through the belt: the chat-service verb for an invites row, the presence registry's
 *  own `read` spy for the disclosure read (transport-owned state — there is no domain verb to observe). */
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
      // @orb-waive no-test-fabrication(never): the belt assertions observe only call count; the mocked verb result is never read. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
      const fn = vi.fn(async () => ({}) as never);
      return { services: { chat: { [verb]: fn } }, presence: inertPresence, probe: fn };
    },
    drive,
  };
}

// The full multi-human surface list at transport today — the invites/membership router (FINAL-Auth-Modes
// §7 P1 — the PD-106 burn-down) + `notifications.presence`.
//
// NEITHER THE INBOX CRUD TRIO NOR THE INBOX STREAM IS ON THIS LIST ANY MORE (#1627). PD-106's ruling
// survives, its INPUT changed: the belt covered the inbox because every notification SOURCE was
// multi-human, and single-human sources now exist (`plugin-disabled`, `automation-notice`, the plugin
// consent prompt), so the belt was hiding durable rows from the only human on a single-user box. The trio
// widened to `authedProcedure` and the room's `authorizeAttach` became a no-op; what holds the per-user
// partition instead is the `recipient_user_id` WHERE clause, PROBED at the wire in
// tests/server/transport/cross-tenant-sweep.suite.int.test.ts. The widened arms are pinned at
// tests/server/transport/trpc/routers/notifications.test.ts and .../stream/sources/notifications.test.ts.
// `presence` stays: online state about OTHER humans is a multi-human surface either way.
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
    // #1039 — the presence DISCLOSURE read. It reaches no domain verb (presence is transport-owned state),
    // so the probe is the registry's own `read` spy: not called ⇒ the belt refused before any presence fact
    // was consulted. This row is the belt half of the row's security posture — a deployment that cannot seat
    // a second human must not answer "who is online" at all, and must refuse it as NONEXISTENT rather than
    // as forbidden (a FORBIDDEN here would advertise that the surface exists).
    path: "notifications.presence",
    make: () => {
      const read = vi.fn<PresenceRegistry["read"]>((userId) => ({ userId, online: false, lastSeenAt: null }));
      return { services: {}, presence: { connect: (): void => undefined, read }, probe: read };
    },
    drive: (ctx) => caller(ctx).notifications.presence({ userIds: [kickTarget] }),
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

  // Driven through `notifications.presence` — a belted QUERY, so the probe reaches the ordering question
  // without the CSRF gate in the way. It moved here from `notifications.list` when the inbox trio left the
  // belt (#1627): `list` now answers UNAUTHORIZED to this call, which is the right answer for an
  // `authedProcedure` and says nothing about belt-vs-auth ORDER.
  test("fires BEFORE the auth gate: an anonymous probe while not capable sees NOT_FOUND, not UNAUTHORIZED", async () => {
    const ctx = makeContext({ auth: null, multiHumanCapable: false });
    await expect(caller(ctx).notifications.presence({ userIds: [kickTarget] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("multi-human capable still requires auth (the belt adds no anonymous bypass)", async () => {
    const ctx = makeContext({ auth: null, multiHumanCapable: true });
    await expect(caller(ctx).notifications.presence({ userIds: [kickTarget] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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
  "TRPCError: Authentication required.\n    at /home/devuser/orbweaver/packages/server/src/transport/trpc/trpc.ts:91:11\n    at /home/devuser/node_modules/.pnpm/@trpc+server@11.18.0/dist/index.mjs:1:1";

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

  // ── THE UNCLASSIFIED-MESSAGE BELT ────────────────────────────────────────────────────────────────────
  //
  // `getErrorShape` sets `shape.message = error.message`, and `TRPCError`'s constructor inherits the
  // CAUSE's message when given none — so a throw nothing modelled put its own raw text on the wire. The
  // formatter now substitutes a fixed sentence whenever `data.code` is INTERNAL_SERVER_ERROR, and does it
  // by destructuring `message` OUT of `shape` so the spread cannot carry it (the same "unrepresentable,
  // not merely unlikely" shape as the `stack` strip above).
  //
  // BOTH PLANTED CONTROLS RUN HERE, because either alone is a false green: the first proves the belt
  // closes on a message that must not ride, the second proves it is keyed on the CODE rather than blanket
  // — a blanket collapse would pass the first and silently degrade every typed refusal in the product.

  /** `getErrorShape`'s output for one (code, message) pair, as it reaches the configured formatter. */
  function shapeFor(
    code: Parameters<typeof errorFormatter>[0]["shape"]["data"]["code"],
    httpStatus: number,
    message: string,
    error: Parameters<typeof errorFormatter>[0]["error"],
  ): { readonly message: string } {
    return errorFormatter({
      error,
      type: "query",
      path: "persona.list",
      input: undefined,
      ctx: undefined,
      shape: { message, code: -32_603, data: { code, httpStatus, path: "persona.list", stack: LEAKING_STACK } },
    });
  }

  test("CONTROL A — an UNCLASSIFIED 500's own message never reaches the wire", () => {
    // The three provenances a raw throw's message actually holds on this tree: a host path (the
    // `local-light` cache-dir error), an unsanitized upstream body (`fetchJson`), a driver string.
    const raw = "ENOENT: no such file, mkdir '/home/opuser/orb/.cache' — <html>502 <b>upstream</b></html> sk-or-v1-abc";
    const shaped = shapeFor("INTERNAL_SERVER_ERROR", 500, raw, mappedError(new DomainOperationError("x", "y")));
    expect(shaped.message).not.toContain("/home/opuser");
    expect(shaped.message).not.toContain("sk-or-v1-abc");
    expect(shaped.message).not.toContain("<html>");
    // Not an empty string either — a surface that renders `error.message` must still say something.
    expect(shaped.message.length).toBeGreaterThan(0);
  });

  test("CONTROL B — a CLASSIFIED error keeps its own message AND its reason, unchanged", () => {
    const refusal = new DomainOperationError("owner_not_present", "the agent's owner is not a present member");
    const mapped = mappedError(refusal);
    const shaped = errorFormatter({
      error: mapped,
      type: "query",
      path: "persona.list",
      input: undefined,
      ctx: undefined,
      shape: { message: mapped.message, code: -32_600, data: { code: "BAD_REQUEST", httpStatus: 400, path: "persona.list", stack: LEAKING_STACK } },
    });
    expect(shaped.message).toBe("the agent's owner is not a present member");
    expect(shaped.data).toMatchObject({ code: "BAD_REQUEST", reason: "owner_not_present" });
  });

  test("a classified PROVIDER failure rides its `provider_<kind>` reason so the client can still discriminate", () => {
    const mapped = mappedError(new ProviderError({ kind: "rate_limit", retryable: true, message: "openrouter chat: HTTP 429 — slow down" }));
    const shaped = errorFormatter({
      error: mapped,
      type: "query",
      path: "search.search",
      input: undefined,
      ctx: undefined,
      shape: { message: mapped.message, code: -32_029, data: { code: "TOO_MANY_REQUESTS", httpStatus: 429, path: "search.search", stack: LEAKING_STACK } },
    });
    expect(shaped.data).toMatchObject({ reason: "provider_rate_limit" });
    // Host copy, not the upstream sentence — the classifier already substituted it.
    expect(shaped.message).not.toContain("HTTP 429");
  });

  test("a provider-reflected credential is absent from the tRPC/UI wire shape and retained cause graph", () => {
    const secret = "sk-or-reflected-through-trpc-123456";
    // The scrub set is the secret VALUE itself (#1599) — a keyed boundary's set comes from the resolved
    // secret, never from a hand-built array, in a test exactly as in a runner.
    const providerError = providerErrorFromHttp(
      Object.assign(new Error(`upstream rejected ${secret}`), { statusCode: 401, body: `{"error":"${secret}"}` }),
      "openrouter chat",
      resolvedScrubSet({ credential: { secret }, transport: null }),
    );
    // The formatter only reads `error` for the optional domain reason; the actual client-visible provider
    // bytes are the `shape` produced by tRPC's getErrorShape immediately before this callback.
    const error = mappedError(new DomainOperationError("bad_input", providerError.message));
    const shaped = errorFormatter({
      error,
      type: "mutation",
      path: "chat.send",
      input: undefined,
      ctx: undefined,
      shape: {
        message: error.message,
        code: -32_603,
        data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500, path: "chat.send", stack: LEAKING_STACK },
      },
    });

    expect(JSON.stringify(shaped)).not.toContain(secret);
    expect(providerError.message).not.toContain(secret);
    expect((providerError.cause as Error).message).not.toContain(secret);
  });
});
