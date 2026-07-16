// verb: generateImage — the explicit image-generation surface (imagery-design/04 §2.1). Thin: gate → the
// injected `imagery.generatePicture` op → persist ONE caller-authored message whose body is a STRING with n
// `![alt](asset:<id>)` refs (D51 — a message body is stored as a STRING; render blocks are PARSED at render,
// never stored) → emit `messageCommitted` → return the view. Authorship is the INITIATING principal (§2.2 —
// a user post that happens to contain media; attribution-truthful under D19). Imagery is caller-blind — it
// returns blocks + warnings; chat holds the message-write authority. Reuses the persist/emit pattern of
// `turn.ts` `persistUserMessage` (the D26 canon-write dance + the durable-first bus emit).

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import { batchMany } from "@orb/db/kit";
import type { ChatContext } from "../context";
import type { GenerateImageParams } from "../contract/params";
import type { ChatService } from "../contract/service";
import { requireParticipant } from "../guard";
import { buildCommittedMessageView, insertCanonMessageStatements } from "../persistence/canon-write";
import { loadMaxMessageSeq } from "../persistence/queries";

/** The alt text stamped on each generated-image ref (one home — no scattered magic string). */
const GENERATED_IMAGE_ALT = "generated image";

/** The collaborators not on `ChatContext` (the chat bus emit — chat's own collaborator, wired at the root). */
interface GenerateImageDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
}

export function createGenerateImage(ctx: ChatContext, deps: GenerateImageDeps): Pick<ChatService, "generateImage"> {
  return {
    generateImage: async ({ principal, chatId, mode, prompt, n }: GenerateImageParams): Promise<MessageView> => {
      await requireParticipant(ctx, principal, chatId);
      const picture = await ctx.generatePicture({
        caller: principal,
        chatId,
        mode,
        ...(prompt !== undefined ? { prompt } : {}),
        ...(n !== undefined ? { n } : {}),
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
      // PD user-bus lane: a new image message moved chat-list recency → fan `chatsChanged` (list-only) to every
      // present human member (cross-device + multi-human).
      void ctx.emitChatChanged(chatId);
      return view;
    },
  };
}
