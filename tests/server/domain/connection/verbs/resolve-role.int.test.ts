// verb: resolveRole — the PD-9 assertions. Honors `routing.roleDefaults.<role>` per role (incl. resolving
// a role to `local-light`, the in-process tier — NO vllm hard-pin), applies the agent-sdk curated heal, and
// throws ConnectionRoutingError on an incoherent (api, source) selection.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ConnectionRoutingError, createConnectionService } from "@orb/server/domain/connection";
import { deriveTrackersReadOnly } from "@orb/server/domain/rpg";
import { env } from "@orb/server/foundation/env";
import { getTraceByRequestId, initTracing, logger, withRequestSpan } from "@orb/server/foundation/observability";
import { afterEach, describe, vi } from "vitest";
import { writeCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import { __resetOrModelCache } from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeConnHarness, makeOrEntry, principal } from "../_support.ts";

const MS_PER_HOUR = 3_600_000;

// The OR mirror is module-scope + per-process and the harness clock is frozen (its TTL never expires within a
// run), so a test that warms it would leak into the next.
afterEach(() => {
  __resetOrModelCache();
});

describe("resolveRole — honors roleDefaults (PD-9)", () => {
  test("an embed role pointed at local-light resolves to a local-light credential (no vllm hard-pin)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ embed: { source: "local-light" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal(castId<UserId>("user_1")) });

    expect(conn.credential.source).toBe("local-light");
    expect(h.credentialCalls).toContain("local-light");
  });

  test("a NON-owner chat defaults to the local vllm engine when no roleDefault is set", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  test("the OWNER's chat defaults to their max-pro-sub (agent-sdk) when no roleDefault is set", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("owner_1"), "owner") });

    expect(conn.api).toBe("agent-sdk");
    expect(conn.credential.source).toBe("max-pro-sub");
  });

  test("an agent-sdk chat roleDefault heals the model to the curated id + the curated capability", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({
      chat: { api: "agent-sdk", source: "max-pro-sub", model: "claude-sonnet-5" },
    });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

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
      principal: principal(castId<UserId>("owner_1"), "owner"),
    });

    // Even the owner's summarize stays on the local engine — only chat is owner-conditional.
    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
  });

  // "summarize override to max-pro-sub" was deleted here (2026-08-07): the owner ruled the metered sub
  // dead for summarize (SUMMARIZE-SUB debt entry). The scenario constructed its role default by bypassing
  // zod (`h.setRoleDefaults`) — unreachable via any real write path now that the contract enum rejects it,
  // and the firewall already denied it at dispatch, so the deleted test only ever proved half a dead path.
  // The resolver stays source-agnostic on purpose (see resolve-role.ts) — the denial lives in the contract
  // enum + firewall, not here.

  test("an incoherent (api, source) selection throws ConnectionRoutingError", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "max-pro-sub" } }); // the sub runs on agent-sdk only
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });

  // agent-sdk × vllm was REMOVED (owner ruling 2026-07-27): the local vLLM loopback agent skin is retired —
  // local vLLM chat runs on the chat-completions surface ONLY. assertCoherent now REJECTS the pair (the same
  // ConnectionRoutingError an incoherent selection throws), so a stored agent-sdk+vllm connection surfaces a
  // loud resolve-time error naming the fix — never a silent rewrite.
  test("agent-sdk × vllm is INCOHERENT (skin retired) — throws ConnectionRoutingError, no silent heal", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    await expect(svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) })).rejects.toBeInstanceOf(ConnectionRoutingError);
  });

  // FRESH-DB DEFAULT-ROUTE REGRESSION (fresh-install rpg-lite born WRITABLE): the E2E global-setup seed used to
  // pin roleDefaults.chat = { agent-sdk, vllm } — RETIRED 2026-07-27 — so a fresh install's default chat route
  // THREW at resolveChat, `deriveTrackersReadOnly` returned readonly-by-construction, and every rpg-lite game
  // was born read-only OOTB (the state round never fired). The seed is now the LIVE local wire
  // chat-completions × vllm: it must resolve WITHOUT throwing to a real capability that carries a model WRITE
  // PATH — `tools` (the state round / the fold) AND `output.structured` (the resync) — so lite is writable.
  test("the fresh-DB local default (chat-completions × vllm) resolves live + carries the rpg-lite write path (structured + tools)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.api).toBe("chat-completions");
    expect(conn.credential.source).toBe("vllm");
    // The write path rpg-lite gates on (deriveTrackersReadOnly): both modes need `tools`; the host resync
    // needs `output.structured`. Present ⇒ the lite game is born WRITABLE (never the retired-route readonly).
    expect(conn.capability.output.structured).toBe(true);
    expect(conn.capability.tools).not.toBeUndefined();
  });

  // The OR skin: `agent-sdk × openrouter` legitimately runs Claude models — assertCoherent admits the pair,
  // so the heal must route it through the curated Claude heal (the arm was dropped in the burn-down alongside
  // the dead `anthropic` source and threw AgentModelHealError on a coherent selection).
  test("agent-sdk × openrouter heals through the curated Claude heal (the OR-skin arm)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

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
    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("owner_1"), "owner") });

    expect(conn.credential.source).toBe("max-pro-sub");
    expect(conn.model.startsWith("claude")).toBe(true);
    expect(conn.model).not.toContain("/");
  });
});

