// verb: resolveRole — the PD-9 assertions. Honors `routing.roleDefaults.<role>` per role (incl. resolving
// a role to `local-light`, the in-process tier — NO vllm hard-pin), applies the agent-sdk curated heal, and
// throws ConnectionRoutingError on an incoherent (api, source) selection.

import { ConnectionRoutingError, createConnectionService } from "@orb/server/domain/connection";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeConnHarness, principal } from "../_support.ts";

describe("resolveRole — honors roleDefaults (PD-9)", () => {
  test("an embed role pointed at local-light resolves to a local-light credential (no vllm hard-pin)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ embed: { source: "local-light" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal("user_1") });

    expect(conn.credential.source).toBe("local-light");
    expect(h.credentialCalls).toContain("local-light");
  });

  test("the chat role defaults to the local engine when no roleDefault is set", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("an agent-sdk chat roleDefault heals the model to the curated id + the curated capability", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({
      chat: { api: "agent-sdk", source: "max-pro-sub", model: "claude-sonnet-4-6" },
    });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.model).toBe("claude-sonnet-4-6");
    expect(conn.credential.source).toBe("max-pro-sub");
    expect(conn.capability.reasoning.mode).toBe("effort"); // curated Sonnet
  });

  test("an incoherent (api, source) selection throws ConnectionRoutingError", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "vllm" } }); // agent-sdk can't run on vllm
    const svc = createConnectionService(h.ctx);

    await expect(
      svc.resolveRole({ role: "chat", principal: principal("user_1") }),
    ).rejects.toBeInstanceOf(ConnectionRoutingError);
  });
});
