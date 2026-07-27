// verb: resolveRole — the PD-9 assertions. Honors `routing.roleDefaults.<role>` per role (incl. resolving
// a role to `local-light`, the in-process tier — NO vllm hard-pin), applies the agent-sdk curated heal, and
// throws ConnectionRoutingError on an incoherent (api, source) selection.

import { ConnectionRoutingError, createConnectionService } from "@orb/server/domain/connection";
import { env } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
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
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "max-pro-sub" } }); // the sub runs on agent-sdk only
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal("user_1") })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });

  // agent-sdk × vllm was REMOVED (owner ruling 2026-07-27): the local vLLM loopback agent skin is retired —
  // local vLLM chat runs on the chat-completions surface ONLY. assertCoherent now REJECTS the pair (the same
  // ConnectionRoutingError an incoherent selection throws), so a stored agent-sdk+vllm connection surfaces a
  // loud resolve-time error naming the fix — never a silent rewrite.
  test("agent-sdk × vllm is INCOHERENT (skin retired) — throws ConnectionRoutingError, no silent heal", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal("user_1") })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });

  // The OR skin: `agent-sdk × openrouter` legitimately runs Claude models — assertCoherent admits the pair,
  // so the heal must route it through the curated Claude heal (the arm was dropped in the burn-down alongside
  // the dead `anthropic` source and threw AgentModelHealError on a coherent selection).
  test("agent-sdk × openrouter heals through the curated Claude heal (the OR-skin arm)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.model).toBe("claude-sonnet-5");
    expect(conn.credential.source).toBe("openrouter");
  });

  // The heal is EXPLICIT + EXHAUSTIVE + FAIL-LOUD (owner ruling: the source-blind fallthrough to a Claude
  // default WAS the silent-failure antipattern). max-pro-sub + openrouter keep healToChatDefault; every other
  // agent-sdk source (incl. the now-retired vllm) is rejected by assertCoherent before the heal.
  test("no regression: agent-sdk on the SUB heals to a Claude curated default (Claude models keep healToChatDefault)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    // The owner's unconfigured chat defaults to agent-sdk × max-pro-sub — a real Claude source, so it heals
    // to the curated Claude default (a `/`-free curated id).
    const conn = await svc.resolveRole({ role: "chat", principal: principal("owner_1", "owner") });

    expect(conn.credential.source).toBe("max-pro-sub");
    expect(conn.model.startsWith("claude")).toBe(true);
    expect(conn.model).not.toContain("/");
  });
});

// resolveChatCapability — the caller's OWN chat-role ModelCapability resolved END-TO-END in ONE hop
// (selection → descriptor). Reuses resolveRole's chat selector (a vLLM-DEFAULT chat resolves the SAME as the
// engine) + the same resolveCapability mediator as getModelCapability — collapsing the old
// selection→getModelCapability round-trip that hid the maxOutputTokens/maxContextTokens fields. Caller-scoped
// by principal.userId, no input id.
describe("resolveChatCapability — the end-to-end chat-role descriptor", () => {
  test("a NON-owner vLLM default (no roleDefaults.chat) resolves a valid capability (the panel's output/context fields can render)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const cap = await svc.resolveChatCapability({ principal: principal("user_1") });

    // The vLLM default healed to a concrete selection → a real descriptor: it carries the window + output cap
    // the params panel's Max context / Max output fields bound against (the OLD null key hid these).
    expect(cap.context.window).toBeGreaterThan(0);
    expect(cap.output.maxTokens.max).toBeGreaterThan(0);
  });

  test("the OWNER's chat default resolves the Claude curated capability (owner-conditional, same selector as resolveRole)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    // Owner unconfigured chat → agent-sdk × max-pro-sub → the curated Claude default descriptor (adaptive
    // reasoning is the curated-Claude tell, matching getModelCapability.int.test.ts).
    const cap = await svc.resolveChatCapability({ principal: principal("owner_1", "owner") });

    expect(cap.reasoning.mode).toBe("adaptive");
  });

  test("an explicit roleDefaults.chat drives the descriptor (parity with resolveRole's heal)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "max-pro-sub", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const cap = await svc.resolveChatCapability({ principal: principal("user_1") });

    // The curated Sonnet descriptor (effort reasoning — the same assertion resolveRole's heal test makes).
    expect(cap.reasoning.mode).toBe("effort");
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

  test.each(["chat", "summarize"] as const)("a %s (generation) role with vllmAvailable:false stays as resolved — NEVER local-light", async (role) => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(false);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role, principal: principal("user_1") });

    expect(conn.credential.source).not.toBe("local-light");
    // For a NON-owner, chat/summarize default to vllm — neither falls to local-light (generation roles never do).
    expect(conn.credential.source).toBe("vllm");
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

describe("resolveRole — vllm gen window truth order (engine self-report WINS over env)", () => {
  test("the engine's self-reported max_model_len is the capability window (beats the env default)", async () => {
    const h = makeConnHarness(await freshDb());
    // A window DIFFERENT from the env default proves the engine's answer — not the env floor — is used.
    const engineWindow = env.VLLM_GEN_MAX_MODEL_LEN + 100_000;
    h.setVllmGenWindow(engineWindow);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.credential.source).toBe("vllm");
    expect(conn.capability.context.window).toBe(engineWindow);
  });

  test("with no engine reachable (null), the capability window falls back to the env-owned default", async () => {
    const h = makeConnHarness(await freshDb());
    h.setVllmGenWindow(null); // engine warming/disabled — nothing to seed the cache
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.credential.source).toBe("vllm");
    expect(conn.capability.context.window).toBe(env.VLLM_GEN_MAX_MODEL_LEN);
  });
});
