// foundation/observability/debug/inspect/config — the CONFIG probes: the stored settings planes a live
// debugging session has to prove rather than assume (app KV, per-user blob, per-chat rpg game, and the whole
// character row including its render-policy tri-states). Reads @orb/db DOWN, same ledger allowance as the
// sibling list/inspect probes.
//
// WHY THIS EXISTS: `characterListSummaries` returns id/name/handle only, so the question "is this character
// TRUSTED?" — the one that decides whether its cards render as immersive chrome or as sanitized markdown —
// could not be answered from the debug surface at all. It was being answered by screenshotting the settings
// UI, which proves what the UI DISPLAYS, not what the row STORES. These probes read the row.
//
// The render-policy arm reports BOTH tiers and the resolved verdict, because the tri-state alone is
// undecidable: `trustHtml: null` means "inherit", and the deployment default is what it inherits. Reporting
// the raw column would reproduce exactly the ambiguity this probe exists to remove.

import type { RenderPolicy } from "@orb/contracts/chat";
import { resolveRenderPolicy } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, personas, presets, rpgGames, settings, userSettings } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";

/** One `settings` KV row (the app-override blob and its siblings — e.g. the OpenRouter catalog snapshot). */
export interface AppSettingRow {
  key: string;
  value: unknown;
  updatedAt: number;
}

/** One `user_settings` row — the per-user blob plus the STORED schema version that beats the in-blob probe
 *  (`[[versioned-config-lift-drops-overrides]]`: the column is the authority, not the blob). */
export interface UserSettingsRow {
  userId: UserId;
  schemaVersion: number;
  config: unknown;
  updatedAt: number;
}

/** The `rpg_games` row for one chat — mode/status/seat plus the whole config blob (statProfile + lite dials,
 *  including `features.immersiveHtml` and `cardKeepLastX`, which decide the card path). */
export interface RpgGameRow {
  id: string;
  chatId: ChatId;
  mode: string;
  status: string;
  sessionNumber: number;
  gmUserId: UserId | null;
  gmPresetId: string | null;
  config: unknown;
  createdAt: number;
  updatedAt: number;
}

/** The render-policy verdict for one character: what the row stores, what the deployment floors it to, and
 *  what actually resolves. `resolved` is what the client reads — the other two explain WHY. */
export interface RenderPolicyVerdict {
  /** The character's own tri-state columns (`null` = inherit the deployment tier). */
  stored: { trustHtml: boolean | null; forbidExternalMedia: boolean | null };
  /** The deployment tier the override resolves against. Absent when the effective config was not injected. */
  deployment: RenderPolicy | null;
  /** The resolved policy the roster hands the client. Null when `deployment` is unavailable to resolve against. */
  resolved: RenderPolicy | null;
  /** Which card render tier the resolved policy selects — the answer the card investigation actually needs.
   *  Per D44 §12.2: `tierB` = the OPT-IN sandboxed ImmersiveCard chrome; `tierA` = the DEFAULT inert seal. */
  cardTier: "tierA" | "tierB" | null;
}

/** The whole character row, minus nothing that matters for debugging. Prose fields ride in full: this is a
 *  token-gated host-only surface, and a truncated `systemPrompt` is exactly the field somebody needs whole. */
export interface CharacterDetailRow {
  id: CharacterId;
  name: string;
  handle: CharacterHandle;
  ownerId: UserId;
  starred: boolean;
  archived: boolean;
  synthetic: boolean;
  renderPolicy: RenderPolicyVerdict;
  themeOverride: unknown;
  backgroundOverride: unknown;
  card: {
    description: string | null;
    personality: string | null;
    scenario: string | null;
    greetings: unknown;
    exampleMessages: string | null;
    systemPrompt: string | null;
    postHistoryInstructions: string | null;
    depthPrompt: unknown;
    creatorNotes: string | null;
    creator: string | null;
    cardVersion: string | null;
    nickname: string | null;
  };
  provenance: {
    importedFrom: string | null;
    importHash: string | null;
    contentHash: string;
    tokenSize: number;
    source: unknown;
    creationDate: number | null;
    modificationDate: number | null;
  };
  extensions: unknown;
  residualData: unknown;
  refinery: unknown;
  avatarAssetId: string | null;
  createdAt: number;
}

