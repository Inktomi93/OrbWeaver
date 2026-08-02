// @orb/contracts/rpg/actor — THE actor: its reference, its IDENTITY half, and its per-actor VOLATILE state
// (rpg-design/05 §2.6 + the actor-state review §5 R2). Wallet + inventory are FIRST-CLASS on EVERY actor
// (character AND cast NPC), present in lite (owner-CONFIRMED at ratification). `wallet` is a STORED
// named-amount array, NOT legacy's derived currency-item total — lite has no loot engine to mint currency
// items, so a derived wallet would be a permanently-empty dead doorway; full's loot engine later CREDITS the
// same slots at grant time (an engine graft onto an existing column, zero re-spell).
//
// R2 — THE NPC IS AN ACTOR, NOT A SCENE ANNOTATION. A cast NPC's identity half (name/emoji/mood/relationship
// + the standing appearance/outfit/thoughts guides) used to live on the `presentCharacters` ROW, which
// departure DESTROYS, while her hard half (trackers/conditions/inventory/wallet/status) lived on the
// `actorState` row, which departure RETAINS invisibly. Two planes, opposite lifecycles, one person: return
// re-surfaced the pack against a blank face and silently reset the relationship arc (the review's MS-2).
// Both halves now ride ONE {@link rpgActorEntrySchema} row, and `presentCharacters` slims to a pure PRESENCE
// list of actor-ref keys. Departure = presence drop; EVERYTHING is retained; return = presence add.
//
// Actor-ref arms: `character`/`user` address roster identities directly (no membership shadow — §4.3);
// `cast` addresses scene-only NPCs by a real normalized SLUG ({@link rpgCastSlug}) with the display name
// carried separately on `identity.name` — the tracker unification's own key/label lesson applied to people
// (the doc used to CLAIM a "normalized-name key" while storing the verbatim model-authored name, so a rename
// was impossible and case variance minted sibling identities). Full ADDS the `{kind:"npc"}` arm when
// `rpg_npcs` lands — an additive union member every `assertNever` consumer is compile-forced to handle
// (shipping it now would mint a dead `RpgNpcId` brand FK-ing a nonexistent table).

import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { RPG_RELATIONSHIP_KINDS } from "./enums";
import { rpgTrackerValueSchema, rpgTrackerValuesSchema } from "./tracker";

// The slug grammar (ASCII match, no `u` flag — `useUnicodeRegex` is deliberately absent from biome.json).
// Hoisted to module scope (the top-level-regex rule) and deliberately LOSSY: it folds case, collapses every
// non-alphanumeric run to one hyphen, and trims the ends, so "Sister Vesna" / "sister  vesna" / "Sister
// Vesna." all address ONE actor. The DISPLAY name is never derived back from it — it rides `identity.name`.
const CAST_SLUG_STRIP = /[^a-z0-9]+/g;
const CAST_SLUG_TRIM = /^-+|-+$/g;

/** The FALLBACK slug for a name that carries no slug-able character at all (an emoji-only or punctuation-only
 *  name). A cast key must be non-empty (`rpgActorRefSchema`), and a refused write on an exotic name would be a
 *  worse answer than one stable bucket the host can rename later. */
const CAST_SLUG_FALLBACK = "unnamed";

/** THE cast key: a display NAME → its stable normalized slug. The ONE home for cast-key normalization — the
 *  tool appliers mint through it, the ghost guard matches through it, the wire REFUSES anything else
 *  ({@link rpgActorRefSchema}), and promotion re-keys through it, so "which spelling is this NPC" is decided
 *  once. IDEMPOTENT by construction: `rpgCastSlug(rpgCastSlug(x)) === rpgCastSlug(x)`, which is what makes it
 *  usable as the wire's own canonicality predicate. */
export function rpgCastSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(CAST_SLUG_STRIP, "-").replace(CAST_SLUG_TRIM, "");
  return slug === "" ? CAST_SLUG_FALLBACK : slug;
}

