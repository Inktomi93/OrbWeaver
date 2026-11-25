// A real guest's activation registrations are bounded at the membrane: each sync door holds at most its count, a
// tool's model-facing description and parameters stay under their caps, and a handler that is not a function is
// refused at the door rather than stored for a later failed call. Each refusal has its control at the cap. The counts
// belong to the plugin instance, so a guest that asks `orb.host` for a second surface meets what the first one spent.
// An activation that throws at an ungranted door errors, and its last error names the capability it was refused.
// @subject packages/server/src/infra/plugin-host/membrane.ts
import { spawn } from "node:child_process";
import { CHAT_TRIGGER_TYPES } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability, PluginStatus } from "@orb/contracts/plugin";
import {
  HOST_FUNCTION_CAPABILITY,
  PLUGIN_FRAME_SURFACES_MAX,
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX,
  PluginCapabilityError,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";
import {
  PLUGIN_COMMANDS_MAX,
  PLUGIN_SURFACES_MAX,
  PLUGIN_TOOL_DESCRIPTION_MAX_CHARS,
  PLUGIN_TOOL_PARAMETERS_MAX_BYTES,
  PLUGIN_TOOLS_MAX,
} from "#server/infra/plugin-host/budgets.ts";

// `report` logs one registration's outcome as `label:registered`, or `label:<error name>` when the door throws.
const PRELUDE = `const h = orb.host(1);
const report = (label, run) => { try { run(); h.log.info(label + ":registered"); } catch (e) { h.log.info(label + ":" + e.name); } };
const tool = (name, extra) => ({ name, description: "Reads nothing.", parameters: { type: "object", properties: {} }, handler: () => null, ...extra });`;

const REGISTERED = "registered";
const REFUSED = Error.name;
const WARN = "warn";

/** An activated guest: its owner, its id, the status and last error the enable left it with, and its log. */
interface ActivatedGuest {
  readonly caller: Principal;
  readonly pluginId: PluginId;
  readonly status: PluginStatus;
  readonly lastError: string | null;
  readonly log: readonly string[];
}

/** Install and enable a guest whose activation runs `source`, and read its log as `message`, or `warn` for a warning. */
async function activate(root: ServerTestHarness, slug: string, capabilities: readonly PluginCapability[], source: string): Promise<ActivatedGuest> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: slug,
    name: slug,
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Registration caps",
    capabilities,
  });
  const installed = await root.services.plugin.install({ caller, bundle: makePluginBundle(manifest, `${PRELUDE}\n${source}`, root.clock.now()), grant: [] });
  const enabled = await root.services.plugin.setGrant({ caller, pluginId: installed.id, grant: capabilities, acknowledgedNetHosts: [], enable: true });
  const lines = await root.services.plugin.getLog({ caller, pluginId: installed.id });
  return {
    caller,
    pluginId: installed.id,
    status: enabled.status,
    lastError: enabled.lastError,
    log: lines.map(({ level, message }) => (level === WARN ? WARN : message)),
  };
}

test("tools.register holds its count, and the call past it throws", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const guest = await activate(
    root,
    "tool-count",
    [HOST_FUNCTION_CAPABILITY["tools.register"]],
    `let held = 0;
for (let i = 0; i < ${PLUGIN_TOOLS_MAX}; i += 1) { try { h.tools.register(tool("t" + i)); held += 1; } catch (e) {} }
h.log.info("held:" + held);
report("past", () => h.tools.register(tool("past")));`,
  );
  expect(guest.status).toBe("enabled");
  expect(guest.log).toEqual(expect.arrayContaining([`held:${PLUGIN_TOOLS_MAX}`, `past:${REFUSED}`]));
});

// The parameters text is sized so its JSON is exactly the byte cap; one more character is one byte past it.
const PARAMETERS_SHELL_BYTES = JSON.stringify({ type: "object", description: "" }).length;
const parametersOf = (bytes: number): string => `{ type: "object", description: "p".repeat(${String(bytes - PARAMETERS_SHELL_BYTES)}) }`;

