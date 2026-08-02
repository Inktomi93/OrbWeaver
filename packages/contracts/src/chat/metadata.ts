// @orb/contracts/chat/metadata — the `chats.metadata` room-behavior blob (D16) and its fault-isolated
// sub-blobs: room overrides (host-only three-field allowlist), the member-card visibility dial (D22), the
// group arbitration config, the opening policy, and the guided-steer wire contract (F6). Misfiled-from-
// settings (shared-dissolution §7 #4): these are chat verb / assemble / client-form shapes, NOT the
// settings KV. ONE HOME here so the `db` `$type` and the server parser derive, never re-spell.

import { GUIDED_GAME_STEER_KINDS } from "@orb/kit/guided";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { OpenRouterProviderRouting } from "#connection";
import type { ChatDocumentVisibility } from "#databank";
import { GUIDED_IMPERSONATE_PERSONS, guidedActionKindSchema } from "#preset";
import type { ChatRpgPointer } from "#rpg";
import type { ThemeBackground } from "#theme";
import { messageRoleSchema } from "./participants";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// MISFILED-FROM-SETTINGS CHAT SHAPES (shared-dissolution §7 #4) — chatMetadata sub-blobs / start-chat
// unions consumed by chat verbs + assemble types + client chat forms, NOT the settings KV.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Room overrides (host-only; exactly three fields — the Part III §9 allowlist) ──
const OVERRIDE_FIELD_MAX = 100_000;
const overrideField = z.string().max(OVERRIDE_FIELD_MAX);

// RETIRED KEY — `authorsNote` (owner ruling 2026-08-01): the room author's note was a SECOND home for the
// concept `chat_injections` already owns. Both landed as the same `in_chat` at-depth splice (operator
// priority, budget-exempt); the note was just an injection with a default depth. ONE door survives — the
// per-chat Injections list (a system note at depth 4 IS the author's note). Strictness therefore REJECTS a
// stored/wired `authorsNote`: the sub-blob heals to absent at the read seam (`domain/chat/contract/
// metadata.ts` `.catch(undefined)`) and the write verb refuses it (`forbiddenOverride`). Pre-launch, stored
// values are debris — no migration.

/** The host-only per-room overrides — exactly three PLAIN-TEXT section overrides ("jailbreak" IS
 *  post_history). `z.strictObject` default-denies a stray key (an enforcer, not prose). Each field absent ⇒
 *  inherit the card/scope fallback (resolved in SHAPE — INERT here). Stored in `chatMetadata` (an FK-clean
 *  JSON sub-blob). At-depth steering is NOT here — it is a `chat_injections` row. */
export const roomOverridesSchema = z.strictObject({
  scenario: overrideField.optional(),
  mainPrompt: overrideField.optional(),
  postHistory: overrideField.optional(),
});
export type RoomOverrides = z.infer<typeof roomOverridesSchema>;

/** Empty ⇒ inherit everything (the off path is byte-identical). */
export const DEFAULT_ROOM_OVERRIDES: RoomOverrides = {};

// ── Member card visibility (D22 — the host-set per-room dial) ──
/** How much of a roster character's card a present human member may read (Part III §11; D22). Levels
 *  widen left→right: `name-avatar` (the conservative floor) → `sheet` (presentable identity) → `sheet+lore`
 *  (+ the character's world-info) → `full` (+ prompt-steering internals). Host-set; the owner/host always
 *  sees `full`; the member view is read-only + while-present. */
export const MEMBER_CARD_VISIBILITY_LEVELS = ["name-avatar", "sheet", "sheet+lore", "full"] as const;
export type MemberCardVisibility = (typeof MEMBER_CARD_VISIBILITY_LEVELS)[number];
export const memberCardVisibilitySchema = z.enum(MEMBER_CARD_VISIBILITY_LEVELS);

// ── Group config (the `chatMetadata.group` sub-blob) ──
/** The canonical arbitration-policy union (spine §5.5 — ONE importable tuple; the derived Select items +
 *  a total `Record` label map in `group-config-form.tsx` fail `tsc` when a member is added/renamed). The
 *  `.catch().default()` on the schema hides `.options`, so the tuple is the shared source, not the enum. */
export const GROUP_POLICIES = ["natural", "list", "pooled", "manual", "smart"] as const;
export type GroupPolicy = (typeof GROUP_POLICIES)[number];
/** Arbitration policy (WHO speaks each round). `@mention` is NOT a policy value — it is a hard override
 *  applied BEFORE the policy. `smart` (side-LLM) falls back to `natural` until wired. */
export const groupPolicySchema = z.enum(GROUP_POLICIES).catch("natural").default("natural");

