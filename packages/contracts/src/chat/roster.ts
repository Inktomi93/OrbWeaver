// @orb/contracts/chat/roster — the unified-roster wire (D16/D22/D80): the participant roster read-model, the
// seat-knob one-home vocabulary + the roster-member spec, the membership-gated level-clamped member card
// (D22), invites + the membership chokepoint, the resolved per-participant render policy (D44 §12.0), the
// join-history visibility clamp + its resolved `HistoryFloorSeq` brand, and the phase-independent
// carried appearance (the true-solo composition both takeovers gate on). The
// LIFECYCLE logic is `domain/chat`; these are just the wire shapes.

import type { AssetId, CharacterId, ChatId, ChatParticipantId, Handle, PersonaId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { ParticipantRole } from "#identity";
import { PARTICIPANT_ROLES } from "#identity";
import type { CardEmbeddableTheme, ThemeBackground, ThemeOverride } from "#theme";
import { cardEmbeddableSubset, themeBackgroundSchema, themeOverrideSchema } from "#theme";
import type { MemberCardVisibility } from "./metadata.ts";
import type { ParticipantKind } from "./participants.ts";
import { participantKindSchema } from "./participants.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE UNIFIED-ROSTER WIRE (D16) — the participant roster, the membership-gated member card (D22), invites,
// and the group-macro context. The LIFECYCLE logic is `domain/chat`; these are just the wire shapes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The `participantRoleSchema` Zod enum over the ONE-HOME `host|member` axis. ONE HOME: the tuple +
 *  `ParticipantRole` type are DEFINED in `@orb/contracts/identity` (`can()` reads them; identity is the DAG
 *  root) — every consumer imports them from there (no second name, no alias); this only derives the schema.
 *
 *  @public twin: PARTICIPANT_ROLES — drives the chat_participants role enum + CHECK (cross-package PUBLIC). */
export const participantRoleSchema = z.enum(PARTICIPANT_ROLES) satisfies z.ZodType<ParticipantRole>;

/** How much history a (re)joining member sees: `full` (the whole room canon — the COLUMN DEFAULT, owner
 *  ruling: inviting someone into a room grants them its history) or `from-join` (only from their own
 *  `joinSeq`, INCLUSIVE — they see the row AT `joinSeq`, nothing below it). `from-join` is the host's
 *  OPT-IN per-participant restriction, never the ambient posture. */
export const JOIN_HISTORY_VISIBILITIES = ["from-join", "full"] as const;
export type JoinHistoryVisibility = (typeof JOIN_HISTORY_VISIBILITIES)[number];
export const joinHistoryVisibilitySchema = z.enum(JOIN_HISTORY_VISIBILITIES) satisfies z.ZodType<JoinHistoryVisibility>;

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
// `talkativenessSchema` (a .catch/.default-ing 0–1 clamp) was DELETED 2026-08-28 (#26 pre-merge F5): its
// predicted-future consumer — the roster-preset seat-knobs projection — arrived and stores the knob
// through `characterMemberSpecSchema`'s inline clamp instead (NULL-means-inherit semantics, which the
// defaulting schema could not express), so the prediction died on arrival and the export had no consumer.

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE ROSTER-MEMBER VOCABULARY (D80 — the participant five-plane model). Homed HERE (chat owns the
// runtime seats + already exports PARTICIPANT_KINDS / SpeakerRef / GroupConfig; the roster-preset domain
// imports from chat — identity stays the DAG root; #26 is the live consumer).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The knobs every AI seat carries — ONE home (D80). The participantId-keyed `setSeatKnobs` verb projects
 *  this shape; the per-kind knob-verb forking is retired (it guaranteed skipped arms — the mute +
 *  talkativeness gaps proved the class). Roster presets are BUILT (#26, D61 B6 — `domain/roster-preset`):
 *  the `roster_preset_members` junction's talkativeness/disabled columns and `applyToChat`'s `setSeatKnobs`
 *  patch project exactly this shape. Founding character sets stay unbuilt (they graft onto the same shape if they
 *  return). `talkativeness` absent = inherit the chat default ({@link TALKATIVENESS_DEFAULT}). */
export const seatKnobsSchema = z.object({
  talkativeness: z.number().min(TALKATIVENESS_MIN).max(TALKATIVENESS_MAX).optional(),
  disabled: z.boolean().optional(),
});
export type SeatKnobs = z.infer<typeof seatKnobsSchema>;

/** The `character` arm of {@link rosterMemberSpecSchema} — extracted so a surface that persists characters
 *  ONLY narrows to it without re-spelling the shape (derive, one home). LIVE consumer: roster presets v1
 *  (#26 — `@orb/contracts/roster-preset`'s `rosterPresetMemberSchema` IS this schema). A card seat: a
 *  `characterId` + `position` + the AI-seat knobs. */
export const characterMemberSpecSchema = z.object({
  kind: z.literal("character"),
  characterId: typeIdSchema(ID_PREFIX.character),
  position: z.number().int().nonnegative(),
  ...seatKnobsSchema.shape,
});
export type CharacterMemberSpec = z.infer<typeof characterMemberSpecSchema>;

/** A seat the caller WANTS to exist — the ONE template/creation-time member vocabulary (D16/D61/D60). Every
 *  membership-template lifetime PROJECTS through it; nothing mints a flat characterId array beside it.
 *  Roster presets are BUILT (#26) and project through the `character` arm; founding character sets and
 *  saved-rosters v2 remain unbuilt (they graft onto this shape). Kind-discriminated like
 *  {@link SpeakerRef}. `human` is UNREPRESENTABLE by design (invites are the only human join path — a
 *  template cannot carry an invite's runtime preconditions); `observer` and `agent` were purged 2026-07-25
 *  (the rebuild re-adds their arms here if either domain returns) — `character` is the only live arm. */
export const rosterMemberSpecSchema = z.discriminatedUnion("kind", [characterMemberSpecSchema]);
export type RosterMemberSpec = z.infer<typeof rosterMemberSpecSchema>;

/** The RESOLVED per-participant content-render policy (D44 §12.0/§12.3). The chat domain resolves each
 *  character's tri-state overrides against the deployment effective config at roster-build time (the ONE
 *  resolution home — {@link resolveRenderPolicy}, never re-resolved client-side); the client READS these to
 *  pick the markdown render trust tier + gate external media for content THIS participant authored. Every
 *  field is non-null (already resolved). */
/**
 * ONE ORDERED LADDER for how much a participant's authored HTML may do (owner ruling 2026-08-16, #111 —
 * "one ladder control, not a second checkbox"). Strictly increasing, and the order IS the meaning:
 *
 *   `untrusted`   — the D21 safe default. Sanitized markdown; a card renders in the inert tierA seal.
 *   `trusted`     — rich HTML + Mermaid render (still SANITIZED — no script/iframe/style/`on*`), and a
 *                   card gets the sandboxed tierB frame (D44 §12.0).
 *   `interactive` — everything `trusted` has, PLUS the card frame is built under the `interactive`
 *                   {@link https://github.com/Inktomi93/orbweaver/issues/111} posture, which since leg 3's
 *                   security pass RUNS the card's own scripts inside that sandbox.
 *
 * THE TOP RUNG IS THE LADDER'S ONLY CAPABILITY JUMP, and this is worth saying because a sibling comment
 * once had it backwards: `trusted` widens what markup renders, but the renderer sanitizes it, so no rung
 * below `interactive` executes author code at all. `interactive` is the first and only one that does — and
 * it is the one rung that also needs the deployment operator's consent ({@link DeploymentRenderPolicy}).
 *
 * INTERACTIVE IMPLIES TRUSTED BY CONSTRUCTION — that is the whole reason this is a ladder and not two
 * booleans: with two flags, "interactive but not trusted" is representable, and every consumer has to
 * decide what that fourth state means (four different consumers, four answers). Here it cannot be said.
 * Read the axis through {@link rendersTrustedHtml} / {@link allowsInteractiveCards}, never by re-spelling
 * a comparison.
 */
export const HTML_TRUST_STEPS = ["untrusted", "trusted", "interactive"] as const;
export type HtmlTrustStep = (typeof HTML_TRUST_STEPS)[number];

/** Does this step render the author's HTML as TRUSTED (rich HTML/Mermaid, the tierB card frame)? True for
 *  every step above the floor — `interactive` includes `trusted` by construction. */
export function rendersTrustedHtml(step: HtmlTrustStep): boolean {
  return step !== "untrusted";
}

/** Does this step select the INTERACTIVE card-frame posture — i.e. may this participant's routed cards RUN
 *  THEIR OWN SCRIPTS? Only the top step, and since #111 leg 3 that is a real capability rather than an arm
 *  selection. A step only REACHES `interactive` when the deployment ceiling allowed it ({@link
 *  resolveRenderPolicy}), so a reader of the resolved ladder never has to re-check the AppSetting. */
export function allowsInteractiveCards(step: HtmlTrustStep): boolean {
  return step === "interactive";
}

export interface RenderPolicy {
  /** The RESOLVED HTML-trust step — the single ordered axis (see {@link HTML_TRUST_STEPS}). */
  readonly htmlTrust: HtmlTrustStep;
  /** `true` = external (http/https) media in this participant's content is gated behind click-to-load
   *  (the load itself is the tracking-pixel/exfil — D44 §12.3). */
  readonly forbidExternalMedia: boolean;
}

/** The strict runtime twin of {@link RenderPolicy} — a nested member of {@link participantViewSchema}. */
export const renderPolicySchema = z.strictObject({
  htmlTrust: z.enum(HTML_TRUST_STEPS),
  forbidExternalMedia: z.boolean(),
}) satisfies z.ZodType<RenderPolicy>;

/** The DEPLOYMENT tier as the resolver takes it. Deliberately NOT a {@link HtmlTrustStep}: the two rungs
 *  have two DIFFERENT app-tier semantics (a default vs a ceiling — see {@link resolveRenderPolicy}), and
 *  one enum value could not say both. */
export interface DeploymentRenderPolicy {
  readonly trustHtml: boolean;
  readonly forbidExternalMedia: boolean;
  /** The `allowInteractiveCards` AppSetting — the deployment operator's consent to run model-authored card
   *  scripts in a viewer's browser at all. FLOOR IS FALSE, and it is an absolute CEILING (an AND, never
   *  `override ??`): a per-character opt-in cannot reach the top rung without it. Built as a precondition
   *  of the #111 leg-3 grant, not as a convenience — that grant opens a WebRTC/STUN beacon no CSP directive
   *  in Chromium can close (`@orb/kit/card-frame` residual R1), so declining the whole posture is the only
   *  control that exists for it. */
  readonly allowInteractiveCards: boolean;
}

/** A LOWER-tier render-policy override as the resolver takes it — the tri-state `characters` columns
 *  (`null` = inherit the deployment tier, `true`/`false` = this card's own answer). Structural, so a
 *  `CharacterDetail` (or any future per-chat carrier of the same columns) passes as-is. */
export interface RenderPolicyOverride {
  readonly trustHtml: boolean | null;
  readonly forbidExternalMedia: boolean | null;
  /** `characters.interactive_html` — the HOST's half of the top step's two consents, stored as its own
   *  column beside `trust_html` rather than as an enum, so the two-tier `override ?? deployment` semantics
   *  of the render step survive unchanged. Tri-state in SHAPE, two-valued in MEANING: the deployment tier
   *  is a CEILING rather than something to inherit, so `null` and `false` are both "the host did not opt
   *  in". The LADDER is what consumers read ({@link RenderPolicy.htmlTrust}); this pair is only ever the
   *  resolver's input. */
  readonly interactiveHtml: boolean | null;
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
 *  • the HTML-TRUST LADDER folds the two stored columns into ONE ordered step, and the fold is where
 *    "interactive implies trusted" becomes unrepresentable-otherwise (owner ruling 2026-08-16):
 *      – the RENDER step keeps `override ?? deployment`, unchanged. Its deployment value is a DEFAULT, not
 *        a block: the floor is the strict end (`untrusted`), and the per-character opt-in IS the designed
 *        escalation path (D44 §12.0); an admin-global `true` likewise stays overridable DOWN by a card.
 *      – the INTERACTIVE step needs BOTH consents and is therefore an AND, the `forbidExternalMedia` shape
 *        rather than the render step's: the deployment `allowInteractiveCards` is an absolute CEILING
 *        (floor FALSE) and the per-character `interactiveHtml` is the host's opt-in under it. Neither
 *        alone reaches the rung. Ruled by the leg-3 security pass (#111) — the grant runs model-authored
 *        code, and its WebRTC residual is not closeable by policy, so the operator of the box gets a veto.
 *        Inside the ceiling the rung WINS over a lower render answer rather than combining with it: a card
 *        carrying the contradictory pair `{ trustHtml: false, interactiveHtml: true }` — reachable only by
 *        a direct API write, never by the single ladder control — resolves to `interactive`, and no
 *        consumer ever sees "runs scripts but renders untrusted". When the CEILING vetoes, that same card
 *        falls back to its own stored render answer (`untrusted` here), never to a rung it did not store.
 *        `=== true`, never truthiness: `null` is "never opted in".
 */
export function resolveRenderPolicy(deployment: DeploymentRenderPolicy, override: RenderPolicyOverride | null): RenderPolicy {
  const trusted = override?.trustHtml ?? deployment.trustHtml;
  const renderStep: HtmlTrustStep = trusted ? "trusted" : "untrusted";
  const interactive = deployment.allowInteractiveCards && override?.interactiveHtml === true;
  return {
    htmlTrust: interactive ? "interactive" : renderStep,
    forbidExternalMedia: deployment.forbidExternalMedia || override?.forbidExternalMedia === true,
  };
}

/** The stored column pair one ladder step means — the ONE home for the write direction, so a surface that
 *  offers the ladder cannot invent a contradictory pair. `null` (inherit) is NOT a step: it is the absence
 *  of an override, and a caller writes `{ trustHtml: null, interactiveHtml: null }` for it directly. */
export function renderPolicyOverrideForStep(step: HtmlTrustStep): { readonly trustHtml: boolean; readonly interactiveHtml: boolean } {
  return { trustHtml: rendersTrustedHtml(step), interactiveHtml: allowsInteractiveCards(step) };
}

/** The ladder step a stored override PAIR reads back as, or `null` when the render step is inherited. The
 *  inverse of {@link renderPolicyOverrideForStep} — one home, so a control's displayed value and the
 *  resolver can never disagree about what a row says. */
export function stepFromRenderPolicyOverride(override: Pick<RenderPolicyOverride, "trustHtml" | "interactiveHtml">): HtmlTrustStep | null {
  if (override.interactiveHtml === true) {
    return "interactive";
  }
  if (override.trustHtml === null) {
    return null;
  }
  return override.trustHtml ? "trusted" : "untrusted";
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
  // @view-server-only: the D16 history-horizon + roster ORDER key, and the clamp resolver is the single authority (read.ts:342, persistence/participants-read.ts:30) — the server returns seats already ordered by it, so a client read would be a second clamp authority. Ends if a join-history affordance renders the seq itself.
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
   *  through unmerged — chat assembly never reads the `themes` table). `null` = no
   *  override for a character seat, or always `null` for a human seat. Resolution to "character over
   *  global over default" is a CLIENT ThemeScope NESTING concern (a per-speaker scope wrapping the root
   *  scope — `clampThemeTokens` only emits present fields, so the CSS custom-property cascade does the
   *  merge for free); the client nests a per-speaker ThemeScope inside the root scope.
   *  Every card-sourced READ projects through `cardEmbeddableSubset` (contracts/theme) first: the
   *  blob is raw and may carry a viewer-sacred key (a legacy write, or a hand-posted one), and a card
   *  supplies the room's LOOK, never the viewer's ergonomics (TD §3). */
  themeOverride?: ThemeOverride | null;
  /** BG-C — the RAW per-character carried BACKGROUND source (`character.backgroundOverride`, the
   *  `themeOverride` twin), threaded unmerged. `null` = no card background for a character seat, always
   *  `null` for a human seat. In a TRUE-SOLO room (see {@link CarriedAppearance}) the sole
   *  character's carried background takes over the app-root background layer, BELOW the chat-set override;
   *  any other composition leaves it INERT (the viewer's own appearance wins). Resolution lives client-side
   *  in the app-shell background resolver. */
  backgroundOverride?: ThemeBackground | null;
}

/** The strict runtime twin of {@link ParticipantView}, used as a tRPC output parser (the invite join results
 *  carry the joiner's row and the room roster). An unexpected key fails the parse. The three carried blobs
 *  reuse their own lenient read schemas (`themeOverrideSchema`, `themeBackgroundSchema`): those heal a stored
 *  legacy value and strip an unknown key rather than failing, so a stale card blob cannot fail a join after the
 *  participant insert has committed, and still cannot put an extra key on the wire. */
export const participantViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.chatParticipant),
  chatId: typeIdSchema(ID_PREFIX.chat),
  kind: participantKindSchema,
  userId: brandedId<UserId>().nullable(),
  characterId: typeIdSchema(ID_PREFIX.character).nullable(),
  role: participantRoleSchema,
  activePersonaId: typeIdSchema(ID_PREFIX.persona).nullable(),
  talkativeness: z.number(),
  disabled: z.boolean(),
  joinedAt: z.number(),
  joinSeq: z.number(),
  leftSeq: z.number().nullable(),
  joinHistoryVisibility: joinHistoryVisibilitySchema,
  displayName: z.string(),
  handle: brandedId<Handle>().nullable(),
  avatarAssetId: typeIdSchema(ID_PREFIX.asset).nullable(),
  avatarHash: z.string().nullable(),
  renderPolicy: renderPolicySchema.exactOptional(),
  // Lenient on purpose: strips and heals a stale stored blob so it cannot fail a committed join; no secrets here.
  themeOverride: themeOverrideSchema.nullable().exactOptional(),
  // Lenient on purpose: strips and heals a stale stored blob so it cannot fail a committed join; no secrets here.
  backgroundOverride: themeBackgroundSchema.nullable().exactOptional(),
}) satisfies z.ZodType<ParticipantView>;

