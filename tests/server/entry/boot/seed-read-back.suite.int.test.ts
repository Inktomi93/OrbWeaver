// entry/boot — a fresh install's seed, read back: every read the UI makes of a seeded row must parse losslessly
// through its current `@orb/contracts` schema, every seeded blob must survive its read seam's schema, and every
// seeded table is either read back row for row or named in `NOT_READ_BACK`.

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../support/composed-real.ts";
import process from "node:process";
import { assetIdSchema, assetKindSchema, characterIdSchema, galleryItemIdSchema } from "@orb/contracts/assets";
import { cardFaceFields } from "@orb/contracts/card-face";
import { CHARACTER_PROVENANCES, characterCardSchema, characterHandleSchema } from "@orb/contracts/character";
import {
  chatDetailSchema,
  chatIdentitySchema,
  chatReasoningPartSchema,
  macroFreezeRecordSchema,
  messageKindSchema,
  messageRoleSchema,
  participantRoleSchema,
  tokenProvenanceSchema,
  toolCallRecordSchema,
  userMacroDrawsSchema,
  variableDeltaSchema,
  variantMetadataSchema,
} from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { normalizedFinishReasonSchema } from "@orb/contracts/inference";
import { NOTIFICATION_TYPES, notificationEventSchema } from "@orb/contracts/notifications";
import { createPersonaSchema, personaMetadataSchema } from "@orb/contracts/persona";
import {
  PLUGIN_CAPABILITIES,
  PLUGIN_ORIGINS,
  PLUGIN_STATUSES,
  pluginBuiltAgainstSchema,
  pluginManifestSchema,
  pluginNetHostSchema,
  pluginSlugSchema,
} from "@orb/contracts/plugin";
import { promptConfigSchema, userIntentSchema } from "@orb/contracts/preset";
import {
  RPG_DELIVERY_PATHS,
  RPG_FOLD_FALLBACK_REASONS,
  rpgActorIdentitySchema,
  rpgActorRefSchema,
  rpgActorVolatileSchema,
  rpgClockTimeSchema,
  rpgGameConfigSchema,
  rpgGameFeaturesSchema,
  rpgGameModeSchema,
  rpgGameStatusSchema,
  rpgJournalTypeSchema,
  rpgPlotSchema,
  rpgQuestSchema,
  rpgSheetSchema,
  rpgSnapshotStateSchema,
  rpgTrackerDefSchema,
  rpgTrackerValueSchema,
  rpgWeatherSchema,
} from "@orb/contracts/rpg";
import { userSettingsSchema } from "@orb/contracts/settings";
import { tagFolderTypeSchema, tagSourceSchema } from "@orb/contracts/tag";
import { themeBackgroundSchema, themeOverrideSchema, themeSchema } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  seedDefaultBackgrounds,
  seedDefaultCharacters,
  seedDefaultPersona,
  seedDefaultPreset,
  seedDemoChats,
  seedExamplePlugins,
  seedThemes,
} from "@orb/server/entry/boot";
import { sql } from "drizzle-orm";
import { afterAll, vi } from "vitest";
import { z } from "zod";
import { PACKAGED_PRESETS } from "../../../../packages/server/src/domain/preset/contract/packaged.ts";
import type { AppCaller } from "../../../support/fixtures.ts";
import { expect, OWNER_USER_ID, test } from "../../../support/fixtures.ts";

// `DEV_SEED=on` is the automation stamp that arms the default-persona seeder; without it no persona row exists.
// biome-ignore-start lint/style/noProcessEnv: this file DRIVES the env parse by crafting process.env before the module graph loads — the same seam `tests/server/domain/chat/engine/turn-fault-outcome.suite.int.test.ts` uses.
// biome-ignore-start lint/correctness/noProcessGlobal: the `vi.hoisted` body below runs before this file's import bindings exist, so the `node:process` import is unreachable from it — `globalThis.process` is the only handle available at that point (the rest of the file uses the import).
const PREVIOUS_DEV_SEED = vi.hoisted((): string | undefined => {
  const previous = globalThis.process.env["DEV_SEED"];
  globalThis.process.env["DEV_SEED"] = "on";
  return previous;
});
// biome-ignore-end lint/correctness/noProcessGlobal: end of the block above

// `pool: "forks"` reuses a process across FILES and process.env is process-wide even though the module graph
// is not — hand the stamp back or the next file in this worker seeds a persona it never asked for.
afterAll(() => {
  if (PREVIOUS_DEV_SEED === undefined) {
    Reflect.deleteProperty(process.env, "DEV_SEED");
  } else {
    process.env["DEV_SEED"] = PREVIOUS_DEV_SEED;
  }
});
// biome-ignore-end lint/style/noProcessEnv: end of the block above

// ── The plan: what the contract declares for each value a read returns ─────────────────────────────────────
// A contract schema must parse its value with nothing stripped, rewritten or filled. An interface-only view is
// keyed by the procedure's output type, so a key no plan names is drift at runtime and a dropped key fails tsc.

/** A view field the contracts type only as an interface member — no runtime schema exists to parse it. Its
 *  presence is still pinned: the enclosing object plan is keyed by the procedure's output type. */
const TYPED_ONLY = Symbol("typed-only");

