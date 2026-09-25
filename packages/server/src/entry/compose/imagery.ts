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
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ProviderExecutor, Resolved, RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import { generationOf, resolveSideGenSampling } from "@orb/inference";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import type { AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { ChatUserMacroDefs, ResolveViewerVisibility } from "#domain/chat";
import { createExtractQuiet } from "#domain/chat";
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
  readonly assets: Pick<AssetsService, "store" | "readOwnedAssetBytes">;
  readonly character: Pick<CharacterService, "getCard" | "get">;
  /** The per-FUNDER role-client binder (§8.5b): the caption + extract-quiet side calls spend the caller's /
   *  the trigger's own `summarize` row. */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "summarize">>;
  /** The caller's default-preset generation params (the side-gen sampling ladder's middle rung — caption). */
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
  /** The chat host's default-preset params (the side-gen ladder's middle rung — extract-quiet is chat-scoped). */
  readonly resolveChatPresetParams: (chatId: ChatId) => Promise<SideGenSampling>;
  /** IMGMAC — late-bound (chat + rpg both compose after imagery): the chat's authored user-macro defs from
   *  BOTH homes, so an imagery mode template resolves `{{house_style}}` the way a turn does. Deref'd only at
   *  request time inside `extractQuiet`, exactly like `resolveViewerVisibility` below. */
  readonly resolveUserMacroDefs: (chatId: ChatId) => Promise<ChatUserMacroDefs>;
  /** ⑫ — the caller's UserSettings read (the FOREIGN-inputs seam) for the per-mode prompt-template/caption
   *  overrides. Imagery resolves `override ?? shipped-catalog-default` off this. */
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
  readonly maxImageBytes: () => number;
  /** Late-bound: chat's `resolveViewerVisibility` (built after chat). Deref'd only at request time inside the
   *  `extractQuiet` gate — never during boot. */
  readonly resolveViewerVisibility: ResolveViewerVisibility;
  readonly toolUse: Pick<ToolUseService, "register">;
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
    resolveGenerateImage: async (caller) => {
      const { resolved } = await connection.resolve({ task: "generateImage", principal: caller });
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
    storeAsset: (caller, bytes, kind, mime) => assets.store({ principal: caller, bytes, kind, mime, enforceMagic: true }),
    // The chat-owned quiet extraction shaper (imagery I1, doc 02 §2): chat windows recent canon + resolves
    // {{char}}/{{user}}, then runs the summarize side-LLM. getCard adapts the ownerId shape via a synthetic
    // host principal (the chat.ts hostPrincipal precedent — cards read under the room host's ownership).
    // MEMBERSHIP GATE (cross-tenant-sweep-enforced): the shaper reads the chat's canon history, and
    // `imagery.extractPrompt` is a CHAT-scoped op with no asset-owner join to gate on (unlike editImage/
    // readProvenance) — so a non-member caller is refused with a leak-free NOT_FOUND BEFORE any history read.
    extractQuiet: (() => {
      const base = createExtractQuiet({
        db,
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
        return base({ ...rest, funderUserId: caller.userId, historyFloorSeq: visibility.historyFloorSeq });
      };
    })(),
    // The ONE vision caption op (D45/D47-6): the multimodal template + the avatar bytes over the summarize
    // lane (IC-B: runSummarize forwards images as multimodal content parts).
    captionImage: async ({ caller, instruction, bytes }): Promise<{ text: string; costUsd: number | null }> => {
      // The side-gen sampling ladder: the `caption` floor (temperature 0.2, maxOutputTokens 512) ← the
      // caller's default-preset params. A user with no preset params gets the floor; a user WITH preset
      // params overrides it through the ladder.
      const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.caption, await deps.resolveUserPresetParams(caller.userId));
      const rc = await roleClientsFor(caller.userId);
      const res = await rc.summarize([{ systemPrompt: instruction, userPrompt: "Describe the attached image.", images: [bytes] }], posture);
      const item = res.items[0];
      return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
    },
    // ⑫ — the caller's per-mode prompt-template / caption-instruction: their UserSettings.imagery override ⊕
    // the shipped `@orb/contracts/imagery` catalog default (the FOREIGN-inputs seam — imagery delegates the
    // settings read). Unset ⇒ byte-identical to the shipped default.
    resolvePromptTemplate: async (caller, mode) => resolveImageryTemplate((await deps.loadUserSettings(caller.userId)).imagery, mode),
    resolveCaptionInstruction: async (caller, mode) => resolveImageryCaption((await deps.loadUserSettings(caller.userId)).imagery, mode),
    // PROSE-1 census 88 — the negative-prompt base off the caller's `UserSettings.prose` (same seam, same
    // caller scoping as its template siblings). No override ⇒ the shipped catalog bytes.
    resolveNegativeBase: async (caller) => resolveProseText(IMAGERY_NEGATIVE_SLOT_ID, (await deps.loadUserSettings(caller.userId)).prose),
    // EC-B owner-gated byte read (the caller owns the asset it references).
    readAsset: (caller, assetId) => assets.readOwnedAssetBytes(caller, assetId),

    // character.get under the CALLER's ownership (imagery passes a real Principal) — the full CharacterDetail
    // (avatarAssetId for B3/caption + the row's contentHash for the I3 identity hash). Throws
    // CharacterNotFoundError on missing/foreign; imagery does not re-gate.
    getCard: (caller, characterId) => character.get({ principal: caller, characterId }),
    recordStats: async (delta): Promise<void> => {
      const batch: BatchStmt[] = [];
      applyStatsDelta(batch, db, delta);
      if (batch.length > 0) {
        await db.batch(batchMany(batch));
      }
    },
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