// resolveChatCapability — the caller's OWN chat-role ModelCapability resolved END-TO-END in ONE hop
// (selection → descriptor). Reuses resolveRole's chat selector (a vLLM-DEFAULT chat resolves the SAME as the
// engine) + the `resolveCapability` substrate mediator — collapsing the old selection→descriptor round-trip
// that hid the maxOutputTokens/maxContextTokens fields. Caller-scoped by principal.userId, no input id. It is
// the ONLY capability surface since the standalone getModelCapability verb was deleted (AU-5), so the
// cold-cache regression below lives here.
describe("resolveChatCapability — the end-to-end chat-role descriptor", () => {
  test("a NON-owner vLLM default (no roleDefaults.chat) resolves a valid capability (the panel's output/context fields can render)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const resolved = await svc.resolveChatCapability({ principal: principal(castId<UserId>("user_1")) });

    // The vLLM default healed to a concrete selection → a real descriptor: it carries the window + output cap
    // the params panel's Max context / Max output fields bound against (the OLD null key hid these).
    expect(resolved.capability.context.window).toBeGreaterThan(0);
    expect(resolved.capability.output.maxTokens.max).toBeGreaterThan(0);
  });

  test("the OWNER's chat default resolves the Claude curated capability (owner-conditional, same selector as resolveRole)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    // Owner unconfigured chat → agent-sdk × max-pro-sub → the curated Claude default descriptor (adaptive
    // reasoning is the curated-Claude tell, matching getModelCapability.int.test.ts).
    const resolved = await svc.resolveChatCapability({ principal: principal(castId<UserId>("owner_1"), "owner") });

    expect(resolved.capability.reasoning.mode).toBe("adaptive");
  });

  // The IDENTITY half of the read (widened 2026-08-02): `ModelCapability` names neither the model nor the
  // source, so the Connections pane's never-saved row could only say "Uses the app default" and name nothing.
  // The resolved `(api, source, model)` rides back with the descriptor — and it is the RESOLVER's answer, so
  // the pane can never drift from what a turn actually takes (the owner/non-owner fork included).
  test("the read NAMES the connection it resolved — owner and non-owner defaults differ, as a turn would", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const owner = await svc.resolveChatCapability({ principal: principal(castId<UserId>("owner_1"), "owner") });
    expect({ api: owner.api, source: owner.source }).toEqual({ api: "agent-sdk", source: "max-pro-sub" });
    expect(owner.model.startsWith("claude")).toBe(true);

    const member = await svc.resolveChatCapability({ principal: principal(castId<UserId>("user_1")) });
    expect({ api: member.api, source: member.source }).toEqual({ api: "chat-completions", source: "vllm" });
    expect(member.model.length).toBeGreaterThan(0);
  });

  test("the named identity follows an explicit roleDefaults.chat (never a stale/guessed fallback)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "openrouter", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const resolved = await svc.resolveChatCapability({ principal: principal(castId<UserId>("user_1")) });

    expect({ api: resolved.api, source: resolved.source, model: resolved.model }).toEqual({
      api: "agent-sdk",
      source: "openrouter",
      model: "claude-sonnet-5",
    });
  });

  test("an explicit roleDefaults.chat drives the descriptor (parity with resolveRole's heal)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "agent-sdk", source: "max-pro-sub", model: "claude-sonnet-5" } });
    const svc = createConnectionService(h.ctx);

    const resolved = await svc.resolveChatCapability({ principal: principal(castId<UserId>("user_1")) });

    // The curated Sonnet descriptor (effort reasoning — the same assertion resolveRole's heal test makes).
    expect(resolved.capability.reasoning.mode).toBe("effort");
  });

  // Regression (cold-cache capability loss), re-homed from the deleted getModelCapability verb's test (AU-5):
  // a restart clears the in-memory OR mirror, and the daily refresh cadence won't re-warm it for up to a day.
  // The boot-seed (getCatalog reads the persisted snapshot) must restore capability, and the mirror must NOT
  // expire the hours/day-old snapshot (the old 1h TTL did).
  test("cold mirror + persisted snapshot ⇒ boot-seed restores a NON-curated OR model's structured/tools", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    // sonnet-4.5 is NOT on the curated shortlist (only 4-6/5 are), so it MUST resolve through OR catalog
    // synthesis — the real subject this fix restores. It advertises structured_outputs + tools on OR.
    const model = "anthropic/claude-sonnet-4.5";
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    const svc = createConnectionService(h.ctx);

    // The last daily refresh landed 2h ago — past the OLD 1h TTL, so this pins the enlarged ceiling too.
    await writeCatalogSnapshot(db, {
      fetchedAt: h.clock.now() - 2 * MS_PER_HOUR,
      models: [makeOrEntry({ id: model, name: "Claude Sonnet 4.5", supportedParameters: ["temperature", "top_p", "structured_outputs", "tools"] })],
    });

    // Simulate a restart: the module-scope mirror is cold and getCatalog has not run yet.
    __resetOrModelCache();
    // Boot-seed (entry/lifecycle calls this on startup) — warms the mirror from the persisted snapshot.
    await svc.getCatalog({});

    const resolved = await svc.resolveChatCapability({ principal: principal(castId<UserId>("user_1")) });

    expect(resolved.capability.output.structured).toBe(true);
    expect(resolved.capability.tools).toBeDefined();
    // The RPG state-round gate: a tool-capable host is NOT trackers-readonly (the round runs). Cold cache used
    // to yield an empty capability ⇒ readonly true ⇒ the empty-rpg-panel bug.
    expect(deriveTrackersReadOnly("folded", resolved.capability)).toBe(false);
  });
});