test("tools.register refuses a description or parameters past its cap and a handler that is not a function", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const guest = await activate(
    root,
    "tool-sizes",
    [HOST_FUNCTION_CAPABILITY["tools.register"]],
    `report("description_at", () => h.tools.register(tool("description_at", { description: "d".repeat(${PLUGIN_TOOL_DESCRIPTION_MAX_CHARS}) })));
report("description_past", () => h.tools.register(tool("description_past", { description: "d".repeat(${PLUGIN_TOOL_DESCRIPTION_MAX_CHARS + 1}) })));
report("parameters_at", () => h.tools.register(tool("parameters_at", { parameters: ${parametersOf(PLUGIN_TOOL_PARAMETERS_MAX_BYTES)} })));
report("parameters_past", () => h.tools.register(tool("parameters_past", { parameters: ${parametersOf(PLUGIN_TOOL_PARAMETERS_MAX_BYTES + 1)} })));
report("handler_number", () => h.tools.register(tool("handler_number", { handler: 5 })));`,
  );
  expect(guest.status).toBe("enabled");
  expect(guest.log).toEqual(
    expect.arrayContaining([
      `description_at:${REGISTERED}`,
      `description_past:${REFUSED}`,
      `parameters_at:${REGISTERED}`,
      `parameters_past:${REFUSED}`,
      `handler_number:${REFUSED}`,
    ]),
  );
});

test("ui.registerCommand holds its count and soft-refuses the command past it", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const guest = await activate(
    root,
    "command-count",
    [HOST_FUNCTION_CAPABILITY["ui.registerCommand"]],
    `for (let i = 0; i <= ${PLUGIN_COMMANDS_MAX}; i += 1) { h.ui.registerCommand({ name: "c" + i, describe: "Witness", onRun: async () => {} }); }`,
  );
  const names = (await root.services.plugin.listCommands({ caller: guest.caller }))
    .filter(({ pluginId }) => pluginId === guest.pluginId)
    .map(({ name }) => name);
  expect(names).toEqual(Array.from({ length: PLUGIN_COMMANDS_MAX }, (_, index) => `c${String(index)}`));
  expect(guest.log).toEqual([WARN]);
});

const SURFACE = `(id, title) => ({ id, anchor: "chat-flank", title, tier: "static", spec: { kind: "text", voice: "gloss", value: "x" } })`;
const RENAMED = "Renamed";

test("ui.register holds its count of distinct surfaces, and a held surface still re-registers at the cap", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const guest = await activate(
    root,
    "surface-count",
    [HOST_FUNCTION_CAPABILITY["ui.register"]],
    `const surface = ${SURFACE};
for (let i = 0; i < ${PLUGIN_SURFACES_MAX}; i += 1) { h.ui.register(surface("s" + i, "Surface")); }
h.ui.register(surface("past", "Surface"));
h.ui.register(surface("s0", ${JSON.stringify(RENAMED)}));`,
  );
  const surfaces = (await root.services.plugin.listSurfaces({ caller: guest.caller })).filter(({ pluginId }) => pluginId === guest.pluginId);
  expect(new Set(surfaces.map(({ id }) => id))).toEqual(new Set(Array.from({ length: PLUGIN_SURFACES_MAX }, (_, index) => `s${String(index)}`)));
  expect(surfaces.find(({ id }) => id === "s0")?.title).toBe(RENAMED);
  expect(guest.log).toEqual([WARN]);
});

const TRIGGER = CHAT_TRIGGER_TYPES[0];

test("events.on and pubsub.on refuse a handler that is not a function and take one that is", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const slug = "handler-types";
  const guest = await activate(
    root,
    slug,
    [HOST_FUNCTION_CAPABILITY["events.on"], HOST_FUNCTION_CAPABILITY["pubsub.on"]],
    `report("events_number", () => h.events.on(${JSON.stringify(TRIGGER)}, 5));
report("events_function", () => h.events.on(${JSON.stringify(TRIGGER)}, () => null));
h.log.info("pubsub_number");
h.pubsub.on(${JSON.stringify(slug)}, "ping", 5);
h.log.info("pubsub_function");
h.pubsub.on(${JSON.stringify(slug)}, "ping", () => null);
h.log.info("done");`,
  );
  expect(guest.status).toBe("enabled");
  // pubsub.on refuses softly, so its refusal is the one warning, logged between the two markers.
  expect(guest.log).toEqual([`events_number:${REFUSED}`, `events_function:${REGISTERED}`, "pubsub_number", WARN, "pubsub_function", "done"]);
});