/** A durable/scene actor identity. `character`/`user` = roster identities; `cast` = a scene-only NPC by
 *  its stable {@link rpgCastSlug} `key`. Full ADDS `{kind:"npc"}` (additive — `assertNever` consumers error).
 *
 *  PREVENT-AT-SCHEMA on the cast key (the R6 enum-constraint / stamped-id write-boundary precedent): a cast
 *  key must ALREADY BE its own slug, so a non-canonical one is unrepresentable at the wire rather than
 *  refused somewhere downstream. Without it a raw API caller could `patchActor` with
 *  `castKey: "Sister Vesna"` and mint a SIBLING row beside the model's `cast:sister-vesna` — a duplicate
 *  person in the panel, unreachable by every model write (the appliers resolve names through the slug), and
 *  removable only by `dismissActor` with the same raw key. The refine costs {@link actorRefKey} nothing: it
 *  stays a pure projection, now over data that is canonical by the time it exists. */
export const rpgCastRefSchema = z.object({
  kind: z.literal("cast"),
  castKey: z
    .string()
    .min(1)
    .refine((key) => key === rpgCastSlug(key), { message: "a cast key must be its normalized slug (lowercase, hyphen-separated) — see rpgCastSlug" }),
});
/** The CAST arm alone, named because one door addresses only scene NPCs: `rpg.promoteActor` (R4). Promotion
 *  turns a cast NPC into a roster character, so a `character`/`user` target is not "refused" — it is
 *  MEANINGLESS, and the wire says so by being unable to express it (the prevent-at-schema posture the cast-key
 *  refine above already takes). The union below is composed FROM this, never a second spelling of the arm. */
export type RpgCastRef = z.infer<typeof rpgCastRefSchema>;

export const rpgActorRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("character"), characterId: typeIdSchema(ID_PREFIX.character) }),
  z.object({ kind: z.literal("user"), userId: brandedId<UserId>() }),
  rpgCastRefSchema,
]);
export type RpgActorRef = z.infer<typeof rpgActorRefSchema>;

/** The ONE string projection of an actor ref — the Map / lock / find key. A total switch (a new arm fails
 *  `tsc` here). */
export function actorRefKey(ref: RpgActorRef): string {
  if (ref.kind === "character") {
    return `character:${ref.characterId}`;
  }
  if (ref.kind === "user") {
    return `user:${ref.userId}`;
  }
  return `cast:${ref.castKey}`;
}

/** An inventory item — `type` taxonomy ships for display + full's equip/filter future, minus any wallet
 *  coupling (§2.6). */
export const rpgInventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  quantity: z.number().int().min(1).default(1),
  location: z.string().default(""),
  type: z.string().default(""),
  // #37 — the HOST-picked display icon (a curated `@orb/ui/icons` seal NAME from the client's
  // `ITEM_ICON_CHOICES` table). Host-set only (absent from `update_inventory`'s args + the extraction
  // schema — unwritable by the model); display falls back to the keyword resolver when unset.
  icon: z.string().optional(),
});
export type RpgInventoryItem = z.infer<typeof rpgInventoryItemSchema>;

/** The full-engine condition slot, born whole (`stat`/`turnsLeft` are full-engine fields lite ignores). */
const rpgConditionSchema = z.object({
  name: z.string().min(1),
  stat: z.enum(["attack", "defense", "speed", "hp"]).nullable(),
  modifier: z.number().int(),
  turnsLeft: z.number().int().min(1).nullable(),
});

/** A present character's RELATIONSHIP (parity-plus §2.1) — a first-class field on the actor's IDENTITY half,
 *  NOT a `customFields` entry. `kind` rides the closed vocab (§2.3 constrains it to the six tokens at the token
 *  level); `label` is the free gloss used ONLY when `kind === "custom"` (empty otherwise). The default reading
 *  is the NPC's stance toward the PLAYER. Swipe-consistent by construction (it rides the snapshot's actor
 *  plane) and DEPARTURE-SURVIVING since R2 (it used to die with the `presentCharacters` row, so an established
 *  `enemy` returned as `neutral` with no journal beat — the silent arc reset). */
export const rpgRelationshipSchema = z.object({
  kind: z.enum(RPG_RELATIONSHIP_KINDS).default("neutral"),
  label: z.string().default(""),
});
export type RpgRelationship = z.infer<typeof rpgRelationshipSchema>;

