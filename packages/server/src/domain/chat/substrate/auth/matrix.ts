// domain/chat/substrate/auth/matrix — THE typed per-verb authority matrix (spine §2a). The matrix is the
// SOURCE OF TRUTH for "what authority each chatId surface demands", and
// it is DEFAULT-DENY: a chatId surface not classified here is denied.
//
// BORN-COMPLIANT: `CHAT_VERB_AUTHORITY` is typed `Record<keyof ChatService, …>`, so a NEW verb on the
// `ChatService` interface fails `tsc` here until it is classified — no silently-ungated verb (the gate is
// the type, not vigilance). Non-membership verbs (creation / cross-chat list / token-gated join / per-user
// maintenance) carry the explicit `non-chat-scoped` marker (their gate is documented inline), so the
// default-deny set is exactly the chatId-scoped surfaces.

import type { ChatService } from "../../contract/service.ts";

// NOTE: the type aliases here are NON-exported (the `types-in-contract` gate homes exported feature types in
// `contract/`, which this chunk does not own). Consumers key on the exported VALUE maps + literals; a caller
// that needs the union derives it via `(typeof CHAT_VERB_AUTHORITY)[keyof typeof CHAT_VERB_AUTHORITY]`.

/**
 * The authority a chatId surface demands — declared ONCE as a tuple, the union derived (§7.5
 * no-inline-union-redecl):
 *  • `member`               — read / stream / post / run-a-turn (`requireParticipant`).
 *  • `author-or-host`       — edit / delete a slot: the slot's author OR the host (`requireAuthorOrHost`).
 *  • `host`                 — room config / roster / lifecycle mutation (`requireHost`).
 *  • `member-card`          — read a roster character's card: member, field-clamped to `memberCardVisibility`
 *                             (D22; see clamp.ts).
 *  • `lineage-per-ancestor` — fork / export / corpus ancestry: gated INDEPENDENTLY per-ancestor (a fork
 *                             grants NO parent membership).
 *  • `turn-owner`           — abort an in-flight turn: the turn OWNER (member floor + the engine's
 *                             active-turns match; NOT host — a host aborting a member's turn is the
 *                             rollback-theft the contract defends against).
 */
export const CHAT_AUTHORITIES = ["member", "author-or-host", "host", "member-card", "lineage-per-ancestor", "turn-owner"] as const;
type ChatAuthority = (typeof CHAT_AUTHORITIES)[number];

/** A verb whose gate is NOT the chatId-membership matrix (it takes no single-chat membership). The marker is
 *  explicit so the default-deny set is unambiguous; the real gate is named in the matrix comment. */
type NonChatScoped = "non-chat-scoped";
type VerbAuthority = ChatAuthority | NonChatScoped;

/**
 * Every `ChatService` verb → its required authority (derived from the spine §2a table,
 * and the per-verb contract notes). `satisfies Record<keyof ChatService, …>` makes this exhaustive.
 */