/** One character seat's carried APPEARANCE — the card-authored look a room may take over (the theme half,
 *  D44 §12.1, and the background half, BG-C). Deliberately the MINIMAL projection: it is the most a
 *  pre-send DRAFT can honestly produce, since a draft has no `chat_participants` row to read. */
export interface CarriedAppearanceMember {
  readonly displayName: string;
  readonly themeOverride: ThemeOverride | null;
  readonly backgroundOverride: ThemeBackground | null;
}

/**
 * The room COMPOSITION the carried-appearance rules read — human seats counted, character seats carried.
 *
 * ONE shape for BOTH chat phases, and that is the point. The takeover rules used to be spelled over
 * `ParticipantView[]`, which only a COMMITTED chat has, so the whole carried look (background + room theme)
 * was silently gated on a server row existing: a brand-new chat wore the viewer's default chrome until its
 * first message landed and then re-skinned itself (owner dogfood 2026-08-06 — "backgrounds and avatars
 * don't show up until the first message"). A committed room projects this off its roster
 * ({@link carriedAppearanceFromParticipants}); a draft projects it off its founding CARDS plus the viewer's own
 * single seat. The rules below read only this shape, so the two phases cannot resolve a card's look
 * differently.
 */
export interface CarriedAppearance {
  /** Human seats on the roster. Counted exactly as the pre-#903 `isSingleHumanCast` counted them — every `human`
   *  row, `leftSeq` NOT consulted. A pre-send draft has exactly one: the viewer (an invite can only land
   *  once the chat exists). */
  readonly humanCount: number;
  readonly characters: readonly CarriedAppearanceMember[];
}

