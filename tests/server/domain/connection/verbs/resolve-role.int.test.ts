// verb: resolveRole — the PD-9 assertions. Honors `routing.roleDefaults.<role>` per role (incl. resolving
// a role to `local-light`, the in-process tier — NO vllm hard-pin), applies the agent-sdk curated heal, and
// throws ConnectionRoutingError on an incoherent (api, source) selection.

import { deriveByoCapability } from "@orb/contracts/comfyui-workflow";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ConnectionRoutingError, createConnectionService } from "@orb/server/domain/connection";
import { vllmAgentModelAlias } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness as makeSettingsHarness, seedUser, principal as settingsPrincipal } from "../../settings/_support.ts";
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
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "max-pro-sub" } }); // the sub runs on agent-sdk only
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal("user_1") })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });

  test("agent-sdk × vllm is COHERENT (U0 local loopback agent path) — resolves, no throw", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("vllm");
  });

  // The model-heal gap: `agent-sdk × vllm` runs Claude Code against the LOCAL vLLM engine, which serves ONLY
  // the slash-free alias (`vllmAgentModelAlias()` = env.VLLM_GEN_MODEL's leaf). Before this fix healModel's
  // source-blind agent-sdk arm returned claude-opus-4-8 (healToChatDefault) → the loopback 404s → the turn
  // crashes (exit 1). It must resolve the vLLM alias, NEVER a Claude default.
  test("agent-sdk × vllm heals to the local vLLM ALIAS, NOT a Claude default (the RPG-on-vLLM crash fix)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal("user_1") });

    // The slash-free leaf of env.VLLM_GEN_MODEL (default "Qwen/Qwen3-VL-8B-Instruct" → "Qwen3-VL-8B-Instruct")
    // — the alias buildClaudeVllmEnv sets as ANTHROPIC_DEFAULT_*_MODEL. Derived from the ONE shared helper.
    expect(conn.model).toBe(vllmAgentModelAlias());
    expect(conn.model).not.toContain("/"); // Claude Code can't resolve a slash-containing id
    expect(conn.model).not.toBe("claude-opus-4-8"); // the pre-fix wrong default
  });

  test("the agent ROLE on agent-sdk × vllm ALSO heals to the vLLM alias (not just the chat role)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.model).toBe(vllmAgentModelAlias());
  });

  // The heal is now EXPLICIT + EXHAUSTIVE + FAIL-LOUD (owner ruling: the source-blind fallthrough to a Claude
  // default WAS the silent-failure antipattern). Each of the three Claude-running agent-sdk sources
  // (max-pro-sub / anthropic / openrouter) keeps healToChatDefault; vllm gets the alias (above); a new/unhandled
  // agent-sdk source THROWS AgentModelHealError instead of silently becoming opus.
  test("no regression: agent-sdk on the SUB heals to a Claude curated default (Claude models keep healToChatDefault)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    // The owner's unconfigured chat defaults to agent-sdk × max-pro-sub — a real Claude source, so it heals
    // to the curated Claude default (a `/`-free curated id), NOT the vLLM alias.
    const conn = await svc.resolveRole({ role: "chat", principal: principal("owner_1", "owner") });

    expect(conn.credential.source).toBe("max-pro-sub");
    expect(conn.model).not.toBe(vllmAgentModelAlias());
    expect(conn.model.startsWith("claude")).toBe(true);
  });

  test("no regression: agent-sdk on the first-party ANTHROPIC key heals to a Claude curated default (W11)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "anthropic", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.credential.source).toBe("anthropic");
    expect(conn.model).toBe("claude-sonnet-5");
    expect(conn.model).not.toBe(vllmAgentModelAlias());
  });

  test("no regression: agent-sdk on the OPENROUTER skin heals to a Claude curated default (mode-2)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.credential.source).toBe("openrouter");
    expect(conn.model.startsWith("claude")).toBe(true);
    expect(conn.model).not.toBe(vllmAgentModelAlias());
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

// N1 (comfyui-control §4.11.2c): a `byo:<name>` generateImage selection folds the caller's saved-workflow
// capability (DERIVED from its placeholder scan) onto the static comfyui descriptor — so a BYO edit workflow
// resolves edit-capable end-to-end (capability → gate → runner). A workflow with NO edit placeholders stays
// honestly non-edit; an UNKNOWN name (no such workflow) claims nothing.
describe("resolveRole — the BYO workflow capability fold (N1)", () => {
  test("a BYO workflow declaring %init_image%/%mask% resolves input.imageEdit (the edit belt binds, not drops)", async () => {
    const h = makeConnHarness(await freshDb());
    // deriveByoCapability is the ONE derivation the picker + runner + this fold share (no hand-shaped fixture).
    h.setByoWorkflowCapability("editflow", deriveByoCapability(["init_image", "mask", "steps", "cfg"]));
    h.setRoleDefaults({ generateImage: { source: "comfyui", model: "byo:editflow" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "generateImage", principal: principal("user_1") });

    expect(conn.model).toBe("byo:editflow");
    expect(conn.capability.input?.imageEdit).toBe(true);
    // The scalar tokens the workflow declares drive the knob surface (steps + cfg present, not the static set).
    expect(conn.capability.imageGen?.steps).toEqual({ min: 1, max: 150 });
  });

  test("a BYO workflow declaring %reference_image% resolves input.imageIdentity (avatar routes into references)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setByoWorkflowCapability("faceflow", deriveByoCapability(["reference_image", "prompt"]));
    h.setRoleDefaults({ generateImage: { source: "comfyui", model: "byo:faceflow" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "generateImage", principal: principal("user_1") });

    expect(conn.capability.input?.imageEdit).toBe(true);
    expect(conn.capability.input?.imageIdentity).toBe(true);
  });

  test("a BYO workflow with NO edit placeholders stays honestly non-edit (input absent)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setByoWorkflowCapability("txtflow", deriveByoCapability(["prompt", "steps", "seed"]));
    h.setRoleDefaults({ generateImage: { source: "comfyui", model: "byo:txtflow" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "generateImage", principal: principal("user_1") });

    expect(conn.capability.input).toBeUndefined();
  });

  test("an UNKNOWN byo:name (the caller has no such workflow) resolves edit-less (claims nothing)", async () => {
    const h = makeConnHarness(await freshDb());
    // No setByoWorkflowCapability — the faked read returns null.
    h.setRoleDefaults({ generateImage: { source: "comfyui", model: "byo:missing" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "generateImage", principal: principal("user_1") });

    expect(conn.capability.input).toBeUndefined();
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

// The D67 api-unpin: the agent role is a per-user connection choice like every other role — it reads its
// OWN `roleDefaults.agent` (api + source + model), no longer borrowing `roleDefaults.chat`, and its api is
// NOT server-pinned to agent-sdk (solo buddy validates the resolved api at its own entry, not here).
// D67 api-unpin + the 2026-07-21 owner ruling: an explicit `roleDefaults.agent` is honored (api NOT
// server-pinned), but the ULTIMATE fallback (no rd.agent, no per-agent override) is now the user's CHAT
// connection — NOT a hardcoded sub/agent-sdk. This is what stops rpg-world-gen from dispatching a
// chat-completions+vllm user's agent turn to runAgentTurn (Claude Code) and crashing the loopback.
describe("resolveRole — the agent role defaults to the CHAT connection (owner ruling 2026-07-21)", () => {
  test("an unconfigured agent (no roleDefaults.agent) INHERITS the user's chat connection — chat-completions+vllm, NOT agent-sdk", async () => {
    const h = makeConnHarness(await freshDb());
    // Chat is a local vLLM chat-completions connection; the agent role must follow it (the whole point —
    // world-gen/crew then run runChatTurn on vLLM instead of crashing Claude Code against the loopback).
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("an owner-unconfigured agent inherits the owner's CHAT default (which falls to the sub on agent-sdk)", async () => {
    const h = makeConnHarness(await freshDb());
    // No rd.agent, no rd.chat → the owner's chat default is agent-sdk × max-pro-sub, and the agent inherits it.
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("owner_1", "owner") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("max-pro-sub");
  });

  test("an agent roleDefault on openrouter+agent-sdk resolves that connection", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("openrouter");
  });

  test("the agent api is UNPINNED — a chat-completions agent connection resolves (never forced to agent-sdk)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "chat-completions", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("an agentOverride api beats the agent roleDefault", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "max-pro-sub" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({
      role: "agent",
      principal: principal("user_1"),
      agentOverride: { api: "chat-completions", source: "vllm" },
    });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("an incoherent agent (api, source) selection throws ConnectionRoutingError", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "anthropic-messages", source: "vllm" } }); // the Anthropic wire is OR-skin-only
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "agent", principal: principal("user_1") })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });

  test("an agent roleDefault on agent-sdk × vllm is COHERENT (U0) — resolves the vllm connection", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("vllm");
  });
});

