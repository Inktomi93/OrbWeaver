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
  ChatBusEvent,
  ChatIdentity,
  ChatInjection,
  ChatListCursor,
  MessageView,
} from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { ChoiceBlockSpec, TemplateDefId, UserMacroValues } from "@orb/contracts/preset";
import type { CharacterId, ChatId, ChatInjectionId, ChatStreamGenerationId, MessageVariantId } from "@orb/kit/ids";
import type { MacroSourceRef, UserMacroInputDef } from "@orb/kit/macro";

export type {
  AssembledPrompt,
  // The full chat read (getChat, fork, start, the invite joins) — a wire node: its strict twin
  // (`chatDetailSchema`) is the invite joins' tRPC output parser.
  ChatDetail,
  // The present-tense context-fit budget (previewContextFit) and its unbound state — the cross-boundary wire nodes
  // (`@orb/contracts/chat`), re-exported type-only so the service + front door share the ONE name.
  ContextFitAnswer,
  ContextFitPreview,
  InvitePreview,
  InviteView,
  MessageView,
  ParticipantView,
  SectionPreview,
  // The content-free SHAPE trace (getShapeTrace) — the cross-boundary wire node (`@orb/contracts/chat`),
  // re-exported type-only so the service signature + front door reference the ONE name (derive-don't-respell).
  ShapeTrace,
  // The per-variant WIRE RECORD (getVariantWire) — the cross-boundary wire node (`@orb/contracts/chat`),
  // re-exported type-only for the same reason. HOST-ONLY payload (see its contract header).
  VariantWireView,
} from "@orb/contracts/chat";

/** ONE character seat's face on a chat-list row (#192): the CAS portrait key plus the card name that backs
 *  its initials fallback and its accessible label (a stacked avatar needs both). `avatarHash` null = this
 *  seat has no portrait, which the row paints as its hue-seeded initials blob — never a broken image. */
