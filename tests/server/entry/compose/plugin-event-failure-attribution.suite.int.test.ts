/// <reference path="../../../../packages/plugin-sdk/shared.d.ts" />

// A plugin event handler that fails is logged by the detached delivery boundary; the operator must be able to
// tell WHICH plugin failed from that line alone.
import "../../../support/composed-real.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { connectionBindings, userConnections } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { startAutomationWatcher } from "@orb/server/domain/automation";
import { logger } from "@orb/server/foundation/observability";
import { vi } from "vitest";
import { createAutomationWatcherEnv } from "../../../../packages/server/src/entry/compose/automation-watcher.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

const SLUG = "event-thrower";

test("a failed plugin event delivery names the plugin whose handler failed", async ({ app, db, services, clock }) => {
  const user = await seedUser(db);
  const caller: Principal = { userId: user.id, handle: user.handle, role: user.role, externalId: user.externalId, via: "header" };
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId: user.id,
    label: "Commit-only fixture",
    providerId: providerIdSchema.parse("custom-openai"),
    model: modelIdSchema.parse("event-fixture"),
    baseUrl: "https://event-fixture.example/v1",
    modelCheck: "listed",
    declared: { kind: "generation", generation: makeGenerationCapability() },
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: user.id, task: "chat", connectionId });
  await services.settings.updateUserSettingsSection({ principal: caller, input: { section: "memory", patch: { enabled: false } } });
  const root = join(import.meta.dirname, "..", "..", "..", "..");
  const directory = await mkdtemp(join(tmpdir(), "cb-dp-"));
  const logged = Promise.withResolvers<Record<string, unknown>>();
  const spy = vi.spyOn(logger, "error").mockImplementation((fields: unknown) => {
    if (typeof fields === "object" && fields !== null && "eventType" in fields) {
      logged.resolve(fields as Record<string, unknown>);
    }
  });
  let installedId: Awaited<ReturnType<typeof services.plugin.install>>["id"] | undefined;
  const watcher = startAutomationWatcher(createAutomationWatcherEnv({ automation: app.automation, eventBus: app.eventBus }));
  try {
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        id: SLUG,
        name: "Event Thrower",
        version: "1.0.0",
        hostVersion: 1,
        entry: "main.js",
        description: "Throws from its event handler.",
        author: "test",
        capabilities: ["events.subscribe"],
      }),
    );
    await writeFile(
      join(directory, "main.ts"),
      'const host = orb.host(1);\nhost.events.on("messageCommitted", () => {\n  throw new Error("handler boom");\n});\n',
    );
    const built = await packPluginDirectory({ pluginDirectory: directory, sdkDirectory: join(root, "packages/plugin-sdk") });
    expect(built.diagnostics).toEqual([]);
    if (built.bundle === null) {
      throw new Error("scratch plugin did not compile");
    }
    const installed = await services.plugin.install({ caller, bundle: built.bundle, grant: ["events.subscribe"] });
    installedId = installed.id;
    await services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
    const { chat } = await services.chat.startChat({ principal: caller, characterIds: [], opening: "none" });
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "hello" });
    const fields = await logged.promise;
    expect(fields).toMatchObject({ eventType: "messageCommitted", pluginSlug: SLUG });
  } finally {
    watcher.stop();
    spy.mockRestore();
    if (installedId !== undefined) {
      await services.plugin.setEnabled({ caller, pluginId: installedId, enabled: false });
    }
    await rm(directory, { recursive: true, force: true });
  }
});
