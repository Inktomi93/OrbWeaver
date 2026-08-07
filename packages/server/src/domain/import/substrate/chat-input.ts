// domain/import/substrate/chat-input — pure ST→canonical mapping: translate a parsed ST chat into the
// canonical BulkImportChatInput that chat's injected bulkImportChats op writes. Zero I/O; owning chat
// domain never sees SillyTavern. updatedAt = max(send_dates), not last and not import `now`; the selected
// variant's content is always the rendered `mes`, even when the active swipe was empty-dropped.

import type { BulkImportChatInput, BulkImportMessageInput, BulkImportVariantInput } from "@orb/contracts/chat";
import type { PersonaId } from "@orb/kit/ids";
import type { ParsedChatMessage } from "#kit/serde/chat";
import type { CollectedChat } from "../contract/views.ts";

const JSONL_EXT = /\.jsonl$/i;

/** Multi-swipe message uses its swipe pool; when the active swipe was empty-dropped or there is no pool,
 *  a variant carrying the rendered `mes` is appended and selected. */
function buildVariantColumns(m: ParsedChatMessage): {
  readonly variants: BulkImportVariantInput[];
  readonly selectedIdx: number;
} {
  if (m.variants.length > 0 && m.activeVariantIdx !== null) {
    const variants = m.variants.map(
      (v): BulkImportVariantInput => ({
        idx: v.idx,
        content: v.content,
        model: v.model,
        provider: v.provider,
        tokensOut: v.tokensOut,
        reasoning: v.reasoning,
        ttftMs: null,
        genStartedAt: v.genStarted,
        genFinishedAt: v.genFinished,
        metadata: v.metadata,
      }),
    );
    const selected = variants[m.activeVariantIdx];
    if (selected !== undefined) {
      return {
        variants: variants.map((v) => (v.idx === m.activeVariantIdx ? { ...v, ttftMs: m.ttftMs } : v)),
        selectedIdx: m.activeVariantIdx,
      };
    }
  }
  const alternates = m.variants.map(
    (v): BulkImportVariantInput => ({
      idx: v.idx,
      content: v.content,
      model: v.model,
      provider: v.provider,
      tokensOut: v.tokensOut,
      reasoning: v.reasoning,
      ttftMs: null,
      genStartedAt: v.genStarted,
      genFinishedAt: v.genFinished,
      metadata: v.metadata,
    }),
  );
  const mesIdx = alternates.length;
  alternates.push({
    idx: mesIdx,
    content: m.content,
    model: m.model,
    provider: m.provider,
    tokensOut: m.tokensOut,
    reasoning: m.reasoning,
    ttftMs: m.ttftMs,
    genStartedAt: m.genStarted,
    genFinishedAt: m.genFinished,
    metadata: m.metadata,
  });
  return { variants: alternates, selectedIdx: mesIdx };
}

/** A user turn credits the pre-resolved chat persona; other roles carry no persona. The parsed row's DECLARED
 *  kind (D129) rides through unchanged — the serde already resolved it (`extra.type`, defaulting to `standard`
 *  for a plain ST transcript), and re-deriving it here would be a second, divergeable answer. */
function toMessageInput(m: ParsedChatMessage, createdAt: number, chatPersonaId: PersonaId | null): BulkImportMessageInput {
  const { variants, selectedIdx } = buildVariantColumns(m);
  return {
    role: m.role,
    kind: m.kind,
    createdAt,
    personaId: m.role === "user" ? chatPersonaId : null,
    variants,
    selectedIdx,
  };
}

/** createDate is the filename date first, then the first message send date, then `now`. */
export function buildBulkImportChatInput(
  ci: CollectedChat,
  deps: {
    readonly now: () => number;
    readonly personaByUserName: Map<string, PersonaId>;
  },
): BulkImportChatInput {
  const pc = ci.parsed;
  const created = pc.createDate ?? pc.messages.find((m) => m.sendDate !== null)?.sendDate ?? deps.now();
  const sendDates = pc.messages.flatMap((m) => (m.sendDate !== null ? [m.sendDate] : []));
  const updatedAt = sendDates.length > 0 ? Math.max(...sendDates) : created;
  const key = pc.userName?.trim().toLowerCase();
  const chatPersonaId: PersonaId | null = (key !== undefined && deps.personaByUserName.get(key)) || null;

  return {
    title: ci.importedFrom.replace(JSONL_EXT, ""),
    importedFrom: ci.importedFrom,
    importHash: ci.importHash,
    anchorPersonaId: chatPersonaId,
    createdAt: created,
    updatedAt,
    parentRef: pc.parentRef,
    authorsNote: pc.notePrompt,
    isRealConversation: pc.bucket === "real_conversation",
    messages: pc.messages.map((m) => toMessageInput(m, m.sendDate ?? created, chatPersonaId)),
  };
}
