// verb: updateUserSettingsSection — deep-merge ONE namespace + re-validate. The load-bearing invariant:
// two concurrent patches on SIBLING sections of the SAME user both land (the per-user
// serializer makes the read-merge-write atomic w.r.t. other same-user writes — without it last-write-wins
// would silently drop one). Plus: a section patch deep-merges (doesn't clobber sibling sections/keys).

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("updateUserSettingsSection", () => {
  test("two concurrent patches on sibling sections BOTH land (serialized per user)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const p = principal(u, "user");
    await Promise.all([
      h.svc.updateUserSettingsSection({
        principal: p,
        input: { section: "memory", patch: { enabled: true } },
      }),
      h.svc.updateUserSettingsSection({
        principal: p,
        input: { section: "worldInfo", patch: { scanDepth: 42 } },
      }),
    ]);
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.memory.enabled).toBe(true);
    expect(view.config.worldInfo.scanDepth).toBe(42);
  });

  test("a patch deep-merges into the section (siblings survive)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const p = principal(u, "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "worldInfo", patch: { scanDepth: 10 } },
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "worldInfo", patch: { tokenBudget: 2048 } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.worldInfo.scanDepth).toBe(10);
    expect(view.config.worldInfo.tokenBudget).toBe(2048);
  });

  test("different users run concurrently (each lands its own row)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await Promise.all([
      h.svc.updateUserSettingsSection({
        principal: principal(a, "user"),
        input: { section: "memory", patch: { enabled: true } },
      }),
      h.svc.updateUserSettingsSection({
        principal: principal(b, "user"),
        input: { section: "memory", patch: { enabled: false } },
      }),
    ]);
    expect((await h.svc.getUserSettings({ principal: principal(a, "user") })).config.memory.enabled).toBe(true);
    expect((await h.svc.getUserSettings({ principal: principal(b, "user") })).config.memory.enabled).toBe(false);
  });

  test("the appearance section patches + deep-merges (D44 §12.1 display prefs round-trip)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_appearance" });
    const p = principal(u, "user");
    // Two partial patches on the same section: the second must not clobber the first (deep-merge).
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { chatStyle: "flat", avatarSize: "lg" } },
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { showInChatAvatars: false } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.appearance.chatStyle).toBe("flat");
    expect(view.config.appearance.avatarSize).toBe("lg"); // survived the second patch
    expect(view.config.appearance.showInChatAvatars).toBe(false);
    // An untouched knob keeps its §12.1 default.
    expect(view.config.appearance.density).toBe("comfortable");
  });

  test("appearance.elevation patches (default flat; ramp is opt-in)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_elevation" });
    const p = principal(u, "user");
    expect((await h.svc.getUserSettings({ principal: p })).config.appearance.elevation).toBe("flat");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "appearance", patch: { elevation: "ramp" } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.appearance.elevation).toBe("ramp");
  });

  test("the theme section patches (themes-design.md §3.3 — selectedThemeId round-trip)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_theme" });
    const p = principal(u, "user");
    expect((await h.svc.getUserSettings({ principal: p })).config.theme.selectedThemeId).toBeNull();
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "theme", patch: { selectedThemeId: "theme_00000000000000000000000002" } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.theme.selectedThemeId).toBe("theme_00000000000000000000000002");
  });

  test("agentConnections: a NULL patch CLEARS a populated per-agent override (the Agents-table Remove path)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_agentconn_null" }), "user");
    // Populate an override, then Remove it. Remove writes `null` — the ONE merge-expressible clear: the
    // resolver reads a null entry as no-override, and deepMergePlain replaces a leaf with a non-object.
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { agentConnections: { agentX: { api: "chat-completions", source: "vllm", model: "local" } } } },
    });
    expect((await h.svc.getUserSettings({ principal: p })).config.routing.agentConnections["agentX"]).toEqual({
      api: "chat-completions",
      source: "vllm",
      model: "local",
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { agentConnections: { agentX: null } } },
    });
    expect((await h.svc.getUserSettings({ principal: p })).config.routing.agentConnections["agentX"]).toBeNull();
  });

  test("agentConnections: a `{}` patch does NOT clear a populated override (why Remove writes null, not {})", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_agentconn_noop" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { agentConnections: { agentX: { source: "vllm" } } } },
    });
    // deepMergePlain recurses into the existing entry; `{}` merges nothing → the override SURVIVES. This
    // is the exact deep-merge no-op the null sentinel exists to avoid.
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { agentConnections: { agentX: {} } } },
    });
    expect((await h.svc.getUserSettings({ principal: p })).config.routing.agentConnections["agentX"]).toEqual({ source: "vllm" });
  });

  test("the regex section patches its scripts array (REPLACE, not merge — the autosave contract)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_regex" });
    const p = principal(u, "user");
    const script = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "strip ooc",
      findRegex: "\\(ooc\\)",
      replaceString: "",
      placement: [],
      enabled: true,
      markdownOnly: false,
      promptOnly: false,
      runOnEdit: false,
      trimStrings: [],
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    };
    expect((await h.svc.getUserSettings({ principal: p })).config.regex.scripts).toHaveLength(0);
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "regex", patch: { scripts: [script] } },
    });
    expect((await h.svc.getUserSettings({ principal: p })).config.regex.scripts).toHaveLength(1);
    // A later save with the empty array REPLACES (an array is not deep-merged) — deleting the last
    // script actually clears the library instead of leaving a stale entry.
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "regex", patch: { scripts: [] } },
    });
    expect((await h.svc.getUserSettings({ principal: p })).config.regex.scripts).toHaveLength(0);
  });
});