const SOLO_COUNT = 1;

/** The COMMITTED-room projection: a `getChat` roster → the composition the takeover rules read. */
export function carriedAppearanceFromParticipants(participants: readonly ParticipantView[] | undefined): CarriedAppearance {
  const characters: CarriedAppearanceMember[] = [];
  let humanCount = 0;
  for (const participant of participants ?? []) {
    if (participant.kind === "human") {
      humanCount += 1;
      continue;
    }
    characters.push({
      displayName: participant.displayName,
      themeOverride: participant.themeOverride ?? null,
      backgroundOverride: participant.backgroundOverride ?? null,
    });
  }
  return { humanCount, characters };
}

/** BG-C true-solo composition — the ONE derivation of "exactly one human and exactly one character, no
 *  other seat", count-derived (never an `isGroup` branch). The shared gate, so the room THEME takeover and
 *  the CARD-CARRIED arm of the background takeover can never drift to two spellings of the same rule. */
function soleCarriedCharacter(appearance: CarriedAppearance): CarriedAppearanceMember | undefined {
  return appearance.humanCount === SOLO_COUNT && appearance.characters.length === SOLO_COUNT ? appearance.characters[0] : undefined;
}

/** "This room holds no OTHER human seat" — exactly one human, any number of characters (owner ruling
 *  2026-08-03, WIDENING the 07-18 true-solo spelling). THE gate on the carried-appearance takeover: the
 *  stated rationale ("a host writing it never forces another human's viewport") does not reach a
 *  single-human GROUP room, because there is no second viewport. Two humans stays permanently INERT. */