// ── The COLD-CATALOG WARM (owner bug: "the preview just assumes 200k and isn't reading the connected model")
// A cold mirror made EVERY OpenRouter model resolve the blanket 200k fallback, so the prompt-budget math and
// the preview's "used / window" ratio described a model nobody was talking to. The resolve seam now learns the
// real window first (persisted snapshot → live fetch), per source, best-effort.
describe("resolveRole — cold-catalog warm (every source reads its own window truth)", () => {
  const model = "meta-llama/llama-4-maverick";

  test("a COLD mirror is warmed from the LIVE catalog — the real window, not the 200k fallback", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setOrCatalog([makeOrEntry({ id: model, name: "Llama 4 Maverick", contextLength: 1_048_576 })]);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.capability.context.window).toBe(1_048_576);
    expect(conn.capability.context.windowEstimated).toBeUndefined();
    expect(h.orCatalogFetches()).toBe(1);
  });

  test("the PERSISTED snapshot is preferred over a re-fetch (cheapest rung of the ladder)", async () => {
    const db = await freshDb();
    const h = makeConnHarness(db);
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    await writeCatalogSnapshot(db, {
      fetchedAt: h.clock.now() - 2 * MS_PER_HOUR,
      models: [makeOrEntry({ id: model, name: "Llama 4 Maverick", contextLength: 131_072 })],
    });
    __resetOrModelCache(); // a restart: the mirror is cold, the DB still holds yesterday's snapshot
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.capability.context.window).toBe(131_072);
    expect(h.orCatalogFetches()).toBe(0); // the DB answered — no gateway call
  });

  test("a warm mirror costs nothing — the second resolve does NOT re-fetch", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setOrCatalog([makeOrEntry({ id: model, contextLength: 131_072 })]);
    const svc = createConnectionService(h.ctx);

    await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });
    await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(h.orCatalogFetches()).toBe(1);
  });

  test("concurrent cold resolves share ONE fetch (the single-flight — no stampede)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setOrCatalog([makeOrEntry({ id: model, contextLength: 131_072 })]);
    const svc = createConnectionService(h.ctx);

    const conns = await Promise.all([
      svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }),
      svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }),
      svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }),
    ]);

    expect(h.orCatalogFetches()).toBe(1);
    expect(conns.every((c) => c.capability.context.window === 131_072)).toBe(true);
  });

  test("an UNREACHABLE gateway never fails the resolve — it degrades to a window MARKED estimated", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setCatalogFetchFails(true);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.model).toBe(model); // the turn still resolves — a catalog outage is not a broken chat
    expect(conn.capability.context.windowEstimated).toBe(true);
  });

  test("vllm reads the LIVE engine window, and never pays for a catalog fetch", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm", model: "qwen-local" } });
    h.setVllmGenWindow(40_960);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.capability.context.window).toBe(40_960);
    expect(conn.capability.context.windowEstimated).toBeUndefined();
    expect(h.orCatalogFetches()).toBe(0);
    expect(h.agentSdkFetches()).toBe(0);
  });

  test("max-pro-sub warms the DAEMON catalog (its own truth source), not the OR one", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("owner_1"), "owner") });

    expect(h.agentSdkFetches()).toBe(1);
    expect(h.orCatalogFetches()).toBe(0);
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

    const conn = await svc.resolveRole({ role, principal: principal(castId<UserId>("user_1")) });

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

    const conn = await svc.resolveRole({ role, principal: principal(castId<UserId>("user_1")) });

    expect(conn.credential.source).not.toBe("local-light");
    // For a NON-owner, chat/summarize default to vllm — neither falls to local-light (generation roles never do).
    expect(conn.credential.source).toBe("vllm");
  });

  test("an embed role with vllmAvailable:true stays on vLLM (fallback only on no-GPU)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(true);
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal(castId<UserId>("user_1")) });

    expect(conn.credential.source).toBe("vllm");
  });

  test("only a vllm selection falls — an embed pinned to openrouter is untouched by no-GPU", async () => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(false);
    h.setRoleDefaults({ embed: { source: "openrouter", model: "openai/text-embedding-3-small" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal(castId<UserId>("user_1")) });

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

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.credential.source).toBe("vllm");
    expect(conn.capability.context.window).toBe(engineWindow);
  });

  test("with no engine reachable (null), the capability window falls back to the env-owned default", async () => {
    const h = makeConnHarness(await freshDb());
    h.setVllmGenWindow(null); // engine warming/disabled — nothing to seed the cache
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.credential.source).toBe("vllm");
    expect(conn.capability.context.window).toBe(env.VLLM_GEN_MAX_MODEL_LEN);
  });
});

