// domain/import/substrate/chat-input — PURE ST→canonical mapping (Option B; PD-77): translate a parsed ST
// chat (`ParsedChat`, import-owned) into the canonical `BulkImportChatInput` (`@orb/contracts/chat`) that
// `chat`'s injected `bulkImportChats` op writes. This is `import`'s ST-INTERPRETATION job — the owning chat
// domain never sees SillyTavern. Zero I/O (substrate); the only injected input is `now` (the ST date
// fallback) + the `personaByUserName` attribution map.
//
// LOAD-BEARING ST esoterica carried here (were in the old `persistence/chat-writer.ts`):
//   • esoterica 2 — `updatedAt = Math.max(send_dates)` (NON-monotonic → max, not last), NOT import `now`.
//   • esoterica 3 — `buildVariantColumns`: the ST swipe pool → the D26 variant rows + the selected index;
//     when the active swipe was empty-dropped (or there is no pool), a variant carrying the rendered `mes`
//     is appended AND selected — so the selected content is ALWAYS `mes`. `ttftMs` (message-level in ST)
//     rides on the selected variant.

import type {
  BulkImportChatInput,
  BulkImportMessageInput,
  BulkImportVariantInput,
} from "@orb/contracts/chat";
import type { PersonaId } from "@orb/kit/ids";
import type { ParsedChatMessage } from "#kit/serde/chat";
import type { CollectedChat } from "../contract/views";

// The imported-chat title is the source filename minus its `.jsonl` extension (top-level per useTopLevelRegex).
const JSONL_EXT = /\.jsonl$/i;

/** Build the D26 variant pool + the selected index for a parsed message. A multi-swipe message uses its
 *  swipe pool; when the active swipe was empty-dropped (`activeVariantIdx` null) OR there is no pool, a
 *  variant carrying the rendered `mes` + the message-level economics is appended and selected. */
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
      // ST's active swipe IS the rendered `mes`; the message-level ttft belongs to that generation.
      return {
        variants: variants.map((v) =>
          v.idx === m.activeVariantIdx ? { ...v, ttftMs: m.ttftMs } : v,
        ),
        selectedIdx: m.activeVariantIdx,
      };
    }
  }
  // No pool, or the active swipe was empty-dropped: the swipe pool (if any) rides as alternates + a `mes`
  // variant is appended and selected (esoterica 3 — `mes` is authoritative regardless).
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

/** Map ONE parsed message → the canonical `BulkImportMessageInput`. Attribution: a user turn credits the
 *  pre-resolved chat persona (chat stamps the owner as `authorUserId`); other roles carry no persona. */
function toMessageInput(
  m: ParsedChatMessage,
  createdAt: number,
  chatPersonaId: PersonaId | null,
): BulkImportMessageInput {
  const { variants, selectedIdx } = buildVariantColumns(m);
  return {
    role: m.role,
    createdAt,
    personaId: m.role === "user" ? chatPersonaId : null,
    variants,
    selectedIdx,
  };
}

/**
 * Translate one collected ST chat → the canonical `BulkImportChatInput`. `createDate` is the FILENAME date
 * first (esoterica 1, resolved in the parser), then the first message send date, then `now` (the ST-date
 * fallback). `updatedAt` = `Math.max(send_dates)` (esoterica 2). `personaByUserName` attributes the chat's
 * `user_name` to the persona the user RP'd as.
 */
export function buildBulkImportChatInput(
  ci: CollectedChat,
  deps: {
    readonly now: () => number;
    readonly personaByUserName: Map<string, PersonaId>;
  },
): BulkImportChatInput {
  const pc = ci.parsed;
  const created =
    pc.createDate ?? pc.messages.find((m) => m.sendDate !== null)?.sendDate ?? deps.now();
  const sendDates = pc.messages.flatMap((m) => (m.sendDate !== null ? [m.sendDate] : []));
  const updatedAt = sendDates.length > 0 ? Math.max(...sendDates) : created;
  const key = pc.userName?.trim().toLowerCase();
  const chatPersonaId: PersonaId | null =
    (key !== undefined && deps.personaByUserName.get(key)) || null;

  return {
    title: ci.importedFrom.replace(JSONL_EXT, ""),
    importedFrom: ci.importedFrom,
    importHash: ci.importHash,
    anchorPersonaId: chatPersonaId,
    createdAt: created,
    updatedAt,
    parentRef: pc.parentRef,
    // ST `note_prompt` → the typed room author's note (export-chat.ts reads it back from here; the SUPERSET
    // round-trip). Plain ST without a note arrives null.
    authorsNote: pc.notePrompt,
    isRealConversation: pc.bucket === "real_conversation",
    messages: pc.messages.map((m) => toMessageInput(m, m.sendDate ?? created, chatPersonaId)),
  };
}
