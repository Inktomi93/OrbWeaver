// @orb/contracts/chat/metadata — the `chats.metadata` room-behavior blob (D16) and its fault-isolated
// sub-blobs: room overrides (host-only three-field allowlist), the member-card visibility dial (D22), the
// group arbitration config, the opening policy, and the guided-steer wire contract (F6). Misfiled-from-
// settings (shared-dissolution §7 #4): these are chat verb / assemble / client-form shapes, NOT the
// settings KV. ONE HOME here so the `db` `$type` and the server parser derive, never re-spell.

import { GUIDED_GAME_STEER_KINDS } from "@orb/kit/guided";
import { z } from "zod";
import type { ChatDocumentVisibility } from "#databank";
import { GUIDED_IMPERSONATE_PERSONS, guidedActionKindSchema, REWRITE_TOGGLE_IDS } from "#preset";
import type { ChatRpgPointer } from "#rpg";
import type { ThemeBackground } from "#theme";
import { messageRoleSchema } from "./participants.ts";
import type { RegexTierAllow } from "./regex-tiers.ts";

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
export const memberCardVisibilitySchema = z.enum(MEMBER_CARD_VISIBILITY_LEVELS) satisfies z.ZodType<MemberCardVisibility>;

// ── Group config (the `chatMetadata.group` sub-blob) ──
/** The canonical arbitration-policy union (spine §5.5 — ONE importable tuple; the derived Select items +
 *  a total `Record` label map in `group-config-form.tsx` fail `tsc` when a member is added/renamed). The
 *  `.catch().default()` on the schema hides `.options`, so the tuple is the shared source, not the enum. */
export const GROUP_POLICIES = ["natural", "list", "pooled", "manual", "smart"] as const;
export type GroupPolicy = (typeof GROUP_POLICIES)[number];
/** Arbitration policy (WHO speaks each round). `@mention` is NOT a policy value — it is a hard override
 *  applied BEFORE the policy (and in a NARRATOR room it COERCES the round to per-speaker for the named
 *  character, like the other two forced doors). `smart` is LIVE: the side-LLM turn arbiter
 *  (`domain/chat/engine/smart-arbitrate`) picks the one next speaker, roster-validated; `natural` is its
 *  DEGRADE arm — a thrown/garbled/off-roster reply falls back to the weighted math and says so out loud
 *  (`smart_arbitration_degraded`, D41). A NARRATOR round never buys that arbiter call (see the arm below). */
export const groupPolicySchema = z.enum(GROUP_POLICIES).catch("natural").default("natural") satisfies z.ZodType<GroupPolicy>;

/** The policy names the host reads on the room's Group tab. A guest's invite preview says how the room plays in its
 *  own words instead. */
export const GROUP_POLICY_LABELS: Record<GroupPolicy, string> = {
  natural: "Natural",
  list: "Everyone, in order",
  pooled: "Round-robin",
  manual: "Only when I pick",
  smart: "Smart (side-LLM)",
};

// Auto-mode (opt-in AI→AI chaining) — MUST live on BOTH union arms (both arms are strict).
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

// RETIRED KEY — `groupCharacterId` (owner ruling 2026-08-08, the D107 dead-switch class): the synthetic
// group character (Part III §10) is resolved by HANDLE (`__group__<chatId>`, a find-or-mint), so this key
// never had a writer OR a reader — a dead switch that nevertheless travelled VERBATIM in the portability
// bundle, where a foreign `CharacterId` resolves to nothing on the target box (the D136(C) class). Both arms
// now REFUSE it (strictObject) at every write boundary. A STORED blob still carrying one is not debris the
// way a retired `authorsNote` is: healing the group sub-blob to absent would silently revert a narrator room
// to the per-speaker default, so the retired key is STRIPPED on the stored read instead — see
// `storedGroupConfigSchema` below, the ONE strip home both stored readers share. Pre-launch, no migration.

// `memberCardVisibility` (D22) — host-set, default `sheet`; on BOTH arms (both arms are strict).
const memberCardVisibilityField = {
  memberCardVisibility: memberCardVisibilitySchema.catch("sheet").default("sheet"),
} as const;

/** Per-room generation behavior. `output` is the discriminator: a `narrator` turn voices all the seated characters in
 *  one message and has NO per-speaker card-scope — the `narrator ⇒ merged` constraint is made
 *  unrepresentable by OMITTING `cardScope` from that arm (and `z.strictObject` REJECTS a stray `cardScope`, an
 *  enforcer not prose). `per-speaker` (default) emits one message per speaker and carries `cardScope`. */