function isSingleHumanRoom(appearance: CarriedAppearance): boolean {
  return appearance.humanCount === SOLO_COUNT;
}

/** THE room-THEME takeover (D44 §12.1), ONE home for both chat phases: in a true-solo room the sole
 *  character's authored theme wins at the chat root; any other composition keeps the viewer's own theme
 *  (`undefined`). What rides is the CARD-EMBEDDABLE subset only — a card supplies the room's LOOK, never
 *  the viewer's ergonomics (TD §3). */
export function resolveCarriedTheme(appearance: CarriedAppearance): CardEmbeddableTheme | undefined {
  const override = soleCarriedCharacter(appearance)?.themeOverride;
  return override === null || override === undefined ? undefined : cardEmbeddableSubset(override);
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

/** THE carried-background cascade (BG-C), ONE home for the app-shell paint AND the panel echo — over the
 *  phase-independent {@link CarriedAppearance}, so a draft resolves it identically to the committed
 *  room it becomes. `undefined` ⇒ nothing is carried and the viewer's own appearance wins.
 *
 *  Gate: {@link isSingleHumanRoom} — in a room with any OTHER human the carried source is INERT for everyone.
 *  Cascade inside the gate: the host's CHAT-SET source (any single-human composition) over the sole
 *  character's CARD-CARRIED source. The card arm stays {@link soleCarriedCharacter}-only BY RULING: with two
 *  cards in the room there is no non-arbitrary pick among their backgrounds, so a group room paints only what
 *  its host explicitly chose. An absent / `kind:"none"` source at either level falls through. (A draft has no
 *  chat-set source at all — that column is written only by a post-creation chat verb — so its cascade is the
 *  card arm alone.) */
export function resolveCarriedBackgroundForAppearance(
  appearance: CarriedAppearance,
  chatBackground: ThemeBackground | null | undefined,
): CarriedBackground | undefined {
  if (!isSingleHumanRoom(appearance)) {
    return;
  }
  if (chatBackground && chatBackground.kind !== "none") {
    return { source: chatBackground, arm: "chat-set", characterName: null };
  }
  const sole = soleCarriedCharacter(appearance);
  const cardCarried = sole?.backgroundOverride;
  if (sole === undefined || !cardCarried || cardCarried.kind === "none") {
    return;
  }
  return { source: cardCarried, arm: "card-carried", characterName: sole.displayName };
}

/** The COMMITTED-roster front door onto {@link resolveCarriedBackgroundForAppearance} (the chat-set arm's only
 *  caller shape — a chat background exists only once the chat does). */
export function resolveCarriedBackground(
  participants: readonly ParticipantView[] | undefined,
  chatBackground: ThemeBackground | null | undefined,
): CarriedBackground | undefined {
  return resolveCarriedBackgroundForAppearance(carriedAppearanceFromParticipants(participants), chatBackground);
}

/** The membership-gated, level-clamped PUBLIC card projection (D22 — Part III §11). Fields above the
 *  effective `visibility` level are `null` (the ONE producer is chat's `clampMemberCard` —
 *  substrate/auth/clamp.ts — keyed to `chatMetadata.group.memberCardVisibility`; the host always
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
  /** Copy the OLD HOST's seated characters into the nominee's library and re-point this room's seats at the
   *  copies: their present character seats, each card's attached character-scoped world books AS COPIES
   *  (a reference-carry would silently lose the lore — the character-book pool is owner-filtered), the
   *  host-owned chat-attached books, and the host-owned chat-attached REGEX SCRIPTS (#1739 — the executable
   *  member of the same set: left behind, they keep transforming the new host's turns under an owner who has
   *  left). `false` ⇒ the D64 drop (the seats the nominee cannot resolve are leftSeq-stamped, exactly as
   *  today) and nothing is copied — the incoming host's remedy for a left-behind script is `detachFromChat`,
   *  which gates on the ROOM. */
  copyCharacters: z.boolean(),
  /** Copy the game's GM-voice preset into the nominee's library and re-point `rpg_games.gmPresetId` at the
   *  copy. `false` (or a non-game room / an unset knob) ⇒ the built conditional heal stands: a preset the
   *  nominee cannot read is NULLED rather than left lying about the room's voice. */
  copyGmPreset: z.boolean(),
});
/** Type twin of {@link handoffOfferSchema} — the `chats.pending_handoff_offer` column's `$type<>`,
 *  the `nominateHostHandoff` wire field, and the accept-side copy plan's input. */