// Auto-mode (opt-in AI→AI chaining) — MUST live on BOTH union arms (the narrator arm is strict).
// Defaults make the OFF path byte-identical (no timer / no auto-turn / no scheduling).
const AUTO_MODE_MAX_TURNS_MIN = 1;
const AUTO_MODE_MAX_TURNS_MAX = 20;
const AUTO_MODE_MAX_TURNS_DEFAULT = 6;
const AUTO_MODE_DELAY_MS_MIN = 0;
const AUTO_MODE_DELAY_MS_MAX = 60_000;
const AUTO_MODE_DELAY_MS_DEFAULT = 1500;
const autoModeFields = {
  autoMode: z.boolean().catch(false).default(false),
  autoModeMaxTurns: z
    .number()
    .int()
    .min(AUTO_MODE_MAX_TURNS_MIN)
    .max(AUTO_MODE_MAX_TURNS_MAX)
    .catch(AUTO_MODE_MAX_TURNS_DEFAULT)
    .default(AUTO_MODE_MAX_TURNS_DEFAULT),
  autoModeDelayMs: z
    .number()
    .int()
    .min(AUTO_MODE_DELAY_MS_MIN)
    .max(AUTO_MODE_DELAY_MS_MAX)
    .catch(AUTO_MODE_DELAY_MS_DEFAULT)
    .default(AUTO_MODE_DELAY_MS_DEFAULT),
  allowSelfResponses: z.boolean().catch(false).default(false),
} as const;

// The synthetic group character's identity id (Part III §10) — narrator turns are AUTHORED by it (a real
// id, never NULL). Optional KEY (absent until minted); on BOTH arms (the narrator arm is strict).
const groupCharacterIdField = {
  groupCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
} as const;

// `memberCardVisibility` (D22) — host-set, default `sheet`; on BOTH arms (narrator is strict).
const memberCardVisibilityField = {
  memberCardVisibility: memberCardVisibilitySchema.catch("sheet").default("sheet"),
} as const;

/** Per-room generation behavior. `output` is the discriminator: a `narrator` turn voices the whole cast in
 *  one message and has NO per-speaker card-scope — the `narrator ⇒ merged` constraint is made
 *  unrepresentable by OMITTING `cardScope` from that arm (and `z.strictObject` REJECTS a stray `cardScope`, an
 *  enforcer not prose). `per-speaker` (default) emits one message per speaker and carries `cardScope`. */
export const groupConfigSchema = z.discriminatedUnion("output", [
  z.strictObject({
    output: z.literal("narrator"),
    policy: groupPolicySchema,
    speakerTags: z.boolean().catch(true).default(true),
    groupNudge: z.boolean().catch(true).default(true),
    ...autoModeFields,
    ...groupCharacterIdField,
    ...memberCardVisibilityField,
  }),
  z.object({
    output: z.literal("per-speaker"),
    policy: groupPolicySchema,
    cardScope: z.enum(["merged", "scoped"]).catch("merged").default("merged"),
    speakerTags: z.boolean().catch(false).default(false),
    groupNudge: z.boolean().catch(true).default(true),
    ...autoModeFields,
    ...groupCharacterIdField,
    ...memberCardVisibilityField,
  }),
]);
export type GroupConfig = z.infer<typeof groupConfigSchema>;
/** The LENIENT input (pre-default): callers may omit the defaulted knobs; `setGroupConfig` parses to
 *  {@link GroupConfig} before persisting, so a stored blob is always fully-defaulted. */
export type GroupConfigInput = z.input<typeof groupConfigSchema>;

/** The default room behavior (Part III §7): per-speaker × merged, natural arbitration, no speaker tags,
 *  group-nudge on, auto-mode OFF, member cards visible at `sheet` (D22). */
export const DEFAULT_GROUP_CONFIG: GroupConfig = {
  output: "per-speaker",
  policy: "natural",
  cardScope: "merged",
  speakerTags: false,
  groupNudge: true,
  autoMode: false,
  autoModeMaxTurns: AUTO_MODE_MAX_TURNS_DEFAULT,
  autoModeDelayMs: AUTO_MODE_DELAY_MS_DEFAULT,
  allowSelfResponses: false,
  memberCardVisibility: "sheet",
  // groupCharacterId omitted — a clean optional key, absent until the synthetic group character is minted.
};

// ── Opening policy (HOW a new room opens — the start-chat union) ──
/** Opening policy for a chat's founding cast. `greet-all` = each founding AI greets (the group default);
 *  `generate` = the model writes a cast-aware opening; `none` = seed no greeting; `first-message` = the
 *  solo degenerate (the primary's greeting at seq 1). No `.catch`/`.default`: optional at every boundary,
 *  the server resolves absent → greet-all-vs-first-message by roster size. */