// PD-139a — an embed/imageEmbed model change is the trigger the PD-104 purge+reindex machine was missing.
// The verb captures the two model ids pre-merge and fires the injected `onEmbedModelChanged` ONLY on an
// actual change of either; the compose root wires that op to a bulk index/all/force reindex.
describe("updateUserSettingsSection — PD-139a embed-model-change reindex trigger", () => {
  test("changing routing.roleDefaults.embed.model enqueues the reindex exactly once", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_embed" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { embed: { model: "qwen3-embed-v2" } } } },
    });
    expect(h.onEmbedModelChanged).toHaveBeenCalledTimes(1);
  });

  test("changing routing.roleDefaults.imageEmbed.model also enqueues the reindex", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_imageembed" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { imageEmbed: { model: "jina-clip-v3" } } } },
    });
    expect(h.onEmbedModelChanged).toHaveBeenCalledTimes(1);
  });

  test("a routing patch that leaves BOTH model ids untouched does NOT enqueue", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_routing_other" }), "user");
    // A chat-role model change — not embed/imageEmbed — must not trip the reindex.
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { chat: { model: "some-chat-model" } } } },
    });
    expect(h.onEmbedModelChanged).not.toHaveBeenCalled();
  });

  test("re-patching the SAME embed.model value does NOT re-enqueue (no actual change)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_embed_same" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { embed: { model: "qwen3-embed-v2" } } } },
    });
    h.onEmbedModelChanged.mockClear();
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { embed: { model: "qwen3-embed-v2" } } } },
    });
    expect(h.onEmbedModelChanged).not.toHaveBeenCalled();
  });

  test("a non-routing section patch does NOT enqueue", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_nonrouting" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "memory", patch: { enabled: true } },
    });
    expect(h.onEmbedModelChanged).not.toHaveBeenCalled();
  });

  test("a fire-and-forget enqueue whose async start rejects does NOT fail the write", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_embed_fail" }), "user");
    // Mirror the compose wiring's shape: the op kicks off an async enqueue and swallows its own rejection
    // (`void workloads.start(...).catch(...)`), so the settings write is never coupled to the enqueue result.
    h.onEmbedModelChanged.mockImplementation(() => {
      void Promise.reject(new Error("enqueue boom")).catch(() => undefined);
    });
    const view = await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { embed: { model: "qwen3-embed-v2" } } } },
    });
    expect(view.config.routing.roleDefaults.embed?.model).toBe("qwen3-embed-v2");
    expect(h.onEmbedModelChanged).toHaveBeenCalledTimes(1);
  });
});