// THE READ-SIDE HEAL. The live dev row held `{api:"chat-completions", source:"vllm",
// model:"anthropic/claude-sonnet-5"}` — a pair the write boundary now prevents, but stored rows already
// carry it, and the resolver used to hand that id straight to the local engine (a 404 on every turn). vllm /
// local-light serve the model they were CONFIGURED with, so a foreign pin resolves to that configured model
// — and says so at WARN (D41: never a silent degrade, never a silent 404 loop either).
/** Narrow a captured pino call's first arg (the merge object) so the log fields can be asserted by NAME —
 *  the structured fields are the contract, not the message text. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("resolveRole — a stored model that cannot belong to a server-configured source", () => {
  test("the live 404 pair (vllm × an OpenRouter model) resolves to the ENGINE's model, loudly", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm", model: "anthropic/claude-sonnet-5" } });
    const warn = vi.spyOn(logger, "warn");
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.credential.source).toBe("vllm");
    expect(conn.model).toBe(env.VLLM_GEN_MODEL); // NOT the stale pin — the row heals without a DB touch
    // The degrade is NAMED: both the ignored pin and what it resolved to, or an operator debugging a 404
    // has no way to learn the settings row was overruled.
    const line = warn.mock.calls.find(([fields]) => isRecord(fields) && fields["storedModel"] === "anthropic/claude-sonnet-5");
    expect(line).toBeDefined();
    expect((line?.[0] as Record<string, unknown>)["resolvedModel"]).toBe(env.VLLM_GEN_MODEL);
    warn.mockRestore();
  });

  test("re-pinning the engine's OWN model is not a degrade — same model, no warning", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "vllm", model: env.VLLM_GEN_MODEL } });
    const warn = vi.spyOn(logger, "warn");
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.model).toBe(env.VLLM_GEN_MODEL);
    expect(warn.mock.calls.some(([fields]) => isRecord(fields) && "storedModel" in fields)).toBe(false);
    warn.mockRestore();
  });

  test("the heal is per-ROLE — an embed pin heals to the embed engine's model, not the gen one", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ embed: { source: "vllm", model: "text-embedding-3-large" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "embed", principal: principal(castId<UserId>("user_1")) });

    expect(conn.model).toBe(env.VLLM_EMBED_MODEL);
  });

  test("a custom_openai pin rides through UNTOUCHED — a BYO endpoint's model set is undecidable here", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "custom_openai", model: "my-own-server/whatever" } });
    const svc = createConnectionService(h.ctx);

    const conn = await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) });

    expect(conn.model).toBe("my-own-server/whatever");
  });
});

// ── THE CACHE SPAN-EVENT LANDING PROOF (the observability standing law: an event is only wired when it is
// proven to reach the trace ring). The warm ladder decides whether the capability window below is MEASURED or
// a marked-estimated guess, and that fork is otherwise unreadable from a request's trace. Each spec drives a
// real resolve inside a request-root span and reads the SEALED trace back through the public read API — the
// same shape /api/_debug/traces serves.
const OR_CACHE = "connection.or-catalog";

/** Every span event on the request's sealed trace, in capture order (flattened across the tree). */
function traceEvents(requestId: string): { readonly name: string; readonly attributes: Record<string, string | number | boolean> }[] {
  const trace = getTraceByRequestId(requestId);
  if (trace === undefined) {
    throw new Error(`expected a sealed trace for request ${requestId}`);
  }
  return trace.spans.flatMap((s) => s.events.map((e) => ({ name: e.name, attributes: e.attributes ?? {} })));
}