export const groupConfigSchema = z.discriminatedUnion("output", [
  z.strictObject({
    output: z.literal("narrator"),
    /** PER-SPEAKER-ONLY IN EFFECT, retained deliberately: a narrator round voices all the seated characters in ONE
     *  generation authored by the synthetic group character, so it consumes no arbitrated speaker. The field
     *  STAYS on this arm so flipping output narrator→per-speaker→narrator round-trips the host's choice
     *  instead of resetting it to `natural`. What it must NOT do is BUY anything: the turn verb
     *  short-circuits the `smart` side-LLM arbiter here (no model call, no `smart_arbitration_degraded`
     *  warning about a verdict nothing reads). Nor does it gate the ROUND: a narrator room narrates every
     *  send, `manual` included (the narrator turn is the room's output, not a scheduled speaker) — the one thing
     *  it still governs here is the auto-chain's cheap deterministic continue/stop probe, so `manual` ends a
     *  narrator chain after the first beat. */
    policy: groupPolicySchema,
    speakerTags: z.boolean().catch(true).default(true),
    groupNudge: z.boolean().catch(true).default(true),
    ...autoModeFields,
    ...memberCardVisibilityField,
  }),
  // `z.strictObject` on THIS arm too (F6): both arms are enforcers, so a typo'd knob on a `setGroupConfig`
  // write is refused loudly instead of stripped-and-healed into a silently-wrong room.
  z.strictObject({
    output: z.literal("per-speaker"),
    policy: groupPolicySchema,
    cardScope: z.enum(["merged", "scoped"]).catch("merged").default("merged"),
    speakerTags: z.boolean().catch(false).default(false),
    groupNudge: z.boolean().catch(true).default(true),
    ...autoModeFields,
    ...memberCardVisibilityField,
  }),
]);
export type GroupConfig = z.infer<typeof groupConfigSchema>;

/** The output names a person reads, beside {@link GROUP_POLICY_LABELS}. */
export const GROUP_OUTPUT_LABELS: Record<GroupConfig["output"], string> = {
  "per-speaker": "Per-speaker",
  narrator: "Narrator",
};

/** Keys a STORED group blob may still carry from a retired field (above: `groupCharacterId`). Finite and
 *  non-growing BY CONSTRUCTION — every WRITE door refuses a retired key against the strict arms, so the only
 *  way one exists is that it was written before the retirement. */
const RETIRED_GROUP_KEYS: readonly string[] = ["groupCharacterId"];

/** Drop the retired keys; anything that is not a plain object passes through untouched (the union's own
 *  parse owns that refusal). */
function stripRetiredGroupKeys(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([key]) => !RETIRED_GROUP_KEYS.includes(key)));
}

/** The STORED-blob read of {@link groupConfigSchema}: retired keys are stripped BEFORE the strict arms see
 *  them. ONE HOME for every fault-isolated stored read of a group config — today the `chats.metadata.group`
 *  sub-blob (`domain/chat/contract/metadata.ts`) and the per-user `settings.groupDefaults`.
 *
 *  WHY a strip and not the `authorsNote` heal-to-absent precedent: both of those seams wrap this schema in a
 *  `.catch(...)`, and for a group config that catch is NOT free. A retired key would fail the strict parse
 *  and the room would heal to the per-speaker DEFAULT — silently reverting a narrator room (or a user's saved
 *  room defaults) to a different mode. `roomOverrides` heals to "inherit", which costs nothing; this heals to
 *  "a different room", which is a data-loss disguised as fault isolation. Use the raw
 *  {@link groupConfigSchema} at every WRITE boundary, where a stray key must still be refused loudly. */
export const storedGroupConfigSchema = z.preprocess(stripRetiredGroupKeys, groupConfigSchema) satisfies z.ZodType<GroupConfig>;
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
};

