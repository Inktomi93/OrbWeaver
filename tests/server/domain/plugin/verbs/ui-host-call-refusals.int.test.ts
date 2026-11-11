// A plugin UI's bad host call answers a client error that carries its code, and the transport leaves the server's
// error log alone: a write past the key cap and a chat-scoped call with no room are the caller's mistakes.
// @subject packages/server/src/domain/plugin/verbs/ui-host-call.ts
// @subject packages/server/src/domain/plugin/substrate/ui-host-dispatch.ts
// @subject packages/server/src/domain/plugin/substrate/storage.ts

import { spawn } from "node:child_process";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import {
  PLUGIN_KV_KEY_MAX_CHARS,
  PLUGIN_KV_MAX_KEYS,
  PLUGIN_KV_VALUE_MAX_BYTES,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_UI_ENTRY,
  PLUGIN_UI_HOST_CALL_CODES,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedCorpusActors, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { strToU8 } from "fflate";
import { z } from "zod";

const LOG_SCAN_LIMIT = 2000;
const BAD_REQUEST = 400;
const logRecordSchema = z.looseObject({ level: z.string() });
const refusalSchema = z.looseObject({ error: z.looseObject({ data: z.looseObject({ code: z.string(), reason: z.string() }) }) });

function ownerRoot(): Promise<ServerTestHarness> {
  return createServerHarness({
    logLevel: "warn",
    physicalPeer: () => "127.0.0.1",
    pluginSpawn: spawn,
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  });
}

/** An enabled plugin of the owner's whose grant covers the room reads and the key-value store. */
async function seedUiPlugin(root: ServerTestHarness): Promise<{ readonly pluginId: Awaited<ReturnType<typeof seedInstalledPlugin>>["outcome"]["id"] }> {
  const { owner: caller } = await seedCorpusActors(root);
  const manifest = pluginManifestSchema.parse({
    id: "ui-refusals",
    name: "UI refusals",
    version: "1.0.0",
    hostVersion: 1,
    entry: PLUGIN_MAIN_ENTRY,
    uiEntry: PLUGIN_UI_ENTRY,
    description: "Bad host calls from a plugin surface",
    capabilities: ["chat.read", "storage.kv", "ui.surface"],
  });
  const installed = await seedInstalledPlugin(root, {
    caller,
    grant: [],
    bundle: makePluginBundle(manifest, "const h = orb.host(1);", root.clock.now(), { [PLUGIN_UI_ENTRY]: strToU8("orb.ui(1);") }),
  });
  await seedPluginGrant(root, { caller, pluginId: installed.outcome.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
  return { pluginId: installed.outcome.id };
}

function errorRecords(root: ServerTestHarness): number {
  return root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "error").length;
}

async function relay(root: ServerTestHarness, input: Record<string, unknown>): Promise<Response> {
  return await root.http.request("/api/trpc/plugin.uiHostCall", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

test("a storage write past the key cap answers a client error with the storage-cap code and logs no error", async () => {
  await using root = await ownerRoot();
  const { pluginId } = await seedUiPlugin(root);
  const caller = await root.principalFor(root.ownerId);
  for (let index = 0; index < PLUGIN_KV_MAX_KEYS; index += 1) {
    await root.services.plugin.uiHostCall({ caller, pluginId, fn: "storage.set", argsJson: JSON.stringify([`key-${String(index)}`, "v"]) });
  }
  const logged = errorRecords(root);

  const existing = await relay(root, { pluginId, fn: "storage.set", argsJson: JSON.stringify(["key-0", "again"]) });
  expect(existing.status).toBe(200);
  await existing.arrayBuffer();

  const refused = await relay(root, { pluginId, fn: "storage.set", argsJson: JSON.stringify(["one-too-many", "v"]) });
  expect(refused.status).toBe(BAD_REQUEST);
  expect(refusalSchema.parse(await refused.json()).error.data).toMatchObject({ code: "BAD_REQUEST", reason: PLUGIN_UI_HOST_CALL_CODES.storageCap });
  expect(errorRecords(root)).toBe(logged);
});

// A character that is three UTF-8 bytes, so a value of N of them is a third as many characters as bytes.
const THREE_BYTE_CHAR = "中";
const THREE_BYTE_CHAR_WIDTH = 3;

test.for([
  {
    name: "a key past the key cap",
    within: ["k".repeat(PLUGIN_KV_KEY_MAX_CHARS), "v"],
    past: ["k".repeat(PLUGIN_KV_KEY_MAX_CHARS + 1), "v"],
  },
  {
    // Fewer characters than the byte cap, more bytes than it: the cap is in bytes.
    name: "a value past the byte cap",
    within: ["key", THREE_BYTE_CHAR.repeat(Math.floor(PLUGIN_KV_VALUE_MAX_BYTES / THREE_BYTE_CHAR_WIDTH))],
    past: ["key", THREE_BYTE_CHAR.repeat(Math.floor(PLUGIN_KV_VALUE_MAX_BYTES / THREE_BYTE_CHAR_WIDTH) + 1)],
  },
])("$name answers a client error with the invalid-arguments code and logs no error", async ({ within, past }) => {
  await using root = await ownerRoot();
  const { pluginId } = await seedUiPlugin(root);
  const logged = errorRecords(root);

  const stored = await relay(root, { pluginId, fn: "storage.set", argsJson: JSON.stringify(within) });
  expect(stored.status).toBe(200);
  await stored.arrayBuffer();

  const refused = await relay(root, { pluginId, fn: "storage.set", argsJson: JSON.stringify(past) });
  expect(refused.status).toBe(BAD_REQUEST);
  expect(refusalSchema.parse(await refused.json()).error.data).toMatchObject({ code: "BAD_REQUEST", reason: PLUGIN_UI_HOST_CALL_CODES.argsInvalid });
  expect(errorRecords(root)).toBe(logged);
});

test("a chat-scoped call with no room answers a client error with the scope code and logs no error", async () => {
  await using root = await ownerRoot();
  const { pluginId } = await seedUiPlugin(root);
  const room = await root.services.chat.startChat({ principal: await root.principalFor(root.ownerId), characterIds: [], opening: "none" });
  const logged = errorRecords(root);

  const scoped = await relay(root, { pluginId, fn: "chat.getVariables", argsJson: "[]", chatId: room.chat.id });
  expect(scoped.status).toBe(200);
  await scoped.arrayBuffer();

  const refused = await relay(root, { pluginId, fn: "chat.getVariables", argsJson: "[]" });
  expect(refused.status).toBe(BAD_REQUEST);
  expect(refusalSchema.parse(await refused.json()).error.data).toMatchObject({ code: "BAD_REQUEST", reason: PLUGIN_UI_HOST_CALL_CODES.scopeRequired });
  expect(errorRecords(root)).toBe(logged);
});