/** The IDENTITY half of a `cast` actor — who she IS, as opposed to what the beat did to her. Roster actors
 *  (character/user) carry NO identity here: their name/avatar come from the chat roster and their standing
 *  prose from `rpg_sheets` (one home per fact, never a second name to reconcile).
 *
 *  `name` is the DISPLAY name (the model authors it; the ref key is its {@link rpgCastSlug}), which is what
 *  makes rename possible at all. The three guides are STANDING state (see {@link RPG_CAST_GUIDE_FIELDS}).
 *
 *  `characterId` is UNREAD (flagged rot, R4): it was reserved as "the promotion join", but promotion RE-KEYS
 *  the row to `character:<id>` — the ref itself carries the join, and a promoted actor has no identity half at
 *  all ({@link rpgPromotedCardDescription} carries its durable content onto the card instead). Left in place
 *  rather than deleted in the promotion lane; its removal is a contracts+mirror sweep of its own. */
export const rpgActorIdentitySchema = z.object({
  name: z.string().min(1),
  characterId: typeIdSchema(ID_PREFIX.character).optional(),
  emoji: z.string().default(""),
  mood: z.string().default(""),
  appearance: z.string().optional(),
  outfit: z.string().optional(),
  thoughts: z.string().optional(),
  relationship: rpgRelationshipSchema.default({ kind: "neutral", label: "" }),
});
export type RpgActorIdentity = z.infer<typeof rpgActorIdentitySchema>;

/** The PERSISTENT per-character guides (RV-11) — the three prose fields the extraction round is asked for on
 *  every beat (`extraction-prompt.ts`: "appearance + outfit (when described), thoughts"). They are STANDING
 *  state, not a per-beat observation: a character's look and dress persist until the story changes them, and
 *  `thoughts` is the character's unspoken inner state (flavor — never dialogue). Named ONCE here because both
 *  readers walk the same three fields in the same order: the steering reminder's continuation lines
 *  (`substrate/reminder.ts`) and the Scene tab's cast card (`CastGuides`). `satisfies` pins them to the schema
 *  above — renaming a field without updating this tuple fails `tsc` here, not at a call site. */
export const RPG_CAST_GUIDE_FIELDS = ["appearance", "outfit", "thoughts"] as const satisfies readonly (keyof RpgActorIdentity)[];
export type RpgCastGuideField = (typeof RPG_CAST_GUIDE_FIELDS)[number];

/** The reader-facing label each standing guide carries into a PROMOTED NPC's card description (R4). Named
 *  beside the tuple it is keyed by, so a guide added to {@link RPG_CAST_GUIDE_FIELDS} fails `tsc` here rather
 *  than silently vanishing from every card promotion mints. */
const CAST_GUIDE_CARD_LABEL: Readonly<Record<RpgCastGuideField, string>> = {
  appearance: "Appearance",
  outfit: "Outfit",
  thoughts: "Inner life",
};

/** PROMOTION'S IDENTITY CARRY (R4) — the standing guides an NPC accumulated, rendered as the card description
 *  her freshly-minted roster card is born with.
 *
 *  Promotion RE-KEYS the actor row from `cast:<slug>` to `character:<id>`, and a roster actor carries NO
 *  identity half ({@link rpgActorIdentitySchema}) — her name is the chat roster's and her standing prose the
 *  sheet's. So the identity row does not survive the re-key, and everything on it that has a DURABLE home must
 *  be carried there in the same gesture or it is destroyed: the display `name` becomes the card's `name`, and
 *  the three standing guides — the persistent look/dress/inner-life the story spent the whole acquaintance
 *  writing — become the card's description, which is exactly the prose a card exists to hold.
 *
 *  What deliberately does NOT carry: `mood` (a per-beat observation, not a standing fact) and `relationship`
 *  (ruled a CAST actor's datum — a roster member's stance toward the player is the story's, not a tracked
 *  plane's). The promotion door SAYS SO to the host rather than letting them discover it; this function is the
 *  one home for what the carry contains, so the copy and the behavior cannot drift.
 *
 *  `""` when the story wrote no guides at all — the caller then mints a card with an empty description rather
 *  than a fabricated one (`createCharacterSchema.description` accepts it; an invented biography would be a lie
 *  the model then plays). */
export function rpgPromotedCardDescription(identity: RpgActorIdentity): string {
  const lines: string[] = [];
  for (const field of RPG_CAST_GUIDE_FIELDS) {
    const text = identity[field]?.trim() ?? "";
    if (text !== "") {
      lines.push(`${CAST_GUIDE_CARD_LABEL[field]}: ${text}`);
    }
  }
  return lines.join("\n");
}