export const CHAT_VERB_AUTHORITY = {
  startChat: "non-chat-scoped", // creation: MINTS the caller's host membership (authedProcedure + AUTH_MODE gate)
  listChats: "non-chat-scoped", // cross-chat: pure-membership list (each row already membership-filtered in the query)
  listForks: "member", // the parent chatId — a member may list its forks (children filtered to the caller's own memberships)
  getChatLineage: "lineage-per-ancestor", // the ancestry chain — each ancestor gated independently (inv §16)
  getChat: "member",
  checkSendAvailability: "member", // #54 — any participant reads the pre-send serveability verdict for the host's resolved connection (the composer disables SEND on it); leak-free NOT_FOUND for a non-participant/hostless room. Deterministic; no turn/API call.
  getMemberCard: "member-card", // D22 — read a roster character's card: present member, field-clamped to `memberCardVisibility` (host ⇒ full). The gate is `requireParticipant` (member floor) + a roster-seat check on `characterId`; the level clamp is `clampMemberCard` (clamp.ts). PROBED in the cross-tenant sweep (a stranger's chatId is NOT_FOUND before any card load). // D22 — read a roster character's card: present member, field-clamped to `memberCardVisibility` (host ⇒ full). The gate is `requireParticipant` (member floor) + a roster-seat check on `characterId`; the level clamp is `clampMemberCard` (clamp.ts). PROBED in the cross-tenant sweep (a stranger's chatId is NOT_FOUND before any card load).
  previewAssembly: "host", // the assembled prompt + TRACE is a host/admin debug surface
  getActivePresetConfig: "member", // the bare `PromptConfig` — preset TEMPLATES only, no assemble ctx is built, so no card/persona bytes can ride out
  // D8 / §7.1 — the preset editor's BOUND readout. RENDERED against the live assemble ctx, so it lands in the
  // same class as `previewSection` above: an action template referencing `{{charsysinfo}}`/`{{description}}`/
  // `{{persona}}` resolves the roster's cards at FULL, which is the D22 `memberCardVisibility` bypass the whole
  // preview family is host-gated for. RENDERED ⇒ `host`.
  previewActionTemplates: "host",
  // SECURITY (2026-08-01, was `member` — the latent hole beside the door): `previewSection` RENDERS an
  // arbitrary preset section against the LIVE assemble ctx, and the marker sections' static sources ARE the
  // full-fidelity card (`main_prompt` ← `character.systemPrompt` + every co-speaker's; `post_history` ←
  // postHistoryInstructions; `char_description`/`scenario`/`dialogue_examples` ← the card text; `persona` ←
  // another human's persona description). That is the SAME D22 `memberCardVisibility` bypass
  // `previewAssembly`/`peekPrompt` are host-gated for — a member just had to name one section instead of
  // asking for the whole prompt. The preview family is a host instrument: RENDERED ⇒ `host`.
  previewSection: "host",
  peekPrompt: "host", // the full next-turn prompt reveals merged member cards at FULL — host/admin only
  getShapeTrace: "host", // the SHAPE-phase debug trace (content-free counts) is a host/admin inspector surface (PD-132)
  // The per-variant WIRE RECORD — the RETROSPECTIVE member of the preview family, and host for the SAME
  // reason `peekPrompt` is: a stored `promptSnapshot` is a real assembled prompt, so it carries the roster's
  // cards at FULL fidelity (the D22 `memberCardVisibility` bypass), the hidden-class spans the §3.6 member
  // strip removes (the wire projection rides them verbatim — the model always sees them), and the whole
  // assembled HISTORY, including slots below a clamped member's D16 floor. Reading a PAST prompt must not be
  // the cheap way around the three host-gated doors above.
  getVariantWire: "host",
  previewContextFit: "member", // the transcript divider's present-tense fit budget — a member read (no merged-card leak, only the boundary id + budget numbers)
  listMessages: "member",
  listMessageVariants: "member", // the full sibling-variant set for one slot — a present member may read it
  listParticipants: "member",
  replayStreamEvents: "member", // the SSE replay/subscribe surface (inv §12)
  streamEventBounds: "member",
  replayChatEvents: "member", // the durable bus-log resume (the chat room's SSE reconnect)
  chatEventBounds: "member", // + the SSE per-yield membership gate (a kicked member stops receiving)
  // ── turn-running (run the turn = member; the turn RUNS AS the host via the runAsUserId triple) ──
  send: "member",
  commitMessage: "member", // D56 "Simple Send" — same membership gate as `send` (post a user row, no AI turn)
  swipe: "member",
  impersonateStream: "member", // NON-PERSISTING streaming guided impersonate (composer fill) — same member gate
  generate: "member",
  continueTurn: "member",
  undoContinue: "member",
  revertContinue: "member",
  forceCharacterTurn: "host", // host-only
  compact: "host", // rewrites the canon checkpoint substrate (room-wide) — host
  abort: "turn-owner", // turn-owner only (rollback-theft defense) — member floor + engine active-turns match
  drainDeferredTurns: "non-chat-scoped", // SYSTEM-triggered (boot reclaim + host-return), no principal: the durable `pending_turns` row IS the authorization (minted by a `send` that cleared `requireParticipant`); the engine re-validates consent/budget in-lock at drain (Part III §5)

  generateImage: "member", // any present member may generate an image (a user post) — the member floor
  // ── canon edits (edit/delete a slot → author-or-host; reorder/reattribute → host) ──
  selectVariant: "author-or-host",
  editMessage: "author-or-host",
  // R3 §4.8/F6 — stepping a SEEDED GREETING onto another card alternate. HOST, not author-or-host: a seeded
  // greeting is written with `authorUserId: null` (no human authored it), so author-or-host would collapse to
  // host-only anyway for a well-formed row — and stating `host` makes that the RULE rather than a consequence
  // of a write-side convention the schema does not enforce. The verb additionally windows itself on the
  // pre-first-user-turn freeze and resolves its bytes from the card, never from the caller. PROBED in the
  // cross-tenant sweep.
  setSeededGreeting: "host",
  setMessageHidden: "author-or-host",
  deleteMessages: "author-or-host",
  editReasoning: "author-or-host",
  clearReasoning: "author-or-host",
  moveMessage: "host", // re-stamps canon ORDER (the §11 "reorder" host-only entry)
  duplicateMessage: "author-or-host",
  forkChat: "host", // fork is HOST-authority (owner policy 2026-07-28) — the fork is a new chat where the forker is host; a non-host may fork ONLY a SOLO room (they are the sole present human — nothing to launder), a documented in-verb widening of this `host` floor
  // ── injections (room-wide prompt content — write is a one-shot room jailbreak surface → host; read → member) ──
  setChatInjection: "host",
  listChatInjections: "member",
  deleteChatInjection: "host",
  // ── variables (ChoiceBlock gameplay state — interactive play, shared story state → member) ──
  getVariables: "member",
  setVariables: "member",
  setUserMacroValues: "member", // WAVE MU: user-macro input picks — interactive play state (the setVariables sibling)
  getVariablePicks: "member", // the picks pane's ChoiceBlock half — the DECLARED variables (question + offered values; a ChoiceBlock has no body class to withhold) + the room's picks. Same member floor as its `setVariables` write.
  getUserMacroPicks: "member", // #24: the picks pane read — the pickable macro DECLARATIONS (identity + inputs; never the body, which is prompt content) + the room's picks. Same member floor as its write.
  clearVariables: "member",
  delete: "host", // host-only
  reapTemporaryChats: "non-chat-scoped",
  reapHusk: "host", // R0 §4.6 — the nav-away husk drop; host-only AND server-re-checked (`started_at IS NULL`) // per-user maintenance: sweeps the CALLER's own expired temp chats
  updateTitle: "host", // shared chats-row config (no per-participant column exists today) — see FLAG
  star: "host", // shared chats-row flag (room-level column, not per-user library) — see FLAG
  archive: "host", // archiving removes the room from every member's active list — host
  setChatAnchorPersona: "host", // the manual Anchor (#4) re-pin — a room-level `{{user}}` POV decision (FINAL-Persona §A.6b gap #2)
  reattributeMessages: "host", // host-only (self-heal hash-diff re-attribution)
  reattributePersona: "author-or-host", // author-or-host PER targeted row: a member re-stamps THEIR OWN user lines, the host any (the persona-attribution / {{user}} history fix — Chat-Macro-Resolution §5). The verb also asserts role==='user' + target-persona-owned-by-the-row's-author.
  setGroupConfig: "host",
  addCharacterToChat: "host",
  removeCharacterFromChat: "host", // host-only, the symmetric drop for addCharacterToChat (future rpg-design scene-cast prune injected consumer)

  setRoomOverrides: "host",
  setChatDocumentVisibility: "host", // D85 — the host governs which databank documents feed the shared room's retrieval (room-wide prompt content is the host's authority, the setRoomOverrides twin)
  setHostDisplayScripts: "host", // D121-E — a room-wide RENDER option is the host's authority (the setChatBackground/setRoomOverrides twin); render-only, so it can never reach canon or the wire
  setChatBackground: "host", // BG-C — the host sets the per-chat carried background (room-wide chrome is the host's authority, the setRoomOverrides twin); asset-ownership additionally gated inside the verb
  setToolRecurseLimit: "host", // the host sets the per-chat tool-call recursion cap (room-wide turn behavior is the host's authority, the setRoomOverrides twin)

  getGroupConfigForChat: "member", // read the effective room config (it affects the member)
  getRoomOverridesForChat: "member",

  setSeatKnobs: "host", // the ONE participantId-keyed AI-seat knob write (D80 — the retired per-kind forking's replacement)
  createInvite: "host",
  previewInvite: "non-chat-scoped", // token-authenticated, PRE-membership (the accept = preview-then-confirm flow)
  redeemInvite: "non-chat-scoped", // the join chokepoint: token-gated, PRE-membership (role server-forced `member`)
  acceptInvite: "non-chat-scoped", // token-FREE join-by-id: SELF-authorizing (invite bound to `invitedUserId`), PRE-membership (role server-forced `member`)
  revokeInvite: "host",
  listInvites: "host", // the host-management outstanding-invites read (FIX #4; InviteViews — no tokens)
  declineInvite: "non-chat-scoped", // self/token: the invited user (may not be a member yet)
  kick: "host", // host-only
  setMemberHistoryVisibility: "host", // D16 — the host governs how much room canon each HUMAN member may read (the `joinHistoryVisibility` opt-in restriction; the enforcement floor is substrate/auth::resolveHistoryFloorSeq)
  selfLeave: "member", // self: you must be a present member to leave your own membership
  nominateHostHandoff: "host", // host-only (step 1)
  acceptHostHandoff: "member", // the nominee (a member) accepts; the nominee-MATCH is a verb-level state check on the nomination
} as const satisfies Record<keyof ChatService, VerbAuthority>;

