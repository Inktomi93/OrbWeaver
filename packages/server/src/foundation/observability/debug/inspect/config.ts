// foundation/observability/debug/inspect/config — the CONFIG probes: the stored settings planes a live
// debugging session has to prove rather than assume (per-user blob, per-chat rpg game, and the whole
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

import type { DeploymentRenderPolicy, RenderPolicyOverride } from "@orb/contracts/chat";
import { rendersTrustedHtml, resolveRenderPolicy } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, chatParticipants, chats, personas, presets, rpgGames, userSettings } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { desc, eq } from "drizzle-orm";
import type {
  CharacterDetailRow,
  CharacterPolicyRow,
  ChatConfigRow,
  PersonaRow,
  PresetRow,
  RenderPolicyVerdict,
  RpgGameRow,
  UserSettingsRow,
} from "../../contract/inspect.ts";

export type { GlobalSettingView as AppSettingRow } from "@orb/contracts/settings";
export type {
  CharacterDetailRow,
  ChatConfigRow,
  ChatParticipantRow,
  PersonaRow,
  PresetRow,
  RenderPolicyVerdict,
  RpgGameRow,
  UserSettingsRow,
} from "../../contract/inspect.ts";

/** Every `user_settings` row, or just one principal's when `userId` is given. A never-touched account has NO
 *  row (it reads defaults from `{}`), so an empty result is a real answer, not a miss. */
export async function userSettingsRows(db: Db, userId?: UserId): Promise<UserSettingsRow[]> {
  // Two explicit awaits rather than awaiting a conditional: drizzle's `.where()` returns a different builder
  // type, and the union is not uniformly thenable to the linter.
  const rows = userId === undefined ? await db.select().from(userSettings) : await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return rows.map((r) => ({ userId: r.userId, schemaVersion: r.schemaVersion, config: r.config, updatedAt: r.updatedAt }));
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
function renderPolicyVerdict(stored: RenderPolicyOverride, deployment: DeploymentRenderPolicy | null): RenderPolicyVerdict {
  if (deployment === null) {
    return { stored, deployment: null, resolved: null, cardTier: null };
  }
  const resolved = resolveRenderPolicy(deployment, stored);
  return { stored, deployment, resolved, cardTier: rendersTrustedHtml(resolved.htmlTrust) ? "tierB" : "tierA" };
}

/** One character's full row + its resolved render policy. `null` when the id does not exist. */
// un-principal HOST read (D20). Every caller is `/api/_debug/*`, and the ADMITTED SET there is exactly two things: a holder of the `DEBUG_TOKEN` operator secret (a box-level credential, not a principal at all), or the box owner's SESSION (`debugGateAdmits`, `can(p,'owner',global)`; a delegated `admin` is refused). Both are the box operator, so filtering these reads by the caller's own ownerId would raise the confidentiality bar by zero while breaking the probe's actual job — answering "what does this row hold" about OTHER users' rows for an operator debugging their deployment. There is no per-user principal at this seam to scope BY, and adding one would be a boundary that looks like a control without being one.
//
// THIS EXEMPTION IS ENFORCED, NOT ASSERTED (constitution §2 — a prose-only boundary is a wish). Its whole
// premise is "the gate ran first", and until AUTHFIX-2 (2026-08-07) that premise was FALSE: the gate's admin
// arm admitted the un-credentialed owner fallback, so these reads served anyone who could reach the port.
// The enforcers are `tests/server/entry/debug-gate-admission.int.test.ts` (every AUTH_MODE × Host, through the
// composed root) and the e2e specs over `tests/e2e/support/debug-gate.ts` (each mode's token states). The exemption ENDS if the admitted set ever widens past the box owner:
// any other per-user principal here makes this a cross-tenant read of arbitrary caller-supplied ids, and
// then these reads must take an ownerId and filter on it. Turn that suite red before widening anything.
export async function characterDetailRow(db: Db, characterId: CharacterId, deployment: DeploymentRenderPolicy | null): Promise<CharacterDetailRow | null> {
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
    renderPolicy: renderPolicyVerdict({ trustHtml: r.trustHtml, forbidExternalMedia: r.forbidExternalMedia, interactiveHtml: r.interactiveHtml }, deployment),
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
export async function characterPolicySweep(db: Db, deployment: DeploymentRenderPolicy | null): Promise<CharacterPolicyRow[]> {
  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      handle: characters.handle,
      ownerId: characters.ownerId,
      synthetic: characters.synthetic,
      trustHtml: characters.trustHtml,
      forbidExternalMedia: characters.forbidExternalMedia,
      interactiveHtml: characters.interactiveHtml,
    })
    .from(characters)
    .orderBy(desc(characters.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    handle: r.handle,
    ownerId: r.ownerId,
    synthetic: r.synthetic,
    renderPolicy: renderPolicyVerdict({ trustHtml: r.trustHtml, forbidExternalMedia: r.forbidExternalMedia, interactiveHtml: r.interactiveHtml }, deployment),
  }));
}
