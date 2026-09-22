// connection.* — the connection-id wire boundary. Every procedure that accepts a `connectionId` shares
// the canonical `ConnectionRef` property schema: malformed and wrong-prefix strings stop at tRPC before a
// domain verb can read, dial or write. `setBinding(null)` remains the deliberate clear-binding arm.

import type { ConnectionBinding } from "@orb/contracts/inference";
import type { VerifyAuthResult } from "@orb/contracts/providers";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ConnectionService } from "@orb/server/domain/connection";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");
const VALID_CONNECTION_ID = mintTypeId(ID_PREFIX.userConnection);

function connectionSpies(): {
  readonly get: ReturnType<typeof vi.fn<ConnectionService["get"]>>;
  readonly update: ReturnType<typeof vi.fn<ConnectionService["update"]>>;
  readonly remove: ReturnType<typeof vi.fn<ConnectionService["remove"]>>;
  readonly capabilities: ReturnType<typeof vi.fn<ConnectionService["capabilities"]>>;
  readonly setBinding: ReturnType<typeof vi.fn<ConnectionService["setBinding"]>>;
  readonly useForEverything: ReturnType<typeof vi.fn<ConnectionService["useForEverything"]>>;
  readonly catalogModels: ReturnType<typeof vi.fn<ConnectionService["catalogModels"]>>;
  readonly probe: ReturnType<typeof vi.fn<ConnectionService["probe"]>>;
  readonly accountCredits: ReturnType<typeof vi.fn<ConnectionService["accountCredits"]>>;
  readonly generationCost: ReturnType<typeof vi.fn<ConnectionService["generationCost"]>>;
  readonly verifyAuth: ReturnType<typeof vi.fn<ConnectionService["verifyAuth"]>>;
  readonly inspectEndpoint: ReturnType<typeof vi.fn<ConnectionService["inspectEndpoint"]>>;
} {
  return {
    get: vi.fn<ConnectionService["get"]>(),
    update: vi.fn<ConnectionService["update"]>(),
    remove: vi.fn<ConnectionService["remove"]>(),
    capabilities: vi.fn<ConnectionService["capabilities"]>(),
    setBinding: vi.fn<ConnectionService["setBinding"]>(),
    useForEverything: vi.fn<ConnectionService["useForEverything"]>(),
    catalogModels: vi.fn<ConnectionService["catalogModels"]>(),
    probe: vi.fn<ConnectionService["probe"]>(),
    accountCredits: vi.fn<ConnectionService["accountCredits"]>(),
    generationCost: vi.fn<ConnectionService["generationCost"]>(),
    verifyAuth: vi.fn<ConnectionService["verifyAuth"]>(),
    inspectEndpoint: vi.fn<ConnectionService["inspectEndpoint"]>(),
  };
}

function ctxWith(connection: Partial<ConnectionService>): Context {
  return makeContext({ auth: principal("user", { userId: OWNER }), services: { connection } });
}

type AppCaller = ReturnType<typeof caller>;

const CONNECTION_ID_CALLS = [
  { name: "get", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.get({ connectionId }) },
  {
    name: "update",
    call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.update({ connectionId, patch: { label: "renamed" } }),
  },
  { name: "remove", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.remove({ connectionId }) },
  { name: "capabilities", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.capabilities({ connectionId }) },
  { name: "setBinding", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.setBinding({ task: "chat", connectionId }) },
  { name: "useForEverything", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.useForEverything({ connectionId }) },
  { name: "catalogModels", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.catalogModels({ connectionId }) },
  { name: "probe", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.probe({ connectionId }) },
  { name: "accountCredits", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.accountCredits({ connectionId }) },
  {
    name: "generationCost",
    call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> =>
      api.connection.generationCost({ connectionId, generationId: "provider-generation" }),
  },
  { name: "verifyAuth", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.verifyAuth({ connectionId }) },
  { name: "inspectEndpoint", call: (api: AppCaller, connectionId: UserConnectionId): Promise<unknown> => api.connection.inspectEndpoint({ connectionId }) },
] as const;