/** Per-actor volatile state — the swipe-volatile plane, born whole (full grafts ZERO fields here). `wallet` is
 *  the STORED named-amount array (§2.6). `trackerValues` is the tracked-field VALUE plane, keyed by tracker
 *  `key` (the tracked-field unification) — it replaces the old name-addressed `pools[]` AND the cast row's
 *  opaque `customFields` string record, so every tracked value on every actor (roster member OR scene NPC)
 *  reads from ONE home with ONE addressing rule.
 *
 *  `hp` IS NOT HERE (R3, owner-RULED): health folded into the unified tracker system. It was the one labelled
 *  number left outside the unification's rule, and it carried a DUAL-MAX home (`sheet.maxHp` beside
 *  `hp.max`, with no reconciler anywhere) — exactly the drift class the unification killed for pools. A `d20`
 *  game SEEDS an `hp` meter tracker at mint; `freeform` seeds nothing, because the lived freeform default was
 *  always hp-absent. Health is now mode-forkable, renameable, and read by the same one grammar as every other
 *  meter. There is no `actorRef` here either — the ref keys the {@link rpgActorEntrySchema} ROW above it. */
export const rpgActorVolatileSchema = z.object({
  trackerValues: rpgTrackerValuesSchema.default({}),
  conditions: z.array(rpgConditionSchema).default([]),
  inventory: z.array(rpgInventoryItemSchema).default([]),
  wallet: z.array(z.object({ name: z.string().min(1), amount: z.number().int() })).default([]),
  status: z.string().default(""),
});
export type RpgActorVolatile = z.infer<typeof rpgActorVolatileSchema>;

/** THE actor row on the snapshot's `actorState` plane (R2) — one person, both halves, one lifecycle. `identity`
 *  is present for `cast` actors and absent for roster ones (see {@link rpgActorIdentitySchema}); `volatile` is
 *  always whole. The plane is keyed by {@link actorRefKey} over `actorRef` (the merge engine's computed element
 *  key), and it is ADDITIVE: an actor leaves it by `rpg.dismissActor`, never by going unmentioned. */
export const rpgActorEntrySchema = z.object({
  actorRef: rpgActorRefSchema,
  identity: rpgActorIdentitySchema.optional(),
  // Defaulted so a row authored as `{actorRef}` alone parses into a WHOLE zero-state actor (the ops then write
  // onto it) — the same born shape `emptyActorEntry` mints, one home for "a fresh actor's zero state".
  volatile: rpgActorVolatileSchema.default(() => rpgActorVolatileSchema.parse({})),
});
export type RpgActorEntry = z.infer<typeof rpgActorEntrySchema>;

// ── THE OP-SHAPED HAND VOCABULARY (R1 — `rpg.patchActor`) ────────────────────────────────────────────────
// The hand used to author this plane as a whole-ARRAY IMAGE through `editSnapshot`, which asked a client that
// could only SEE the plane in projections (the roster half + a bolted-on `castVolatile` map, never the
// offstage rows — both retired by R2's one `RpgActorView`) to
// re-author every actor's every field on every click. Three shipped defects and one latent clobber came out of
// that one contract (the actor-state stickler review §2/§5 R1). The ops below replace it: one actor, one
// datum, per call — the server reads the TRUE head, applies the op, and writes back, so a model flush landing
// between the panel's read and the human's click can no longer be overwritten by a stale image, and the
// auto-lock lands on exactly the datum the human touched.
//
// The op vocabulary is DERIVED from the plane above ({@link RPG_ACTOR_OP_FIELDS}) — a renamed volatile field
// fails `tsc` here, not at a call site — and every op names the ONE field it writes, which is also the fine
// lock path it stamps (the server's ONE derivation, `substrate/actor-ops.ts`).

/** The volatile fields the hand ops address, pinned to the plane's own keys (`actorRef` is identity, not a
 *  writable datum — an actor is re-keyed by no gesture; it LEAVES by `rpg.dismissActor`). */
export const RPG_ACTOR_OP_FIELDS = ["status", "trackerValues", "conditions", "inventory", "wallet"] as const satisfies readonly (keyof RpgActorVolatile)[];
export type RpgActorOpField = (typeof RPG_ACTOR_OP_FIELDS)[number];