/** The non-VERB chatId surfaces inv §12 names explicitly (the membership chokepoint covers these too).
 *  NOTE: the anchor re-pin is NOT here — it graduated from a speculative non-verb placeholder to a real
 *  `ChatService` verb (`setChatAnchorPersona`, classified in `CHAT_VERB_AUTHORITY` above) — keeping both
 *  would be two homes for one "host" decision (one-home law). */
export const CHAT_NONVERB_SURFACES = [
  "sse-subscribe", // a kicked member's stream stops yielding within the kick tx
  "bus-delivery", // room-public bus events reach members only
  "lineage-walk", // fork/export/corpus ancestry walkers — gated per-ancestor
  "roster-card-read", // a roster character's card (D22 level-clamped)
  "chat-injection-write", // write a positional chat_injection — host (room-wide prompt content)
] as const;
type ChatNonVerbSurface = (typeof CHAT_NONVERB_SURFACES)[number];

/** The non-verb surfaces → authority. */
export const CHAT_SURFACE_AUTHORITY = {
  "sse-subscribe": "member",
  "bus-delivery": "member",
  "lineage-walk": "lineage-per-ancestor",
  "roster-card-read": "member-card",
  "chat-injection-write": "host",
} as const satisfies Record<ChatNonVerbSurface, ChatAuthority>;

/** The default-deny verdict for an UNLISTED chatId surface (inv §12: unlisted ⇒ deny). */
export const DENY = "deny" as const;

/**
 * Classify a non-verb chatId surface, DEFAULT-DENY: an unrecognized surface string returns {@link DENY}
 * (inv §12 — "an unlisted chatId surface defaults to deny"). The verb surface is exhaustively typed
 * (`CHAT_VERB_AUTHORITY` over `keyof ChatService`), so default-deny is the runtime guard for the non-verb
 * surfaces (SSE/bus/lineage/anchor/…) that arrive as strings, not method names.
 */
export function authorityForSurface(surface: string): ChatAuthority | typeof DENY {
  return surface in CHAT_SURFACE_AUTHORITY ? CHAT_SURFACE_AUTHORITY[surface as ChatNonVerbSurface] : DENY;
}
