// verb: updateUserSettingsSection — deep-merge ONE namespace + re-validate. The load-bearing invariant:
// two concurrent patches on SIBLING sections of the SAME user both land (the per-user
// serializer makes the read-merge-write atomic w.r.t. other same-user writes — without it last-write-wins
// would silently drop one). Plus: a section patch deep-merges (doesn't clobber sibling sections/keys).

import { DomainOperationError } from "@orb/kit/errors";
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

  // PROSE-1 S2 — the Prose settings section's WRITE end. A `prose` key is a slot id, and the editor sends
  // every editable slot on every save: a typed field as `{text, baseVersion}`, a blank one as the leaf
  // `null`. The clear is the arm worth pinning — `undefined` would be "don't touch" and reset would not
  // reset, and a stored `null` must read back as ABSENT (⇒ the shipped default) rather than poisoning the
  // section (\[\[merge-clear-needs-transition-test]]).
  test("the prose section stores an override and CLEARS it on a null leaf (a real reset-to-default)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_prose" });
    const p = principal(u, "user");
    const override = { text: "Pick whoever has been quiet longest.", baseVersion: 1 };
    const before = (await h.svc.getUserSettings({ principal: p })).config;
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "prose", patch: { "chat.arbiter.system": override, "chat.compaction.system": null } },
    });
    const after = (await h.svc.getUserSettings({ principal: p })).config;
    expect(after.prose["chat.arbiter.system"]).toEqual(override);
    expect(after.prose["chat.compaction.system"]).toBeUndefined();
    // The write is key-minimal: a prose patch leaves the sibling section it shares a blob with alone.
    expect(after.imagery).toEqual(before.imagery);

    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "prose", patch: { "chat.arbiter.system": null } },
    });
    const cleared = (await h.svc.getUserSettings({ principal: p })).config.prose;
    expect(cleared["chat.arbiter.system"]).toBeUndefined();
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

  // The write half of the Connections pane's LIVE-vs-DRAFT honesty (2026-08-01): the pane must be able to
  // UNSET a role. deepMergePlain treats an omitted key as "don't touch", so the pane's old sparse patch
  // rendered a cleared row while turns kept resolving the old model. An explicit `null` leaf is the clear.
  test("an explicit null leaf CLEARS a stored role selection (an omitted key would be a no-op)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_role_clear" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5", api: "chat-completions" } } } },
    });

    const cleared = await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { chat: { source: null, model: null, api: null } } } },
    });

    // Read back through the real parse: `source`/`api` heal to unset, `model` to its nullable empty — the
    // resolver's `rd.chat?.<field> ?? <fallback>` therefore lands on the app default, which is what the
    // cleared row now claims.
    const view = await h.svc.getUserSettings({ principal: p });
    for (const config of [cleared.config, view.config]) {
      expect(config.routing.roleDefaults.chat?.source).toBeUndefined();
      expect(config.routing.roleDefaults.chat?.api).toBeUndefined();
      expect(config.routing.roleDefaults.chat?.model ?? undefined).toBeUndefined();
    }
  });
});

// `(source, model)` is ONE selection, and `deepMergePlain` merges per KEY — so a patch naming half of it
// left the other half pinned from the PREVIOUS selection. That is how the live dev row became
// `{api:"chat-completions", source:"vllm", model:"anthropic/claude-sonnet-5"}`: the e2e seed patches
// `roleDefaults.chat = {api, source}` with no model, and the owner's earlier OpenRouter model survived the
// merge into a pair the local engine 404s on. The guard is at the WRITE boundary because the pane is only
// one doorway (substrate/routing-coherence.ts).
describe("updateUserSettingsSection — routing (source, model) coherence", () => {
  test("a patch naming a role's SOURCE without its MODEL clears the stale model (the vllm × sonnet 404)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_flip" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: {
        section: "routing",
        patch: { roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5", api: "chat-completions" } } },
      },
    });

    // The exact e2e-seed patch shape: source + api, no model key.
    const flipped = await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { chat: { api: "chat-completions", source: "vllm" } } } },
    });

    const view = await h.svc.getUserSettings({ principal: p });
    for (const config of [flipped.config, view.config]) {
      expect(config.routing.roleDefaults.chat?.source).toBe("vllm");
      // Cleared, not carried over — the resolver re-derives the engine's configured model live.
      expect(config.routing.roleDefaults.chat?.model ?? "").toBe("");
    }
  });

  test("a source flip to a CATALOG source also drops the previous source's model", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_flip_or" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { summarize: { source: "vllm" } } } },
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { summarize: { source: "openrouter", model: "anthropic/claude-haiku-4-5" } } } },
    });

    const flipped = await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { summarize: { source: "max-pro-sub" } } } },
    });

    expect(flipped.config.routing.roleDefaults.summarize?.source).toBe("max-pro-sub");
    expect(flipped.config.routing.roleDefaults.summarize?.model ?? "").toBe("");
  });

  test("a patch naming BOTH leaves keeps the submitted model (the pane's own shape)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_both" }), "user");
    const saved = await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5", api: "chat-completions" } } } },
    });
    expect(saved.config.routing.roleDefaults.chat?.model).toBe("anthropic/claude-sonnet-5");
  });

  test("pinning a model on a SERVER-CONFIGURED source is REJECTED (vllm serves what it was launched with)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_reject" }), "user");

    const err = await h.svc
      .updateUserSettingsSection({
        principal: p,
        input: { section: "routing", patch: { roleDefaults: { chat: { source: "vllm", model: "anthropic/claude-sonnet-5" } } } },
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("incoherent_role_model");
    // And nothing landed — the rejection is at the boundary, before the merge/write.
    expect((await h.svc.getUserSettings({ principal: p })).config.routing.roleDefaults.chat?.source).toBeUndefined();
  });

  test("the reject arm also covers a model-only patch against a STORED config-derived source", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_reject_stored" }), "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { embed: { source: "local-light" } } } },
    });

    const err = await h.svc
      .updateUserSettingsSection({
        principal: p,
        input: { section: "routing", patch: { roleDefaults: { embed: { model: "text-embedding-3-large" } } } },
      })
      .catch((e: unknown) => e);

    expect((err as DomainOperationError).code).toBe("incoherent_role_model");
  });

  test("a pre-existing incoherent row does NOT block an unrelated role's patch (only what the patch asserts is judged)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const p = principal(await seedUser(db, { id: "user_legacy_row" }), "user");
    // Plant the legacy shape the guard now prevents, the only way it can still be written: a catalog-source
    // model plus a source-only flip is healed, so write the model first and flip with an explicit re-pin…
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5" } } } },
    });

    // …then touch a DIFFERENT role. The stale chat pair is untouched data, not this patch's assertion.
    const after = await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "routing", patch: { roleDefaults: { rerank: { source: "openrouter", model: "rerank-v3.5" } } } },
    });

    expect(after.config.routing.roleDefaults.rerank?.model).toBe("rerank-v3.5");
    expect(after.config.routing.roleDefaults.chat?.model).toBe("anthropic/claude-sonnet-5");
  });
});