/** The events naming ONE cache, so a spec asserts its own subject without seeing a sibling cache's warm. */
function eventsForCache(requestId: string, cache: string): { readonly name: string; readonly attributes: Record<string, string | number | boolean> }[] {
  return traceEvents(requestId).filter((e) => e.attributes["cache"] === cache);
}

describe("resolveRole — the cold-warm ladder ANNOTATES the request span (addSpanEvent landing proof)", () => {
  const model = "meta-llama/llama-4-maverick";

  test("a COLD OR mirror lands cache.miss then cache.warm{outcome:fetch} on the request trace", async () => {
    initTracing();
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setOrCatalog([makeOrEntry({ id: model, contextLength: 131_072 }), makeOrEntry({ id: "openai/gpt-5" })]);
    const svc = createConnectionService(h.ctx);
    const requestId = "obs-or-cold-warm";

    await withRequestSpan(requestId, "test resolveRole", {}, () => svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }));

    const events = eventsForCache(requestId, OR_CACHE);
    expect(events.map((e) => e.name)).toEqual(["cache.miss", "cache.warm"]);
    // The rung is the diagnostic payload: `fetch` means we paid a live gateway round-trip this request.
    expect(events[1]?.attributes).toMatchObject({ outcome: "fetch", models: 2 });
  });

  test("a WARM mirror lands cache.hit — and nothing else (the second resolve pays no ladder)", async () => {
    initTracing();
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setOrCatalog([makeOrEntry({ id: model, contextLength: 131_072 })]);
    const svc = createConnectionService(h.ctx);
    const requestId = "obs-or-warm-hit";

    await svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }); // warms the module-scope mirror
    await withRequestSpan(requestId, "test resolveRole", {}, () => svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }));

    expect(eventsForCache(requestId, OR_CACHE).map((e) => e.name)).toEqual(["cache.hit"]);
  });

  test("an UNREACHABLE gateway lands cache.warm{outcome:failed} + the reason — the only in-trace record of the degrade", async () => {
    initTracing();
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setCatalogFetchFails(true);
    const svc = createConnectionService(h.ctx);
    const requestId = "obs-or-warm-failed";

    // The resolve SUCCEEDS (a catalog outage never fails a turn) — so without the event the trace is silent
    // about the window being a guess.
    await withRequestSpan(requestId, "test resolveRole", {}, () => svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }));

    const warm = eventsForCache(requestId, OR_CACHE).find((e) => e.name === "cache.warm");
    expect(warm?.attributes).toMatchObject({ outcome: "failed", reason: "or catalog unreachable" });
  });

  test("a resolve that rides another's in-flight warm lands cache.warm.coalesced (its own trace has no start/done)", async () => {
    initTracing();
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ chat: { api: "chat-completions", source: "openrouter", model } });
    h.setOrCatalog([makeOrEntry({ id: model, contextLength: 131_072 })]);
    const svc = createConnectionService(h.ctx);
    const requestId = "obs-or-coalesced";

    // Three concurrent cold resolves under ONE root: the first runs the ladder, the other two coalesce.
    await withRequestSpan(requestId, "test resolveRole", {}, () =>
      Promise.all([
        svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }),
        svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }),
        svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }),
      ]),
    );

    const names = eventsForCache(requestId, OR_CACHE).map((e) => e.name);
    expect(names.filter((n) => n === "cache.warm.coalesced")).toHaveLength(2);
    expect(names).toContain("cache.warm"); // the one caller that actually fetched
    expect(h.orCatalogFetches()).toBe(1);
  });

  test("the vllm-window mirror annotates its own engine — cache.miss then cache.warm{outcome:engine}", async () => {
    initTracing();
    const h = makeConnHarness(await freshDb());
    h.setVllmGenWindow(40_960);
    const svc = createConnectionService(h.ctx);
    const requestId = "obs-vllm-window-warm";

    await withRequestSpan(requestId, "test resolveRole", {}, () => svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }));

    const events = eventsForCache(requestId, "connection.vllm-window");
    expect(events.map((e) => e.name)).toEqual(["cache.miss", "cache.warm"]);
    // The engine attribute is what makes the event actionable — gen/embed/rerank cache independently.
    expect(events[1]?.attributes).toMatchObject({ outcome: "engine", engine: "gen" });
  });

  test("an engine that reports NO window lands outcome:unavailable — the window below is the env floor", async () => {
    initTracing();
    const h = makeConnHarness(await freshDb());
    h.setVllmGenWindow(null); // engine warming/disabled
    const svc = createConnectionService(h.ctx);
    const requestId = "obs-vllm-window-unavailable";

    await withRequestSpan(requestId, "test resolveRole", {}, () => svc.resolveRole({ role: "chat", principal: principal(castId<UserId>("user_1")) }));

    const warm = eventsForCache(requestId, "connection.vllm-window").find((e) => e.name === "cache.warm");
    expect(warm?.attributes).toMatchObject({ outcome: "unavailable", engine: "gen" });
  });
});