// The per-agent connection cascade (D67 amendment): a SEATED agent whose principal id has an entry in
// `routing.agentConnections` runs on THAT connection, beating `roleDefaults.agent` (the DEFAULT/fallback).
// An absent id (solo buddy, crew, any un-overridden agent) falls through to the role default.
describe("resolveRole — the per-agent connection cascade (agentConnections beats roleDefaults.agent)", () => {
  test("a per-agent connection beats the role default for THAT agent id (override → default cascade)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "max-pro-sub" } });
    h.setAgentConnections({ agentX: { api: "chat-completions", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1"), agentPrincipalId: castId<UserId>("agentX") });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("a per-agent AGENT-SDK mapping beats the CHAT inheritance (agent mapped to something specific — owner ruling)", async () => {
    const h = makeConnHarness(await freshDb());
    // No rd.agent: the fallback would be the chat connection (chat-completions+vllm). But this agent id is
    // explicitly mapped to agent-sdk × sub — the per-agent override wins over the chat inheritance.
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setAgentConnections({ agentX: { api: "agent-sdk", source: "max-pro-sub" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1"), agentPrincipalId: castId<UserId>("agentX") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("max-pro-sub");
  });

  test("an un-mapped agent id with a chat default (no rd.agent) INHERITS chat (chat-completions+vllm), not the sub", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    h.setAgentConnections({ agentOther: { api: "agent-sdk", source: "max-pro-sub" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1"), agentPrincipalId: castId<UserId>("agent_unmapped") });

    // No per-agent entry for this id, no rd.agent → the chat connection is the fallback.
    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("an agent id with NO entry falls through to roleDefaults.agent (the default row)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } });
    h.setAgentConnections({ agentOther: { api: "chat-completions", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1"), agentPrincipalId: castId<UserId>("agent_unconfigured") });

    // No entry for this id → the DEFAULT agent connection.
    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("openrouter");
  });

  test("NO agentPrincipalId (solo buddy / crew) uses the default — agentConnections is never consulted", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "max-pro-sub" } });
    h.setAgentConnections({ agentX: { api: "chat-completions", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("max-pro-sub");
  });

  test("a NULL agent connection entry reads as no-override → falls back to roleDefaults.agent (cleared override)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ agent: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } });
    h.setAgentConnections({ agentX: null }); // the Agents-table Remove writes null
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "agent", principal: principal("user_1"), agentPrincipalId: castId<UserId>("agentX") });

    // A null (cleared) entry cascades to the DEFAULT, identical to an absent id.
    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("openrouter");
  });

  // END-TO-END regression pin (the stickler-flagged deep-merge bug): drive the CLEAR through the REAL
  // settings write, feed the resulting config into the resolver. A populated override cleared with a `null`
  // patch must resolve to the default — proving the whole Remove chain (patch → deepMergePlain → parse →
  // resolve), not just the resolver half.
  test("Remove via the real updateUserSettingsSection (null patch) clears the override → resolver uses the default", async () => {
    const db = await freshDb();
    const sh = makeSettingsHarness(db);
    const sp = settingsPrincipal(await seedUser(db, { id: "user_e2e_agent" }), "user");
    // Populate an override on vllm, then clear it with the null patch (the Remove affordance).
    await sh.svc.updateUserSettingsSection({
      principal: sp,
      input: { section: "routing", patch: { roleDefaults: { agent: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } } } },
    });
    await sh.svc.updateUserSettingsSection({
      principal: sp,
      input: { section: "routing", patch: { agentConnections: { agentX: { api: "chat-completions", source: "vllm", model: "local" } } } },
    });
    await sh.svc.updateUserSettingsSection({
      principal: sp,
      input: { section: "routing", patch: { agentConnections: { agentX: null } } },
    });
    const config = (await sh.svc.getUserSettings({ principal: sp })).config;

    const ch = makeConnHarness(db);
    ch.setRoleDefaults(config.routing.roleDefaults);
    ch.setAgentConnections(config.routing.agentConnections);
    const conn = await createConnectionService(ch.ctx).resolveRole({
      role: "agent",
      principal: principal("user_e2e_agent"),
      agentPrincipalId: castId<UserId>("agentX"),
    });

    // The cleared override cascades to roleDefaults.agent (openrouter/agent-sdk), NOT the stale vllm entry.
    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("openrouter");
  });

  test("a per-agent connection is validated for coherence like any selection (incoherent → throws)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setAgentConnections({ agentX: { api: "anthropic-messages", source: "vllm" } }); // the Anthropic wire is OR-skin-only
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "agent", principal: principal("user_1"), agentPrincipalId: castId<UserId>("agentX") })).rejects.toBeInstanceOf(
      ConnectionRoutingError,
    );
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
    // For a NON-owner, chat/summarize default to vllm; the agent now INHERITS chat (owner ruling), so it too
    // is vllm — none fall to local-light (generation roles never do).
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
