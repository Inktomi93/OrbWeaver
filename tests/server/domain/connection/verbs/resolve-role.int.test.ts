// verb: resolveRole — the PD-9 assertions. Honors `routing.roleDefaults.<role>` per role (incl. resolving
// a role to `local-light`, the in-process tier — NO vllm hard-pin), applies the agent-sdk curated heal, and
// throws ConnectionRoutingError on an incoherent (api, source) selection.

import { ConnectionRoutingError, createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, makeOrEntry, principal } from "../_support.ts";

describe("resolveRole — honors roleDefaults (PD-9)", () => {
  test("an embed role pointed at local-light resolves to a local-light credential (no vllm hard-pin)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ embed: { source: "local-light" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal("user_1") });

    expect(conn.credential.source).toBe("local-light");
    expect(h.credentialCalls).toContain("local-light");
  });

  test("a NON-owner chat defaults to the local vllm engine when no roleDefault is set", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("the OWNER's chat defaults to their max-pro-sub (agent-sdk) when no roleDefault is set", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("owner_1", "owner") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("max-pro-sub");
  });

  test("an agent-sdk chat roleDefault heals the model to the curated id + the curated capability", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({
      chat: { api: "agent-sdk", source: "max-pro-sub", model: "claude-sonnet-5" },
    });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.model).toBe("claude-sonnet-5");
    expect(conn.credential.source).toBe("max-pro-sub");
    expect(conn.capability.reasoning.mode).toBe("effort"); // curated Sonnet
  });

  test("summarize DEFAULTS to the local vllm gen model (unchanged) with no roleDefault", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({
      role: "summarize",
      principal: principal("owner_1", "owner"),
    });

    // Even the owner's summarize stays on the local engine — only chat is owner-conditional.
    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("a summarize override to max-pro-sub resolves via agent-sdk (the sub as a selectable summarizer)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ summarize: { source: "max-pro-sub", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "summarize", principal: principal("user_1") });

    // The sub summarize pairs with agent-sdk (the only coherent api for max-pro-sub) and heals its model
    // through the curated agent-sdk heal — like the chat role.
    expect(conn.api).toBe("agent-sdk");
    expect(conn.model).toBe("claude-sonnet-5");
    expect(conn.credential.source).toBe("max-pro-sub");
  });

  test("an incoherent (api, source) selection throws ConnectionRoutingError", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "vllm" } }); // agent-sdk can't run on vllm
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal("user_1") })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });
});

// The anth-direct (D67, W7) protocol pairing — `assertCoherent`'s new arm. The v1 PRIMARY path rides the
// existing `openrouter` credential (ZERO new credential); the free Max sub can NEVER reach it (§3d, the
// load-bearing sub-exclusion invariant).
describe("resolveRole — the anthropic-messages (anth-direct) coherence pairing (D67 §3a/§3d)", () => {
  test("anthropic-messages × openrouter is COHERENT (the v1 PRIMARY path, rides the OR credential)", async () => {
    const h = makeConnHarness(await freshDb());
    // The OR catalog carries an anthropic slug so the openrouter chat-model heal picks it.
    h.setOrCatalog([makeOrEntry({ id: "anthropic/claude-opus-4.8" })]);
    h.setRoleDefaults({
      chat: { api: "anthropic-messages", source: "openrouter", model: "anthropic/claude-opus-4.8" },
    });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.api).toBe("anthropic-messages");
    expect(conn.credential.source).toBe("openrouter");
  });

  test("THE SUB-EXCLUSION: anthropic-messages × max-pro-sub throws ConnectionRoutingError (§3d)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "anthropic-messages", source: "max-pro-sub" } });
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal("owner_1", "owner") })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });

  test("anthropic-messages × vllm is INCOHERENT in v1 (the Anthropic wire is OR-skin-only)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "anthropic-messages", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal("user_1") })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });
});

// The no-GPU derive-role fallback: `vllmAvailable:false` reroutes embed/rerank/imageEmbed from vLLM to the
// in-process local-light tier (jina-clip-v2, 1024-dim — fits F32_BLOB(1024)); the generation roles never
// fall (local-light has no generation — a no-GPU user picks a hosted roleDefault for those).
describe("resolveRole — derive-role local-light fallback when vLLM is unavailable", () => {
  // Empty default roleDefaults → every derive role selects `vllm`; with no GPU it must reroute.
  test.each([
    "embed",
    "rerank",
    "imageEmbed",
  ] as const)("a %s role resolving to vllm with vllmAvailable:false → local-light + empty (self-default) model", async (role) => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(false);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role, principal: principal("user_1") });

    expect(conn.credential.source).toBe("local-light");
    expect(h.credentialCalls).toContain("local-light");
    expect(h.credentialCalls).not.toContain("vllm");
    // Empty model id → the local-light backend self-defaults to jina-clip-v2 (1024-dim).
    expect(conn.model).toBe("");
  });

  test.each(["chat", "summarize", "agent"] as const)("a %s (generation) role with vllmAvailable:false stays as resolved — NEVER local-light", async (role) => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(false);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role, principal: principal("user_1") });

    expect(conn.credential.source).not.toBe("local-light");
    // chat/summarize default to vllm; agent defaults to the owner's sub — none fall to local-light.
    expect(conn.credential.source).toBe(role === "agent" ? "max-pro-sub" : "vllm");
  });

  test("an embed role with vllmAvailable:true stays on vLLM (fallback only on no-GPU)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(true);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal("user_1") });

    expect(conn.credential.source).toBe("vllm");
  });

  test("only a vllm selection falls — an embed pinned to openrouter is untouched by no-GPU", async () => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(false);
    h.setRoleDefaults({ embed: { source: "openrouter", model: "openai/text-embedding-3-small" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal("user_1") });

    expect(conn.credential.source).toBe("openrouter");
  });
});
