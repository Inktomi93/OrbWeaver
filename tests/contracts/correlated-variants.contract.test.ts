import { automationActionSchema, automationActionViewSchema, testRunResultSchema } from "@orb/contracts/automation";
import { characterSummarySchema } from "@orb/contracts/character";
import { chatSummarySchema, messageWindowSchema } from "@orb/contracts/chat";
import { chatInspectionSchema } from "@orb/contracts/debug";
import { authConfigShareSchema } from "@orb/contracts/identity";
import { generateImageActionArgsSchema, generatePictureRequestSchema } from "@orb/contracts/imagery";
import { cachePolicySchema, connectionBindingSchema } from "@orb/contracts/inference";
import { inboxViewSchema } from "@orb/contracts/notifications";
import { regexScriptBehaviorSchema } from "@orb/contracts/regex";
import { statsFreshnessSchema } from "@orb/contracts/stats";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { makeChatSummaryView } from "@orb/testkit/node/factories/chat-view.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("relay projections withhold links when down but allow an anonymous up relay", () => {
  for (const value of [
    { state: "up", url: null },
    { state: "up", url: "https://relay.test" },
    { state: "off", url: null },
  ]) {
    expect(authConfigShareSchema.parse(value)).toEqual(value);
  }
  expect(authConfigShareSchema.safeParse({ state: "off", url: "https://relay.test" }).success).toBe(false);
});

test("effective cache controls preserve unknown facts without contradictory active controls", () => {
  const prefix = { action: "none", format: "cache-control", ttl: null, cacheSystem: false, historyDepth: null, preservesBlockEnds: false };
  const implicit = { supported: null, disableApplied: false, minimumRetentionSeconds: null, refreshOnHit: null, retention: null };
  const replay = { supported: false, enabled: false, ttlSeconds: null, refresh: false, provenance: "default" };
  const policy = { prefix, implicit, replay };
  expect(cachePolicySchema.parse(policy)).toEqual(policy);
  expect(cachePolicySchema.parse({ ...policy, prefix: { ...prefix, action: "markers", format: "openai-breakpoint" } }).prefix.ttl).toBeNull();
  for (const changes of [
    { prefix: { ...prefix, action: "markers", format: null } },
    { prefix: { ...prefix, cacheSystem: true } },
    { replay: { ...replay, enabled: true } },
    { replay: { ...replay, refresh: true } },
  ]) {
    expect(cachePolicySchema.safeParse({ ...policy, ...changes }).success).toBe(false);
  }
});

test("source windows distinguish unavailable endpoints from a resolved empty page", ({ ids }) => {
  const id = mintTypeId(ID_PREFIX.message, ids.next);
  const empty = {
    outcome: "deleted",
    anchorMessageId: null,
    anchorSeq: null,
    endSeq: null,
    endMessageId: null,
    messages: [],
    identities: [],
    hasBefore: false,
    hasAfter: false,
  };
  expect(messageWindowSchema.parse(empty)).toEqual(empty);
  const resolved = { ...empty, outcome: "resolved", anchorMessageId: id, anchorSeq: 1, endSeq: 1, endMessageId: id };
  expect(messageWindowSchema.parse(resolved)).toEqual(resolved);
  expect(messageWindowSchema.safeParse({ ...empty, outcome: "resolved" }).success).toBe(false);
  expect(messageWindowSchema.safeParse({ ...resolved, outcome: "unavailable" }).success).toBe(false);
});

test("freshness requires the rollup timestamp exactly when data exists", () => {
  for (const value of [
    { hasData: false, computedAt: null, stale: false },
    { hasData: true, computedAt: 0, stale: false },
  ]) {
    expect(statsFreshnessSchema.parse(value)).toEqual(value);
  }
  for (const value of [
    { hasData: true, computedAt: null, stale: false },
    { hasData: false, computedAt: 0, stale: false },
    { hasData: true, computedAt: 1, stale: true },
  ]) {
    expect(statsFreshnessSchema.safeParse(value).success).toBe(false);
  }
});

test("free imagery requires text while template modes retain optional overrides", () => {
  expect(generateImageActionArgsSchema.parse({}).mode).toBe("scenario");
  const action = automationActionSchema.parse({ type: "generate_image" });
  expect(action).toMatchObject({ mode: "scenario" });
  expect(automationActionViewSchema.parse(action)).toEqual(action);
  expect(automationActionViewSchema.safeParse({ ...action, privateInput: true }).success).toBe(false);
  for (const schema of [generatePictureRequestSchema, generateImageActionArgsSchema]) {
    expect(schema.safeParse({ mode: "free", prompt: "portrait" }).success).toBe(true);
    expect(schema.safeParse({ mode: "character_multimodal" }).success).toBe(true);
    expect(schema.safeParse({ mode: "scenario", prompt: "override" }).success).toBe(true);
    expect(schema.safeParse({ mode: "free" }).success).toBe(false);
    expect(schema.safeParse({ mode: "free", prompt: "   " }).success).toBe(false);
  }
});