export type HandoffOffer = z.infer<typeof handoffOfferSchema>;

/** The no-offer offer — the shape a `null` column means, spelled once so no consumer re-spells
 *  `{ copyCharacters: false, copyGmPreset: false }` and no arm can drift from the byte-identical default. */
export const NO_HANDOFF_OFFER: HandoffOffer = { copyCharacters: false, copyGmPreset: false };

/** WHAT AN ACCEPTED OFFER WOULD LAND IN THE NOMINEE'S LIBRARY — the DISCLOSURE half of the offer (#1762),
 *  frozen at NOMINATE and carried by the `handoff-nominated` notification so the nominee can read what they
 *  are accepting before they accept it. The receiving side used to render a bare Accept for a press that
 *  copied four classes of someone else's property — including the room's REGEX SCRIPTS, which are executable
 *  transforms over the accepter's own chats (#1739).
 *
 *  COUNTS, NEVER IDS. A nominee cannot resolve the departing host's character/book/script ids (they own
 *  none of those rows yet), so an id here would be an unreadable pointer AND a disclosure of another user's
 *  library keys beyond what the offer already implies. The count is the whole decision input; the rows
 *  themselves arrive as ordinary library rows the moment they accept, theirs to inspect and delete.
 *
 *  A POINT-IN-TIME PREVIEW, resolved from the SAME resolvers the accept executes (chat's
 *  `previewHandoffCopyPlan` beside `resolveHandoffCopyPlan`), never a second count of its own. It can still
 *  differ from what finally lands: the offer is executed at ACCEPT (§5 — acceptance is what freezes the
 *  point in time), so a card the host deletes in between is disclosed and then absent. That direction is the
 *  honest one — the disclosure is a ceiling on what the accept can copy, never a floor.
 *
 *  ZEROS ARE SENT, NOT OMITTED: "this gives you nothing" is a fact the nominee needs, and an absent field
 *  would make the confirm's silence ambiguous between "nothing" and "unknown". */
