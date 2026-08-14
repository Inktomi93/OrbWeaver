// verb: generateImage — the explicit image-generation surface (imagery-design/04 §2.1). Thin: gate → the
// injected `imagery.generatePicture` op → persist ONE caller-authored message whose body is a STRING with n
// `![alt](asset:<id>)` refs (D51 — a message body is stored as a STRING; render blocks are PARSED at render,
// never stored) → emit `messageCommitted` → return the view. Authorship is the INITIATING principal (§2.2 —
// a user post that happens to contain media; attribution-truthful under D19). Imagery is caller-blind — it
// returns blocks + warnings; chat holds the message-write authority. Reuses the persist/emit pattern of
// `turn.ts` `persistUserMessage` (the D26 canon-write dance + the durable-first bus emit).

import type { ChatWarningCode, DurableChatBusEvent, MessageView } from "@orb/contracts/chat";
import { batchMany } from "@orb/db/kit";
import type { ChatContext } from "../context.ts";
import type { ClaimChatOp } from "../contract/context.ts";
import type { GenerateImageParams } from "../contract/params.ts";
import type { ChatService } from "../contract/service.ts";
import { requireParticipant } from "../guard.ts";
import { buildCommittedMessageView, insertCanonMessageStatements } from "../persistence/canon-write.ts";
import { loadMaxMessageSeq } from "../persistence/queries.ts";

/** The alt text stamped on each generated-image ref (one home — no scattered magic string). */
const GENERATED_IMAGE_ALT = "generated image";

/** Chat OWNS its bus warning vocabulary: it maps imagery's native warning codes onto its own `ChatWarningCode`
 *  (the turnAbortNotice precedent — a foreign domain never dictates chat's bus codes). An unmapped imagery code
 *  is dropped rather than emitted as an unknown code. The imagery drop code (imagery-design/03 §2):
 *  `image_edit_dropped` = the whole edit strip. The code is spelled identically across the two vocabularies —
 *  a match against this compile-checked `ChatWarningCode` subset yields the chat code (no re-spell). */
const IMAGERY_WARNING_CODES: readonly ChatWarningCode[] = ["image_edit_dropped"];

function toChatWarningCode(imageryCode: string): ChatWarningCode | null {
  return IMAGERY_WARNING_CODES.find((code) => code === imageryCode) ?? null;
}

/** The collaborators not on `ChatContext` (the chat bus emit — chat's own collaborator, wired at the root). */
interface GenerateImageDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
  /** The husk→real transition (R0) -- an image generation commits a caller-authored row, so it claims. */
  readonly claimChat: ClaimChatOp;
}

export function createGenerateImage(ctx: ChatContext, deps: GenerateImageDeps): Pick<ChatService, "generateImage"> {
  return {
    generateImage: async ({ principal, chatId, mode, prompt, n, size }: GenerateImageParams): Promise<MessageView> => {
      await requireParticipant(ctx, principal, chatId);
      await deps.claimChat(chatId);
      const picture = await ctx.generatePicture({
        caller: principal,
        chatId,
        mode,
        ...(prompt !== undefined ? { prompt } : {}),
        ...(n !== undefined ? { n } : {}),
        ...(size !== undefined ? { size } : {}),
      });

      // ONE message body STRING: the prompt (if any) + one markdown image ref per generated asset (D51).
      const refs = picture.images.map((img) => `![${GENERATED_IMAGE_ALT}](asset:${img.assetId})`).join("\n");
      const trimmed = prompt?.trim() ?? "";
      const body = trimmed.length > 0 ? `${trimmed}\n\n${refs}` : refs;

      const seq = await loadMaxMessageSeq(ctx.db, chatId);
      const params = {
        messageId: ctx.newMessageId(),
        variantId: ctx.newMessageVariantId(),
        chatId,
        seq: seq + 1,
        role: "user" as const,
        authorUserId: principal.userId,
        personaId: null,
        now: ctx.now(),
        variant: { content: body },
      };
      await ctx.db.batch(batchMany(insertCanonMessageStatements(ctx.db, params)));
      const view = buildCommittedMessageView(params);
      await deps.emit({ type: "messageCommitted", chatId, messageId: view.id, view });
      // Surface any imagery warning (e.g. an avatar reference / edit dropped for a non-edit model — doc 03 §2)
      // onto the one chat `warning` bus so the client can render a notice; the message itself still committed.
      await Promise.all(
        picture.warnings.flatMap((warning) => {
          const code = toChatWarningCode(warning.code);
          return code === null ? [] : [deps.emit({ type: "warning", chatId, code })];
        }),
      );
      // PD user-bus lane: a new image message moved chat-list recency → fan `chatsChanged` (list-only) to every
      // present human member (cross-device + multi-human).
      void ctx.emitChatChanged(chatId);
      return view;
    },
  };
}
