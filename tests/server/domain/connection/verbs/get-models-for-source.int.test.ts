// verb: getModelsForSource — the read-only Connections picker facade (CONNECTIONS-BUILD-SPEC §2). Covers
// the per-source union states (OR warm/cold/keyless · max-pro-sub owner/cold/non-owner · custom
// needs-key/needs-probe · vllm role→env + engine-off · local-light trio + dimensions) and the LOAD-BEARING
// ghost-parity: the facade's `defaultModelId` equals what `resolveRole` resolves for an UNSET slot (guards
// the derive-not-stamp contract against resolver/facade drift). The verb does ZERO outbound fetch — the
// harness's `resolveCredential` is a pure key-presence fake, never a network call.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createConnectionService } from "@orb/server/domain/connection";
import { afterEach, describe } from "vitest";
import { CHAT_MODELS } from "../../../../../packages/server/src/domain/connection/catalog/chat-models.ts";
import { writeAgentSdkCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/agent-sdk-catalog-snapshot.ts";
import { writeCatalogSnapshot } from "../../../../../packages/server/src/domain/connection/persistence/catalog-snapshot.ts";
import { __resetAgentSdkModelCache } from "../../../../../packages/server/src/domain/connection/substrate/agent-sdk-model-cache.ts";
import { __resetOrModelCache } from "../../../../../packages/server/src/domain/connection/substrate/or-model-cache.ts";
import { env } from "../../../../../packages/server/src/foundation/env/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeAgentSdkModel, makeConnHarness, makeOrEntry, principal } from "../_support.ts";

afterEach(() => {
  __resetOrModelCache();
  __resetAgentSdkModelCache();
});

describe("getModelsForSource — openrouter", () => {
  test("a warm snapshot with a key → ok, models mapped, fetchedAt carried", async () => {
    const h = makeConnHarness(await freshDb());
    const models = [
      makeOrEntry({
        id: "anthropic/claude-opus-4.8",
        name: "Claude Opus 4.8",
        contextLength: 200_000,
        promptPrice: 0.000_015,
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        supportedParameters: ["tools", "temperature"],
      }),
    ];
    await writeCatalogSnapshot(h.ctx.db, { fetchedAt: 1234, models });
    __resetOrModelCache();
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "openrouter",
      role: "chat",
    });

    expect(result.state).toBe("ok");
    expect(result.fetchedAt).toBe(1234);
    expect(result.allowsFreeText).toBe(false);
    expect(result.defaultModelId).toBe("openrouter/auto");
    expect(result.models).toEqual([
      {
        id: "anthropic/claude-opus-4.8",
        label: "Claude Opus 4.8",
        contextLength: 200_000,
        promptPrice: 0.000_015,
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        supportedParameters: ["tools", "temperature"],
        origin: "catalog",
      },
    ]);
  });

  test("a cold (never-refreshed) snapshot → empty-catalog, no models, fetchedAt null", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "openrouter",
      role: "chat",
    });

    expect(result.state).toBe("empty-catalog");
    expect(result.models).toEqual([]);
    expect(result.fetchedAt).toBeNull();
    expect(result.defaultModelId).toBe("openrouter/auto");
  });

  test("KEYLESS BROWSE: no OR key → needs-key BUT the models stay populated (browse-without-key)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setNoCredentialSource("openrouter");
    await writeCatalogSnapshot(h.ctx.db, { fetchedAt: 7, models: [makeOrEntry({ id: "x/y" })] });
    __resetOrModelCache();
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "openrouter",
      role: "chat",
    });

    expect(result.state).toBe("needs-key");
    expect(result.models).toHaveLength(1); // only the DOT goes red — browse stays legal
  });

  test("generateImage has no OR default model (defaultModelId null)", async () => {
    const h = makeConnHarness(await freshDb());
    await writeCatalogSnapshot(h.ctx.db, { fetchedAt: 7, models: [makeOrEntry({ id: "x/y" })] });
    __resetOrModelCache();
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "openrouter",
      role: "generateImage",
    });

    expect(result.defaultModelId).toBeNull();
  });
});

describe("getModelsForSource — max-pro-sub", () => {
  test("owner + a warm agent-sdk snapshot → ok, alias→resolved detail, curated opus default", async () => {
    const h = makeConnHarness(await freshDb());
    await writeAgentSdkCatalogSnapshot(h.ctx.db, {
      fetchedAt: 99,
      models: [makeAgentSdkModel({ alias: "sonnet", resolvedModel: "claude-sonnet-5" })],
    });
    __resetAgentSdkModelCache();
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("owner_1"), "owner"),
      source: "max-pro-sub",
      role: "chat",
    });

    expect(result.state).toBe("ok");
    expect(result.fetchedAt).toBe(99);
    expect(result.defaultModelId).toBe("claude-opus-4-8");
    expect(result.models[0]).toEqual({
      id: "sonnet",
      label: "Sonnet",
      detail: "sonnet → claude-sonnet-5",
      origin: "catalog",
    });
  });

  test("a cold agent-sdk snapshot → the curated CHAT_MODELS fallback (origin curated), fetchedAt null", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("owner_1"), "owner"),
      source: "max-pro-sub",
      role: "chat",
    });

    expect(result.fetchedAt).toBeNull();
    // Derive the count from the catalog — CHAT_MODELS may carry curated non-flagships (sonnet-4-6,
    // c656bc1b) beyond one-per-tier; every entry must come back origin "curated".
    expect(result.models.map((m) => m.origin)).toEqual(CHAT_MODELS.map(() => "curated"));
    expect(result.models.map((m) => m.id)).toContain("claude-opus-4-8");
    expect(result.models.map((m) => m.id)).toContain("claude-sonnet-4-6");
  });

  test("a NON-owner → owner-only (the curated list still returned so the disabled option renders honest)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "max-pro-sub",
      role: "chat",
    });

    expect(result.state).toBe("owner-only");
    expect(result.models.length).toBeGreaterThan(0);
  });
});

