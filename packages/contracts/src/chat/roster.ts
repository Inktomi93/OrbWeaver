// @orb/contracts/chat/roster — the unified-roster wire (D16/D22/D80): the participant roster read-model, the
// seat-knob one-home vocabulary + the roster-member spec, the membership-gated level-clamped member card
// (D22), invites + the membership chokepoint, the resolved per-participant render policy (D44 §12.0), the
// join-history visibility clamp + its resolved `HistoryFloorSeq` brand, and true-solo composition. The
// LIFECYCLE logic is `domain/chat`; these are just the wire shapes.

import type { AssetId, CharacterId, ChatId, ChatInviteId, ChatParticipantId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { ParticipantRole } from "#identity";
import { PARTICIPANT_ROLES } from "#identity";
import type { ThemeBackground, ThemeOverride } from "#theme";
import type { MemberCardVisibility } from "./metadata";
import type { ParticipantKind } from "./participants";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE UNIFIED-ROSTER WIRE (D16) — the participant roster, the membership-gated member card (D22), invites,
// and the group-macro context. The LIFECYCLE logic is `domain/chat`; these are just the wire shapes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The `participantRoleSchema` Zod enum over the ONE-HOME `host|member` axis. ONE HOME (PD-59): the tuple +
 *  `ParticipantRole` type are DEFINED in `@orb/contracts/identity` (`can()` reads them; identity is the DAG
 *  root) — every consumer imports them from there (no second name, no alias); this only derives the schema.
 *
 *  @public schema twin of `PARTICIPANT_ROLES`, which drives the chat_participants role enum + CHECK. */
export const participantRoleSchema = z.enum(PARTICIPANT_ROLES);

/** How much history a (re)joining member sees: `full` (the whole room canon — the COLUMN DEFAULT, owner
 *  ruling: inviting someone into a room grants them its history) or `from-join` (only from their own
 *  `joinSeq`, INCLUSIVE — they see the row AT `joinSeq`, nothing below it). `from-join` is the host's
 *  OPT-IN per-participant restriction, never the ambient posture. */
export const JOIN_HISTORY_VISIBILITIES = ["from-join", "full"] as const;
export type JoinHistoryVisibility = (typeof JOIN_HISTORY_VISIBILITIES)[number];
export const joinHistoryVisibilitySchema = z.enum(JOIN_HISTORY_VISIBILITIES);

// A viewer's INCLUSIVE `messages.seq` read floor (the D16 join-history clamp resolved to a number): rows
// with `seq >= HistoryFloorSeq` are visible, rows below are pre-join and withheld. Branded (the phantom
// `unique symbol` precedent — `connection::ChatModelId`) so a bare `number` can't flow where a resolved,
// viewer-scoped floor is expected: the ONLY way to obtain one is `substrate/auth::resolveHistoryFloorSeq`
// (the one resolver) which mints it via {@link historyFloor}. The brand ERASES at runtime — it never
// crosses a wire as anything but a plain number (D-inv: no wire-shape change). NOT a zod/tool-schema field
// (a branded/transform field throws in `z.toJSONSchema`) — it rides TS-typed op params only.
declare const historyFloorBrand: unique symbol;
export type HistoryFloorSeq = number & { readonly [historyFloorBrand]: true };
/** Mint a raw `messages.seq` value as a {@link HistoryFloorSeq}. The one sanctioned cast — call it ONLY in
 *  the floor resolver (`substrate/auth::resolveHistoryFloorSeq`), never at a read site (a read consumes an
 *  already-resolved floor, it never mints one). */
export function historyFloor(seq: number): HistoryFloorSeq {
  return seq as HistoryFloorSeq;
}

const TALKATIVENESS_MIN = 0;
const TALKATIVENESS_MAX = 1;
/** The default talkativeness weight (Part III §1) — the natural-arbitration sampling weight. */
export const TALKATIVENESS_DEFAULT = 0.5;
/** The 0–1 talkativeness weight schema (default {@link TALKATIVENESS_DEFAULT}).
 *
 *  @public the named 0-1 RANGE clamp for the live `TALKATIVENESS_DEFAULT` axis (cited by seatKnobs below). */
export const talkativenessSchema = z.number().min(TALKATIVENESS_MIN).max(TALKATIVENESS_MAX).catch(TALKATIVENESS_DEFAULT).default(TALKATIVENESS_DEFAULT);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE ROSTER-MEMBER VOCABULARY (D80 — the participant five-plane model). Homed HERE (chat owns the
// runtime seats + already exports PARTICIPANT_KINDS / SpeakerRef / GroupConfig; a roster-preset domain, if
// it returns, would import from chat — identity stays the DAG root). Defined below talkativenessSchema so
// the value reference resolves.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The knobs every AI seat carries — ONE home (D80). The participantId-keyed `setSeatKnobs` verb projects
 *  this shape; the per-kind knob-verb forking is retired (it guaranteed skipped arms — the mute +
 *  talkativeness gaps proved the class). Roster presets/founding casts are unbuilt (purged with the
 *  2026-07-25 rollback) — they'd project this same shape if they return. `talkativeness` absent = inherit
 *  the chat default ({@link TALKATIVENESS_DEFAULT}); the RANGE clamp is the raw `talkativenessSchema` (0–1). */
export const seatKnobsSchema = z.object({
  talkativeness: z.number().min(TALKATIVENESS_MIN).max(TALKATIVENESS_MAX).optional(),
  disabled: z.boolean().optional(),
});
export type SeatKnobs = z.infer<typeof seatKnobsSchema>;

/** The `character` arm of {@link rosterMemberSpecSchema} — extracted so a surface that persists characters
 *  ONLY (roster presets v1, RP-D1) narrows to it without re-spelling the shape (derive, one home). A card
 *  seat: a `characterId` + `position` + the AI-seat knobs. */
export const characterMemberSpecSchema = z.object({
  kind: z.literal("character"),
  characterId: typeIdSchema(ID_PREFIX.character),
  position: z.number().int().nonnegative(),
  ...seatKnobsSchema.shape,
});
/** @public type twin of `characterMemberSpecSchema`, round-trip-pinned by tests/contracts/chat/roster.contract.test.ts. */
export type CharacterMemberSpec = z.infer<typeof characterMemberSpecSchema>;

/** A seat the caller WANTS to exist — the ONE template/creation-time member vocabulary (D16/D61/D60). Every
 *  membership-template lifetime (roster presets, founding casts, saved-rosters v2 — none built today; the
 *  rebuild grafts onto this shape) PROJECTS through it; nothing mints a flat characterId array beside it.
 *  Kind-discriminated like {@link SpeakerRef}. `human` is UNREPRESENTABLE by design (invites are the only
 *  human join path — a template cannot carry an invite's runtime preconditions); `observer` and `agent` were
 *  purged 2026-07-25 (the rebuild re-adds their arms here if either domain returns) — `character` is the
 *  only live arm. */
export const rosterMemberSpecSchema = z.discriminatedUnion("kind", [characterMemberSpecSchema]);
/** @public type twin of `rosterMemberSpecSchema`, round-trip-pinned by tests/contracts/chat/roster.contract.test.ts. */
export type RosterMemberSpec = z.infer<typeof rosterMemberSpecSchema>;

/** The RESOLVED per-participant content-render policy (D44 §12.0/§12.3). The chat domain resolves each
 *  character's tri-state overrides against the deployment effective config at roster-build time (the ONE
 *  resolution home — {@link resolveRenderPolicy}, never re-resolved client-side); the client READS these to
 *  pick the markdown render trust tier + gate external media for content THIS participant authored. Both
 *  fields are non-null (already resolved). */
export interface RenderPolicy {
  /** `true` = this participant's card/message HTML renders TRUSTED (rich HTML + Mermaid). Floor: `false`
   *  (untrusted — the D21 safe default; an admin-global or per-character opt-in escalates). */
  readonly trustHtml: boolean;
  /** `true` = external (http/https) media in this participant's content is gated behind click-to-load
   *  (the load itself is the tracking-pixel/exfil — D44 §12.3). */
  readonly forbidExternalMedia: boolean;
}

/** A LOWER-tier render-policy override as the resolver takes it — the tri-state `characters` columns
 *  (`null` = inherit the deployment tier, `true`/`false` = this card's own answer). Structural, so a
 *  `CharacterDetail` (or any future per-chat carrier of the same two columns) passes as-is. */
export interface RenderPolicyOverride {
  readonly trustHtml: boolean | null;
  readonly forbidExternalMedia: boolean | null;
}

/**
 * THE render-policy resolver — the ONE place the deployment tier and a lower tier (per-character today)
 * combine. Every producer of a {@link RenderPolicy} calls this; nobody re-spells the `??`/`||` inline.
 *
 * The two axes combine DIFFERENTLY, on purpose (owner ruling 2026-08-01):
 *  • `forbidExternalMedia` is TIGHTEN-ONLY. The deployment "Block external media" AppSetting is an
 *    ABSOLUTE ceiling — a lower tier may only restrict FURTHER, never widen. So it is an OR (deployment
 *    forbids ∨ this tier forbids), never `override ?? deployment`: a card carrying `false` (allow) on a
 *    blocking deployment must NOT re-open external media. The app-document CSP enforces the same ceiling
 *    at the browser (`entry/http/security-headers.ts` — it reads the DEPLOYMENT value only), so an
 *    `override ?? deployment` here produced a control that rendered the element and then ate a CSP block:
 *    a dead opt-in that looked live. Belt and suspenders now agree.
 *  • `trustHtml` stays `override ?? deployment`. Its deployment value is a DEFAULT, not a block: the floor
 *    is the strict end (`false`), and the per-character opt-in IS the designed escalation path (D44 §12.0).
 *    An admin-global `true` likewise stays overridable DOWN by a card. Nothing widens past a strict floor.
 */
export function resolveRenderPolicy(deployment: RenderPolicy, override: RenderPolicyOverride | null): RenderPolicy {
  return {
    trustHtml: override?.trustHtml ?? deployment.trustHtml,
    forbidExternalMedia: deployment.forbidExternalMedia || override?.forbidExternalMedia === true,
  };
}

/** The roster read-model (one `chat_participants` row, resolved for display). `kind` (∈ PARTICIPANT_KINDS)
 *  drives the identity + column shape per the `chat_participants_kind_shape` CHECK: `human` carries `userId`,
 *  `character` carries `characterId` (the old 2-way XOR was replaced at AP0; the CHECK still carries dormant
 *  `agent`/`observer` arms from the purged agent-principal build — unreachable while PARTICIPANT_KINDS stays
 *  2-member). `talkativeness`/`disabled` feed arbitration; `disabled` also drops a CHARACTER from
 *  `{{groupNotMuted}}`; `leftSeq` null = present (the "present-and-contributing" predicate). */
export interface ParticipantView {
  id: ChatParticipantId;
  chatId: ChatId;
  kind: ParticipantKind;
  userId: UserId | null;
  characterId: CharacterId | null;
  role: ParticipantRole;
  activePersonaId: PersonaId | null;
  talkativeness: number;
  disabled: boolean;
  joinedAt: number;
  joinSeq: number;
  leftSeq: number | null;
  joinHistoryVisibility: JoinHistoryVisibility;
  /** Resolved display name — one rule, no raw id ever (R10): a human's publics displayName (else handle, else
   *  a removed-member label); a character's card name (else a removed-character label). (An agent's resolved
   *  soul name was the third arm before the agent-principal purge; the rebuild re-adds it if that seat returns.) */
  displayName: string;
  /** A human's public handle (null for a character). */
  handle: Handle | null;
  /** The avatar asset (the floor — always member-visible via the D21 blob route's roster exception). */
  avatarAssetId: AssetId | null;
  /** The CAS hash of `avatarAssetId` (`assets.hash`, joined server-side) — `blobUrl(avatarHash)` is the
   *  renderable `<img src>`; `null` when `avatarAssetId` is null OR the asset row is gone. Kept a SIBLING
   *  field (never derived client-side — the client has no id→hash resolver, #67). */
  avatarHash: string | null;
  /** The RESOLVED content-render policy for content THIS participant authored (D44 §12.0 — see
   *  {@link RenderPolicy}). ALWAYS server-populated on the `getChat`/roster read; declared OPTIONAL so a
   *  partial/legacy payload or a not-yet-migrated test literal fails CLOSED at the client (absent ⇒ the
   *  untrusted + gate-external safe floor), never fails open. */
  renderPolicy?: RenderPolicy;
  /** D44 §12.1/§12.5 — the RAW per-character theme-token override (`character.themeOverride`, threaded
   *  through unmerged — themes-design.md §1: chat assembly never reads the `themes` table). `null` = no
   *  override for a character seat, or always `null` for a human seat. Resolution to "character over
   *  global over default" is a CLIENT ThemeScope NESTING concern (a per-speaker scope wrapping the root
   *  scope — `clampThemeTokens` only emits present fields, so the CSS custom-property cascade does the
   *  merge for free); the client nests a per-speaker ThemeScope inside the root scope. */
  themeOverride?: ThemeOverride | null;
  /** BG-C — the RAW per-character carried BACKGROUND source (`character.backgroundOverride`, the
   *  `themeOverride` twin), threaded unmerged. `null` = no card background for a character seat, always
   *  `null` for a human seat. In a TRUE-SOLO room (see {@link soleTrueSoloCharacter}) the sole
   *  character's carried background takes over the app-root background layer, BELOW the chat-set override;
   *  any other composition leaves it INERT (the viewer's own appearance wins). Resolution lives client-side
   *  in the app-shell background resolver. */
  backgroundOverride?: ThemeBackground | null;
}

/** BG-C true-solo composition — the ONE derivation of "exactly one human and exactly one character, no
 *  other seat", count-derived (never an `isGroup` branch). Returns the sole character's {@link ParticipantView}
 *  when the room is true-solo, else `undefined`. The shared home so the per-speaker THEME takeover
 *  (`resolveRoomTheme`, client attribution) and the CARD-CARRIED arm of the background takeover can never
 *  drift to two spellings of the same rule. */
const SOLO_COUNT = 1;
const TRUE_SOLO_SEATS = 2;
export function soleTrueSoloCharacter(participants: readonly ParticipantView[] | undefined): ParticipantView | undefined {
  if (participants === undefined) {
    return;
  }
  let characterCount = 0;
  let soleCharacter: ParticipantView | undefined;
  for (const participant of participants) {
    if (participant.kind !== "human") {
      characterCount += 1;
      soleCharacter = participant;
    }
  }
  const trueSolo = isSingleHumanRoom(participants) && characterCount === SOLO_COUNT && participants.length === TRUE_SOLO_SEATS;
  return trueSolo ? soleCharacter : undefined;
}

/** BG-C composition, WIDENED (owner ruling 2026-08-03): "this room holds no OTHER human seat" — exactly one
 *  human, any number of characters. THE gate on the carried-appearance takeover. The 07-18 ruling spelled the
 *  gate as true-solo, which ALSO excluded a single-human GROUP room — a composition its own stated rationale
 *  ("a host writing it never forces another human's viewport") does not reach: there is no second viewport.
 *  The predicate now matches the rationale exactly; a room with two humans is still, and permanently, INERT. */
export function isSingleHumanRoom(participants: readonly ParticipantView[] | undefined): boolean {
  if (participants === undefined) {
    return false;
  }
  let humanCount = 0;
  for (const participant of participants) {
    if (participant.kind === "human") {
      humanCount += 1;
    }
  }
  return humanCount === SOLO_COUNT;
}

/** The resolved carried background + WHERE it came from. The provenance arm is not decoration: the chat
 *  context panel's Background row echoes the EFFECTIVE source with its origin ("… — from <card>'s card"), so
 *  the settings echo and the painted pixels are ONE truth (the S4 override-echoed-as-default class). */
export interface CarriedBackground {
  readonly source: ThemeBackground;
  readonly arm: "chat-set" | "card-carried";
  /** The card the source rode in on (`card-carried`), else `null` — the panel's provenance gloss. */
  readonly characterName: string | null;
}

/** THE carried-background cascade (BG-C), ONE home for the app-shell paint AND the panel echo.
 *  `undefined` ⇒ nothing is carried and the viewer's own appearance wins.
 *
 *  Gate: {@link isSingleHumanRoom} — in a room with any OTHER human the carried source is INERT for everyone.
 *  Cascade inside the gate: the host's CHAT-SET source (any single-human composition) over the sole
 *  character's CARD-CARRIED source. The card arm stays {@link soleTrueSoloCharacter}-only BY RULING: with two
 *  cards in the room there is no non-arbitrary pick among their backgrounds, so a group room paints only what
 *  its host explicitly chose. An absent / `kind:"none"` source at either level falls through. */
export function resolveCarriedBackground(
  participants: readonly ParticipantView[] | undefined,
  chatBackground: ThemeBackground | null | undefined,
): CarriedBackground | undefined {
  if (!isSingleHumanRoom(participants)) {
    return;
  }
  if (chatBackground && chatBackground.kind !== "none") {
    return { source: chatBackground, arm: "chat-set", characterName: null };
  }
  const sole = soleTrueSoloCharacter(participants);
  const cardCarried = sole?.backgroundOverride;
  if (sole === undefined || !cardCarried || cardCarried.kind === "none") {
    return;
  }
  return { source: cardCarried, arm: "card-carried", characterName: sole.displayName };
}

/** The membership-gated, level-clamped PUBLIC card projection (D22 — Part III §11). Fields above the
 *  effective `visibility` level are `null` (the ONE producer is chat's `clampMemberCard` —
 *  substrate/auth/clamp.ts, PD-111 — keyed to `chatMetadata.group.memberCardVisibility`; the host always
 *  gets `full`). Read-only +
 *  while-present; viewing ≠ owning (edit/clone/export stay owner-only). Self-contained — it is a clamped
 *  PROJECTION, not the full `CharacterCard`, so `chat` needs no `→ character` edge for it. */
export interface MemberCardView {
  characterId: CharacterId;
  /** The level this projection was clamped to — the consumer reads it to know which fields are populated. */
  visibility: MemberCardVisibility;
  // ── name-avatar floor (always present) ───────────────────────────────────
  name: string;
  avatarAssetId: AssetId | null;
  /** The CAS hash of `avatarAssetId` — see {@link ParticipantView.avatarHash}. Same always-present floor
   *  as `avatarAssetId` (never clamped by `visibility`). */
  avatarHash: string | null;
  // ── sheet (>= `sheet`) ───────────────────────────────────────────────────
  description: string | null;
  personality: string | null;
  scenario: string | null;
  greetings: string[] | null;
  exampleMessages: string | null;
  tags: string[] | null;
  creatorNotes: string | null;
  // ── sheet+lore (>= `sheet+lore`) ─────────────────────────────────────────
  /** The character's world-info entry contents (rendered), or null below `sheet+lore`. */
  lore: string[] | null;
  // ── full (== `full`): the prompt-steering internals ──────────────────────
  systemPrompt: string | null;
  postHistoryInstructions: string | null;
  authorsNoteDepth: number | null;
}

// ── HOST HANDOFF — the departing host's OPT-IN property offer (stickler 2026-08-03 §5/§6(f)) ──

/** What the DEPARTING host optionally gives the nominee alongside the room, persisted on
 *  `chats.pendingHandoffOffer` at NOMINATE and executed at ACCEPT (copy-at-accept: acceptance is what freezes
 *  the point in time, and nobody receives property they have not accepted).
 *
 *  CLASS-LEVEL, never per-item (owner ruling 2026-08-03: "the name of the game is OPTIONS … a POINT-IN-TIME
 *  COPY of their characters, worldbooks, the message variants"). A per-item matrix is the jank the ruling's
 *  own addendum asked to avoid; the blob is an OBJECT rather than a boolean precisely so a later per-class
 *  arm needs no schema churn.
 *
 *  BOTH FIELDS FALSE ⇒ byte-identical to a handoff with no offer at all: the built D64 drop runs, the
 *  `gmPresetId` heal runs, and nothing is copied. A `null` column is the same thing said by absence.
 *
 *  Message VARIANTS are deliberately absent from this shape: they are `messages`/`message_variants` rows
 *  keyed to THIS chat, so they transfer with the room by construction — there is nothing to copy and nothing
 *  to opt into. */
export const handoffOfferSchema = z.object({
  /** Copy the OLD HOST's seated cast into the nominee's library and re-point this room's seats at the
   *  copies: their present character seats, each card's attached character-scoped world books AS COPIES
   *  (a reference-carry would silently lose the lore — the character-book pool is owner-filtered), and the
   *  host-owned chat-attached books. `false` ⇒ the D64 drop (the seats the nominee cannot resolve are
   *  leftSeq-stamped, exactly as today). */
  copyCast: z.boolean(),
  /** Copy the game's GM-voice preset into the nominee's library and re-point `rpg_games.gmPresetId` at the
   *  copy. `false` (or a non-game room / an unset knob) ⇒ the built conditional heal stands: a preset the
   *  nominee cannot read is NULLED rather than left lying about the room's voice. */
  copyGmPreset: z.boolean(),
});
/** Type twin of {@link handoffOfferSchema} — the `chats.pending_handoff_offer` column's `$type<>`,
 *  the `nominateHostHandoff` wire field, and the accept-side copy plan's input. */
export type HandoffOffer = z.infer<typeof handoffOfferSchema>;

/** The no-offer offer — the shape a `null` column means, spelled once so no consumer re-spells
 *  `{ copyCast: false, copyGmPreset: false }` and no arm can drift from the byte-identical default. */
export const NO_HANDOFF_OFFER: HandoffOffer = { copyCast: false, copyGmPreset: false };

// ── Invites & the membership chokepoint (Part III §2; D16) ──
const INVITE_MAX_USES_MIN = 1;
const INVITE_MAX_USES_MAX = 10_000;
const INVITE_TOKEN_MIN = 1;

/** Invite lifecycle status (the db `chat_invites.status` column mirrors this). */
export const INVITE_STATUSES = ["pending", "accepted", "declined", "revoked", "expired"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];
/** @public schema twin of `INVITE_STATUSES`, which drives the chat_invites status enum + CHECK. */
export const inviteStatusSchema = z.enum(INVITE_STATUSES);

/** Create an invite (host action). Two creation paths: a share-link (no target) OR targeted-by-handle
 *  (`invitedHandle`, resolved to a user server-side). The `token` is CSPRNG-minted + stored HASHED on the
 *  server — NEVER a client input, never returned in a view. `role` is server-forced `member` on redeem. */
export const createInviteSchema = z.object({
  maxUses: z.number().int().min(INVITE_MAX_USES_MIN).max(INVITE_MAX_USES_MAX).optional(),
  expiresAt: z.number().int().nullable().optional(),
  /** Targeted-by-handle: the exact public handle to invite (no user directory/listing). */
  invitedHandle: brandedId<Handle>().nullable().optional(),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/** Preview an invite before confirming (the accept = preview-then-confirm flow). Carries the raw token. */
export const previewInviteSchema = z.object({
  token: z.string().min(INVITE_TOKEN_MIN),
});
export type PreviewInviteInput = z.infer<typeof previewInviteSchema>;

/** Redeem an invite (the ONE participant-insert chokepoint, atomic). Carries the raw token. */
export const redeemInviteSchema = z.object({
  token: z.string().min(INVITE_TOKEN_MIN),
});
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>;

/** Accept a TARGETED invite by its id — the in-app notification→accept path (the token-free twin of
 *  `redeemInviteSchema`). No raw token: the invitee's own authenticated identity is the authorization (the
 *  invite is BOUND to their `invitedUserId`), so the `/join/:token` link never has to leave the app. Keyed by
 *  the `inviteId` the durable `invite` notification carries — the same handle `declineInvite` takes. A
 *  share-link (untargeted) invite is NOT acceptable by id (token-only); a foreign/invalid id is a leak-free
 *  NOT_FOUND downstream. */
export const acceptInviteSchema = z.object({
  inviteId: brandedId<ChatInviteId>(),
});
/** @public type twin of `acceptInviteSchema`, the live `acceptInvite` tRPC input. */
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** The preview-then-confirm result — deliberately MINIMAL: room name / host handle / member COUNT / mode
 *  label ONLY. NO roster identities, NO history (Part III §2 — those replay from `joinSeq` AFTER accept). */
export interface InvitePreview {
  chatId: ChatId;
  roomName: string;
  hostHandle: Handle;
  memberCount: number;
  /** A human-readable mode label (e.g. the output × policy summary) — never the raw config. */
  modeLabel: string;
}

/** An invite as the host manages it. NEVER carries the token (raw or hashed) — a leak would let anyone
 *  redeem. `remainingUses` is `maxUses` minus redemptions (null = unlimited). */
export interface InviteView {
  id: ChatInviteId;
  chatId: ChatId;
  status: InviteStatus;
  maxUses: number | null;
  remainingUses: number | null;
  expiresAt: number | null;
  /** The targeted user when created by handle; null for an open share-link. */
  invitedUserId: UserId | null;
  createdAt: number;
}