/** Every `settings` KV row. Small table (a handful of keys) — no limit needed. */
export async function appSettingRows(db: Db): Promise<AppSettingRow[]> {
  const rows = await db.select().from(settings).orderBy(settings.key);
  return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt }));
}

/** Every `user_settings` row, or just one principal's when `userId` is given. A never-touched account has NO
 *  row (it reads defaults from `{}`), so an empty result is a real answer, not a miss. */
export async function userSettingsRows(db: Db, userId?: UserId): Promise<UserSettingsRow[]> {
  // Two explicit awaits rather than awaiting a conditional: drizzle's `.where()` returns a different builder
  // type, and the union is not uniformly thenable to the linter.
  const rows = userId === undefined ? await db.select().from(userSettings) : await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return rows.map((r) => ({ userId: r.userId, schemaVersion: r.schemaVersion, config: r.config, updatedAt: r.updatedAt }));
}

/** One `presets` row. The `config` blob is the whole `PromptConfig` — every section, its order and depth, plus
 *  the gen settings. `maxOutputTokens` lives in here, and reading it from the ROW is the only way to settle a
 *  question the wire capture answers ambiguously (the request shows the value SENT, not which preset sent it).
 *  `schemaVersion` rides alongside because the stored column beats an in-blob probe. */
export interface PresetRow {
  id: string;
  /** Nullable: a BUILT-IN preset has no owner. `null` here is "shipped with the app", not a missing read. */
  ownerId: UserId | null;
  name: string;
  kind: string;
  schemaVersion: number;
  forkedFrom: string | null;
  config: unknown;
  createdAt: number;
  updatedAt: number;
}

/** One `personas` row — the identity a seat plays. Paired with the seat's `activePersonaId` this is what
 *  settles a misattribution report: the seat points at an id, and this is what that id actually IS. */
export interface PersonaRow {
  id: string;
  ownerId: UserId;
  name: string;
  title: string | null;
  description: string;
  starred: boolean;
  avatarAssetId: string | null;
  metadata: unknown;
  createdAt: number;
  updatedAt: number;
}

/** Every preset, or one owner's. Config blobs ride whole — a preset's section ORDER is the thing being
 *  debugged more often than any single value, and a summary would drop exactly that. */
