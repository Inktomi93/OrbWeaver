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
//     allowlist carries the citation; when a per-user connection store lands, wire the emit + delete the
//     DEFERRED entry). Kept in the union so the client map + the coverage ratchet track it explicitly.
//   • `themes` ride their own member though they live inside the `settings` domain (a distinct client read
//     surface — the theme list — with its own emit sites in `settings/verbs/*-theme.ts`).
//   • `settings` / `connection` carry NO id (a user has ONE settings blob; connection has no per-user row).
//
// LAWS honored (mirrors the `ChatBusEvent` allowlist): every member is a closed object literal of a branded id
// (optional) — no `unknown`/`Record`/index field a secret could ride in; no caller id (a subscriber only ever
// receives its OWN userId channel, derived server-side from the principal, never from client input).

import type { CharacterId, ChatId, PersonaId, PresetId, TagId, ThemeId, UserCredentialId, UserId, WorldBookId } from "@orb/kit/ids";

/** One coarse "a thing you own in domain X changed" event. The optional id is a targeting hint — the client
 *  invalidation map is free to path-invalidate the whole domain regardless (a missed/omitted id costs one
 *  broader refetch; invalidation is idempotent). */
export type UserBusEvent =
  | { type: "charactersChanged"; characterId?: CharacterId }
  | { type: "personasChanged"; personaId?: PersonaId }
  | { type: "presetsChanged"; presetId?: PresetId }
  | { type: "worldInfoChanged"; bookId?: WorldBookId }
  | { type: "tagsChanged"; tagId?: TagId }
  | { type: "themesChanged"; themeId?: ThemeId }
  | { type: "settingsChanged" }
  | { type: "credentialsChanged"; credentialId?: UserCredentialId }
  | { type: "chatsChanged"; chatId?: ChatId }
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
  tagsChanged: true,
  themesChanged: true,
  settingsChanged: true,
  credentialsChanged: true,
  chatsChanged: true,
  connectionsChanged: true,
} satisfies Record<UserBusEvent["type"], true>;

/** The INJECTED emit op every mutating domain verb closes over (the house cross-feature-op pattern — the verb
 *  declares this TYPE in its `contract/`, the entry root wires the runtime to transport's `publishUserEvent`).
 *  Fire-and-forget (`void`) — LIVE-ONLY, so a dead live path costs at most a stale read the next reconnect
 *  heals; called by the verb AFTER its durable write commits, with the acting principal's `userId`. */
export type EmitUserEvent = (userId: UserId, event: UserBusEvent) => void;