test("debug existence does not invent a chat for a missing row", ({ ids }) => {
  const missing = { found: false, chat: null, participants: [], messages: [], sessionFrameCount: 0, recentEvents: [] };
  const found = {
    ...missing,
    found: true,
    chat: {
      id: mintTypeId(ID_PREFIX.chat, ids.next),
      title: null,
      starred: false,
      archived: false,
      temporary: false,
      startedAt: null,
      parentChatId: null,
      forkedAt: null,
      streamSeq: 0,
      createdAt: 0,
      updatedAt: 0,
    },
    participants: [{ id: "corrupt-human-seat", kind: "human", role: "member", userId: null, characterId: null, characterName: null }],
  };
  expect(chatInspectionSchema.parse(found)).toEqual(found);
  expect(chatInspectionSchema.safeParse({ ...found, found: false }).success).toBe(false);
  expect(chatInspectionSchema.parse(missing)).toEqual(missing);
  expect(chatInspectionSchema.safeParse({ ...missing, found: true }).success).toBe(false);
});

test("dry-run arms cannot claim both rendered text and a render error", () => {
  for (const arm of [{ type: "set_variable" }, { type: "set_variable", renderedPreview: "" }, { type: "set_variable", error: "invalid macro" }]) {
    expect(testRunResultSchema.parse({ predicate: true, arms: [arm] }).arms).toEqual([arm]);
  }
  expect(testRunResultSchema.safeParse({ predicate: true, arms: [{ type: "set_variable", renderedPreview: "text", error: "invalid macro" }] }).success).toBe(
    false,
  );
});

test("notification views correlate outer and payload types", ({ ids }) => {
  const value = {
    id: mintTypeId(ID_PREFIX.notification, ids.next),
    type: "plugin-disabled",
    payload: { type: "plugin-disabled", recipientUserId: "recipient", pluginId: mintTypeId(ID_PREFIX.plugin, ids.next) },
    actionable: false,
    seq: 1,
    readAt: null,
    dismissedAt: null,
    createdAt: 0,
  };
  expect(inboxViewSchema.parse(value)).toEqual(value);
  expect(inboxViewSchema.safeParse({ ...value, type: "invite" }).success).toBe(false);
});

test("binding actors require exactly their own identity and retain deleted connection targets", ({ ids }) => {
  const common = { id: mintTypeId(ID_PREFIX.connectionBinding, ids.next), task: "chat", connectionId: null };
  const user = { ...common, actorKind: "user", userId: "owner", ruleId: null, pluginId: null };
  expect(connectionBindingSchema.parse(user)).toEqual(user);
  const ruleId = mintTypeId(ID_PREFIX.automationRule, ids.next);
  expect(connectionBindingSchema.parse({ ...common, actorKind: "automation-rule", userId: null, ruleId, pluginId: null }).connectionId).toBeNull();
  expect(connectionBindingSchema.safeParse({ ...user, userId: null }).success).toBe(false);
  expect(connectionBindingSchema.safeParse({ ...user, ruleId }).success).toBe(false);
});

test("foreign regex tier masks preserve inert contradictory provenance", () => {
  const behavior = { findRegex: "x", replaceString: "y", placement: [] };
  for (const flags of [
    { markdownOnly: false, promptOnly: false },
    { markdownOnly: true, promptOnly: false },
    { markdownOnly: false, promptOnly: true },
  ]) {
    expect(regexScriptBehaviorSchema.safeParse({ ...behavior, ...flags }).success).toBe(true);
  }
  expect(regexScriptBehaviorSchema.safeParse({ ...behavior, markdownOnly: true, promptOnly: true }).success).toBe(true);
});

test("game posture distinguishes a paused game from an engaged game", () => {
  const summary = makeChatSummaryView();
  for (const flags of [
    { isGame: false, gamePaused: false },
    { isGame: false, gamePaused: true },
    { isGame: true, gamePaused: false },
  ]) {
    expect(chatSummarySchema.parse({ ...summary, ...flags })).toEqual({ ...summary, ...flags });
  }
  expect(chatSummarySchema.safeParse({ ...summary, isGame: true, gamePaused: true }).success).toBe(false);
  expect(chatSummarySchema.safeParse({ ...summary, privateInput: true }).success).toBe(false);
});

test("character resume identity and its timestamp form one recency witness", ({ ids }) => {
  const summary = {
    id: mintTypeId(ID_PREFIX.character, ids.next),
    handle: "recency",
    name: "Recency",
    starred: false,
    archived: false,
    forbidExternalMedia: null,
    trustHtml: null,
    themeOverride: null,
    backgroundOverride: null,
    avatarAssetId: null,
    avatarHash: null,
    createdAt: 0,
    tokenSize: 0,
    tags: [],
    elevatorPitch: null,
    lastChattedAt: null,
    lastChatId: null,
    chatCount: 0,
    provenance: "authored",
    nameIsAmbiguous: false,
  };
  const known = { ...summary, lastChattedAt: 0, lastChatId: mintTypeId(ID_PREFIX.chat, ids.next) };
  expect(characterSummarySchema.parse(summary)).toEqual(summary);
  expect(characterSummarySchema.parse(known)).toEqual(known);
  expect(characterSummarySchema.safeParse({ ...summary, lastChattedAt: 0 }).success).toBe(false);
  expect(characterSummarySchema.safeParse({ ...known, lastChattedAt: null }).success).toBe(false);
});
