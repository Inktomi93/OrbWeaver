// Composition seam for the imagery domain (chat-facing image gen, prompt-template modes, `/imagine`). Owns no
// business logic — it wires imagery's injected ops onto the already-built sibling front doors (connection role
// resolve, the infra executor, assets store/read, character card reads over a synthetic host principal, the
// summarize role client) and registers the D48 `generate_image` tool into the ONE tool-use registry.
//
// FORWARD-REF: `resolveViewerVisibility` is built AFTER chat (the keystone's chat compose block) but is
// forward-referenced by the `extractQuiet` membrane gate here. It is threaded as a late-bound getter (the
// keystone hands a thunk that derefs the const once chat has composed) — the same late-bind discipline the
// keystone's `materializeBackground`/`embedReindex` holders use to break a genuine construction cycle.

import type { Principal } from "@orb/contracts/identity";
import { IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { UserSettings } from "@orb/contracts/settings";
import { resolveImageryCaption, resolveImageryTemplate } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { ProviderExecutor, Resolved, RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import { generationOf, resolveSideGenSampling } from "@orb/inference";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { ChatUserMacroDefs, ResolveViewerVisibility } from "#domain/chat";
import { createExtractQuiet, resolveTurnIdentity } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { ImageryService, ImageryWarning } from "#domain/imagery";
import { createImageryService, imageryToolDefinitions } from "#domain/imagery";
import { applyStatsDelta } from "#domain/stats";
import type { ToolUseService } from "#domain/tool-use";
import { fetchImageBytes } from "#infra/network";
import { minter } from "./minter.ts";

/** The infra `WarningCode` members that are imagery's concern (mapped onto `ImageryWarning` at the generateImage
 *  op): the whole edit strip (`image_edit_dropped`). The resolve-chat knob codes (sampling/effort/etc.) are not
 *  imagery's and drop. A guard (not a bare `Set.has`) so `w.code` narrows to `ImageryWarning["code"]` — the
 *  mapped result then satisfies the domain result type. */
const IMAGERY_WARNING_CODES = new Set<string>(["image_edit_dropped"]);
function isImageryWarningCode(code: string): code is ImageryWarning["code"] {
  return IMAGERY_WARNING_CODES.has(code);
}

/** What the imagery seam needs from the composition root. `resolveViewerVisibility` is the late-bound
 *  forward-ref (built after chat); the keystone threads it as a getter so the cycle stays broken. */
export interface ImageryComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly connection: Pick<ConnectionService, "resolve">;
  /** The compose-tier executor FENCE (§7.5-1a): imagery may reach exactly `generateImage`. */
  readonly executor: Pick<ProviderExecutor, "generateImage">;
  readonly assets: Pick<AssetsService, "store" | "readOwnedAssetBytes" | "addToGallery">;
  /** The owner-scoped character read the gallery add verb gates on — imagery's auto-add gate reads the same one. */
  readonly characterOwned: (ownerId: UserId, characterId: CharacterId) => Promise<boolean>;
  readonly character: Pick<CharacterService, "getCard" | "get">;
  /** The per-FUNDER role-client binder (§8.5b): the caption + extract-quiet side calls spend the run-as
   *  principal's own `summarize` row. */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "summarize">>;
  /** The chat's present host: the room a preview runs as (D298). */
  readonly resolveChatHostUserId: (chatId: ChatId) => Promise<UserId | null>;
  /** Is the character a present character seat of the chat? A preview's subject must be (`createCharacterSeated`). */
  readonly isCharacterSeated: (chatId: ChatId, characterId: CharacterId) => Promise<boolean>;
  /** The row-derived host Principal (`createHostPrincipalResolver`), so a run-as principal carries its real role. */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  /** The run-as principal's default-preset generation params (the side-gen sampling ladder's middle rung — caption). */
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
  /** The chat host's default-preset params (the side-gen ladder's middle rung — extract-quiet is chat-scoped). */
  readonly resolveChatPresetParams: (chatId: ChatId) => Promise<SideGenSampling>;
  /** IMGMAC — late-bound (chat + rpg both compose after imagery): the chat's authored user-macro defs from
   *  BOTH homes, so an imagery mode template resolves `{{house_style}}` the way a turn does. Deref'd only at
   *  request time inside `extractQuiet`, exactly like `resolveViewerVisibility` below. */
  readonly resolveUserMacroDefs: (chatId: ChatId) => Promise<ChatUserMacroDefs>;
  /** ⑫ — the run-as principal's UserSettings read (the FOREIGN-inputs seam) for the per-mode
   *  prompt-template/caption overrides. Imagery resolves `override ?? shipped-catalog-default` off this. */
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
  readonly maxImageBytes: () => number;
  /** Late-bound: chat's `resolveViewerVisibility` (built after chat). Deref'd only at request time inside the
   *  `extractQuiet` gate — never during boot. */
  readonly resolveViewerVisibility: ResolveViewerVisibility;
  readonly toolUse: Pick<ToolUseService, "register">;
}

/** Is `characterId` a present character seat of `chatId`? The roster a room preview's subject must come from. */
export function createCharacterSeated(db: Db): (chatId: ChatId, characterId: CharacterId) => Promise<boolean> {
  return async (chatId, characterId) => {
    const rows = await db
      .select({ id: chatParticipants.id })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.kind, "character"),
          eq(chatParticipants.characterId, characterId),
          isNull(chatParticipants.leftSeq),
        ),
      )
      .limit(1);
    return rows.length > 0;
  };
}

