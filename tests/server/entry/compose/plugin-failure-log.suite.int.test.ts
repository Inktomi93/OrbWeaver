/// <reference path="../../../../packages/plugin-sdk/shared.d.ts" />

// Every way a plugin can fail reaches the server log once, naming the plugin, the kind of failure and the cause.
// Each case drives a scratch plugin through the real broker and compose and counts ALL warn/error lines the
// failure produced, so a second line from anywhere up the stack fails the case.
// @orb-waive-file platform-spellings(Promise): baselined when the gate widened; burn-down item 906.
import "../../../support/composed-real.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Principal } from "@orb/contracts/identity";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import type { PluginCapability } from "@orb/contracts/plugin";
import { connectionBindings, plugins, userConnections } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { startAutomationWatcher } from "@orb/server/domain/automation";
import { logger } from "@orb/server/foundation/observability";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { createAutomationWatcherEnv } from "#server/entry/compose/automation-watcher.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { expect, test } from "../../../support/fixtures.ts";

interface LogLine {
  readonly level: "warn" | "error";
  readonly fields: Record<string, unknown>;
  readonly message: string;
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

const SETTLE_MS = 600;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

const commandThrowing = (message: string): string =>
  `const host = orb.host(1);\nhost.ui.registerCommand({ name: "boom", describe: "x", onRun: () => { throw new Error(${JSON.stringify(message)}); } });\n`;

test("each plugin failure path logs exactly one line naming its plugin, kind and cause", { timeout: 180_000 }, async ({ app, db, services, clock }) => {
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
  const lines: LogLine[] = [];
  const spies = (["warn", "error"] as const).map((level) =>
    vi.spyOn(logger, level).mockImplementation((fields: unknown, message?: string): void => {
      lines.push({ level, fields: typeof fields === "object" && fields !== null ? (fields as Record<string, unknown>) : {}, message: message ?? "" });
    }),
  );
  // Unrelated subsystems may warn while a case runs; only a plugin-side line can be a duplicate.
  const since = (from: number): LogLine[] => lines.slice(from).filter((line) => !line.message.startsWith("inference:"));
  const failures = (from: number): LogLine[] => since(from).filter((line) => line.message === "plugin: failure");
  const enabled: Awaited<ReturnType<typeof services.plugin.install>>["id"][] = [];
  const bring = async (slug: string, capabilities: readonly PluginCapability[], source: string): Promise<{ readonly id: (typeof enabled)[number] }> => {
    const installed = await services.plugin.install({ caller, bundle: await scratchPlugin(slug, capabilities, source), grant: [...capabilities] });
    await services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
    enabled.push(installed.id);
    return installed;
  };
  const drop = (pluginId: (typeof enabled)[number]): Promise<unknown> => services.plugin.setEnabled({ caller, pluginId, enabled: false });
  try {
    // A UI command that throws: one line per strike, and the third strike adds the single auto-disable line.
    const command = await bring("cmd-thrower", ["ui.surface"], commandThrowing("command boom"));
    const run = (): Promise<unknown> => services.plugin.invokeUiCommand({ caller, pluginId: command.id, name: "boom", args: "", chatId: chat.id });
    let mark = lines.length;
    await expect(run()).rejects.toThrow("command boom");
    expect(since(mark).map((line) => [line.level, line.fields["pluginSlug"], line.fields["kind"]])).toEqual([["warn", "cmd-thrower", "guest-error"]]);
    expect(String(lines[mark]?.fields["cause"])).toContain("command boom");
    mark = lines.length;
    await expect(run()).rejects.toThrow("command boom");
    expect(since(mark).length).toBe(1);
    mark = lines.length;
    await expect(run()).rejects.toThrow();
    expect(since(mark).map((line) => [line.level, line.fields["kind"]])).toEqual([
      ["warn", "guest-error"],
      ["error", "auto-disabled"],
    ]);

    // A guest error text is guest-controlled: the logged cause is bounded and says so.
    const big = await bring("big-thrower", ["ui.surface"], commandThrowing("x".repeat(100_000)));
    mark = lines.length;
    await expect(services.plugin.invokeUiCommand({ caller, pluginId: big.id, name: "boom", args: "", chatId: chat.id })).rejects.toThrow();
    const [bigLine, ...bigRest] = since(mark);
    expect(bigRest).toEqual([]);
    const cause = String(bigLine?.fields["cause"]);
    expect(cause.length).toBeLessThan(300);
    expect(cause.endsWith("[truncated]")).toBe(true);
    await drop(big.id);

    // The client reporting a dead UI surface.
    const ui = await bring("ui-reporter", ["ui.surface"], 'const host = orb.host(1);\nhost.log.info("up");\n');
    mark = lines.length;
    await services.plugin.reportUiCrash({ caller, pluginId: ui.id, surfaceId: "panel", reason: "tree refused by client schema" });
    expect(failures(mark).map((line) => line.fields)).toEqual([
      { pluginSlug: "ui-reporter", kind: "ui-crash", cause: "surface 'panel': tree refused by client schema" },
    ]);
    expect(since(mark).length).toBe(1);
    await drop(ui.id);

    // An event handler that throws: one line from the resident invoke, none from the delivery boundary.
    const event = await bring(
      "event-thrower",
      ["events.subscribe"],
      'const host = orb.host(1);\nhost.events.on("messageCommitted", () => { throw new Error("handler boom"); });\n',
    );
    mark = lines.length;
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "hello" });
    await expect.poll(() => since(mark).length).toBeGreaterThan(0);
    await settle();
    expect(since(mark).length).toBe(1);
    expect(failures(mark)[0]?.fields).toMatchObject({ pluginSlug: "event-thrower", kind: "guest-error" });
    await drop(event.id);

    // A private-event (pubsub) handler that throws: same, one line.
    const emitter = await bring(
      "ps-emitter",
      ["ui.surface", "plugin_events"],
      'const host = orb.host(1);\nhost.ui.registerCommand({ name: "ping", describe: "x", onRun: async () => { await host.pubsub.emit("ping", {}); } });\n',
    );
    const listener = await bring(
      "ps-listener",
      ["plugin_events"],
      'const host = orb.host(1);\nhost.pubsub.on("ps-emitter", "ping", () => { throw new Error("pubsub boom"); });\n',
    );
    mark = lines.length;
    await services.plugin.invokeUiCommand({ caller, pluginId: emitter.id, name: "ping", args: "", chatId: chat.id });
    await expect.poll(() => since(mark).length).toBeGreaterThan(0);
    await settle();
    expect(since(mark).length).toBe(1);
    expect(failures(mark)[0]?.fields).toMatchObject({ pluginSlug: "ps-listener", kind: "guest-error" });
    await drop(emitter.id);
    await drop(listener.id);

    // A prompt transform that throws: the plugin's own line only, not the registry's SKIPPED warning on top.
    const prompt = await bring(
      "prompt-thrower",
      ["chat.transform"],
      'const host = orb.host(1);\nhost.transforms.register({ name: "boom", point: "user_input", apply: () => { throw new Error("transform boom"); } });\n',
    );
    mark = lines.length;
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "to be transformed" });
    await settle();
    expect(failures(mark).map((line) => [line.fields["pluginSlug"], line.fields["kind"]])).toEqual([["prompt-thrower", "guest-error"]]);
    expect(since(mark).length).toBe(1);
    await drop(prompt.id);

    // A prompt transform that outruns its deadline: the plugin's one deadline line (no generic SKIPPED warning),
    // then the orphaned invocation settles and counts the one crash without a late guest-error line.
    const hung = await bring(
      "prompt-hanger",
      ["chat.transform"],
      'const host = orb.host(1);\nhost.transforms.register({ name: "hang", point: "user_input", apply: () => new Promise<string>(() => {}) });\n',
    );
    mark = lines.length;
    await services.chat.commitMessage({ principal: caller, chatId: chat.id, content: "to be hung" });
    await settle();
    expect(since(mark).map((line) => [line.message, line.fields["pluginSlug"], line.fields["kind"]])).toEqual([
      ["plugin: failure", "prompt-hanger", "prompt-deadline"],
    ]);
    const hungCrashes = async (): Promise<number> => (await db.select().from(plugins).where(eq(plugins.id, hung.id)))[0]?.consecutiveCrashes ?? 0;
    await expect.poll(hungCrashes, { timeout: 45_000, interval: 500 }).toBe(1);
    expect(since(mark).length).toBe(1);
    await drop(hung.id);

    // A display transform that outruns its deadline.
    const display = await bring(
      "slow-display",
      ["chat.transform"],
      'const host = orb.host(1);\nhost.transforms.registerDisplay({ name: "slow", apply: () => new Promise<string>(() => {}) });\n',
    );
    mark = lines.length;
    await services.plugin.transformForDisplay({ caller, chatId: chat.id, messageId: mintTypeId(ID_PREFIX.message), text: "row" });
    expect(failures(mark).map((line) => line.fields["kind"])).toEqual(["display-deadline"]);
    expect(since(mark).length).toBe(1);
    // The orphaned invocation settles later and counts the one crash, without a second line.
    const crashes = async (): Promise<number> => (await db.select().from(plugins).where(eq(plugins.id, display.id)))[0]?.consecutiveCrashes ?? 0;
    await expect.poll(crashes, { timeout: 45_000, interval: 500 }).toBe(1);
    expect(since(mark).length).toBe(1);
    await drop(display.id);

    // A plugin whose main.js throws at activation.
    const failing = await services.plugin.install({
      caller,
      bundle: await scratchPlugin("boot-thrower", ["ui.surface"], 'throw new Error("boot boom");\n'),
      grant: ["ui.surface"],
    });
    mark = lines.length;
    await services.plugin.setEnabled({ caller, pluginId: failing.id, enabled: true }).catch(() => undefined);
    expect(since(mark).length).toBe(1);
    expect(failures(mark)[0]?.fields).toMatchObject({ pluginSlug: "boot-thrower", kind: "activation-failed" });
    expect(String(failures(mark)[0]?.fields["cause"])).toContain("boot boom");
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
    watcher.stop();
    for (const pluginId of enabled) {
      await drop(pluginId).catch(() => undefined);
    }
  }
});
