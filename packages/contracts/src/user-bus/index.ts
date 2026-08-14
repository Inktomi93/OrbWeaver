// @orb/contracts/user-bus — the per-USER "an entity you own changed" live stream (PD user-bus lane). The
// QueryClient runs `staleTime: Infinity` — "the bus drives freshness" — but the only pre-existing bus is the
// per-CHAT stream (`ChatBusEvent`), which reaches only subscribers of the OPEN chat. Every non-chat domain
// read (characters, personas, presets, world-info, user settings, themes, tags, credentials, the chat LIST)
// had NO freshness driver: device B's edit never reached device A. This union is that driver — one COARSE
// member per domain-noun, carrying an optional entity id (a targeting hint; the client map may path-invalidate
// the whole domain regardless). It is LIVE-ONLY (no durable table, no replay) — a subscriber attaches and goes
// live, and the client gap-heals on every (re)connect with a blanket invalidate.
//
// MEMBERSHIP is derived from an AUDIT of the user-level mutating verbs that exist TODAY. The
// `user-bus-coverage` gate flags a declared-never-emitted member as dead wire (both directions) — so every
// member below EITHER has a real server emit site OR is a cited DEFERRED entry in that gate.
//   • `connection` is DEFERRED, not omitted: it has no per-user entity CRUD today (the model catalog is
//     global/admin — `refreshCatalog`; a user's provider/role routing lives in USER SETTINGS →
//     `settingsChanged`), so `connectionsChanged` is DECLARED but not yet emitted (the gate's DEFERRED
//     allowlist carries the citation; when the per-user connection store (FLAG[PD-149], owner-deferred) lands, wire the emit + delete the
//     DEFERRED entry). Kept in the union so the client map + the coverage ratchet track it explicitly.
//   • `themes` ride their own member though they live inside the `settings` domain (a distinct client read
//     surface — the theme list — with its own emit sites in `settings/verbs/*-theme.ts`).
//   • `settings` / `connection` carry NO id (a user has ONE settings blob; connection has no per-user row).
//   • `refinery` is the member the coverage survey's H1 forced (docs/design/event-bus-coverage-survey.md
//     §2.2/F1): refinery shipped 15 mutating verbs with ZERO emits on any plane, so at `staleTime: Infinity`
//     a second tab/device sat on the pre-write roster forever. Sessions and schemas are single-owned
//     per-user rows — the exact "an entity you own changed" posture — so they ride HERE rather than paying
//     the 5-site cost of a feature bus for scoping refinery does not have.
//   • `databank` is the survey's H3 (§2.4/§3.4-3): 10+ mutating verbs, no member, the no-bus posture CITED at
//     birth rather than argued. The bank is per-user owned rows exactly like refinery's, so it rides here.
//     The per-chat RACK's freshness is a different question and stays where it was — that surface is
//     member-visible and rides `chatUpdated` on the chat bus (`membership-fan-guard`: member-visible state
//     fans to the roster, never to one user), so this member covers the OWNER's library, not the room's view.
//   • `corpusRecomputed` is the ONE member for every background library-semantics pass (§2.5/F6 — themes,
//     distillation, co-occurrence, near-duplicates, hub scores, the embeddings index sweep). It is the only
//     member NOT named after a noun the user edits: nothing here has a user-facing WRITE at all, the writer
//     is a workload, and so no mutation exists anywhere for a client to hang an `invalidates` on. One coarse
//     member rather than one per pass (F6): every discovery read maps to the domain root regardless.
//
// LAWS honored (mirrors the `ChatBusEvent` allowlist): every member is a closed object literal of a branded id
// (optional) — no `unknown`/`Record`/index field a secret could ride in; no caller id (a subscriber only ever
// receives its OWN userId channel, derived server-side from the principal, never from client input).

import type {
  CharacterId,
  ChatId,
  DocumentId,
  PersonaId,
  PresetId,
  RefinerySessionId,
  RegexScriptId,
  TagId,
  ThemeId,
  UserCredentialId,
  UserId,
  WorldBookId,
} from "@orb/kit/ids";

/** One coarse "a thing you own in domain X changed" event. The optional id is a targeting hint — the client
 *  invalidation map is free to path-invalidate the whole domain regardless (a missed/omitted id costs one
 *  broader refetch; invalidation is idempotent). */
export type UserBusEvent =
  | { type: "charactersChanged"; characterId?: CharacterId }
  | { type: "personasChanged"; personaId?: PersonaId }
  | { type: "presetsChanged"; presetId?: PresetId }
  | { type: "worldInfoChanged"; bookId?: WorldBookId }
  | { type: "regexChanged"; scriptId?: RegexScriptId }
  | { type: "tagsChanged"; tagId?: TagId }
  | { type: "themesChanged"; themeId?: ThemeId }
  | { type: "settingsChanged" }
  | { type: "credentialsChanged"; credentialId?: UserCredentialId }
  | { type: "chatsChanged"; chatId?: ChatId }
  // The refinery workspace: sessions · runs · accepts · the custom-schema library. ONE coarse member for the
  // whole domain (the client path-invalidates `trpc.refinery`), so the SCHEMA-library writes carry no id at
  // all — a second optional `schemaId` would buy nothing the root invalidate does not already do, and the
  // grammar here is one hint per member, not one per noun.
  | { type: "refineryChanged"; sessionId?: RefinerySessionId }
  // The document bank: the library list · one document's detail · the global id set · the attachment chips.
  // ONE coarse member (the client path-invalidates `trpc.databank`); the `documentId` hint is carried by the
  // per-document writes (rename/remove/attach/detach/ingest) and omitted by the owner-wide reindex sweep,
  // which touched too many to name one.
  | { type: "databankChanged"; documentId?: DocumentId }
  // The background library-semantics passes (survey §2.5/F6). NO id: the grain is "your corpus analytics were
  // recomputed", the client maps it to the discovery root + `search.similarArt`, and a per-pass or per-card
  // hint would be a targeting promise none of these passes can keep (they rewrite whole derived tables).
  | { type: "corpusRecomputed" }
  // DEFERRED (no server emit yet — see the MEMBERSHIP note + the `user-bus-coverage` DEFERRED allowlist): a
  // user's connection config lives in settings today, so nothing emits this. Declared so the client map +
  // the ratchet track it for the day a per-user connection store lands.
  | { type: "connectionsChanged" };

/** Valid discriminators, derived from the union. The `satisfies Record<UserBusEvent["type"], true>` makes
 *  `tsc` error if a member is added without a matching entry — the `user-bus-coverage` gate parses THIS object
 *  literal (the one home) to check every member has a server emit site. */
export const USER_BUS_EVENT_TYPES = {
  charactersChanged: true,
  personasChanged: true,
  presetsChanged: true,
  worldInfoChanged: true,
  regexChanged: true,
  tagsChanged: true,
  themesChanged: true,
  settingsChanged: true,
  credentialsChanged: true,
  chatsChanged: true,
  refineryChanged: true,
  databankChanged: true,
  corpusRecomputed: true,
  connectionsChanged: true,
} satisfies Record<UserBusEvent["type"], true>;

/** The INJECTED emit op every mutating domain verb closes over (the house cross-feature-op pattern — the verb
 *  declares this TYPE in its `contract/`, the entry root wires the runtime to transport's `publishUserEvent`).
 *  Fire-and-forget (`void`) — LIVE-ONLY, so a dead live path costs at most a stale read the next reconnect
 *  heals; called by the verb AFTER its durable write commits, with the acting principal's `userId`. */
export type EmitUserEvent = (userId: UserId, event: UserBusEvent) => void;