export const handoffOfferContentsSchema = z.object({
  /** Seated characters that would be copied — the old host's cards the nominee does not already own. */
  characters: z.number().int().min(0),
  /** Distinct world books that would be copied: the copied cards' attached lore plus the room's own books. */
  worldBooks: z.number().int().min(0),
  /** Chat-tier regex scripts that would be copied — EXECUTABLE find/replace over this room's text. */
  regexScripts: z.number().int().min(0),
  /** Would the game's GM voice preset be copied? False for a non-game room, an unset knob, an un-offered
   *  preset, or one the nominee can already read (that knob is left alone rather than duplicated). */
  gmPreset: z.boolean(),
});
/** Type twin of {@link handoffOfferContentsSchema} — the `handoff-nominated` notification payload's
 *  `offer` field and the client confirm's read model. */
export type HandoffOfferContents = z.infer<typeof handoffOfferContentsSchema>;

/** The disclosure of an offer that copies nothing — the value every offer-less nomination sends, spelled
 *  once so no producer re-spells the zeros. */
export const NO_HANDOFF_OFFER_CONTENTS: HandoffOfferContents = { characters: 0, worldBooks: 0, regexScripts: 0, gmPreset: false };

// ── Invites & the membership chokepoint (Part III §2; D16) ──
const INVITE_MAX_USES_MIN = 1;
const INVITE_MAX_USES_MAX = 10_000;
const INVITE_TOKEN_MIN = 1;