export async function presetRows(db: Db, ownerId?: UserId): Promise<PresetRow[]> {
  const rows =
    ownerId === undefined
      ? await db.select().from(presets).orderBy(desc(presets.updatedAt))
      : await db.select().from(presets).where(eq(presets.ownerId, ownerId)).orderBy(desc(presets.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    name: r.name,
    kind: r.kind,
    schemaVersion: r.schemaVersion,
    forkedFrom: r.forkedFrom,
    config: r.config,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/** Every persona, or one owner's. */
export async function personaRows(db: Db, ownerId?: UserId): Promise<PersonaRow[]> {
  const rows =
    ownerId === undefined
      ? await db.select().from(personas).orderBy(desc(personas.updatedAt))
      : await db.select().from(personas).where(eq(personas.ownerId, ownerId)).orderBy(desc(personas.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    name: r.name,
    title: r.title,
    description: r.description,
    starred: r.starred,
    avatarAssetId: r.avatarAssetId,
    metadata: r.metadata,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/** The ROOM config for one chat — the `chats` row's configuration planes plus the seat roster. The four JSON
 *  blobs are the ones that decide prompt content and are otherwise invisible: `runtimeVariables` is the plane
 *  `RUNTIME-VARS-DEAD` is about (stored, threaded to the macro env, consumed by nothing), and
 *  `userMacroValues` carries the flat-vs-nested shape that has bitten before. */
export interface ChatConfigRow {
  id: ChatId;
  title: string | null;
  starred: boolean;
  archived: boolean;
  temporary: boolean;
  anchorPersonaId: string | null;
  pendingHostUserId: string | null;
  pendingHandoffOffer: unknown;
  parentChatId: string | null;
  forkedAt: number | null;
  compactedAtSeq: number | null;
  compactSummary: string | null;
  metadata: unknown;
  variableValues: unknown;
  userMacroValues: unknown;
  runtimeVariables: unknown;
  standaloneVariableDeltas: unknown;
  importedFrom: string | null;
  importHash: string | null;
  participants: ChatParticipantRow[];
  createdAt: number;
  updatedAt: number;
}

/** One seat. `activePersonaId` is the column `INVITE-JOIN-NULL-PERSONA` is about — a NULL here on a joined
 *  member is the defect itself, so it is reported raw rather than floored to a display default. */
export interface ChatParticipantRow {
  kind: string;
  userId: UserId | null;
  characterId: CharacterId | null;
  activePersonaId: string | null;
  role: string | null;
}

/** The room config + roster for one chat, or `null` when the chat does not exist. */
export async function chatConfigRow(db: Db, chatId: ChatId): Promise<ChatConfigRow | null> {
  const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
  const r = rows[0];
  if (r === undefined) {
    return null;
  }
  const seats = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
  return {
    id: r.id,
    title: r.title,
    starred: r.starred,
    archived: r.archived,
    temporary: r.temporary,
    anchorPersonaId: r.anchorPersonaId,
    pendingHostUserId: r.pendingHostUserId,
    pendingHandoffOffer: r.pendingHandoffOffer,
    parentChatId: r.parentChatId,
    forkedAt: r.forkedAt,
    compactedAtSeq: r.compactedAtSeq,
    compactSummary: r.compactSummary,
    metadata: r.metadata,
    variableValues: r.variableValues,
    userMacroValues: r.userMacroValues,
    runtimeVariables: r.runtimeVariables,
    standaloneVariableDeltas: r.standaloneVariableDeltas,
    importedFrom: r.importedFrom,
    importHash: r.importHash,
    participants: seats.map((s) => ({
      kind: s.kind,
      userId: s.userId,
      characterId: s.characterId,
      activePersonaId: s.activePersonaId,
      role: s.role,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** The rpg game for one chat, or `null` when the chat has no game (the `rpg_games_chat_unique` index makes
 *  this at most one row). */
export async function rpgGameForChat(db: Db, chatId: ChatId): Promise<RpgGameRow | null> {
  const rows = await db.select().from(rpgGames).where(eq(rpgGames.chatId, chatId)).limit(1);
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    id: row.id,
    chatId: row.chatId,
    mode: row.mode,
    status: row.status,
    sessionNumber: row.sessionNumber,
    gmUserId: row.gmUserId,
    gmPresetId: row.gmPresetId,
    config: row.config,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Build the render-policy verdict from a character's tri-states + the deployment floor. `deployment` null
 *  (effective config not injected) degrades to stored-only rather than guessing a floor — a WRONG resolved
 *  verdict here is worse than an absent one, since the whole point is to stop inferring this. */
function renderPolicyVerdict(stored: { trustHtml: boolean | null; forbidExternalMedia: boolean | null }, deployment: RenderPolicy | null): RenderPolicyVerdict {
  if (deployment === null) {
    return { stored, deployment: null, resolved: null, cardTier: null };
  }
  const resolved = resolveRenderPolicy(deployment, stored);
  return { stored, deployment, resolved, cardTier: resolved.trustHtml ? "tierB" : "tierA" };
}

/** One character's full row + its resolved render policy. `null` when the id does not exist. */
// @owner-scope-ok: un-principal HOST read (D20). Every caller is `/api/_debug/*`, and the ADMITTED SET
// there is exactly two things: a holder of the `DEBUG_TOKEN` operator secret (a box-level credential, not a
// principal at all), or a SESSION whose principal satisfies `can(p,'admin',global)` — i.e. `role` is
// `owner` OR `admin` (D17). Both are box administrators; per D17 an `admin` already holds
// `admin.resetPassword`/`setEnabled`/`setRole` and can assume any account at will, so filtering these reads
// by the caller's own ownerId would raise the confidentiality bar by zero while breaking the probe's actual
// job — answering "what does this row hold" about OTHER users' rows for an operator debugging their
// deployment. There is no per-user principal at this seam to scope BY, and adding one would be a boundary
// that looks like a control without being one.
//
// THIS EXEMPTION IS ENFORCED, NOT ASSERTED (constitution §2.3 — a prose-only boundary is a wish). Its whole
// premise is "the gate ran first", and until AUTHFIX-2 (2026-08-07) that premise was FALSE: the gate's admin
// arm admitted the un-credentialed owner fallback, so these reads served anyone who could reach the port.
// The enforcer is now `tests/server/entry/debug-gate.suite.test.ts` — every AUTH_MODE × Host × token state,
// driven through the real registrar. The exemption ENDS if the admitted set ever widens below admin: a
// non-admin per-user principal here makes this a cross-tenant read of arbitrary caller-supplied ids, and
// then these reads must take an ownerId and filter on it. Turn that suite red before widening anything.
export async function characterDetailRow(db: Db, characterId: CharacterId, deployment: RenderPolicy | null): Promise<CharacterDetailRow | null> {
  const rows = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  const r = rows[0];
  if (r === undefined) {
    return null;
  }
  return {
    id: r.id,
    name: r.name,
    handle: r.handle,
    ownerId: r.ownerId,
    starred: r.starred,
    archived: r.archived,
    synthetic: r.synthetic,
    renderPolicy: renderPolicyVerdict({ trustHtml: r.trustHtml, forbidExternalMedia: r.forbidExternalMedia }, deployment),
    themeOverride: r.themeOverride,
    backgroundOverride: r.backgroundOverride,
    card: {
      description: r.description,
      personality: r.personality,
      scenario: r.scenario,
      greetings: r.greetings,
      exampleMessages: r.exampleMessages,
      systemPrompt: r.systemPrompt,
      postHistoryInstructions: r.postHistoryInstructions,
      depthPrompt: r.depthPrompt,
      creatorNotes: r.creatorNotes,
      creator: r.creator,
      cardVersion: r.cardVersion,
      nickname: r.nickname,
    },
    provenance: {
      importedFrom: r.importedFrom,
      importHash: r.importHash,
      contentHash: r.contentHash,
      tokenSize: r.tokenSize,
      source: r.source,
      creationDate: r.creationDate,
      modificationDate: r.modificationDate,
    },
    extensions: r.extensions,
    residualData: r.residualData,
    refinery: r.refinery,
    avatarAssetId: r.avatarAssetId,
    createdAt: r.createdAt,
  };
}

/** Every character's render-policy verdict in one read — the sweep that answers "which cards are trusted?"
 *  without N round-trips. Synthetic buckets included here (unlike the user-facing list probe): a synthetic
 *  group identity authors content too, so its tier is a real question.
 *
 *  `ownerId` and `handle` are NOT optional decoration. The default-character pack is seeded PER USER
 *  (`entry/boot/seed-default-characters.ts`), and `characters_owner_handle_unique` is on `(ownerId, handle)` —
 *  so on an N-user deployment every default legitimately appears N times under the SAME handle with different
 *  owners. Without the owner column that reads as duplicate rows, and it did: this sweep's first output was
 *  mis-filed as a seeder idempotency bug before the owners were checked. A cross-tenant sweep that omits the
 *  tenant is a misreading waiting to happen. */
export async function characterPolicySweep(
  db: Db,
  deployment: RenderPolicy | null,
): Promise<{ id: CharacterId; name: string; handle: CharacterHandle; ownerId: UserId; synthetic: boolean; renderPolicy: RenderPolicyVerdict }[]> {
  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      handle: characters.handle,
      ownerId: characters.ownerId,
      synthetic: characters.synthetic,
      trustHtml: characters.trustHtml,
      forbidExternalMedia: characters.forbidExternalMedia,
    })
    .from(characters)
    .orderBy(desc(characters.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    handle: r.handle,
    ownerId: r.ownerId,
    synthetic: r.synthetic,
    renderPolicy: renderPolicyVerdict({ trustHtml: r.trustHtml, forbidExternalMedia: r.forbidExternalMedia }, deployment),
  }));
}
