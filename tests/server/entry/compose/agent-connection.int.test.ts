// entry/compose/agent-connection — the compose-root, host-funded agent-connection resolver (D60; AP3-3;
// agent-principal-design/04 §5 + 02 §3). Proves: resolveRole('agent') is called under the HOST's REAL
// principal (funding follows the host, never the caller/owner); a ConnectionRoutingError (no coherent
// host-funded agent connection) degrades to null (the engine falls back to the round connection); and a
// credential/authorization failure PROPAGATES (never a silent re-credential around the control).

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { ConnectionRoutingError } from "../../../../packages/server/src/domain/connection";
import { createAgentConnectionResolver } from "../../../../packages/server/src/entry/compose/agent-connection.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures";

const HOST = castId<UserId>("user_host");
const AGENT = castId<UserId>("user_agent");

function ownerPrincipal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("host"), role: "owner" });
}

function agentConnection(): ResolvedConnection {
  return {
    api: "agent-sdk",
    model: castId<ModelId>("claude-agent-brain"),
    // The resolver passes the connection through opaquely — only `.model` is asserted; the credential/
    // capability shapes are irrelevant to this pass-through test (the _support testConnection double).
    // FABRICATION-OK: opaque pass-through double, only .model read
    credential: { source: "max-pro-sub", credentialId: null } as unknown as ResolvedConnection["credential"],
    // FABRICATION-OK: opaque pass-through double, capability never read
    capability: {} as unknown as ResolvedConnection["capability"],
  };
}

describe("createAgentConnectionResolver — host-funded resolveRole('agent')", () => {
  test("resolves under the HOST's REAL principal (funding follows the host, not the caller/owner) + threads the agent id", async () => {
    const seen: Principal[] = [];
    const seenAgentIds: UserId[] = [];
    const resolveHostPrincipal = (userId: UserId): Promise<Principal> => Promise.resolve(ownerPrincipal(userId));
    const resolve = createAgentConnectionResolver((principal, agentPrincipalId) => {
      seen.push(principal);
      seenAgentIds.push(agentPrincipalId);
      return Promise.resolve(agentConnection());
    }, resolveHostPrincipal);

    const conn = await resolve(HOST, AGENT);

    expect(conn?.model).toBe("claude-agent-brain");
    // The role resolver saw the HOST principal with its REAL role (the max-pro-sub owner gate reads the role).
    expect(seen).toHaveLength(1);
    expect(seen[0]?.userId).toBe(HOST);
    expect(seen[0]?.role).toBe("owner");
    // The SPEAKING agent's id is threaded so its per-agent connection can beat the role default (D67 amendment).
    expect(seenAgentIds).toEqual([AGENT]);
  });

  test("a ConnectionRoutingError (no coherent agent connection) degrades to null — the caller falls back", async () => {
    const resolve = createAgentConnectionResolver(
      () => Promise.reject(new ConnectionRoutingError("agent-sdk", "vllm")),
      (userId) => Promise.resolve(ownerPrincipal(userId)),
    );

    expect(await resolve(HOST, AGENT)).toBeNull();
  });

  test("a credential/authorization failure PROPAGATES — never a silent re-credential", async () => {
    const resolve = createAgentConnectionResolver(
      () => Promise.reject(new DomainForbiddenError("max-pro-sub is owner-only")),
      (userId) => Promise.resolve(ownerPrincipal(userId)),
    );

    await expect(resolve(HOST, AGENT)).rejects.toBeInstanceOf(DomainForbiddenError);
  });
});