export interface ChatSeatPortrait {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** The library-list row (listChats) — light, membership-scoped (D18: a chat I host OR am a member of; there
 *  is no `ownerId`). `lastMessageAt`/`messageCount` drive the list ordering + the unread chrome. */
export interface ChatSummary {
  readonly id: ChatId;
  readonly title: string | null;
  readonly starred: boolean;
  readonly archived: boolean;
  /** The timestamp of the newest message (null for an empty just-created chat). With `updatedAt` it IS the
   *  list's sort key — every surface renders `lastMessageAt ?? updatedAt` and `listChats` orders on exactly
   *  that expression in SQL (#150), so the row on top is the room whose stamp is the freshest. */
  readonly lastMessageAt: number | null;
  readonly messageCount: number;
  /** The SCENT line: the newest visible message flattened to plain text
   *  (`@orb/kit/content::projectBodyForPreview` — hidden-class spans + structured spans dropped, markdown
   *  flattened, word-boundary-capped at `PREVIEW_MAX_CHARS`). The budget is the WIDEST consumer's — home's
   *  two-line hero, not the one-line chats-list row that clips it in CSS (#188 N-2). `null` when there is
   *  nothing this CALLER may see: an empty chat, a body that was
   *  all structure, or — the member-visibility arm — a viewer whose D16 history floor sits ABOVE the newest
   *  row (their whole readable window is empty, so a preview would be the one surface leaking pre-join canon).
   *  Per-caller by construction: the floor is resolved from the viewer's own participant row, never stamped. */
  readonly lastMessagePreview: string | null;
  /** Is this chat a LIVE GAME (docs/plans/rpg/design.md)? The ONE takeover-gate predicate (`isRpgEngaged`) over the
   *  opaque `metadata.rpg` pointer this row already carries — the SAME sync surface `ChatDetail.rpg` and every
   *  client rpg gate read, so the list marker can never disagree with the chat it opens (chat stays
   *  rpg-table-blind: no join, no cross-domain read; a detached/healed pointer, or a game toggled OFF, is
   *  `false`).
   *
   *  RULING FORK, recorded (#863(f), 2026-08-30). This clause used to end "a disengaged game shows no panel,
   *  so it shows no marker". The MECHANISM survives verbatim — `isGame` is still the one engagement
   *  predicate, still pointer-only, and a disengaged game still shows no panel and no ⚔. What changed is its
   *  INPUT: the drive found that once a game is off, its existence is visible ONLY behind a host-only tab in
   *  a pane that ships closed, so a host cannot find the rooms with a sleeping game. The answer is a SECOND
   *  bit ({@link ChatSummary.gamePaused}), not a widened `isGame`. */
  readonly isGame: boolean;
  /** Does this chat carry a game that is currently OFF (#863(f), owner-ordered 2026-08-30)? The SECOND bit
   *  off the SAME opaque pointer — `metadata.rpg` present AND `isRpgEngaged` false. It does NOT widen
   *  `isGame` and it does NOT read the rpg tables (the rpg-table-blind mechanism above is untouched): it
   *  exists because the ONLY surviving evidence of a paused game was a host-only tab inside a pane that
   *  ships closed, so a host could not see which rooms had a game sleeping in them. The list row wears it as
   *  a QUIET marker (`Game chat — paused`), never as the live ⚔ — the panel/assembly still see nothing, which
   *  is what the `isGame` ruling actually protects. */
  readonly gamePaused: boolean;
  /** The resolved present characters for the list card (names only — the heavy roster is `getChat`), PER-CALLER:
   *  the VIEWER'S OWN seat is suppressed while any other seat remains, so an untitled row reads "Niko", not
   *  "You, Niko" (side-eye NR4 — the viewer is in every chat they can list, so their own name is a constant
   *  prefix that carries nothing and costs title width). A solo/self chat keeps its name, so the row never
   *  falls through to "Untitled chat". */
  readonly participantNames: readonly string[];
  /** The row's own PORTRAITS — one entry per PRESENT character seat, in seat order (#192). The list row
   *  paints a face per seat (one seat = a portrait, two or more = an `AvatarStack`), and until now the
   *  client resolved those faces by fetching the WHOLE character library (`character.list {limit: 500}`)
   *  on every surface that shows a chat row, then indexing character ids into it — a whole-library read to
   *  decorate six rows, and one that simply stopped resolving past the page ceiling.
   *  A row carries what it is about, so the seats ride the row.
   *
   *  Derived from the roster views this projection ALREADY loads (`loadParticipantViews` — the same read
   *  that produces `participantNames`), so it costs no extra query and its name/avatar resolution is the
   *  one the room itself uses. PRESENT seats only: a face is a statement about who is IN the room, and the
   *  roster resolver only decorates present seats. */
  readonly participantPortraits: readonly ChatSeatPortrait[];
  /** The CALLER's own role in this chat (D18 membership), derived per-caller from the `chat_participants`
   *  FK truth in the listing projection — never stamped. Drives the Automation pane's chat picker (which
   *  offers only HOSTED chats, since v1 rule authoring IS room-host authority) and any future
   *  host-vs-member list affordance. Present on every listing row (listChats/listForks/getChatLineage). */
  readonly viewerRole: ParticipantRole;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One KEYSET page of the caller's chat library (`listChats`) — newest-CONVERSATION first (ordered on the
 *  clock the rows DISPLAY, `lastMessageAt ?? updatedAt`; #150), filtered by the
 *  request's `characterId`/`includeArchived`. Mirrors the `items`/`nextCursor` shape of `character`'s own
 *  `ListCharactersResult` and ADDS the census.
 *
 *  `totalCount` is a real server `COUNT` over the SAME scope this page windows, not `items.length`. The
 *  characters band had to DROP its count when that list went keyset-paged ("any number here would be
 *  'loaded so far', and a census that silently means something else is worse than none",
 *  `characters-list-header.tsx`) — chat prints its census in two user-visible places (the chats band's count
 *  and the character card's "N chats"), so the honest number is served rather than the badge deleted. */
export interface ChatListPage {
  readonly items: readonly ChatSummary[];
  /** The keyset boundary to pass as the next `cursor`; `null` when a short page came back (no row remains). */
  readonly nextCursor: ChatListCursor | null;
  readonly totalCount: number;
}

/** The `listMessages` page result (Chat-Macro-Resolution.md §1/§3) — the chronological `MessageView[]`
 *  window + the page's CHAT IDENTITY producer: participant-scoped coverage (the `ChatDetail.identities` floor)
 *  UNION this page's own loaded rows' `characterId`/`personaId` stamps (covers a since-switched persona whose
 *  id isn't any participant's CURRENT active persona but is still stamped on an older row in THIS page). The
 *  client merges identity sets across pages as it paginates backward, accumulating full coverage. */
export interface MessagesPage {
  readonly messages: readonly MessageView[];
  /** This page's own loaded rows' stamp coverage — see {@link ChatDetail.identities}. */
  readonly identities: readonly ChatIdentity[];
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

/** One ACTION template resolved against a bound chat (`previewActionTemplates` — D8 / §7.1). NON-exported:
 *  its ONE consumer is {@link ActionTemplatesPreview}, which carries it across the wire (the `matrix.ts`
 *  idiom — a second exported name for the same row would be dead surface). */
interface ActionTemplatePreview {
  /** The `TEMPLATE_DEFS` row this resolution belongs to — the readout keys its rows off the SAME registry
   *  the Actions list renders from, so a new template needs no new field here. */
  readonly id: TemplateDefId;
  /** The template rendered through the chat's own macro resolution: identity/chat macros REAL, the two
   *  fire-time tokens (`{{input}}`/`{{person}}`) preserved verbatim — the §7 honesty pin's bound arm. */
  readonly resolved: string;
}

/** The preset editor's BOUND readout payload: every ACTION template of
 *  the inspected preset, resolved against the bound chat, plus the identity bindings that resolution used.
 *
 *  HOST-GATED like the rest of the preview family: a rendered template can carry `{{charsysinfo}}` /
 *  `{{description}}` / `{{persona}}`, i.e. the D22 full-fidelity card bytes `previewSection` is host-gated
 *  for. Nothing here persists — it is a dry-run render of the chat as it stands. */
export interface ActionTemplatesPreview {
  /** WHAT `{{user}}`/`{{char}}` resolved TO in this chat — the readout's bound gloss names the resolution
   *  ("`{{user}}` resolves through the chat") instead of merely claiming one happened. */
  readonly identity: { readonly user: string; readonly char: string };
  readonly templates: readonly ActionTemplatePreview[];
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
  readonly generationId: ChatStreamGenerationId | null;
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