// ── Opening policy (HOW a new room opens — the start-chat union) ──
/** Opening policy for a chat's founding characters. `greet-all` = each founding AI greets (the group default);
 *  `generate` = the model writes a characters-aware opening; `none` = seed no greeting; `first-message` = the
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
  /** The Rewrite modal's picked toggle KINDS (the templating fork, ARM B — owner 2026-08-09). Enum-validated
   *  for the same reason `gameSteer` is: the wire carries the kind, the SERVER holds the bytes. Each id names
   *  a `preset.rewriteToggle.*` prose slot the assembly resolves against the turn's preset overrides and
   *  joins — in CATALOG order, never wire order — ahead of `input` (the host's own free text) into the ONE
   *  steer that becomes `{{input}}`. Absent/empty ⇒ `input` alone, byte-identical to a plain steered rewrite.
   *  Riding a non-`rewrite` action is harmless and composes the same way; only the Rewrite modal sends it. */
  rewriteToggles: z.array(z.enum(REWRITE_TOGGLE_IDS)).optional(),
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
  /** A chat-level knob (in a multi-human room the loop spends the host's money, so the funder tunes it). */
  toolRecurseLimit?: number;
  /** The host's per-document databank retrieval-visibility override (D85 — the membership-widened chat scope's
   *  governance knob). Absent ⇒ nothing hidden. Written by the host-gated `chat.setChatDocumentVisibility`
   *  verb; READ by `databank/persistence/scope.ts` (the union filter). Schema is databank's (documentId vocab)
   *  — the databankVisibility precedent. */
  databankVisibility?: ChatDocumentVisibility;
  /** BG-C — the host-set per-chat carried BACKGROUND source. Absent ⇒ no chat background (the card-carried
   *  twin, then the viewer's own appearance, wins). Written ONLY by the host-gated `chat.setChatBackground`
   *  verb; READ client-side (getChat carries it), applied at the app-root background layer in a TRUE-SOLO room.
   *  Schema is theme's (`ThemeBackground`) — the databankVisibility precedent. */
  background?: ThemeBackground;
  /** The OPAQUE rpg sync pointer — mode-free `{gameId}`, written ONCE by `createGame`
   *  through the `setRpgPointer` chat op, stored BLIND (chat never dereferences it). The truth is `rpg_games`;
   *  this is a SYNC SIGNAL so the client's takeover gate is a read off data it already holds. A corrupt blob
   *  heals to absent at the parser (`.catch(undefined)`). Schema is rpg's (`ChatRpgPointer`) — the
   *  databankVisibility/background foreign-schema precedent. */
  rpg?: ChatRpgPointer;
  /** D121-E display-tier HOST OPTION (owner ruling 2026-08-02). Absent/false ⇒ the default: display-tier
   *  regex is PER-USER — each viewer sees only their own scripts applied to the transcript, and nobody can
   *  restyle anybody else's reading. TRUE ⇒ the host opts this room in: the HOST's display scripts render
   *  for EVERY viewer here — a host staging shared visual effects on the transcript — and each viewer's
   *  OWN scripts still apply ON TOP, so a viewer can always counter-style.
   *
   *  An OPTION in the D121-B grammar, never a default: off is byte-identical to a room that never heard of
   *  it. Host-set, host-only (`chat.setHostDisplayScripts`); it governs RENDER only — no wire payload, no
   *  canon, no composer/edit text is touched on either arm. */
  hostDisplayScripts?: boolean;
  /** B1 / RULED F2 — the per-room "offer choices" POSTURE: whether this chat's model is taught the standing
   *  `:::choices` fence (the reading surface renders the options as click-to-compose affordances).
   *
   *  TRI-STATE BY ABSENCE, and that is the whole point: `true`/`false` are the host's explicit per-room
   *  choice, and ABSENT means INHERIT the host's own per-user default (`UserSettings.chat.offerChoices`) —
   *  which is what makes a NEWLY-CREATED room born with the posture its host plays in, without any
   *  create-time copy of the value into the blob. Resolve through {@link resolveOfferChoices}, never with an
   *  ad-hoc `?? false`. Host-set (`chat.setOfferChoices`); room-public on the read (a member sees why the
   *  model keeps offering choices). Distinct from the GAME's own `features.cyoa` knob, which is rpg's and
   *  untouched — a chat with both on gets ONE teach (the S2 double-teach guard, `substrate/teaching.ts`). */
  offerChoices?: boolean;
  /** B7 — the per-room "characters can react" POSTURE: whether this chat's turns attach the `react` tool,
   *  letting the model have a PRESENT character drop an emoji reaction on the newest message mid-turn.
   *
   *  The `offerChoices` shape exactly: tri-state by absence — `true`/`false` are the host's explicit
   *  per-room choice, ABSENT inherits the host's per-user default (`UserSettings.chat.charactersCanReact`).
   *  Resolve through {@link resolveCharactersCanReact}, never an ad-hoc `?? false`. Host-set
   *  (`chat.setCharactersCanReact`). DEFAULT OFF end to end (owner requirement): an autonomous AI reacting
   *  is opt-in — a room whose host never touched either tier never attaches the tool. Also gated by
   *  {@link ChatMetadata.reactionsEnabled}: a room with the reaction plane off attaches nothing. */
  charactersCanReact?: boolean;
  /** B7 — the per-room MASTER switch for the B6 reaction plane (pills, picker, toggles, the react tool,
   *  the prompt-attribution loop). Same tri-state shape; per-user default
   *  `UserSettings.chat.reactionsEnabled`, which DEFAULTS ON — the shipped feature stays on; this knob
   *  makes it disableable, never silently off. Resolve through {@link resolveReactionsEnabled}. Host-set
   *  (`chat.setReactionsEnabled`). Resolved OFF is ENFORCED server-side: `listReactions` answers
   *  `{enabled:false, groups:[]}` and `toggleReaction`/the react tool refuse — hidden is not the
   *  mechanism, refused is. */
  reactionsEnabled?: boolean;
  /** #1742 — the room's regex MASTER — the section's "Run regex in this chat" switch.
   *  Absent ⇒ ON, and that default is why it is not tri-state like its `offerChoices` neighbours:
   *  there is no per-user "do I run regex" default to inherit — the library IS the host's default, and this
   *  key exists only so the debugger can bisect ONE room without disturbing it. `false` drops the whole
   *  host-tier union for this chat (`substrate/regex-tier.ts`); the display leg is untouched by it, because
   *  the display leg is viewer-library-wide and attachment-blind (the 2026-08-02 O-4 ruling). Host-set
   *  (`chat.setRegexAllow`); room-public on the read. */
  regexEnabled?: boolean;
  /** #1742 — the room's per-TIER allows, a SPARSE override map keyed by {@link RegexTierKey} (`global` ·
   *  `preset` · `character:<id>` per seat · `chat`). Absent, or a key absent, ⇒ that tier runs, so an
   *  existing room is byte-identical. Written by the same host-gated `chat.setRegexAllow` verb; READ by the
   *  host-tier resolver, which drops a disallowed tier's rows BEFORE the dedup (see the schema's header —
   *  dropping after would let a switched-off tier swallow a script that another tier still runs). Schema is
   *  `regexTierAllowSchema` — the `databankVisibility` id-keyed sub-blob precedent. */
  regexTiers?: RegexTierAllow;
}