/** Invite lifecycle status (the db `chat_invites.status` column mirrors this). */
export const INVITE_STATUSES = ["pending", "accepted", "declined", "revoked", "expired"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];
/** @public twin: INVITE_STATUSES — drives the chat_invites status enum + CHECK (cross-package PUBLIC). */
export const inviteStatusSchema = z.enum(INVITE_STATUSES) satisfies z.ZodType<InviteStatus>;

/** Create an invite (host action). Two creation paths: a share-link (no target) OR targeted-by-handle
 *  (`invitedHandle`, resolved to a user server-side). The `token` is CSPRNG-minted + stored HASHED on the
 *  server — NEVER a client input, never returned in a view. `role` is server-forced `member` on redeem. */
export const createInviteSchema = z.object({
  /** OMITTED = the verb's safe single-use default; an EXPLICIT `null` = unlimited, the same
   *  say-it-out-loud escape hatch `expiresAt` carries. Nullable because the mint dialog offers unlimited
   *  and had no way to spell it: omission is what the safe default claims, so "unlimited" needed a word. */
  maxUses: z.number().int().min(INVITE_MAX_USES_MIN).max(INVITE_MAX_USES_MAX).nullable().optional(),
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
  inviteId: typeIdSchema(ID_PREFIX.chatInvite),
});
/** @public twin: acceptInviteSchema — the live `acceptInvite` tRPC input (cross-package PUBLIC). */
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** The preview-then-confirm result — deliberately MINIMAL: room name / host handle / member COUNT / mode
 *  label ONLY. NO roster identities, NO history (Part III §2 — those replay from `joinSeq` AFTER accept).
 *  STRICT, and the `invites.previewInvite` output parser: the caller is not a member yet, so any extra key
 *  (a roster, an id list) fails the call instead of reaching them. */
