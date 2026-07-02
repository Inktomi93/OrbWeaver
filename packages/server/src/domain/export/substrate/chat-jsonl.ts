// domain/export/substrate/chat-jsonl — the chat transcript OUT builders (export.md §8-slot; PD-42). PURE,
// server-only, export-local: typed canon in → JSONL / TXT string out; `verbs/export-chat.ts` maps the DB
// rows to the `ExportChatMeta`/`ExportMessage` inputs (contract/params.ts — the one type home).
//
// The ST-compat esoterics (export.md §Esoteric — preserve exactly):
//   • ST HUMAN DATE (`formatStDate`): dates emit in the legacy human form ("August 27, 2025 6:36pm", UTC)
//     so a vanilla legacy reader renders a readable date; the importer's parseStDate handles this form, so
//     our own round-trip is unaffected.
//   • SWIPE ARRAYS ONLY WHEN >1 VARIANT: `swipes`/`swipe_id`/`swipe_info` are emitted only when a message
//     has more than one variant — matching the parser's `swipes.length > 1` gate. A single-variant turn
//     stays clean and re-imports without a swipe array.
//   • TXT = THE ACTIVE VARIANT ONLY: a transcript shows what was said, not the re-rolls.
//   • BRANCH + NOTE ROUND-TRIP: `main_chat` = the parent chat's imported source filename (the relink key);
//     `note_prompt` = the author's note. Both omitted when null (a clean chat stays clean).

import type { ExportChatMeta, ExportMessage } from "../contract/params";

const ST_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const NOON_HOUR = 12;

/** Format an epoch-ms instant as ST's human send_date string, UTC. e.g. "August 27, 2025 6:36pm". */
export function formatStDate(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) {
    return null;
  }
  const d = new Date(ms);
  const month = ST_MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hour24 = d.getUTCHours();
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const ap = hour24 >= NOON_HOUR ? "pm" : "am";
  const hour12 = hour24 % NOON_HOUR === 0 ? NOON_HOUR : hour24 % NOON_HOUR;
  return `${month} ${day}, ${year} ${hour12}:${minute}${ap}`;
}

/**
 * Serialize a chat's canon to the ST chat-JSONL interchange (the inverse of the chat importer). One header
 * line (user/character names + create_date + the branch/note metadata), then one line per message. Swipe
 * arrays only when a message carries >1 variant (file header). PURE.
 */
export function buildChatJsonl(meta: ExportChatMeta, messages: readonly ExportMessage[]): string {
  const header = {
    user_name: meta.userName,
    character_name: meta.characterName,
    create_date: formatStDate(meta.createDate),
    chat_metadata: {
      ...(meta.parentRef !== null && meta.parentRef !== undefined
        ? { main_chat: meta.parentRef }
        : {}),
      ...(meta.notePrompt !== null && meta.notePrompt !== undefined
        ? { note_prompt: meta.notePrompt }
        : {}),
    },
  };

  const lines = [JSON.stringify(header)];
  for (const m of messages) {
    const hasVariants = m.variants.length > 1;
    const line = {
      // The PER-MESSAGE speaker (Part III group fidelity) — the voicing character / authoring persona of THIS
      // turn, resolved by the verb; NOT the single header `characterName`. A legacy ST group reader keys on
      // this `name` field per line.
      name: m.speakerName,
      is_user: m.role === "user",
      is_system: m.role === "system",
      mes: m.content,
      send_date: formatStDate(m.sendDate ?? meta.createDate),
      // `reasoning` is the ST thinking-trace field (import reads it back via extra.reasoning); only
      // emitted when present so a no-reasoning turn stays clean and re-imports as null.
      extra: {
        model: m.model,
        api: m.provider,
        token_count: m.tokensOut,
        ...(m.reasoning !== null ? { reasoning: m.reasoning } : {}),
      },
      gen_started: m.genStarted,
      gen_finished: m.genFinished,
      // Swipe arrays only when >1 variant (matches the parser's `swipes.length > 1` gate).
      ...(hasVariants
        ? {
            swipes: m.variants.map((v) => v.content),
            swipe_id: m.activeVariantIdx ?? 0,
            swipe_info: m.variants.map((v) => ({
              extra: {
                model: v.model,
                api: v.provider,
                token_count: v.tokensOut,
                ...(v.reasoning !== null ? { reasoning: v.reasoning } : {}),
              },
              gen_started: v.genStarted,
              gen_finished: v.genFinished,
            })),
          }
        : {}),
    };
    lines.push(JSON.stringify(line));
  }
  return `${lines.join("\n")}\n`;
}

/** Speaker label for the plain-text transcript: the per-message speaker name (Part III group fidelity — the
 *  authoring persona / voicing character of THIS turn), with "System" reserved for system turns. */
function txtAuthor(m: ExportMessage): string {
  return m.role === "system" ? "System" : m.speakerName;
}

/**
 * Serialize a chat's canon to a human-readable plain-text transcript — the `txt` export format. One
 * `Author: message` block per turn, blank line between. Only the ACTIVE variant's text is emitted (a
 * transcript shows what was said, not the re-rolls). PURE.
 */
export function buildChatTxt(_meta: ExportChatMeta, messages: readonly ExportMessage[]): string {
  const blocks = messages.map((m) => `${txtAuthor(m)}: ${m.content}`);
  return `${blocks.join("\n\n")}\n`;
}