class ObjectPlan {
  readonly fields: Readonly<Record<string, Plan>>;
  constructor(fields: Readonly<Record<string, Plan>>) {
    this.fields = fields;
  }
}
class EachPlan {
  readonly item: Plan;
  constructor(item: Plan) {
    this.item = item;
  }
}
class NullablePlan {
  readonly inner: Plan;
  constructor(inner: Plan) {
    this.inner = inner;
  }
}
type Plan = z.ZodType | typeof TYPED_ONLY | ObjectPlan | EachPlan | NullablePlan;

/** An object view: one plan per key of `V`, no more and no fewer (the mapped type is the compile-time half). */
function view<V>(fields: { readonly [K in keyof V]-?: Plan }): ObjectPlan {
  return new ObjectPlan(fields);
}
function each(item: Plan): EachPlan {
  return new EachPlan(item);
}
function orNull(inner: Plan): NullablePlan {
  return new NullablePlan(inner);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How a parse that FILLS an absent key reads: drift on a read, a heal on a stored blob (the read seam's
 *  `.default` is the ruled posture for a sparse blob). */
const FILL_POSTURES = ["drift", "heal"] as const;
type Fills = (typeof FILL_POSTURES)[number];

/** Where a successful parse is not the identity: a key the schema dropped, a key it filled, a value it rewrote. */
function lossOf(sent: unknown, parsed: unknown, path: string, fills: Fills): string[] {
  if (Array.isArray(sent)) {
    if (!Array.isArray(parsed) || parsed.length !== sent.length) {
      return [`${path}: the wire schema reshaped the array`];
    }
    return sent.flatMap((item, i) => lossOf(item, parsed[i], `${path}[${i}]`, fills));
  }
  if (isRecord(sent)) {
    if (!isRecord(parsed)) {
      return [`${path}: the wire schema reshaped the object`];
    }
    const dropped = Object.keys(sent)
      .filter((key) => sent[key] !== undefined && parsed[key] === undefined)
      .map((key) => `${path}.${key}: seeded, dropped by the wire schema`);
    const filled = Object.keys(parsed)
      .filter((key) => fills === "drift" && parsed[key] !== undefined && sent[key] === undefined)
      .map((key) => `${path}.${key}: filled by the wire schema, absent from the seeded value`);
    const nested = Object.keys(sent)
      .filter((key) => sent[key] !== undefined && parsed[key] !== undefined)
      .flatMap((key) => lossOf(sent[key], parsed[key], `${path}.${key}`, fills));
    return [...dropped, ...filled, ...nested];
  }
  return Object.is(sent, parsed) ? [] : [`${path}: the wire schema rewrote ${JSON.stringify(sent)} to ${JSON.stringify(parsed)}`];
}

/** Every place `value` departs from `plan`, as `path: reason` lines. Empty means the read is faithful. */
function driftOf(value: unknown, plan: Plan, path: string, fills: Fills = "drift"): string[] {
  if (plan === TYPED_ONLY) {
    return [];
  }
  if (plan instanceof z.ZodType) {
    const parsed = plan.safeParse(value);
    if (!parsed.success) {
      return parsed.error.issues.map((issue) => `${[path, ...issue.path.map(String)].join(".")}: ${issue.message}`);
    }
    return lossOf(value, parsed.data, path, fills);
  }
  if (plan instanceof NullablePlan) {
    return value === null ? [] : driftOf(value, plan.inner, path, fills);
  }
  if (plan instanceof EachPlan) {
    return Array.isArray(value) ? value.flatMap((item, i) => driftOf(item, plan.item, `${path}[${i}]`, fills)) : [`${path}: expected an array`];
  }
  if (!isRecord(value)) {
    return [`${path}: expected an object`];
  }
  const undeclared = Object.keys(value)
    .filter((key) => value[key] !== undefined && !Object.hasOwn(plan.fields, key))
    .map((key) => `${path}.${key}: sent by the read path, declared by no wire schema`);
  const fields = Object.entries(plan.fields).flatMap(([key, field]) => driftOf(value[key], field, `${path}.${key}`, fills));
  return [...undeclared, ...fields];
}

// ── The read outputs, typed from the procedures the UI calls ───────────────────────────────────────────────

type Out<P extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<P>>;
type CharacterSummaryOut = Out<AppCaller["character"]["list"]>["items"][number];
type CharacterDetailOut = Out<AppCaller["character"]["get"]>;
type TagOut = CharacterDetailOut["tags"][number];
type TagWithUsageOut = Out<AppCaller["tag"]["listTagsWithUsage"]>[number];
type TagSuggestionOut = Out<AppCaller["tag"]["listPendingSuggestions"]>[number];
type PersonaDetailOut = Out<AppCaller["persona"]["get"]>;
type ChatSummaryOut = Out<AppCaller["chat"]["listChats"]>["items"][number];
type MessagesPageOut = Out<AppCaller["chat"]["listMessages"]>;
type MessageOut = MessagesPageOut["messages"][number];
type GameOut = NonNullable<Out<AppCaller["rpg"]["getGame"]>>;
type TrackerViewOut = Out<AppCaller["rpg"]["getTrackerView"]>;
type ActorOut = TrackerViewOut["actors"][number];
type JournalOut = Out<AppCaller["rpg"]["listJournal"]>[number];
type UserSettingsOut = Out<AppCaller["settings"]["getUserSettings"]>;
type PresetSummaryOut = Out<AppCaller["preset"]["list"]>[number];
type PresetDetailOut = Out<AppCaller["preset"]["get"]>;
type PluginOut = Out<AppCaller["plugin"]["list"]>[number];
type InboxOut = Out<AppCaller["notifications"]["list"]>["items"][number];
type GalleryOut = Out<AppCaller["assets"]["listGallery"]>[number];
type AssetOut = Out<AppCaller["assets"]["listOwned"]>[number];

const tagPlan = view<TagOut>({
  id: TYPED_ONLY,
  name: TYPED_ONLY,
  color: TYPED_ONLY,
  color2: TYPED_ONLY,
  source: tagSourceSchema.nullable(),
  folderType: tagFolderTypeSchema,
  sortOrder: TYPED_ONLY,
  isHiddenOnCard: TYPED_ONLY,
});

const tagWithUsagePlan = view<TagWithUsageOut>({ ...tagPlan.fields, usage: TYPED_ONLY });
const tagSuggestionPlan = view<TagSuggestionOut>({ ...tagPlan.fields, characterId: TYPED_ONLY });

const characterProvenanceSchema = z.enum(CHARACTER_PROVENANCES);

const characterSummaryPlan = view<CharacterSummaryOut>({
  id: TYPED_ONLY,
  handle: characterHandleSchema,
  name: cardFaceFields.name,
  starred: cardFaceFields.starred,
  archived: TYPED_ONLY,
  forbidExternalMedia: TYPED_ONLY,
  trustHtml: TYPED_ONLY,
  themeOverride: themeOverrideSchema.nullable(),
  backgroundOverride: themeBackgroundSchema.nullable(),
  avatarAssetId: cardFaceFields.avatarAssetId,
  avatarHash: TYPED_ONLY,
  createdAt: TYPED_ONLY,
  tokenSize: TYPED_ONLY,
  tags: each(tagPlan),
  elevatorPitch: TYPED_ONLY,
  lastChattedAt: TYPED_ONLY,
  lastChatId: TYPED_ONLY,
  chatCount: TYPED_ONLY,
  provenance: characterProvenanceSchema,
  nameIsAmbiguous: TYPED_ONLY,
});

// The card half is the contract's own field schemas, spread — a field the card schema loses leaves the detail
// sending a key no plan names.
const characterDetailPlan = view<CharacterDetailOut>({
  ...characterCardSchema.shape,
  id: TYPED_ONLY,
  handle: characterHandleSchema,
  starred: cardFaceFields.starred,
  archived: TYPED_ONLY,
  synthetic: TYPED_ONLY,
  forbidExternalMedia: TYPED_ONLY,
  trustHtml: TYPED_ONLY,
  interactiveHtml: TYPED_ONLY,
  themeOverride: themeOverrideSchema.nullable(),
  backgroundOverride: themeBackgroundSchema.nullable(),
  importedFrom: TYPED_ONLY,
  importHash: TYPED_ONLY,
  provenance: characterProvenanceSchema,
  contentHash: TYPED_ONLY,
  createdAt: TYPED_ONLY,
  avatarHash: TYPED_ONLY,
  tags: each(tagPlan),
});

// `persona.list` returns the same detail `persona.get` does.
const personaPlan = view<PersonaDetailOut>({
  id: TYPED_ONLY,
  name: createPersonaSchema.shape.name,
  title: createPersonaSchema.shape.title,
  description: createPersonaSchema.shape.description,
  starred: createPersonaSchema.shape.starred,
  avatarAssetId: createPersonaSchema.shape.avatarAssetId,
  avatarHash: TYPED_ONLY,
  metadata: personaMetadataSchema.nullable(),
  createdAt: TYPED_ONLY,
  updatedAt: TYPED_ONLY,
});

const chatSummaryPlan = view<ChatSummaryOut>({
  id: TYPED_ONLY,
  title: TYPED_ONLY,
  starred: TYPED_ONLY,
  archived: TYPED_ONLY,
  lastMessageAt: TYPED_ONLY,
  messageCount: TYPED_ONLY,
  lastMessagePreview: TYPED_ONLY,
  isGame: TYPED_ONLY,
  gamePaused: TYPED_ONLY,
  participantNames: TYPED_ONLY,
  participantPortraits: each(view<ChatSummaryOut["participantPortraits"][number]>({ characterId: TYPED_ONLY, name: TYPED_ONLY, avatarHash: TYPED_ONLY })),
  viewerRole: participantRoleSchema,
  createdAt: TYPED_ONLY,
  updatedAt: TYPED_ONLY,
});

const messagePlan = view<MessageOut>({
  id: TYPED_ONLY,
  chatId: TYPED_ONLY,
  seq: TYPED_ONLY,
  role: messageRoleSchema,
  kind: messageKindSchema,
  authorUserId: TYPED_ONLY,
  characterId: TYPED_ONLY,
  personaId: TYPED_ONLY,
  excludedFromPrompt: TYPED_ONLY,
  createdAt: TYPED_ONLY,
  editedAt: TYPED_ONLY,
  selectedVariantId: TYPED_ONLY,
  selectedVariantIdx: TYPED_ONLY,
  variantCount: TYPED_ONLY,
  hasContinuation: TYPED_ONLY,
  content: TYPED_ONLY,
  reasoning: TYPED_ONLY,
  model: TYPED_ONLY,
  provider: TYPED_ONLY,
  finishReason: normalizedFinishReasonSchema.nullable(),
  stopReason: TYPED_ONLY,
  terminalReason: TYPED_ONLY,
  tokensIn: TYPED_ONLY,
  tokensOut: TYPED_ONLY,
  tokenProvenance: tokenProvenanceSchema,
  cacheReadTokens: TYPED_ONLY,
  cacheWriteTokens: TYPED_ONLY,
  contextWindow: TYPED_ONLY,
  contextBoundaryMessageId: TYPED_ONLY,
  costUsd: TYPED_ONLY,
  costProvenance: tokenProvenanceSchema,
  ttftMs: TYPED_ONLY,
  genStartedAt: TYPED_ONLY,
  genFinishedAt: TYPED_ONLY,
  generationId: TYPED_ONLY,
  connectionId: TYPED_ONLY,
  toolCalls: z.array(toolCallRecordSchema),
});

const messagesPagePlan = view<MessagesPageOut>({ messages: each(messagePlan), identities: z.array(chatIdentitySchema) });

const gamePlan = view<GameOut>({
  id: TYPED_ONLY,
  chatId: TYPED_ONLY,
  mode: rpgGameModeSchema,
  status: rpgGameStatusSchema,
  trackersReadOnly: TYPED_ONLY,
  canPopulate: TYPED_ONLY,
  extractionMode: rpgGameConfigSchema.shape.extractionMode,
  effectiveDelivery: view<GameOut["effectiveDelivery"]>({
    path: z.enum(RPG_DELIVERY_PATHS),
    fallbackReason: z.enum(RPG_FOLD_FALLBACK_REASONS).nullable(),
  }),
  publicConfig: view<GameOut["publicConfig"]>({
    statProfile: rpgGameConfigSchema.shape.statProfile,
    ruleset: rpgGameConfigSchema.shape.ruleset,
    dateMode: rpgGameConfigSchema.shape.dateMode,
    immersiveHtml: TYPED_ONLY,
    cyoa: TYPED_ONLY,
    cyoaChoiceBehavior: rpgGameFeaturesSchema.shape.cyoaChoiceBehavior,
    plotProgression: TYPED_ONLY,
  }),
});

const actorPlan = view<ActorOut>({
  actorRef: rpgActorRefSchema,
  name: TYPED_ONLY,
  avatar: TYPED_ONLY,
  presence: TYPED_ONLY,
  identity: rpgActorIdentitySchema.nullable(),
  sheet: rpgSheetSchema,
  volatile: rpgActorVolatileSchema.nullable(),
  trackers: z.array(rpgTrackerDefSchema),
});

const trackerViewPlan = view<TrackerViewOut>({
  ambient: orNull(
    view<NonNullable<TrackerViewOut["ambient"]>>({
      location: TYPED_ONLY,
      calendarDate: TYPED_ONLY,
      clock: rpgClockTimeSchema.nullable(),
      weather: rpgWeatherSchema.nullable(),
    }),
  ),
  actors: each(actorPlan),
  cast: TYPED_ONLY,
  trackerDefs: z.array(rpgTrackerDefSchema),
  gameTrackers: each(view<TrackerViewOut["gameTrackers"][number]>({ def: rpgTrackerDefSchema, value: rpgTrackerValueSchema.nullable() })),
  quests: z.array(rpgQuestSchema),
  plot: rpgPlotSchema.nullable(),
  recentBeats: TYPED_ONLY,
  trackersReadOnly: TYPED_ONLY,
  trackerOrbs: each(view<TrackerViewOut["trackerOrbs"][number]>({ key: TYPED_ONLY, label: TYPED_ONLY, value: TYPED_ONLY, max: TYPED_ONLY, color: TYPED_ONLY })),
  lockedPaths: TYPED_ONLY,
});

const journalPlan = view<JournalOut>({
  id: TYPED_ONLY,
  type: rpgJournalTypeSchema,
  label: TYPED_ONLY,
  title: TYPED_ONLY,
  content: TYPED_ONLY,
  createdAt: TYPED_ONLY,
});

const userSettingsPlan = view<UserSettingsOut>({
  userId: TYPED_ONLY,
  schemaVersion: TYPED_ONLY,
  config: userSettingsSchema,
  updatedAt: TYPED_ONLY,
  configUnreadable: TYPED_ONLY,
});

const presetSummaryFields = {
  id: TYPED_ONLY,
  name: TYPED_ONLY,
  kind: TYPED_ONLY,
  isSystemDefault: TYPED_ONLY,
  forkedFrom: TYPED_ONLY,
  createdAt: TYPED_ONLY,
  updatedAt: TYPED_ONLY,
} as const;
const presetSummaryPlan = view<PresetSummaryOut>(presetSummaryFields);
const presetDetailPlan = view<PresetDetailOut>({ ...presetSummaryFields, config: promptConfigSchema, schemaVersion: TYPED_ONLY, configUnreadable: TYPED_ONLY });

const pluginCapabilitiesSchema = z.array(z.enum(PLUGIN_CAPABILITIES));
const pluginPlan = view<PluginOut>({
  id: TYPED_ONLY,
  slug: pluginSlugSchema,
  name: TYPED_ONLY,
  version: TYPED_ONLY,
  status: z.enum(PLUGIN_STATUSES),
  origin: z.enum(PLUGIN_ORIGINS),
  sourceUrl: TYPED_ONLY,
  updateSource: TYPED_ONLY,
  grantedCapabilities: pluginCapabilitiesSchema,
  declaredCapabilities: pluginCapabilitiesSchema,
  netHosts: z.array(pluginNetHostSchema).nullable(),
  reconsentPending: TYPED_ONLY,
  widenedNetHosts: z.array(pluginNetHostSchema),
  builtAgainst: pluginBuiltAgainstSchema.nullable(),
  lastError: TYPED_ONLY,
  installedAt: TYPED_ONLY,
  updatedAt: TYPED_ONLY,
});

const inboxPlan = view<InboxOut>({
  id: TYPED_ONLY,
  type: z.enum(NOTIFICATION_TYPES),
  payload: notificationEventSchema,
  actionable: TYPED_ONLY,
  seq: TYPED_ONLY,
  readAt: TYPED_ONLY,
  dismissedAt: TYPED_ONLY,
  createdAt: TYPED_ONLY,
});

const galleryPlan = view<GalleryOut>({
  galleryItemId: galleryItemIdSchema,
  assetId: assetIdSchema,
  hash: TYPED_ONLY,
  mime: TYPED_ONLY,
  animated: TYPED_ONLY,
  subjectCharacterId: characterIdSchema.nullable(),
  createdAt: TYPED_ONLY,
});

const assetPlan = view<AssetOut>({
  assetId: assetIdSchema,
  hash: TYPED_ONLY,
  kind: assetKindSchema,
  mime: TYPED_ONLY,
  size: TYPED_ONLY,
  uploadedAt: TYPED_ONLY,
  animated: TYPED_ONLY,
});

// ── The stored half: seeded JSON blobs against the schema their read seam parses them with ────────────────
// The read seam parses a blob through the same schema, so a field that schema loses vanishes from the read and
// from the plan check together; the seeded row is the only witness left.

interface StoredColumn {
  readonly table: string;
  readonly key: string;
  readonly column: string;
  readonly schema: z.ZodType;
}

const STORED_COLUMNS: readonly StoredColumn[] = [
  { table: "characters", key: "id", column: "greetings", schema: characterCardSchema.shape.greetings },
  { table: "characters", key: "id", column: "depth_prompt", schema: characterCardSchema.shape.depthPrompt },
  { table: "characters", key: "id", column: "source", schema: characterCardSchema.shape.source },
  { table: "characters", key: "id", column: "extensions", schema: characterCardSchema.shape.extensions },
  { table: "characters", key: "id", column: "residual_data", schema: characterCardSchema.shape.residualData },
  { table: "characters", key: "id", column: "refinery", schema: characterCardSchema.shape.refinery },
  { table: "characters", key: "id", column: "theme_override", schema: themeOverrideSchema.nullable() },
  { table: "characters", key: "id", column: "background_override", schema: themeBackgroundSchema.nullable() },
  { table: "personas", key: "id", column: "metadata", schema: personaMetadataSchema.nullable() },
  { table: "presets", key: "id", column: "config", schema: promptConfigSchema },
  { table: "themes", key: "id", column: "override", schema: themeOverrideSchema },
  { table: "user_settings", key: "user_id", column: "config", schema: userSettingsSchema },
  { table: "notifications", key: "id", column: "payload", schema: notificationEventSchema },
  { table: "plugins", key: "id", column: "manifest", schema: pluginManifestSchema },
  { table: "plugins", key: "id", column: "granted_capabilities", schema: z.array(z.enum(PLUGIN_CAPABILITIES)) },
  { table: "plugins", key: "id", column: "widened_net_hosts", schema: z.array(pluginNetHostSchema).nullable() },
  { table: "rpg_games", key: "id", column: "config", schema: rpgGameConfigSchema },
  { table: "rpg_sheets", key: "id", column: "sheet", schema: rpgSheetSchema },
  { table: "message_variants", key: "id", column: "reasoning_parts", schema: z.array(chatReasoningPartSchema).nullable() },
  { table: "message_variants", key: "id", column: "tool_calls", schema: z.array(toolCallRecordSchema).nullable() },
  { table: "message_variants", key: "id", column: "metadata", schema: variantMetadataSchema.nullable() },
  { table: "message_variants", key: "id", column: "macro_freezes", schema: macroFreezeRecordSchema.nullable() },
  { table: "message_variants", key: "id", column: "variable_delta", schema: variableDeltaSchema.nullable() },
  { table: "message_variants", key: "id", column: "macro_draws", schema: userMacroDrawsSchema.nullable() },
  { table: "message_variants", key: "id", column: "params", schema: userIntentSchema.nullable() },
];

/** A `text({ mode: "json" })` cell as the domain reads it: SQL NULL stays null, anything else is JSON. */
function decoded(cell: unknown): unknown {
  return typeof cell === "string" ? JSON.parse(cell) : cell;
}

/** The snapshot planes, one column each, keyed as `rpgSnapshotStateSchema` names them. */
const SNAPSHOT_PLANES = {
  clock: { column: "clock", json: true },
  calendarDate: { column: "calendar_date", json: false },
  location: { column: "location", json: false },
  weather: { column: "weather", json: true },
  presentCharacters: { column: "present_characters", json: true },
  recentEvents: { column: "recent_events", json: true },
  actorState: { column: "actor_state", json: true },
  trackerValues: { column: "tracker_values", json: true },
  quests: { column: "quests", json: true },
  plot: { column: "plot", json: true },
  fieldLocks: { column: "field_locks", json: true },
} as const satisfies Record<keyof z.input<typeof rpgSnapshotStateSchema>, { readonly column: string; readonly json: boolean }>;

async function storedDrift(db: Db): Promise<string[]> {
  const columns = await Promise.all(
    STORED_COLUMNS.map(async ({ table, key, column, schema }) => {
      const rows = await db.all<{ id: string; value: unknown }>(sql.raw(`select ${key} as id, ${column} as value from ${table}`));
      return rows.flatMap((row) => driftOf(decoded(row.value), schema, `${table}[${row.id}].${column}`, "heal"));
    }),
  );
  const planes = Object.entries(SNAPSHOT_PLANES);
  const snapshots = await db.all<Record<string, unknown>>(sql.raw(`select id, ${planes.map(([, plane]) => plane.column).join(", ")} from rpg_snapshots`));
  const states = snapshots.flatMap((row) => {
    const state = Object.fromEntries(planes.map(([name, plane]) => [name, plane.json ? decoded(row[plane.column]) : row[plane.column]]));
    return driftOf(state, rpgSnapshotStateSchema, `rpg_snapshots[${String(row["id"])}]`, "heal");
  });
  return [...columns.flat(), ...states];
}

// ── The seed and the read-back ─────────────────────────────────────────────────────────────────────────────

const OWNER: Principal = { userId: OWNER_USER_ID, role: "owner", handle: castId<Handle>("fixture-owner"), externalId: null, via: "header" };

/** The one page every list read is asked for; a full page means the census below would be reading a window. */
const PAGE = 100;

/** Seeded tables with no read-back, and why. Every other table the seed writes is in `READ_BACK_TABLES`. */
const NOT_READ_BACK: ReadonlyMap<string, string> = new Map([
  ["users", "the fixture's own principal row (`ownerCaller`), written before the seed, not by it"],
  [
    "audit_logs",
    "the audit trail the seeding verbs append as a side effect; it is operator evidence, not seeded content, and no user-facing procedure reads it",
  ],
  ["chat_import_claims", "the demo-chat seeder's idempotency ledger; it has no read procedure by design"],
  ["stats_canon_versions", "the stats rollup's internal canon-version marker; no procedure returns it"],
  [
    "rpg_snapshots",
    "`rpg.getTrackerView` reads only the snapshot the head resolves to; the other rows are resolved by a swipe, a fork, a checkpoint restore or an export, none a read procedure. Every row's planes are checked in `storedDrift`",
  ],
]);

/** The seeded tables the test reads back row for row. */
const READ_BACK_TABLES = [
  "assets",
  "character_tags",
  "characters",
  "chat_participants",
  "chats",
  "gallery_items",
  "message_variants",
  "messages",
  "notifications",
  "personas",
  "plugins",
  "presets",
  "rpg_games",
  "rpg_journal",
  "rpg_sheets",
  "tags",
  "themes",
  "user_settings",
] as const;

/** The actor a roster sheet belongs to (`rpg_sheets` holds characterId XOR userId); a cast NPC has no sheet row. */
function sheetActorOf(actor: ActorOut): string[] {
  if (actor.identity !== null) {
    return [];
  }
  const ref = actor.actorRef;
  if (ref.kind === "character") {
    return [ref.characterId];
  }
  return ref.kind === "user" ? [ref.userId] : [];
}

/** The ids a table holds, for the row census. */
async function idsOf(db: Db, query: string): Promise<string[]> {
  const rows = await db.all<{ id: string }>(sql.raw(query));
  return rows.map((row) => row.id).toSorted();
}

function sorted(ids: readonly string[]): string[] {
  return [...ids].toSorted();
}

/** Every non-empty table after the seed, with its row count. */
async function seededTables(db: Db): Promise<Record<string, number>> {
  const tables = await db.all<{ name: string }>(
    sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'`,
  );
  const counts = await Promise.all(
    tables.map(async ({ name }) => {
      const [row] = await db.all<{ n: number }>(sql.raw(`select count(*) as n from "${name}"`));
      return [name, row?.n ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts.filter(([, n]) => n > 0));
}

/** The whole transcript of one chat, paged backwards from the tail the way the client scrolls it. */
async function allMessages(caller: AppCaller, chatId: ChatSummaryOut["id"]): Promise<MessagesPageOut[]> {
  const pages: MessagesPageOut[] = [];
  let beforeSeq: number | undefined;
  for (;;) {
    const page = await caller.chat.listMessages({ chatId, limit: PAGE, ...(beforeSeq === undefined ? {} : { beforeSeq }) });
    pages.push(page);
    const oldest = page.messages[0];
    if (page.messages.length < PAGE || oldest === undefined) {
      return pages;
    }
    beforeSeq = oldest.seq;
  }
}

test("every seeded row reads back through its read procedure, faithful to its current wire schema", { timeout: 60_000 }, async ({
  db,
  app,
  clock,
  ownerCaller,
}) => {
  // The boot seed, in `entry/lifecycle.ts` order, for the deployment owner.
  await seedDefaultPreset({ db, now: clock.now });
  await seedThemes({ db, now: clock.now });
  await seedDefaultBackgrounds({ seeder: app.backgroundSeeder, owner: OWNER });
  await seedDefaultCharacters({ seeder: app.characterSeeder, owner: OWNER });
  await seedDefaultPersona({ seeder: app.personaSeeder, owner: OWNER });
  await seedDemoChats({ seeder: app.demoChatSeeder, owner: OWNER });
  await seedExamplePlugins({ seeder: app.examplePluginSeeder, owner: OWNER });

  const drift: string[] = [];
  const check = (value: unknown, plan: Plan, path: string): void => {
    drift.push(...driftOf(value, plan, path));
  };

  // Cards.
  const library = await ownerCaller.character.list({ limit: PAGE });
  expect(library.nextCursor, "the library fits one page, so the census reads all of it").toBeNull();
  const details = await Promise.all(library.items.map((item) => ownerCaller.character.get({ characterId: item.id })));
  for (const item of library.items) {
    check(item, characterSummaryPlan, `character.list[${item.handle}]`);
  }
  for (const detail of details) {
    check(detail, characterDetailPlan, `character.get[${detail.handle}]`);
  }
  const tags = await ownerCaller.tag.listTagsWithUsage();
  for (const tag of tags) {
    check(tag, tagWithUsagePlan, `tag.listTagsWithUsage[${tag.name}]`);
  }
  // The seeded card tags land STAGED (`pending`): the editor reads them through the review queue, not `tags`.
  const suggestions = await ownerCaller.tag.listPendingSuggestions();
  check(suggestions, each(tagSuggestionPlan), "tag.listPendingSuggestions");

  // The persona.
  const personas = await ownerCaller.persona.list();
  const personaDetails = await Promise.all(personas.map((persona) => ownerCaller.persona.get({ personaId: persona.id })));
  for (const persona of personas) {
    check(persona, personaPlan, `persona.list[${persona.name}]`);
  }
  for (const persona of personaDetails) {
    check(persona, personaPlan, `persona.get[${persona.name}]`);
  }

  // The example chats: the room list, each room, and each whole transcript.
  const rooms = await ownerCaller.chat.listChats({ limit: PAGE });
  expect(rooms.nextCursor, "the room list fits one page").toBeNull();
  const roomDetails = await Promise.all(rooms.items.map((room) => ownerCaller.chat.getChat({ chatId: room.id })));
  const transcripts = await Promise.all(rooms.items.map(async (room) => ({ room, pages: await allMessages(ownerCaller, room.id) })));
  for (const room of rooms.items) {
    check(room, chatSummaryPlan, `chat.listChats[${room.title ?? room.id}]`);
  }
  for (const room of roomDetails) {
    check(room, chatDetailSchema, `chat.getChat[${room.title ?? room.id}]`);
  }
  for (const { room, pages } of transcripts) {
    pages.forEach((page, i) => {
      check(page, messagesPagePlan, `chat.listMessages[${room.title ?? room.id}]#${i}`);
    });
  }

  // The RPG game: every room whose detail carries a game pointer.
  const gameRooms = roomDetails.filter((room) => room.rpg !== null);
  const games = await Promise.all(
    gameRooms.map(async (room) => ({
      room,
      game: await ownerCaller.rpg.getGame({ chatId: room.id }),
      tracker: await ownerCaller.rpg.getTrackerView({ chatId: room.id }),
      journal: await ownerCaller.rpg.listJournal({ chatId: room.id, limit: PAGE }),
    })),
  );
  for (const { room, game, tracker, journal } of games) {
    const label = room.title ?? room.id;
    check(game, gamePlan, `rpg.getGame[${label}]`);
    check(tracker, trackerViewPlan, `rpg.getTrackerView[${label}]`);
    check(journal, each(journalPlan), `rpg.listJournal[${label}]`);
  }

  // The settings the seeds write into, the presets, the theme palettes, the example plugins, the inbox and
  // the owned art.
  const settings = await ownerCaller.settings.getUserSettings();
  check(settings, userSettingsPlan, "settings.getUserSettings");
  const presets = await ownerCaller.preset.list();
  const presetDetails = await Promise.all(presets.map((preset) => ownerCaller.preset.get({ id: preset.id })));
  check(presets, each(presetSummaryPlan), "preset.list");
  for (const preset of presetDetails) {
    check(preset, presetDetailPlan, `preset.get[${preset.name}]`);
  }
  const themes = await ownerCaller.settings.listThemes();
  check(themes, z.array(themeSchema), "settings.listThemes");
  const plugins = await ownerCaller.plugin.list();
  check(plugins, each(pluginPlan), "plugin.list");
  const inbox = await ownerCaller.notifications.list({ limit: PAGE });
  expect(inbox.nextCursor, "the inbox fits one page").toBeNull();
  check(inbox.items, each(inboxPlan), "notifications.list");
  const gallery = await ownerCaller.assets.listGallery({ limit: PAGE });
  const assets = await ownerCaller.assets.listOwned({ limit: PAGE });
  expect(
    [gallery.length, assets.length].every((n) => n < PAGE),
    "the gallery and the asset list each fit one page",
  ).toBe(true);
  check(gallery, each(galleryPlan), "assets.listGallery");
  check(assets, each(assetPlan), "assets.listOwned");

  // ── SHAPE: every seeded value the UI reads is faithful to its current wire contract.
  expect(drift, "a seeded field has drifted from what its read path's wire schema declares").toEqual([]);
  expect(await storedDrift(db), "a seeded blob carries a field its read seam's schema no longer keeps").toEqual([]);

  // ── ROWS: every seeded row reached a read, and every seeded table is accounted for.
  const readPages = transcripts.flatMap(({ pages }) => pages);
  // A synthetic card (the narrator identity) is outside the library by design; the UI reads it as a chat
  // identity, from the room detail or from the message page that stamps it.
  const identities = [...roomDetails.flatMap((room) => room.identities), ...readPages.flatMap((page) => page.identities)];
  const readCharacters = new Set<string>([
    ...library.items.map((item) => item.id),
    ...identities.flatMap((identity) => (identity.kind === "character" ? [identity.id] : [])),
  ]);
  const characterRows = await db.all<{ id: string; handle: string; synthetic: number }>(sql`select id, handle, synthetic from characters`);
  expect(
    characterRows.filter((row) => !readCharacters.has(row.id)),
    "a seeded character no read path returns (neither the library nor a chat identity)",
  ).toEqual([]);

  const junctions = await db.all<{ id: string }>(sql`select character_id || ':' || tag_id as id from character_tags`);
  expect(
    sorted(junctions.map((row) => row.id)),
    "character_tags ↔ the accepted tags character.get returns + the pending ones tag.listPendingSuggestions returns",
  ).toEqual(
    sorted([
      ...details.flatMap((detail) => detail.tags.map((tag) => `${detail.id}:${tag.id}`)),
      ...suggestions.map((suggestion) => `${suggestion.characterId}:${suggestion.id}`),
    ]),
  );

  expect(await idsOf(db, "select id from tags"), "tags ↔ tag.listTagsWithUsage").toEqual(sorted(tags.map((tag) => tag.id)));
  expect(await idsOf(db, "select id from personas"), "personas ↔ persona.list").toEqual(sorted(personas.map((persona) => persona.id)));
  expect(personas.length, "DEV_SEED=on arms the persona seed, so the persona half is exercised, not vacuous").toBe(1);
  expect(await idsOf(db, "select id from chats"), "chats ↔ chat.listChats").toEqual(sorted(rooms.items.map((room) => room.id)));
  expect(await idsOf(db, "select id from chat_participants"), "chat_participants ↔ chat.getChat participants").toEqual(
    sorted(roomDetails.flatMap((room) => room.participants.map((seat) => seat.id))),
  );
  const readMessages = readPages.flatMap((page) => page.messages);
  expect(await idsOf(db, "select id from messages"), "messages ↔ chat.listMessages").toEqual(sorted(readMessages.map((message) => message.id)));
  expect(await idsOf(db, "select id from message_variants"), "message_variants ↔ each message's selected variant").toEqual(
    sorted(readMessages.map((message) => message.selectedVariantId)),
  );
  expect(await idsOf(db, "select id from rpg_games"), "rpg_games ↔ rpg.getGame").toEqual(sorted(games.flatMap(({ game }) => (game === null ? [] : [game.id]))));
  expect(games.length, "the flagship game seeded, so the RPG half is exercised, not vacuous").toBeGreaterThan(0);
  const sheetActors = await db.all<{ id: string }>(sql`select coalesce(character_id, user_id) as id from rpg_sheets`);
  expect(sorted(sheetActors.map((row) => row.id)), "rpg_sheets ↔ the roster actors rpg.getTrackerView returns").toEqual(
    sorted(games.flatMap(({ tracker }) => tracker.actors.flatMap(sheetActorOf))),
  );
  expect(await idsOf(db, "select id from rpg_journal"), "rpg_journal ↔ rpg.listJournal").toEqual(
    sorted(games.flatMap(({ journal }) => journal.map((entry) => entry.id))),
  );
  expect(await idsOf(db, "select user_id as id from user_settings"), "user_settings ↔ settings.getUserSettings").toEqual([settings.userId]);
  // A PACKAGED template is a clone source kept out of the readable list by design (its contract file's
  // header); its one reader is the `clonePackaged` verb, which no procedure exposes. It is the one seeded
  // row with no read path, named here so a second one fails.
  expect(await idsOf(db, "select id from presets"), "presets ↔ preset.list + the packaged clone templates").toEqual(
    sorted([...presets.map((preset) => preset.id), ...Object.values(PACKAGED_PRESETS).map((template) => template.id)]),
  );
  expect(await idsOf(db, "select id from themes"), "themes ↔ settings.listThemes").toEqual(sorted(themes.map((theme) => theme.id)));
  expect(await idsOf(db, "select id from plugins"), "plugins ↔ plugin.list").toEqual(sorted(plugins.map((plugin) => plugin.id)));
  // Each example plugin install supersedes the previous consent notice (a singleton type), which dismisses it;
  // the inbox read excludes dismissed rows by design, so only the live notice has a read path.
  expect(await idsOf(db, "select id from notifications where dismissed_at is null"), "live notifications ↔ notifications.list").toEqual(
    sorted(inbox.items.map((item) => item.id)),
  );
  expect(await idsOf(db, "select id from gallery_items"), "gallery_items ↔ assets.listGallery").toEqual(sorted(gallery.map((item) => item.galleryItemId)));
  expect(await idsOf(db, "select id from assets"), "assets ↔ assets.listOwned").toEqual(sorted(assets.map((asset) => asset.assetId)));

  expect(Object.keys(await seededTables(db)).toSorted(), "a seeded table is neither read back above nor named in NOT_READ_BACK").toEqual(
    [...READ_BACK_TABLES, ...NOT_READ_BACK.keys()].toSorted(),
  );
});
