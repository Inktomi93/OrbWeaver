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
 *  root) — every consumer imports them from there (no second name, no alias); this only derives the schema. */
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
/** The 0–1 talkativeness weight schema (default {@link TALKATIVENESS_DEFAULT}). */
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
export type CharacterMemberSpec = z.infer<typeof characterMemberSpecSchema>;

/** A seat the caller WANTS to exist — the ONE template/creation-time member vocabulary (D16/D61/D60). Every
 *  membership-template lifetime (roster presets, founding casts, saved-rosters v2 — none built today; the
 *  rebuild grafts onto this shape) PROJECTS through it; nothing mints a flat characterId array beside it.
 *  Kind-discriminated like {@link SpeakerRef}. `human` is UNREPRESENTABLE by design (invites are the only
 *  human join path — a template cannot carry an invite's runtime preconditions); `observer` and `agent` were
 *  purged 2026-07-25 (the rebuild re-adds their arms here if either domain returns) — `character` is the
 *  only live arm. */
export const rosterMemberSpecSchema = z.discriminatedUnion("kind", [characterMemberSpecSchema]);
export type RosterMemberSpec = z.infer<typeof rosterMemberSpecSchema>;

/** The RESOLVED per-participant content-render policy (D44 §12.0/§12.3) — `override ?? global`. The chat
 *  domain resolves each character's tri-state overrides against the deployment effective config at
 *  roster-build time (the ONE resolution home — never re-resolved client-side); the client READS these to
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
 *  (`resolveRoomTheme`, client attribution) and the per-chat BACKGROUND takeover (the app-shell background
 *  resolver) can never drift to two spellings of the same rule. */
const SOLO_COUNT = 1;
const TRUE_SOLO_SEATS = 2;
export function soleTrueSoloCharacter(participants: readonly ParticipantView[] | undefined): ParticipantView | undefined {
  if (participants === undefined) {
    return;
  }
  let humanCount = 0;
  let characterCount = 0;
  let soleCharacter: ParticipantView | undefined;
  for (const participant of participants) {
    if (participant.kind === "human") {
      humanCount += 1;
    } else {
      characterCount += 1;
      soleCharacter = participant;
    }
  }
  const trueSolo = humanCount === SOLO_COUNT && characterCount === SOLO_COUNT && participants.length === TRUE_SOLO_SEATS;
  return trueSolo ? soleCharacter : undefined;
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

// ── Invites & the membership chokepoint (Part III §2; D16) ──
const INVITE_MAX_USES_MIN = 1;
const INVITE_MAX_USES_MAX = 10_000;
const INVITE_TOKEN_MIN = 1;

/** Invite lifecycle status (the db `chat_invites.status` column mirrors this). */
export const INVITE_STATUSES = ["pending", "accepted", "declined", "revoked", "expired"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];
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