/** The IDENTITY fields the hand ops address as free TEXT, pinned to the identity plane's own keys. Each is
 *  also its own fine lock path (`actorState.<key>.identity.<field>`) — pinning one NPC's mood no longer
 *  freezes the whole cast, which is what the retired plane-level `presentCharacters` pin did. `relationship`
 *  is deliberately absent: it is a two-field object with its own op arm, not a string. */
export const RPG_ACTOR_IDENTITY_TEXT_FIELDS = [
  "name",
  "emoji",
  "mood",
  "appearance",
  "outfit",
  "thoughts",
] as const satisfies readonly (keyof RpgActorIdentity)[];
export type RpgActorIdentityTextField = (typeof RPG_ACTOR_IDENTITY_TEXT_FIELDS)[number];

/** The tracked-value PATCH a `setTracker` op carries — each datum optional, each DERIVED from the resident
 *  value schema (never a re-spell): an omitted datum keeps the actor's current one, so a max edit never blanks
 *  the reading beside it. `max: null` is the honest CLEAR of a per-carrier ceiling override
 *  (`resolveTrackerMaxOverride`), not "no max given". */
const rpgTrackerValuePatchSchema = z.object({
  value: rpgTrackerValueSchema.shape.value.optional(),
  items: rpgTrackerValueSchema.shape.items.optional(),
  max: rpgTrackerValueSchema.shape.max.optional(),
});

/** The authored half of an inventory item (the resident shape MINUS `id`, which the SERVER mints — a hand
 *  caller never names an item's identity, exactly as the model applier never does). */
const rpgInventoryItemInputSchema = rpgInventoryItemSchema.omit({ id: true }).partial().extend({ name: rpgInventoryItemSchema.shape.name });

/** ONE hand write on ONE actor's volatile plane. Discriminated on `op`; every arm names the field it writes
 *  (the `<field>` in its `actorState.<actorKey>.<field>` lock path) and carries only that field's datum.
 *  Keyed sub-arrays (`conditions` by name, `inventory` by id, `wallet` by name — the merge engine's own
 *  element keys) get add/remove/patch arms; the leaves get `set` arms. There is no `setHp`: health is an
 *  ordinary meter tracker since R3, so it is written by `setTracker` like every other one. */
export const rpgActorOpSchema = z.discriminatedUnion("op", [
  // The IDENTITY arms (R2) — a cast actor's own half. They REFUSE on an actor that carries no identity (a
  // roster member: her name is the roster's and her standing prose is the sheet's), which is errors-as-data,
  // not a silent no-op. `setIdentityText` on `name` is the RENAME the slug key was minted to make possible.
  z.object({ op: z.literal("setIdentityText"), field: z.enum(RPG_ACTOR_IDENTITY_TEXT_FIELDS), text: z.string() }),
  z.object({ op: z.literal("setRelationship"), relationship: rpgRelationshipSchema }),
  z.object({ op: z.literal("setStatus"), status: rpgActorVolatileSchema.shape.status }),
  z.object({ op: z.literal("setTracker"), key: z.string().min(1), value: rpgTrackerValuePatchSchema }),
  z.object({ op: z.literal("addCondition"), condition: rpgConditionSchema.partial().extend({ name: rpgConditionSchema.shape.name }) }),
  z.object({ op: z.literal("removeCondition"), name: z.string().min(1) }),
  z.object({ op: z.literal("addItem"), item: rpgInventoryItemInputSchema }),
  // The item ops address the element by its OWN `id` field — a blob-internal string (no table, no FK, no
  // brand: `rpgInventoryItemSchema.id` is the same plain string, and a per-item brand buys nothing at this
  // cardinality), which is also why the field is spelled `id` and not `itemId`.
  z.object({ op: z.literal("patchItem"), id: rpgInventoryItemSchema.shape.id, patch: rpgInventoryItemInputSchema.partial() }),
  z.object({ op: z.literal("removeItem"), id: rpgInventoryItemSchema.shape.id }),
  z.object({ op: z.literal("setWalletAmount"), name: z.string().min(1), amount: z.number().int() }),
]);
export type RpgActorOp = z.infer<typeof rpgActorOpSchema>;