test("a second orb.host surface meets the counts the first one spent at every capped door", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const slug = "second-surface";
  const guest = await activate(
    root,
    slug,
    [
      HOST_FUNCTION_CAPABILITY["tools.register"],
      HOST_FUNCTION_CAPABILITY["ui.registerCommand"],
      HOST_FUNCTION_CAPABILITY["ui.register"],
      HOST_FUNCTION_CAPABILITY["pubsub.on"],
    ],
    `const surface = ${SURFACE};
for (let i = 0; i < ${PLUGIN_TOOLS_MAX}; i += 1) { h.tools.register(tool("t" + i)); }
for (let i = 0; i < ${PLUGIN_COMMANDS_MAX}; i += 1) { h.ui.registerCommand({ name: "c" + i, describe: "Witness", onRun: async () => {} }); }
for (let i = 0; i < ${PLUGIN_SURFACES_MAX}; i += 1) { h.ui.register(surface("s" + i, "Surface")); }
for (let i = 0; i < ${PLUGIN_PUBSUB_SUBSCRIPTIONS_MAX}; i += 1) { h.pubsub.on(${JSON.stringify(slug)}, "n" + i, () => null); }
const again = orb.host(1);
report("tool_past", () => again.tools.register(tool("past")));
again.ui.registerCommand({ name: "past", describe: "Witness", onRun: async () => {} });
again.ui.register(surface("past", "Surface"));
again.pubsub.on(${JSON.stringify(slug)}, "past", () => null);`,
  );
  expect(guest.status).toBe("enabled");
  // The tool refusal throws; the command, surface and subscription refusals are one warning each, in that order.
  expect(guest.log).toEqual([`tool_past:${REFUSED}`, WARN, WARN, WARN]);
  const commands = (await root.services.plugin.listCommands({ caller: guest.caller })).filter(({ pluginId }) => pluginId === guest.pluginId);
  const surfaces = (await root.services.plugin.listSurfaces({ caller: guest.caller })).filter(({ pluginId }) => pluginId === guest.pluginId);
  expect(commands).toHaveLength(PLUGIN_COMMANDS_MAX);
  expect(surfaces).toHaveLength(PLUGIN_SURFACES_MAX);
});

test("a second orb.host surface meets the frame count the first one spent, and its frame past the cap is refused", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const guest = await activate(
    root,
    "frame-second",
    [HOST_FUNCTION_CAPABILITY["ui.registerFrame"]],
    `const frame = (id) => ({ id, anchor: "page", title: "Frame", html: "<p>frame</p>" });
for (let i = 0; i < ${PLUGIN_FRAME_SURFACES_MAX}; i += 1) { h.ui.registerFrame(frame("f" + i)); }
orb.host(1).ui.registerFrame(frame("past"));`,
  );
  expect(guest.status).toBe("enabled");
  // The refusal is the one warning. The frames the first surface registered are the control: they all landed.
  expect(guest.log).toEqual([WARN]);
  const frames = (await root.services.plugin.listSurfaces({ caller: guest.caller })).filter(({ pluginId }) => pluginId === guest.pluginId);
  expect(frames.map(({ id }) => id)).toEqual(Array.from({ length: PLUGIN_FRAME_SURFACES_MAX }, (_, index) => `f${String(index)}`));
});

test("an activation that throws at an ungranted door errors with the refused capability as its last error", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const frameCapability = HOST_FUNCTION_CAPABILITY["ui.registerFrame"];
  const refused = await activate(
    root,
    "ungranted-frame",
    [HOST_FUNCTION_CAPABILITY["ui.register"]],
    `h.ui.registerFrame({ id: "frame", anchor: "page", title: "Frame", html: "<p>frame</p>" });`,
  );
  expect(refused.status).toBe("errored");
  expect(refused.lastError).toContain(new PluginCapabilityError(frameCapability).message);

  const granted = await activate(
    root,
    "granted-frame",
    [HOST_FUNCTION_CAPABILITY["ui.register"], frameCapability],
    `h.ui.registerFrame({ id: "frame", anchor: "page", title: "Frame", html: "<p>frame</p>" });`,
  );
  expect(granted).toMatchObject({ status: "enabled", lastError: null });
});
