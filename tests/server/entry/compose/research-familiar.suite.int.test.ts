/// <reference path="../../../../packages/plugin-sdk/shared.d.ts" />

// The shipped UI action and lookup guest cross the real installer-variable, room-attachment and lore
// persistence boundaries. Only the external DNS/HTTP edges are scripted; no provider/model is called.
import "../../../support/composed-real.ts";
import { join } from "node:path";
import vm from "node:vm";
import type { Principal } from "@orb/contracts/identity";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { PluginCapability, PluginSurfaceSpec } from "@orb/contracts/plugin";
import { connectionBindings, userConnections } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { startAutomationWatcher } from "@orb/server/domain/automation";
import { __setEgressResolverForTest } from "@orb/server/infra/network";
import { AMBIENT_STUBS } from "@orb/server/infra/plugin-host";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, vi } from "vitest";
import { createAutomationWatcherEnv } from "../../../../packages/server/src/entry/compose/automation-watcher.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

const fetches: string[] = [];
beforeEach(() => {
  fetches.length = 0;
  __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"]));
  vi.stubGlobal("fetch", (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    expect(url).toMatch(/^https:\/\/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\//u);
    fetches.push(url);
    return Promise.resolve(
      url.endsWith("Missing_term")
        ? new Response(null, { status: 404 })
        : Response.json({ title: "Aurora borealis", extract: "Charged particles excite gases above the polar sky." }),
    );
  });
});
afterEach(() => {
  __setEgressResolverForTest(null);
  vi.unstubAllGlobals();
});

test("the real Research picker persists its installer choice; only a genuinely attached owned book receives the lookup", async ({
  app,
  db,
  services,
  clock,
}) => {
  const user = await seedUser(db);
  const caller: Principal = { userId: user.id, handle: user.handle, role: user.role, externalId: user.externalId, via: "header" };
  const otherUser = await seedUser(db);
  const other: Principal = { userId: otherUser.id, handle: otherUser.handle, role: otherUser.role, externalId: otherUser.externalId, via: "header" };
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId: user.id,
    label: "Commit-only fixture",
    providerId: providerIdSchema.parse("custom-openai"),
    model: modelIdSchema.parse("research-fixture"),
    baseUrl: "https://research-fixture.example/v1",
    modelCheck: "listed",
    declared: { kind: "generation", generation: makeGenerationCapability() },
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: user.id, task: "chat", connectionId });
  await services.settings.updateUserSettingsSection({ principal: caller, input: { section: "memory", patch: { enabled: false } } });
  const { chat } = await services.chat.startChat({ principal: caller, characterIds: [], opening: "none" });
  const book = await services.worldInfo.createBook({ principal: caller, input: { name: "Field Notes" } });
  const foreignBook = await services.worldInfo.createBook({ principal: other, input: { name: "Private notes" } });
  expect((await services.worldInfo.listBooks({ principal: caller })).map((row) => row.id)).toEqual([book.id]);
  const root = join(import.meta.dirname, "..", "..", "..", "..");
  const built = await packPluginDirectory({
    pluginDirectory: join(root, "packages/showcase-plugins/bundles/research-familiar"),
    sdkDirectory: join(root, "packages/plugin-sdk"),
  });
  expect(built.diagnostics).toEqual([]);
  if (built.bundle === null) {
    throw new Error("Research Familiar did not compile");
  }
  const grant: PluginCapability[] = [
    "events.subscribe",
    "storage.kv",
    "chat.read",
    "global_vars",
    "worldinfo.read",
    "worldinfo.write",
    "net.fetch",
    "notify",
    "ui.surface",
  ];
  const installed = await services.plugin.install({ caller, bundle: built.bundle, grant });
  await services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const watcher = startAutomationWatcher(createAutomationWatcherEnv({ automation: app.automation, eventBus: app.eventBus }));
  try {
    expect(await services.plugin.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "familiar_settings", actionId: "configure", values: {} })).toEqual(
      { toasts: [], openDialog: "familiar_configuration" },
    );
    const uiSource = unzipSync(built.bundle)["ui.js"];
    if (uiSource === undefined) {
      throw new Error("Research Familiar ships no configuration guest");
    }
    const loaded = Promise.withResolvers<void>();
    let action: Parameters<PluginUiV1["onEvent"]>[0] | undefined;
    let tree: PluginSurfaceSpec | undefined;
    const relay = async (fn: "variables.get" | "variables.set", args: readonly string[]): Promise<string | null> => {
      const result = await services.plugin.uiHostCall({ caller, pluginId: installed.id, fn, argsJson: JSON.stringify(args) });
      return JSON.parse(result.resultJson) as string | null;
    };
    const context = vm.createContext({});
    vm.runInContext(AMBIENT_STUBS, context);
    context["orb"] = {
      ui: (): Record<string, unknown> => ({
        host: {
          variables: {
            get: (key: string): Promise<string | null> => relay("variables.get", [key]),
            set: (key: string, value: string): Promise<string | null> => relay("variables.set", [key, value]),
          },
        },
        log: {
          warn: (message: string): never => {
            throw new Error(message);
          },
        },
        onEvent: (handler: Parameters<PluginUiV1["onEvent"]>[0]): void => {
          action = handler;
        },
        render: (_surfaceId: string, spec: PluginSurfaceSpec): void => {
          tree = spec;
          if (spec.kind === "stack" && spec.children.some((node) => node.kind === "select")) {
            loaded.resolve();
          }
        },
      }),
    };
    vm.runInContext(new TextDecoder().decode(uiSource), context);
    await loaded.promise;
    if (action === undefined) {
      throw new Error("Configuration guest registered no action");
    }
    await action({ surfaceId: "familiar_configuration", event: { type: "action", actionId: "configure" }, values: { book: book.id } });
    expect(tree).toMatchObject({ children: expect.arrayContaining([{ kind: "text", value: "Destination updated." }]) });
    expect(await services.automation.getGlobalVariable({ principal: caller, key: "familiar_book_id" })).toBe(book.id);
    expect(await services.automation.getGlobalVariable({ principal: other, key: "familiar_book_id" })).toBeNull();
    expect(await services.worldInfo.listForChat({ principal: caller, chatId: chat.id })).toEqual([]);
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "((lookup: Aurora borealis))" });
    await expect
      .poll(async () => (await services.notifications.list({ principal: caller })).items.filter((notice) => notice.payload.type === "automation-notice").length)
      .toBe(1);
    expect(fetches).toEqual([]);
    expect(await services.worldInfo.listEntries({ principal: caller, bookId: book.id })).toEqual([]);
    await services.worldInfo.attachToChat({ principal: caller, chatId: chat.id, bookId: book.id });
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "((lookup: Aurora borealis))" });
    await expect
      .poll(async () => (await services.plugin.getLog({ caller, pluginId: installed.id })).some((line) => line.message === 'filed "Aurora borealis"'))
      .toBe(true);
    const entries = await services.worldInfo.listEntries({ principal: caller, bookId: book.id });
    expect(entries.map((entry) => ({ title: entry.title, keys: entry.keys, content: entry.content }))).toEqual([
      {
        title: `plugin/${installed.id}:familiar:aurora borealis`,
        keys: ["Aurora borealis"],
        content: "Aurora borealis: Charged particles excite gases above the polar sky.",
      },
    ]);
    clock.advance(60_000);
    await action({ surfaceId: "familiar_configuration", event: { type: "action", actionId: "configure" }, values: { book: foreignBook.id } });
    const before = (await services.plugin.getLog({ caller, pluginId: installed.id })).filter((line) => line.message.includes("not attached")).length;
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "((lookup: Foreign target))" });
    await expect
      .poll(async () => (await services.plugin.getLog({ caller, pluginId: installed.id })).filter((line) => line.message.includes("not attached")).length)
      .toBe(before + 1);
    expect(fetches).toHaveLength(1);
    expect(await services.worldInfo.listEntries({ principal: other, bookId: foreignBook.id })).toEqual([]);
    await action({ surfaceId: "familiar_configuration", event: { type: "action", actionId: "configure" }, values: { book: book.id } });
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "((lookup: Missing term))" });
    await expect
      .poll(async () =>
        (await services.plugin.getLog({ caller, pluginId: installed.id })).some((line) => line.message.includes('no article for "Missing term"')),
      )
      .toBe(true);
    expect(fetches).toHaveLength(2);
    expect((await services.worldInfo.listEntries({ principal: caller, bookId: book.id })).map((entry) => entry.id)).toEqual(entries.map((entry) => entry.id));
    expect((await services.notifications.list({ principal: caller })).items.filter((notice) => notice.payload.type === "automation-notice")).toHaveLength(1);
    expect((await services.notifications.list({ principal: other })).items).toEqual([]);
  } finally {
    watcher.stop();
    await services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: false });
  }
});