export const openingPolicySchema = z.enum(["greet-all", "generate", "none", "first-message"]);
export type OpeningPolicy = z.infer<typeof openingPolicySchema>;

// ── The guided-steer wire contract (F6 — the transport trust boundary for the composer wand) ──
// The one-turn typed steer every generating chat verb accepts. DERIVED, never re-spelled: `action` from
// `guidedActionKindSchema` (#preset), `person` from `GUIDED_IMPERSONATE_PERSONS` (#preset), the inject
// placement role from `messageRoleSchema`. Before this schema the six turn verbs rode `z.any()` and the
// domain assumed the shape — a garbage `action` dereferenced `undefined.prompt` and a non-string `input`
// hit `.trim()`, so any authed participant could 500 the turn with a malformed body. This schema IS the
// trust boundary; the domain re-exports this exact `GuidedSteer` type (`domain/chat/contract/params.ts`)
// — the pre-F6 local re-spell died with `z.any()`, so there is one shape and no drift to guard.
/** The steer text cap — the house user-prose bound ({@link OVERRIDE_FIELD_MAX}); a steer is a short one-turn
 *  nudge, so this ceiling is only a wire-abuse floor, never a real-usage limit. */
export const GUIDED_STEER_INPUT_MAX = OVERRIDE_FIELD_MAX;
export const guidedSteerSchema = z.strictObject({
  action: guidedActionKindSchema,
  input: z.string().max(GUIDED_STEER_INPUT_MAX).optional(),
  placement: z
    .discriminatedUnion("kind", [z.object({ kind: z.literal("system") }), z.object({ kind: z.literal("inject"), role: messageRoleSchema })])
    .optional(),
  /** The `{{person}}` word for impersonate's 1st/2nd/3rd-person templates; ignored by other actions. */
  person: z.enum(GUIDED_IMPERSONATE_PERSONS).optional(),
  /** A wand-fired one-shot GAME steer KIND (parity-plus P5 — the Plot submenu + "Offer choices"). When
   *  present, the assembly resolves the kit-homed SYSTEM template (`GUIDED_GAME_STEERS`) through the macro
   *  engine (the rpg data macros read the game turn's gather feed) and delivers it as a depth-0 system
   *  injection — `input`/the action config are ignored. Enum-validated: the wire carries only the kind,
   *  never template text (a member cannot smuggle macros onto the trusted template side). */
  gameSteer: z.enum(GUIDED_GAME_STEER_KINDS).optional(),
});
export type GuidedSteer = z.infer<typeof guidedSteerSchema>;

/** The parsed `chats.metadata` room-behavior blob (D16). No single schema spans it — the column composes
 *  independently fault-isolated sub-blobs, each optional (absent ⇒ the consumer applies its canonical
 *  default; the off-path is byte-identical). ONE HOME here in `contracts` so the `db` `$type` and the
 *  server parser (`domain/chat/contract/metadata.ts` — the runtime lenient-parse machinery) share the shape
 *  instead of re-spelling it. */
export interface ChatMetadata {
  group?: GroupConfig;
  roomOverrides?: RoomOverrides;
  opening?: OpeningPolicy;
  providerRouting?: OpenRouterProviderRouting;
  /** A chat-level knob (in a multi-human room the loop spends the host's money, so the funder tunes it). */
  toolRecurseLimit?: number;
  /** The host's per-document databank retrieval-visibility override (D85 — the membership-widened chat scope's
   *  governance knob). Absent ⇒ nothing hidden. Written by the host-gated `chat.setChatDocumentVisibility`
   *  verb; READ by `databank/persistence/scope.ts` (the union filter). Schema is databank's (documentId vocab)
   *  — the providerRouting precedent. */
  databankVisibility?: ChatDocumentVisibility;
  /** BG-C — the host-set per-chat carried BACKGROUND source. Absent ⇒ no chat background (the card-carried
   *  twin, then the viewer's own appearance, wins). Written ONLY by the host-gated `chat.setChatBackground`
   *  verb; READ client-side (getChat carries it), applied at the app-root background layer in a TRUE-SOLO room.
   *  Schema is theme's (`ThemeBackground`) — the providerRouting/databankVisibility precedent. */
  background?: ThemeBackground;
  /** The OPAQUE rpg sync pointer (rpg-design/05 §2.1) — mode-free `{gameId}`, written ONCE by `createGame`
   *  through the `setRpgPointer` chat op, stored BLIND (chat never dereferences it). The truth is `rpg_games`;
   *  this is a SYNC SIGNAL so the client's takeover gate is a read off data it already holds. A corrupt blob
   *  heals to absent at the parser (`.catch(undefined)`). Schema is rpg's (`ChatRpgPointer`) — the
   *  providerRouting/databankVisibility/background foreign-schema precedent. */
  rpg?: ChatRpgPointer;
}
