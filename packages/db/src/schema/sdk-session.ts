// schema/sdk-session — the agent-sdk prompt-cache lineage (producer: the agent-sdk backend at
// infra/providers/backends/agent-sdk/session, D8). This is the SDK "chat session" — the backend-internal
// canon-derived cache that makes a stateful claude-agent-sdk turn cheap (the prompt-cache survival). It is
// NOT the BFF browser session (`sessions` table, schema/sessions.ts) — they share only the word "session":
// separate tables, separate homes, separate tiers (core/Spine-Identity-and-Auth.md "BFF session ≠ SDK chat
// session"). The chat
// domain is stateless-first and does NOT own this; only the TABLE lives here (producer-owned schema).
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • D8  — the agent-sdk session store is backend-internal; the lineage is keyed by `chatId`.
//   • D25 — there is NO `chats.sessionId`/`chats.sessionDirty` back-pointer. The session-cache state left
//           the `chats` row entirely; staleness is DETECTED vs canon (re-hash the live canon prefix and
//           compare `canon_hash`), never stored as a `chats` dirty flag. A reseed APPENDS a new lineage
//           entry rather than mutating a pointer (chat.md §"session-as-canon-cache" / §SDK-frame).
//
// No enum columns — an SDK session entry is ids + ordinals + a canon hash + timestamps. Timestamps are
// plain `integer("x_at")` epoch-MS NUMBERS (contracts view timestamps as `number`), born at insert via
// `(unixepoch() * 1000)`.

import type { ChatId, SessionEntryId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { chats } from "./chat";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// session_entries — one persisted agent-sdk session in a chat's prompt-cache lineage (D8). Keyed by
// `chatId` (CASCADE — a deleted chat drops its whole SDK cache). A reseed appends a new entry (the
// deterministic-frame replay means a fresh seed is byte-identical); the lineage is ordered by `seq`, and
// exactly one entry is the live primary at a time (the dual-session reap's `keepPrimary`). Staleness is
// computed vs canon from `seeded_through_seq` + `canon_hash` — there is NO stored dirty flag (D25).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const sessionEntries = sqliteTable(
  "session_entries",
  {
    // TypeID PK (`session_entry_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<SessionEntryId>().primaryKey(),
    // The chat this SDK session caches (D8/D25 — the lineage hangs off the chat, not a `chats.sessionId`
    // back-pointer). CASCADE: a deleted chat drops its session cache.
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The agent-sdk's OWN resume handle — the prompt-cache lineage id the SDK returns and we pass back to
    // resume the cached session next turn. The resume lookup key, so it is UNIQUE. This is NEVER the BFF
    // cookie token (that is `sessions.token_hash`, a different table) — only the SDK's session identifier.
    sdkSessionId: text("sdk_session_id").notNull(),
    // Per-chat monotonic lineage ordinal — the ordering axis. A reseed APPENDS the next ordinal (a new
    // deterministic seed); the highest `seq` is the live lineage head. UNIQUE per chat.
    seq: integer("seq").notNull(),
    // The canon `messages.seq` this seed covered THROUGH — the staleness horizon (canon advanced past it
    // ⇒ resume from the tail / reseed). Mirrors the portable `chats.compactedAtSeq` checkpoint semantics.
    seededThroughSeq: integer("seeded_through_seq").notNull(),
    // A hash of the canon prefix the seed was built from — the staleness GATE (D25 "detected vs canon,
    // not a flag"): re-hash the live canon and compare; a mismatch ⇒ canon diverged ⇒ reseed. Mirrors the
    // `content_hash` staleness pattern on the vector tables.
    canonHash: text("canon_hash").notNull(),
    // The dual-session reap's `keepPrimary` (chat.md §SDK-frame): among a chat's lineage exactly one entry
    // is the live primary; reseeds spawn a secondary that is later reaped. NOT a staleness flag.
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The lineage order + the per-chat ordinal; `seq` is unique within a chat (the chat-cluster pattern).
    uniqueIndex("session_entries_chat_seq_unique").on(t.chatId, t.seq),
    // The reseed/resume lookup key — one entry per agent-sdk session handle.
    uniqueIndex("session_entries_sdk_session_unique").on(t.sdkSessionId),
  ],
);