describe("getModelsForSource — custom_openai (key presence only, never a fetch)", () => {
  test("no key → needs-key, free-text allowed", async () => {
    const h = makeConnHarness(await freshDb());
    h.setNoCredentialSource("custom_openai");
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "custom_openai",
      role: "chat",
    });

    expect(result.state).toBe("needs-key");
    expect(result.models).toEqual([]);
    expect(result.allowsFreeText).toBe(true);
  });

  test("a resolvable key → needs-probe (the client fires fetchModels on open)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "custom_openai",
      role: "chat",
    });

    expect(result.state).toBe("needs-probe");
    expect(result.allowsFreeText).toBe(true);
    expect(result.fetchedAt).toBeNull();
  });
});

describe("getModelsForSource — vllm (env/config read)", () => {
  test("embed role → the env embed model + dimensions, ok when available", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "vllm",
      role: "embed",
    });

    expect(result.state).toBe("ok");
    expect(result.models).toEqual([
      {
        id: env.VLLM_EMBED_MODEL,
        label: env.VLLM_EMBED_MODEL,
        dimensions: env.VLLM_EMBED_DIM,
        origin: "config",
      },
    ]);
    expect(result.defaultModelId).toBe(env.VLLM_EMBED_MODEL);
  });

  test("rerank role → the env rerank model (no dimensions)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "vllm",
      role: "rerank",
    });

    expect(result.models[0]?.id).toBe(env.VLLM_RERANK_MODEL);
    expect(result.models[0]?.dimensions).toBeUndefined();
  });

  test("chat/summarize role → the env gen model", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "vllm",
      role: "summarize",
    });

    expect(result.models[0]?.id).toBe(env.VLLM_GEN_MODEL);
  });

  test("engine off (vllmAvailable false) → engine-off but the config entry still shows what WOULD run", async () => {
    const h = makeConnHarness(await freshDb());
    h.setVllmAvailable(false);
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "vllm",
      role: "embed",
    });

    expect(result.state).toBe("engine-off");
    expect(result.models).toHaveLength(1);
  });
});

describe("getModelsForSource — local-light (the injected builtin trio)", () => {
  test("embed → the jina embed builtin, dimensions 1024, origin builtin", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "local-light",
      role: "embed",
    });

    expect(result.state).toBe("ok");
    expect(result.models).toEqual([
      {
        id: "jinaai/jina-clip-v2",
        label: "jinaai/jina-clip-v2",
        dimensions: 1024,
        origin: "builtin",
      },
    ]);
    expect(result.defaultModelId).toBe("jinaai/jina-clip-v2");
  });

  test("rerank → the cross-encoder builtin (no dimensions)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "local-light",
      role: "rerank",
    });

    expect(result.models[0]?.id).toBe("Xenova/ms-marco-MiniLM-L-6-v2");
    expect(result.models[0]?.dimensions).toBeUndefined();
  });

  test("a non-derive role (chat) → empty + ok (the client never asks local-light for it)", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const result = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "local-light",
      role: "chat",
    });

    expect(result.state).toBe("ok");
    expect(result.models).toEqual([]);
    expect(result.defaultModelId).toBeNull();
  });
});

// The LOAD-BEARING drift guard (CONNECTIONS-BUILD-SPEC §2.8): the facade's `defaultModelId` must equal what
// resolveRole ACTUALLY resolves for an UNSET slot pinned to that source — else the ghosted value the client
// shows lies about what will run.
describe("getModelsForSource — ghost parity with resolveRole (derive-not-stamp)", () => {
  test("vllm embed: facade defaultModelId === resolveRole's resolved model for an unset embed slot", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ embed: { source: "vllm" } }); // model unset — the resolver derives it
    const svc = createConnectionService(h.ctx);

    const facade = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "vllm",
      role: "embed",
    });
    const resolved = await svc.resolveRole({ role: "embed", principal: principal(castId<UserId>("user_1")) });

    expect(facade.defaultModelId).toBe(resolved.model);
  });

  test("vllm rerank: facade defaultModelId === resolveRole's resolved model for an unset rerank slot", async () => {
    const h = makeConnHarness(await freshDb());
    h.setRoleDefaults({ rerank: { source: "vllm" } });
    const svc = createConnectionService(h.ctx);

    const facade = await svc.getModelsForSource({
      principal: principal(castId<UserId>("user_1")),
      source: "vllm",
      role: "rerank",
    });
    const resolved = await svc.resolveRole({ role: "rerank", principal: principal(castId<UserId>("user_1")) });

    expect(facade.defaultModelId).toBe(resolved.model);
  });

  test("max-pro-sub chat: the owner's unset chat heals to the curated opus id the facade ghosts", async () => {
    const h = makeConnHarness(await freshDb());
    const svc = createConnectionService(h.ctx);

    const facade = await svc.getModelsForSource({
      principal: principal(castId<UserId>("owner_1"), "owner"),
      source: "max-pro-sub",
      role: "chat",
    });
    // The owner's unset chat defaults to max-pro-sub/agent-sdk and heals the null model to the curated opus.
    const resolved = await svc.resolveRole({
      role: "chat",
      principal: principal(castId<UserId>("owner_1"), "owner"),
    });

    expect(facade.defaultModelId).toBe(resolved.model);
  });
});