/** THE PRECEDENCE, one home: **the room's explicit choice wins; an absent room value inherits the host's
 *  per-user default** (`UserSettings.chat.offerChoices`, itself defaulting to off). Two callers by design —
 *  the SERVER resolves it per turn into the S2 teaching knobs, and the CLIENT resolves it to seat the host's
 *  toggle — so the rule lives here in `contracts` rather than being spelled `?? default` on both sides of the
 *  wire, where the two spellings could drift into a toggle that lies about what the model is being told. */
export function resolveOfferChoices(roomValue: boolean | undefined, userDefault: boolean): boolean {
  return roomValue ?? userDefault;
}

/** The B7 "characters can react" precedence — the {@link resolveOfferChoices} rule for its knob: the
 *  room's explicit choice wins, absent inherits the host's per-user default (itself defaulting OFF —
 *  the react tool is opt-in at both tiers). Same two callers by design: the server resolves it into the
 *  S2 teaching knobs, the client resolves it to seat the host's toggle. */
export function resolveCharactersCanReact(roomValue: boolean | undefined, userDefault: boolean): boolean {
  return roomValue ?? userDefault;
}

/** The B7 reaction-plane master precedence — same rule, OPPOSITE default direction: the per-user default
 *  ships ON (`UserSettings.chat.reactionsEnabled` defaults `true` — B6 is a shipped feature, this knob
 *  makes it disableable rather than quietly off). One home because THREE surfaces resolve the same pair —
 *  the toggle-verb gate, the `listReactions` verdict, and the host's switch — and a drifted spelling here
 *  is a room whose pills disagree with its writes. */
export function resolveReactionsEnabled(roomValue: boolean | undefined, userDefault: boolean): boolean {
  return roomValue ?? userDefault;
}
