/// <reference path="../../../../packages/plugin-sdk/shared.d.ts" />

// Every way a plugin can fail reaches the server log once, naming the plugin, the kind of failure and the cause.
// Each case drives a scratch plugin through the real broker and compose, then reads the log ring.
import "../../../support/composed-real.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { PluginCapability } from "@orb/contracts/plugin";
import { connectionBindings, userConnections } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { startAutomationWatcher } from "@orb/server/domain/automation";
import { vi } from "vitest";
import { createAutomationWatcherEnv } from "../../../../packages/server/src/entry/compose/automation-watcher.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

interface FailureLine {
  readonly pluginSlug: string;
  readonly kind: string;
  readonly cause: string;
}

// The log level is silent under test, so record what the single failure-logging helper is asked to write.
const recorded = vi.hoisted((): FailureLine[] => []);
// @orb-waive test-mock-doctrine(mock): the logger is process-global and silent under test, so the helper is the only seam that exposes what is logged. Ends if tests can read the log ring at info level.
vi.mock("../../../../packages/server/src/domain/plugin/substrate/failure-log.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../packages/server/src/domain/plugin/substrate/failure-log.ts")>();
  return {
    ...original,
    logPluginFailure: (pluginSlug: string, kind: string, cause: string): void => {
      recorded.push({ pluginSlug, kind, cause });
    },
  };
});

function failureLines(slug: string): FailureLine[] {
  return recorded.filter((line) => line.pluginSlug === slug);
}

async function scratchPlugin(slug: string, capabilities: readonly PluginCapability[], mainSource: string): Promise<Uint8Array> {
  const directory = await mkdtemp(join(tmpdir(), "cb-dp-"));
  try {
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        id: slug,
        name: slug,
        version: "1.0.0",
        hostVersion: 1,
        entry: "main.js",
        description: "Fails on purpose.",
        author: "test",
        capabilities,
      }),
    );
    await writeFile(join(directory, "main.ts"), mainSource);
    const root = join(import.meta.dirname, "..", "..", "..", "..");
    const built = await packPluginDirectory({ pluginDirectory: directory, sdkDirectory: join(root, "packages/plugin-sdk") });
    expect(built.diagnostics).toEqual([]);
    if (built.bundle === null) {
      throw new Error(`scratch plugin ${slug} did not compile`);
    }
    return built.bundle;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const COMMAND_THROWS =
  'const host = orb.host(1);\nhost.ui.registerCommand({ name: "boom", describe: "x", onRun: () => { throw new Error("command boom"); } });\n';

test("each plugin failure path logs once with its plugin, kind and cause", { timeout: 90_000 }, async ({ app, db, services, clock }) => {
  const user = await seedUser(db);
  const caller: Principal = { userId: user.id, handle: user.handle, role: user.role, externalId: user.externalId, via: "header" };
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId: user.id,
    label: "Commit-only fixture",
    providerId: providerIdSchema.parse("custom-openai"),
    model: modelIdSchema.parse("failure-fixture"),
    baseUrl: "https://failure-fixture.example/v1",
    modelCheck: "listed",
    declared: { kind: "generation", generation: makeGenerationCapability() },
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: user.id, task: "chat", connectionId });
  await services.settings.updateUserSettingsSection({ principal: caller, input: { section: "memory", patch: { enabled: false } } });
  const { chat } = await services.chat.startChat({ principal: caller, characterIds: [], opening: "none" });
  const watcher = startAutomationWatcher(createAutomationWatcherEnv({ automation: app.automation, eventBus: app.eventBus }));
  const enabled: Awaited<ReturnType<typeof services.plugin.install>>["id"][] = [];
  const bring = async (slug: string, capabilities: readonly PluginCapability[], source: string): Promise<{ readonly id: (typeof enabled)[number] }> => {
    const installed = await services.plugin.install({ caller, bundle: await scratchPlugin(slug, capabilities, source), grant: [...capabilities] });
    await services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
    enabled.push(installed.id);
    return installed;
  };
  try {
    // A UI command that throws, then two more throws: the third strike auto-disables.
    const command = await bring("cmd-thrower", ["ui.surface"], COMMAND_THROWS);
    const run = (): Promise<unknown> => services.plugin.invokeUiCommand({ caller, pluginId: command.id, name: "boom", args: "", chatId: chat.id });
    await expect(run()).rejects.toThrow("command boom");
    expect(failureLines("cmd-thrower")).toEqual([{ pluginSlug: "cmd-thrower", kind: "guest-error", cause: expect.stringContaining("command boom") }]);
    await expect(run()).rejects.toThrow("command boom");
    await expect(run()).rejects.toThrow();
    expect(failureLines("cmd-thrower").map((line) => line.kind)).toEqual(["guest-error", "guest-error", "guest-error", "auto-disabled"]);

    // The client reporting a dead UI surface.
    const ui = await bring("ui-reporter", ["ui.surface"], 'const host = orb.host(1);\nhost.log.info("up");\n');
    await services.plugin.reportUiCrash({ caller, pluginId: ui.id, surfaceId: "panel", reason: "tree refused by client schema" });
    expect(failureLines("ui-reporter")).toEqual([{ pluginSlug: "ui-reporter", kind: "ui-crash", cause: "surface 'panel': tree refused by client schema" }]);

    // An event handler that throws: one line, not one from the handler and another from the delivery.
    await bring(
      "event-thrower",
      ["events.subscribe"],
      'const host = orb.host(1);\nhost.events.on("messageCommitted", () => { throw new Error("handler boom"); });\n',
    );
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "hello" });
    await expect.poll(() => failureLines("event-thrower").length).toBe(1);
    expect(failureLines("event-thrower")[0]).toMatchObject({ kind: "guest-error", cause: expect.stringContaining("handler boom") });

    // A display transform that outruns its deadline.
    await bring(
      "slow-display",
      ["chat.transform"],
      'const host = orb.host(1);\nhost.transforms.registerDisplay({ name: "slow", apply: () => new Promise<string>(() => {}) });\n',
    );
    await services.plugin.transformForDisplay({ caller, chatId: chat.id, messageId: mintTypeId(ID_PREFIX.message), text: "row" });
    expect(failureLines("slow-display")).toEqual([{ pluginSlug: "slow-display", kind: "display-deadline", cause: expect.stringContaining("exceeded 200ms") }]);

    // A plugin whose main.js throws at activation.
    const failing = await services.plugin.install({
      caller,
      bundle: await scratchPlugin("boot-thrower", ["ui.surface"], 'throw new Error("boot boom");\n'),
      grant: ["ui.surface"],
    });
    await services.plugin.setEnabled({ caller, pluginId: failing.id, enabled: true }).catch(() => undefined);
    expect(failureLines("boot-thrower")).toEqual([{ pluginSlug: "boot-thrower", kind: "activation-failed", cause: expect.stringContaining("boot boom") }]);
  } finally {
    watcher.stop();
    for (const pluginId of enabled) {
      await services.plugin.setEnabled({ caller, pluginId, enabled: false }).catch(() => undefined);
    }
  }
});