describe("connection.* — canonical connection id boundary", () => {
  test.each([
    ["wrong-prefix TypeID", castId<UserConnectionId>(mintTypeId(ID_PREFIX.chat))],
    ["malformed connection id", castId<UserConnectionId>("user_connection_not-a-typeid")],
  ])("every connection-id procedure rejects a %s before its service verb", async (_case, connectionId) => {
    const connection = connectionSpies();
    const api = caller(ctxWith(connection));

    const outcomes = await Promise.allSettled(CONNECTION_ID_CALLS.map(({ call }) => call(api, connectionId)));
    const reached = CONNECTION_ID_CALLS.filter(({ name }) => connection[name].mock.calls.length > 0).map(({ name }) => name);

    expect({ outcomes: outcomes.map(({ status }) => status), reached }).toEqual({
      outcomes: CONNECTION_ID_CALLS.map(() => "rejected"),
      reached: [],
    });
  });

  test("a valid user-connection TypeID reaches the requested verb", async () => {
    const remove = vi.fn<ConnectionService["remove"]>(async () => undefined);

    await caller(ctxWith({ remove })).connection.remove({ connectionId: VALID_CONNECTION_ID });

    expect(remove).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: OWNER }),
      connectionId: VALID_CONNECTION_ID,
    });
  });

  test("setBinding preserves null as the clear-binding arm", async () => {
    const cleared: ConnectionBinding = {
      id: mintTypeId(ID_PREFIX.connectionBinding),
      actorKind: "user",
      userId: OWNER,
      ruleId: null,
      pluginId: null,
      task: "chat",
      connectionId: null,
    };
    const setBinding = vi.fn<ConnectionService["setBinding"]>(async () => cleared);

    await caller(ctxWith({ setBinding })).connection.setBinding({ task: "chat", connectionId: null });

    expect(setBinding).toHaveBeenCalledWith({
      principal: expect.objectContaining({ userId: OWNER }),
      task: "chat",
      connectionId: null,
    });
  });
});

describe("connection.verifyAuth — output boundary", () => {
  const validResult: VerifyAuthResult = {
    source: "max-pro-sub",
    ok: true,
    apiKeySource: "none",
    model: "claude-opus-4-1",
    reply: "ok",
    costUsd: 0,
  };

  test("returns a valid auth diagnostic", async () => {
    const verifyAuth = vi.fn<ConnectionService["verifyAuth"]>(async () => validResult);

    await expect(caller(ctxWith({ verifyAuth })).connection.verifyAuth({ connectionId: VALID_CONNECTION_ID })).resolves.toEqual(validResult);
  });

  test("rejects a malformed auth diagnostic", async () => {
    const verifyAuth = vi.fn<ConnectionService["verifyAuth"]>(async () => validResult);
    const ctx = ctxWith({ verifyAuth });
    Object.defineProperty(ctx.services.connection, "verifyAuth", {
      value: () => Promise.resolve({ ...validResult, source: "unexpected-auth-source" }),
    });

    await expect(caller(ctx).connection.verifyAuth({ connectionId: VALID_CONNECTION_ID })).rejects.toThrow("Output validation failed");
  });

  test("strips an unexpected secret-like field from the auth diagnostic", async () => {
    const verifyAuth = vi.fn<ConnectionService["verifyAuth"]>(async () => validResult);
    const ctx = ctxWith({ verifyAuth });
    Object.defineProperty(ctx.services.connection, "verifyAuth", {
      value: () => Promise.resolve({ ...validResult, apiKey: "must-not-cross-the-wire" }),
    });

    const result = await caller(ctx).connection.verifyAuth({ connectionId: VALID_CONNECTION_ID });

    expect(result).toEqual(validResult);
    expect(result).not.toHaveProperty("apiKey");
  });
});
