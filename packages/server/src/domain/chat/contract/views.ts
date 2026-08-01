// domain/chat/contract/views — the client read-models the chat service returns. One home for the shapes
// (§7.4 / types-in-contract). Cross-boundary read-models that
// already live in `@orb/contracts/chat` (the wire node) are RE-EXPORTED here type-only (derive-don't-respell,
// §7.5) so the service signatures + the front door reference one name — they are NOT re-declared:
//   • MessageView        — the D26 slot⋈selected-variant read-model (listMessages / turn results).
//   • ParticipantView    — the resolved roster row (listParticipants / roster mutators).
//   • SectionPreview     — one section's render preview (previewSection).
//   • AssembledPrompt    — the BUILD product (peekPrompt / the assembly preview body).
//
// The chat-DOMAIN-specific read-models (the list/detail/lineage/pool projections) are declared here.

import type {
  AssembledPrompt,
  AssembleTrace,
  AssemblyBudgetPreview,
  CharacterAvatarEntry,
  ChatBusEvent,
  ChatInjection,
  ChatMacroNameProducer,
  GroupConfig,
  MessageView,
  OpeningPolicy,
  ParticipantView,
  PersonaAvatarEntry,
  RoomOverrides,
} from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { ChoiceBlockSpec, UserMacroValues } from "@orb/contracts/preset";
import type { ChatRpgPointer } from "@orb/contracts/rpg";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { CharacterId, ChatId, ChatInjectionId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { MacroSourceRef, UserMacroInputDef } from "@orb/kit/macro";

export type {
  AssembledPrompt,
  // The present-tense context-fit budget (previewContextFit) — the cross-boundary wire node
  // (`@orb/contracts/chat`), re-exported type-only so the service + front door share the ONE name.
  ContextFitPreview,
  InvitePreview,
  InviteView,
  MessageView,
  ParticipantView,
  SectionPreview,
  // The content-free SHAPE trace (getShapeTrace) — the cross-boundary wire node (`@orb/contracts/chat`),
  // re-exported type-only so the service signature + front door reference the ONE name (derive-don't-respell).
  ShapeTrace,
} from "@orb/contracts/chat";

/** The library-list row (listChats) — light, membership-scoped (D18: a chat I host OR am a member of; there
 *  is no `ownerId`). `lastMessageAt`/`messageCount` drive the list ordering + the unread chrome; `parentChatId`
 *  marks a fork in the list. */
export interface ChatSummary {
  readonly id: ChatId;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
  /** The fork-lineage pointer (D27) — null for a root chat. */
  readonly parentChatId: ChatId | null;
  /** The seq/timestamp of the newest message (null for an empty just-created chat). */
  readonly lastMessageAt: number | null;
  readonly messageCount: number;
  /** The list row's SCENT line: the newest visible message flattened to ONE line of plain text
   *  (`@orb/kit/content::projectBodyForPreview` — hidden-class spans + structured spans dropped, markdown
   *  flattened, ~120 chars). `null` when there is nothing this CALLER may see: an empty chat, a body that was
   *  all structure, or — the member-visibility arm — a viewer whose D16 history floor sits ABOVE the newest
   *  row (their whole readable window is empty, so a preview would be the one surface leaking pre-join canon).
   *  Per-caller by construction: the floor is resolved from the viewer's own participant row, never stamped. */
  readonly lastMessagePreview: string | null;
  /** Is this chat a LIVE GAME (rpg-design/05 §2.1)? The ONE takeover-gate predicate (`isRpgEngaged`) over the
   *  opaque `metadata.rpg` pointer this row already carries — the SAME sync surface `ChatDetail.rpg` and every
   *  client rpg gate read, so the list marker can never disagree with the chat it opens (chat stays
   *  rpg-table-blind: no join, no cross-domain read; a detached/healed pointer, or a game toggled OFF, is
   *  `false` — a disengaged game shows no panel, so it shows no marker). */
  readonly isGame: boolean;
  /** The resolved present cast for the list card (names only — the heavy roster is `getChat`), PER-CALLER:
   *  the VIEWER'S OWN seat is suppressed while any other seat remains, so an untitled row reads "Niko", not
   *  "You, Niko" (side-eye NR4 — the viewer is in every chat they can list, so their own name is a constant
   *  prefix that carries nothing and costs title width). A solo/self chat keeps its name, so the row never
   *  falls through to "Untitled chat". */
  readonly participantNames: readonly string[];
  /** The character-SEAT ids in this chat — the reverse "which chats include character X" read backing the
   *  FINAL-Character §7 Activity tab (every chat you've had with a character) + the §4.4/§9c resume-or-new
   *  decision + the §4.5 recency signal. Unlike `participantNames` (display names, PRESENT roster only), this
   *  DELIBERATELY includes DEPARTED character seats: §7 wants "every chat you've had with them," so a chat a
   *  character has since left still counts for the reverse read (mirrors `roster.characterSeatedInAnotherChat`,
   *  which also counts past seats). Character seats only (`kind='character'`) — human/agent/observer excluded;
   *  deduped. Populated via ONE junction bulk read per page (no N+1 — the `canonicalTagsFor` precedent). */
  readonly participantCharacterIds: readonly CharacterId[];
  /** The CALLER's own role in this chat (D18 membership), derived per-caller from the `chat_participants`
   *  FK truth in the listing projection — never stamped. Drives the Automation pane's chat picker (which
   *  offers only HOSTED chats, since v1 rule authoring IS room-host authority) and any future
   *  host-vs-member list affordance. Present on every listing row (listChats/listForks/getChatLineage). */
  readonly viewerRole: ParticipantRole;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The full chat read (getChat) — the row resolved + the present roster + the effective room behavior
 *  (`group`/`roomOverrides`/`opening` parsed from `metadata`, fault-isolated to their defaults). The message
 *  list is fetched separately (listMessages, paged). */
export interface ChatDetail {
  readonly id: ChatId;
  readonly title: string | null;
  readonly star: boolean;
  readonly archived: boolean;
  /** ST "Temporary Chat" (PD-65) — this room is ephemeral: hidden from `listChats` and swept once past
   *  the host's TTL. Exposed because the flag is CREATION-ONLY: a user who only learns their room was
   *  temporary after the first send cannot fix it, so the room must keep saying so. Read-only here — the
   *  only writer is `startChat` (`chat-detail.ts` projects it; no verb updates the column). */
  readonly temporary: boolean;
  readonly parentChatId: ChatId | null;
  readonly forkedAt: number | null;
  /** The stable `{{user}}` anchor persona (chat-open POV for card-authored sections). */
  readonly anchorPersonaId: ParticipantView["activePersonaId"];
  readonly participants: readonly ParticipantView[];
  /** The CALLER's own participant's `activePersonaId` (FINAL-Persona §A — Chat persona #3) — populated
   *  server-side from the resolving `principal`, so the client never has to find-and-match its own
   *  userId in `participants`. Null when the caller has none set (never null-because-absent: `getChat`
   *  requires present membership, so a matching participant always exists). */
  readonly viewerActivePersonaId: ParticipantView["activePersonaId"];
  /** `true` when the caller is this chat's host (`chat_participants.role === 'host'`) — gates
   *  host-only controls client-side (e.g. the Anchor re-pin) without a second round trip. */
  readonly viewerIsHost: boolean;
  /** The CALLER's own userId (== `principal.userId`, never a foreign-user leak) — the "own-authored
   *  content" signal for a client-side own-messages filter (e.g. reattribute's `authorUserId` match).
   *  NOT an identity/whoami surface (no handle/avatar/email) — those stay deferred to auth #50. */
  readonly viewerUserId: UserId;
  /** The pending host-handoff NOMINEE (`chats.pendingHostUserId`, Part III §2) — null when no handoff is
   *  in flight. Drives the Members-panel pending-nomination chip (FINAL-Chats §8.3); room-public (members
   *  already see every participant's userId), refreshed by the `chatUpdated` the nominate/accept verbs emit. */
  readonly pendingHostUserId: UserId | null;
  /** The effective room behavior (parsed from `metadata`; defaults applied — never raw). */
  readonly group: GroupConfig;
  readonly roomOverrides: RoomOverrides;
  /** The host's per-chat tool-call recursion cap (`metadata.toolRecurseLimit`, Phase A L3) — `null` when
   *  unset (the turn engine falls to its default). Exposed so the host's room-settings control can display +
   *  edit the current value; the WRITE is `chat.setToolRecurseLimit` (host-gated). */
  readonly toolRecurseLimit: number | null;
  /** BG-C — the host-set per-chat carried BACKGROUND source (parsed `metadata.background`), or `null` when
   *  unset. Applied at the app-root background layer in a TRUE-SOLO room, above the card-carried twin; INERT
   *  for every viewer in any other composition (client-resolved). */
  readonly background: ThemeBackground | null;
  /** The OPAQUE rpg sync pointer (parsed `metadata.rpg`, rpg-design/05 §2.1), or `null` when this chat is
   *  not a game. Mode-free `{gameId}` — the client's takeover gate is a SYNC read off this (data it already
   *  holds), then it reads the lite/full trim from `rpg.getGame`. Chat never dereferences it; a corrupt blob
   *  heals to absent at the parser. */
  readonly rpg: ChatRpgPointer | null;

  readonly opening: OpeningPolicy | null;
  /** The portable compaction checkpoint (D25) — the summary text + the seq it covers through. */
  readonly compactSummary: string | null;
  readonly compactedAtSeq: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** The chat-macro name PRODUCER (Chat-Macro-Resolution.md §1), member-gated, covering every participant's
   *  seat/active-persona id — the client derives `{{char}}`/`{{user}}`/`{{persona}}` history names from this
   *  via `@orb/kit/macro`'s `resolveRowMacros` + `@orb/contracts/chat`'s `buildCharacterNameMap`/
   *  `buildPersonaNameMap`. Does NOT cover a loaded page's message-stamped ids beyond the roster (a
   *  since-switched persona) — `listMessages`'s `MessagesPage.macroNames` covers that half; the client
   *  merges both as it paginates back. */
  readonly macroNames: ChatMacroNameProducer;
  /** The persona AVATAR-chrome producer (`persistence/roster-avatars.ts`) — the participant-scoped floor,
   *  SAME merge contract as `macroNames` (this field ∪ `MessagesPage.personaAvatars`, last-write-wins) but
   *  a separate array (§1: never folded into the names-only `macroNames`). The client rebuilds it via
   *  `@orb/contracts/chat`'s `buildPersonaAvatarMap` for `resolveRowAttribution`'s USER-row avatar. */
  readonly personaAvatars: readonly PersonaAvatarEntry[];
  /** The character AVATAR-chrome producer (`persistence/roster-avatars.ts`) — the assistant-row twin of
   *  `personaAvatars`, SAME merge contract (this field ∪ `MessagesPage.characterAvatars`, last-write-wins).
   *  The transcript-integrity floor: a character removed from the room has no `ParticipantView`, so its
   *  historical rows' avatar must resolve from this participant-independent producer, not the roster. The
   *  client rebuilds it via `buildCharacterAvatarMap` for `resolveRowAttribution`'s ASSISTANT-row fallback. */
  readonly characterAvatars: readonly CharacterAvatarEntry[];
}

/** The `listMessages` page result (Chat-Macro-Resolution.md §1/§3) — the chronological `MessageView[]`
 *  window + the page's macro name producer: participant-scoped names (the `ChatDetail.macroNames` floor)
 *  UNION this page's own loaded rows' `characterId`/`personaId` stamps (covers a since-switched persona whose
 *  id isn't any participant's CURRENT active persona but is still stamped on an older row in THIS page). The
 *  client merges producers across pages as it paginates backward, accumulating full coverage. */
export interface MessagesPage {
  readonly messages: readonly MessageView[];
  readonly macroNames: ChatMacroNameProducer;
  /** This page's own loaded rows' `personaId`-stamp coverage — see {@link ChatDetail.personaAvatars}. */
  readonly personaAvatars: readonly PersonaAvatarEntry[];
  /** This page's own loaded rows' `characterId`-stamp coverage — see {@link ChatDetail.characterAvatars}. */
  readonly characterAvatars: readonly CharacterAvatarEntry[];
}

/** The fork-lineage chain (getChatLineage) — the chat's ancestors then self, oldest-root first. Each ancestor
 *  is walked + gated INDEPENDENTLY (a fork grants NO parent membership); a hidden/
 *  not-a-member ancestor is omitted, so the chain may be sparse. */
export interface ChatLineageView {
  /** Oldest ancestor → … → this chat. Membership-gated per ancestor (omitted where not a member). */
  readonly chain: readonly ChatSummary[];
}

/** One sibling variant's identity + position (listMessageVariants) — NO content, just enough to resolve an
 *  idx to its variant id. Ordered by `idx` ascending. The swipe strip's step-target resolver: `MessageView`
 *  carries only the SELECTED variant per slot (D26), so reaching an idx this session hasn't rendered
 *  (e.g. a cold page load mid-way through a multi-variant slot) needs this read. */
export interface MessageVariantSummary {
  readonly variantId: MessageVariantId;
  readonly idx: number;
}

/** The assembly preview (previewAssembly) — the BUILD product for a hypothetical turn + the debug trace.
 *  Host/admin-only at the transport (the trace is metadata-about-assembly, never RP content). */
export interface AssemblyPreview {
  readonly prompt: AssembledPrompt;
  readonly trace: AssembleTrace;
  /** The next turn's CONTEXT BUDGET, partitioned by source (D-4 — the Preview tab's stacked bar + drill-in
   *  rows). Same build, same fit, same estimator as the turn itself; `sources` partitions `totalTokens`. */
  readonly budget: AssemblyBudgetPreview;
}

/** One persisted positional injection (the `chat_injections` row resolved) — the `ChatInjection` wire shape
 *  plus its id. Returned by setChatInjection / listChatInjections. */
export interface ChatInjectionView extends ChatInjection {
  readonly id: ChatInjectionId;
}

/** The per-chat ChoiceBlock variable map (`{{get::<name>}}`) — what `getVariables` (effective,
 *  computed-this-turn) returns; the PERSISTED picks ride `getVariablePicks.values` (the pane's one read). */
export type ChatVariables = Record<string, string>;

/** One PICKABLE user macro as the picks pane sees it (#24) — the least-privilege projection of the active
 *  preset's `UserMacroSpec`: identity + the typed INPUT declarations only. The macro BODY and its declared
 *  `args` are deliberately NOT projected — the body is prompt content (the same class `previewAssembly`/
 *  `previewSection` are host-gated for), while this read is member-gated because a picker needs the
 *  question, not the template. `inputs` is kit's own `UserMacroInputDef` (contracts/preset's authored
 *  schema is pinned assignable to it), so the pane renders each control off the ONE input vocabulary.
 *  NON-exported (the `matrix.ts` idiom): its ONE consumer is {@link UserMacroPicksView}, which carries it
 *  across the wire — a second exported name for the same row would be dead surface (knip RED). */
interface UserMacroPickDef {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly UserMacroInputDef[];
  /** WHICH authoring home declared it (owner ruling #20's two homes) — `preset` = the chat's active preset,
   *  `game` = this chat's rpg game config. Derived from kit's own `MacroSourceRef.kind` (never a re-spelled
   *  union). The pane glosses a `game` macro so a picker can tell why a knob appeared with the game and will
   *  vanish with it; on a name clash the GAME def is the one projected (it is the one the turn resolves —
   *  `shadowPresetUserMacros`). */
  readonly source: MacroSourceRef["kind"];
}

/** The MU picks pane read (`getUserMacroPicks`, #24) — the chat's pickable user-macro declarations (the
 *  resolved preset's `userMacros` that declare at least one input; a macro with no inputs has nothing to
 *  pick) plus the persisted per-chat picks (`chats.user_macro_values`). Per-CHAT, not per-user: the picks
 *  are room state every member shares (the owner's Arm-A ruling — the `setVariables` sibling), and the
 *  WRITE is the member-gated `setUserMacroValues`. A macro/input absent from `values` is UNSET — it
 *  resolves its per-kind default at turn time (`resolveUserMacroInputs`), which is what the pane shows. */
export interface UserMacroPicksView {
  readonly macros: readonly UserMacroPickDef[];
  readonly values: UserMacroValues;
}

/** The picks pane's ChoiceBlock read (`getVariablePicks`) — the SECOND knob family in the same pane: the
 *  active preset's declared `variables` plus the persisted per-chat picks (`chats.variableValues`, written
 *  by the member-gated `setVariables`). Same member floor, same per-CHAT store, same UNSET semantics as its
 *  {@link UserMacroPicksView} sibling (an absent key — or an empty string, which `resolveChoiceVariables`
 *  reads alike — falls back to the declared `defaultValue`, else the first option).
 *
 *  PROJECTION: the WHOLE `ChoiceBlockSpec`, deliberately. Unlike a `UserMacroSpec` there is no body/args
 *  class to withhold — a ChoiceBlock IS its question + its offered values, and every remaining field is
 *  load-bearing for the picker (`multiSelect`/`separator` decide how a pick is stored, `randomPick` and
 *  `defaultValue` decide what the pick DOES and what UNSET resolves to). Withholding any of them would make
 *  the pane lie about the turn, not protect anything. */
export interface VariablePicksView {
  readonly variables: readonly ChoiceBlockSpec[];
  readonly values: ChatVariables;
}

/** A resumable SSE token-log row (replayStreamEvents) — one streamed delta with its replay cursor
 *  ("resumable SSE stream log"; the db `chat_stream_events` row projected). */
export interface ChatStreamReplayEvent {
  readonly seq: number;
  readonly messageId: MessageView["id"] | null;
  readonly kind: "text" | "reasoning";
  readonly delta: string;
}

/** A durable chat-bus log row (replayChatEvents) — one room-public `ChatBusEvent` with its per-chat replay
 *  cursor (the `chat_events` row projected). The chat room's SSE resume replays these; the live
 *  half rides the transport fan-out with the SAME `{seq, event}` shape (uniform `tracked()` envelopes). */
export interface ChatBusReplayEvent {
  readonly seq: number;
  readonly event: ChatBusEvent;
}

/** The replay cursor bounds (streamEventBounds / chatEventBounds) — the min/max `seq` of the chat's stream
 *  log / durable bus log (null/null when empty). The late-subscriber ramp-up reads these to size the replay
 *  window; `chatEventBounds` doubles as the cheap membership gate the SSE per-yield check calls. */
export interface StreamEventBounds {
  readonly minSeq: number | null;
  readonly maxSeq: number | null;
}

/** What the SSE attach / per-yield probe (`chatEventBounds`) hands the subscription: the retained-window
 *  bounds PLUS the caller's own D16 canon read floor, resolved at the membership chokepoint
 *  (`guard.requireParticipant` → `substrate/auth::resolveHistoryFloorSeq`).
 *
 *  The floor rides HERE rather than being re-derived at the transport because that probe is ALREADY the one
 *  member-gated read the subscription performs (at attach and before every live yield): the same read that
 *  decides "may this caller still receive at all" now also carries "…and from which `messages.seq` up". It is
 *  therefore per-CALLER by construction and never client-supplied. `0` = unclamped (`full` / a born-here host
 *  seat) — the common case, which the `isBelowHistoryFloor` verdict short-circuits on. */
export interface ChatEventAttach extends StreamEventBounds {
  readonly historyFloorSeq: number;
  /** Whether the SUBSCRIBER is the room host — resolved from their own participant row at the same probe.
   *  The live fan-out applies the §3.6 hidden-content member-strip (`stripChatEventForMember`) when false,
   *  mirroring the per-caller strip the durable replay applies. Never client-supplied. */
  readonly viewerIsHost: boolean;
  /** P3 (§3.6): is the game rooted at this chat DECEPTION-ACTIVE (`config.features.deception || omniscience`)?
   *  Resolved once at attach via the injected `ChatRpgOps.resolveReasoningHostOnly` (chat stays rpg-table-blind).
   *  When true AND the subscriber is NOT the host, the live fan-out withholds the whole reasoning channel for
   *  that member (reasoning deltas + `reasoningStreamDone` dropped, `view.reasoning` nulled). `false` for a
   *  non-game / non-deception chat — the pre-P3 live behavior (reasoning member-visible). Never client-supplied. */
  readonly reasoningHostOnly: boolean;
}
