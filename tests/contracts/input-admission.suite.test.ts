import { CHARACTER_LIST_MAX_LIMIT, characterListInputSchema } from "@orb/contracts/character";
import { CHAT_MESSAGE_LIST_MAX_LIMIT, chatListInputSchema, listMessagesInputSchema } from "@orb/contracts/chat";
import { listDocumentsInputSchema } from "@orb/contracts/databank";
import { listInboxInputSchema, NOTIFICATIONS_LIST_MAX_LIMIT } from "@orb/contracts/notifications";
import { personaIdInputSchema } from "@orb/contracts/persona";
import { PLUGIN_LOG_LIST_MAX_LIMIT, pluginLogInputSchema, pluginSurfaceStateInputSchema } from "@orb/contracts/plugin";
import { presetIdInputSchema } from "@orb/contracts/preset";
import { regexScriptIdInputSchema } from "@orb/contracts/regex";
import { applyRosterPresetInputSchema, rosterPresetListInputSchema } from "@orb/contracts/roster-preset";
import { SEARCH_TOP_N_MAX, similarArtInputSchema, unifiedSearchInputSchema } from "@orb/contracts/search";
import {
  latencyScopeSchema,
  STATS_LIST_MAX_LIMIT,
  statsByModelInputSchema,
  statsLeaderboardInputSchema,
  statsTimeseriesInputSchema,
} from "@orb/contracts/stats";
import { worldBookIdInputSchema } from "@orb/contracts/world-info";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("optional library requests preserve absence without injecting paging defaults", () => {
  for (const schema of [
    characterListInputSchema,
    chatListInputSchema,
    listInboxInputSchema,
    rosterPresetListInputSchema,
    statsLeaderboardInputSchema,
    statsByModelInputSchema,
  ]) {
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse(null).success).toBe(false);
  }
  expect(listDocumentsInputSchema.safeParse(undefined).success).toBe(false);
});

test("cursor and time windows retain their distinct null and numeric admissions", () => {
  expect(chatListInputSchema.parse({ cursor: null })).toEqual({ cursor: null });
  expect(listDocumentsInputSchema.parse({ cursor: null })).toEqual({ cursor: null });
  expect(characterListInputSchema.safeParse({ cursor: null }).success).toBe(false);
  expect(listInboxInputSchema.parse({ cursor: 0.5 })).toEqual({ cursor: 0.5 });
  expect(statsTimeseriesInputSchema.parse({ from: -1, to: 0 })).toEqual({ from: -1, to: 0 });
  expect(statsTimeseriesInputSchema.safeParse({ from: 0.5 }).success).toBe(false);
});

test("paged requests reject fractional and over-ceiling asks without clamping", () => {
  for (const [schema, limit] of [
    [characterListInputSchema, CHARACTER_LIST_MAX_LIMIT],
    [listInboxInputSchema, NOTIFICATIONS_LIST_MAX_LIMIT],
    [statsLeaderboardInputSchema, STATS_LIST_MAX_LIMIT],
    [statsByModelInputSchema, STATS_LIST_MAX_LIMIT],
  ] as const) {
    expect(schema.parse({ limit })).toEqual({ limit });
    for (const invalid of [0, 0.5, limit + 1]) {
      expect(schema.safeParse({ limit: invalid }).success).toBe(false);
    }
  }
});

test("message reads preserve fractional cursors but require bounded integer page sizes", ({ ids }) => {
  const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
  expect(listMessagesInputSchema.parse({ chatId, beforeSeq: 0.5, limit: CHAT_MESSAGE_LIST_MAX_LIMIT, ownerId: "discard" })).toEqual({
    chatId,
    beforeSeq: 0.5,
    limit: CHAT_MESSAGE_LIST_MAX_LIMIT,
  });
  expect(listMessagesInputSchema.safeParse({ chatId, limit: CHAT_MESSAGE_LIST_MAX_LIMIT + 1 }).success).toBe(false);
  expect(listMessagesInputSchema.safeParse({ chatId, limit: 1.5 }).success).toBe(false);
});

test("entity reads preserve prefix validation and strip undeclared authority fields", ({ ids }) => {
  const personaId = mintTypeId(ID_PREFIX.persona, ids.next);
  expect(personaIdInputSchema.parse({ personaId, ownerId: "discard" })).toEqual({ personaId });
  expect(personaIdInputSchema.safeParse({ personaId: mintTypeId(ID_PREFIX.character, ids.next) }).success).toBe(false);
  expect(presetIdInputSchema.safeParse({ id: personaId }).success).toBe(false);
  expect(worldBookIdInputSchema.safeParse({ bookId: personaId }).success).toBe(false);
  expect(regexScriptIdInputSchema.safeParse({ scriptId: personaId }).success).toBe(false);
});

test("search keeps the scoped discriminator and nested authority stripping", ({ ids }) => {
  const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
  const request = { query: "needle", topN: SEARCH_TOP_N_MAX, over: "corpus", scope: { kind: "chat", chatId } } as const;
  expect(unifiedSearchInputSchema.parse({ ...request, ownerId: "discard", scope: { ...request.scope, ownerId: "discard" } })).toEqual(request);
  expect(unifiedSearchInputSchema.safeParse({ ...request, topN: SEARCH_TOP_N_MAX + 1 }).success).toBe(false);
  expect(unifiedSearchInputSchema.safeParse({ ...request, over: "invalid" }).success).toBe(false);
  expect(unifiedSearchInputSchema.safeParse({ ...request, scope: { kind: "character", characterId: chatId } }).success).toBe(false);
  expect(similarArtInputSchema.safeParse({ characterId: chatId, topN: 1 }).success).toBe(false);
});

test("latency model scopes require explicit nullable providers and leaderboard sorts stay closed", () => {
  expect(latencyScopeSchema.parse({ kind: "model", model: "", provider: null, ownerId: "discard" })).toEqual({ kind: "model", model: "", provider: null });
  expect(latencyScopeSchema.safeParse({ kind: "model", model: "" }).success).toBe(false);
  expect(latencyScopeSchema.safeParse({ kind: "invalid" }).success).toBe(false);
  expect(statsLeaderboardInputSchema.safeParse({ sort: "invalid" }).success).toBe(false);
});

test("plugin and roster requests retain surface grammar, caps and time-zone normalization", ({ ids }) => {
  const pluginId = mintTypeId(ID_PREFIX.plugin, ids.next);
  expect(pluginLogInputSchema.parse({ pluginId, limit: PLUGIN_LOG_LIST_MAX_LIMIT })).toEqual({ pluginId, limit: PLUGIN_LOG_LIST_MAX_LIMIT });
  expect(pluginLogInputSchema.safeParse({ pluginId, limit: PLUGIN_LOG_LIST_MAX_LIMIT + 1 }).success).toBe(false);
  expect(pluginSurfaceStateInputSchema.safeParse({ pluginId, surfaceId: "bad surface" }).success).toBe(false);
  const presetId = mintTypeId(ID_PREFIX.rosterPreset, ids.next);
  const chatId = mintTypeId(ID_PREFIX.chat, ids.next);
  expect(applyRosterPresetInputSchema.parse({ presetId, chatId, timeZone: "unrecognized-zone" })).toEqual({ presetId, chatId, timeZone: "UTC" });
  expect(applyRosterPresetInputSchema.safeParse({ presetId, chatId }).success).toBe(false);
});