export const invitePreviewSchema = z.strictObject({
  chatId: typeIdSchema(ID_PREFIX.chat),
  roomName: z.string(),
  hostHandle: brandedId<Handle>(),
  memberCount: z.number().int().nonnegative(),
  /** A human-readable mode label (e.g. the output × policy summary) — never the raw config. */
  modeLabel: z.string(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** An invite as the host manages it. NEVER carries the token (raw or hashed) — a leak would let anyone
 *  redeem. `remainingUses` is `maxUses` minus redemptions (null = unlimited). STRICT: the output parser of
 *  `invites.listInvites` and the `invite` half of `invites.createInvite`, so a spread row carrying the
 *  peppered `tokenHash` fails the call. */
export const inviteViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.chatInvite),
  chatId: typeIdSchema(ID_PREFIX.chat),
  status: inviteStatusSchema,
  maxUses: z.number().nullable(),
  remainingUses: z.number().nullable(),
  expiresAt: z.number().nullable(),
  /** The targeted user when created by handle; null for an open share-link. */
  invitedUserId: brandedId<UserId>().nullable(),
  createdAt: z.number(),
});
export type InviteView = z.infer<typeof inviteViewSchema>;

/** `createInvite` — the persisted invite plus the raw token, returned exactly once for the `/join/:token`
 *  link. The token is stored hashed and never appears in an {@link InviteView}. STRICT at both levels and the
 *  procedure's output parser: `token` is the one secret this result may carry, and any sibling key fails the
 *  call. `token` carries the same floor the redeem/preview inputs demand, so the link it builds is one those
 *  inputs accept. */
export const createInviteResultSchema = z.strictObject({
  invite: inviteViewSchema,
  token: z.string().min(INVITE_TOKEN_MIN),
});
export type CreateInviteResult = z.infer<typeof createInviteResultSchema>;