export function buildImagery(deps: ImageryComposeDeps): ImageryService {
  const { db, now, connection, executor, assets, character, roleClientsFor } = deps;

  // The synthetic host principal for the extraction shaper's card reads (the chat.ts hostPrincipal precedent —
  // role-irrelevant getCard reads under the room host's ownership).
  // @orb-waive one-principal-mint-population(Principal): synthetic role-irrelevant principal for imagery card reads; ends when a shared factory replaces it
  const imageryCardPrincipal = (userId: UserId): Principal => ({ userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "fallback" });

  const imagery = createImageryService({
    db,
    now,
    newGenerationId: minter(ID_PREFIX.imageryGeneration),
    newCallId: minter(ID_PREFIX.imageryCall),
    resolveGenerateImage: async (runAs, actor) => {
      const { resolved } = await connection.resolve({ task: "generateImage", principal: runAs, ...(actor !== undefined ? { actor } : {}) });
      return { connection: resolved as Resolved<"generateImage">, capability: generationOf(resolved) };
    },
    generateImage: async (req) => {
      const result = await executor.generateImage(req);
      // Map the infra runner's edit-strip belt warnings (`ResolvedWarning{code,message}`) onto the domain's
      // `ImageryWarning{code,detail}` — imagery never imports `#infra` types. The image concern is the whole
      // edit strip (`image_edit_dropped`); the resolve-chat knob codes (sampling/effort/etc.) are not imagery's
      // and drop.
      return {
        images: result.images,
        model: result.model,
        usage: result.usage,
        warnings: result.warnings.flatMap((w) => (isImageryWarningCode(w.code) ? [{ code: w.code, detail: w.message }] : [])),
      };
    },
    // The provider URL is attacker-influenceable; safeFetch's total deadline bounds the body read (no
    // unbounded slow-loris). `fetchImageBytes` accepts an optional caller/workload signal (3rd arg) — none
    // flows through the imagery `fetchImage(url)` port today (it can't ride the zod wire params); threading
    // a per-turn signal is a follow-up in the imagery/chat contracts.
    fetchImage: (url) => fetchImageBytes(url, deps.maxImageBytes()),
    resolveRunAs: (runAsUserId) => deps.resolveHostPrincipal(runAsUserId),
    // D298: a preview runs as the room host. The visibility gate runs first, so a caller the room does
    // not admit reaches no host read and spends nothing of the host's; the turn identity is the one home of
    // "the host funds and runs as".
    resolveRoomRunAs: async (caller, chatId, subjectCharacterId) => {
      if ((await deps.resolveViewerVisibility(chatId, caller.userId)) === null) {
        throw new DomainNotFoundError("chat", chatId);
      }
      // The host's card reads and Utility spend follow the subject, so it must be one of this room's
      // characters: otherwise a member could name, or caption, any character the host owns.
      if (subjectCharacterId !== undefined && !(await deps.isCharacterSeated(chatId, subjectCharacterId))) {
        throw new DomainNotFoundError("character", subjectCharacterId);
      }
      const hostUserId = await deps.resolveChatHostUserId(chatId);
      if (hostUserId === null) {
        throw new Error(`imagery: chat ${chatId} has no host to run the preview as`);
      }
      const { runAsUserId } = resolveTurnIdentity({ principalUserId: caller.userId, hostUserId });
      return runAsUserId === caller.userId ? caller : await deps.resolveHostPrincipal(runAsUserId);
    },
    storeAsset: (owner, bytes, kind, mime) => assets.store({ principal: owner, bytes, kind, mime, enforceMagic: true }),
    // The chat-owned quiet extraction shaper (imagery I1, doc 02 §2): chat windows recent canon + resolves
    // {{char}}/{{user}}, then runs the summarize side-LLM. getCard adapts the ownerId shape via a synthetic
    // host principal (the chat.ts hostPrincipal precedent — cards read under the room host's ownership).
    // MEMBERSHIP GATE (cross-tenant-sweep-enforced): the shaper reads the chat's canon history, and
    // `imagery.extractPrompt` is a CHAT-scoped op with no asset-owner join to gate on (unlike editImage/
    // readProvenance) — so a non-member caller is refused with a leak-free NOT_FOUND BEFORE any history read.
    extractQuiet: (() => {
      const base = createExtractQuiet({
        db,
        now,
        summarize: async (funderUserId, ...args) => (await roleClientsFor(funderUserId)).summarize(...args),
        getCard: ({ ownerId, characterId }) => character.getCard({ principal: imageryCardPrincipal(ownerId), characterId }),
        resolveChatPresetParams: deps.resolveChatPresetParams,
        // IMGMAC — the user-macro plane the mode templates resolve against (late-bound: chat + rpg compose
        // after imagery, and this is only ever deref'd at request time).
        resolveUserMacroDefs: deps.resolveUserMacroDefs,
      });
      return async ({ caller, ...rest }) => {
        // MEMBERSHIP *AND* THE FLOOR — one op, one answer. The old gate was `loadPresentRole !== null`
        // (membership only), which admitted a `from-join`-clamped member and then let the extractor read the
        // room's last rows unfloored: `imagery.extractPrompt` hands the model's distillation of those rows
        // straight back on the wire, so a clamped caller could read a summary of canon their own
        // `listMessages` withholds. `null` ⇒ the same leak-free NOT_FOUND as before.
        const visibility = await deps.resolveViewerVisibility(rest.chatId, caller.userId);
        if (visibility === null) {
          throw new DomainNotFoundError("chat", rest.chatId);
        }
        return base({ ...rest, historyFloorSeq: visibility.historyFloorSeq });
      };
    })(),
    // The ONE vision caption op (D45/D47-6): the multimodal template + the avatar bytes over the summarize
    // lane (IC-B: runSummarize forwards images as multimodal content parts).
    captionImage: async ({ runAs, instruction, bytes }): Promise<{ text: string; costUsd: number | null }> => {
      // The side-gen sampling ladder: the `caption` floor (temperature 0.2, maxOutputTokens 512) ← the
      // run-as principal's default-preset params. A user with no preset params gets the floor; a user WITH
      // preset params overrides it through the ladder.
      const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.caption, await deps.resolveUserPresetParams(runAs.userId));
      const rc = await roleClientsFor(runAs.userId);
      const res = await rc.summarize([{ systemPrompt: instruction, userPrompt: "Describe the attached image.", images: [bytes] }], posture);
      const item = res.items[0];
      return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
    },
    // ⑫ — the run-as principal's per-mode prompt-template / caption-instruction: its UserSettings.imagery
    // override ⊕ the shipped `@orb/contracts/imagery` catalog default (the FOREIGN-inputs seam — imagery
    // delegates the settings read). Unset ⇒ byte-identical to the shipped default.
    resolvePromptTemplate: async (runAs, mode) => resolveImageryTemplate((await deps.loadUserSettings(runAs.userId)).imagery, mode),
    resolveCaptionInstruction: async (runAs, mode) => resolveImageryCaption((await deps.loadUserSettings(runAs.userId)).imagery, mode),
    // PROSE-1 census 88 — the negative-prompt base off the run-as principal's `UserSettings.prose` (same
    // seam, same scoping as its template siblings). No override ⇒ the shipped catalog bytes.
    resolveNegativeBase: async (runAs) => resolveProseText(IMAGERY_NEGATIVE_SLOT_ID, (await deps.loadUserSettings(runAs.userId)).prose),
    // EC-B owner-gated byte read (the caller owns the asset it references).
    readAsset: (caller, assetId) => assets.readOwnedAssetBytes(caller, assetId),

    // character.get under the CALLER's ownership (imagery passes a real Principal) — the full CharacterDetail
    // (avatarAssetId for B3/caption + the row's contentHash for the I3 identity hash). Throws
    // CharacterNotFoundError on missing/foreign; imagery does not re-gate.
    getCard: (caller, characterId) => character.get({ principal: caller, characterId }),
    ownsCharacter: deps.characterOwned,
    // The picture is its owner's asset (stored under the run-as principal above), so the add runs under that
    // principal and lands in that principal's gallery only.
    addToGallery: async (owner, assetId, subjectCharacterId): Promise<void> => {
      await assets.addToGallery({ principal: owner, assetId, subjectCharacterId });
    },
    applyStatsDelta,
  });

  // The D48 `generate_image` tool — registered into the SAME one registry buddy joined
  // above (additive; rpg registers its own tools later). The handler closes over `imagery.generatePicture` and
  // reads the acting principal + chat from the per-turn exec context. The automation `generate_image` action
  // arm is a separate consumer of the same op + schema.
  for (const def of imageryToolDefinitions({ generatePicture: imagery.generatePicture })) {
    deps.toolUse.register(def);
  }

  return imagery;
}
