// contracts/chat/regex-tiers — the ROOM'S REGEX TIER vocabulary: the tier KEY every per-chat allow flag and
// every rendered lever is addressed by, the per-seat character slice the resolver consumes, and the wire view
// of the room's effective regex (`chat.listEffectiveRegex`). The design was
// owner-approved 2026-09-05 (#1742).
//
// WHY THE KEY IS ONE FLAT STRING and not a structured `{scope, characterId?}`: it is the identity of a SWITCH.
// The section draws one lever per tier, the host's per-chat allow blob stores one boolean per tier, and the
// read hands back one group per tier — three surfaces that must agree on "which tier is this" without any of
// them re-deriving a composite. A flat key makes the allow lookup a plain member read (`allow[key] !== false`)
// and makes a React key, a `data-*` value and a JSON object key the SAME string. The character arm carries the
// seat's id because a room seats several characters and each one is its own lever (the mock design §3, the lever
// strip); `characterRegexTierKey` is the ONE mint and `parseCharacterRegexTierKey` the ONE reader, so the
// `character:` prefix is never spelled at a call site.
//
// ABSENT ⇒ ALLOWED, everywhere. The blob is a sparse OVERRIDE map: a room that never heard of the section has
// no `regexTiers` key at all and every tier runs, which is byte-identical to today's behavior. That is why
// {@link RegexTierAllow} is `Partial` and why {@link isRegexTierAllowed} exists rather than a `?? true` spelled
// at each of the (server resolver, client lever, client count) readers.
//
// THE ALLOW DROP HAPPENS BEFORE DEDUP (the mock design §7.1, the stickler's F2): a script attached at BOTH a
// disallowed tier and an allowed one must still RUN — dropping after the dedup would let the disallowed tier's
// earlier occurrence swallow the allowed one and silently kill a script the host never switched off. The
// resolver (`server/domain/chat/substrate/regex-tier.ts`) is the one implementation; this file owns the shapes
// it speaks.

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { RegexScriptRow } from "../regex/index.ts";

/** The `character:` tier-key prefix — the ONE spelling, read by the mint and the parser below. */
const CHARACTER_TIER_PREFIX = "character:";

/**
 * WHICH TIER a row (or a lever, or an allow flag) belongs to. Four arms, and the run ORDER is exactly this
 * declaration order — `global` first, the room's own `chat` tier last (`domain/chat/substrate/regex-tier.ts`
 * concatenates in it, and `executeRegexScripts` applies the result in the order it is handed).
 */
export type RegexTierKey = "global" | "preset" | `character:${CharacterId}` | "chat";

/** The three FIXED tier keys, in run order. The character keys are per-seat and therefore not enumerable. */
export const FIXED_REGEX_TIER_KEYS = ["global", "preset", "chat"] as const satisfies readonly RegexTierKey[];

/** Mint one seated character's tier key. The ONE place the prefix is written. */
export function characterRegexTierKey(characterId: CharacterId): RegexTierKey {
  return `${CHARACTER_TIER_PREFIX}${characterId}`;
}

/** The character id inside a character tier key, or `null` for one of the three fixed keys. The ONE reader. */
export function parseCharacterRegexTierKey(key: RegexTierKey): CharacterId | null {
  return key.startsWith(CHARACTER_TIER_PREFIX) ? (key.slice(CHARACTER_TIER_PREFIX.length) as CharacterId) : null;
}

const tierCharacterIdSchema = typeIdSchema(ID_PREFIX.character);

/** A stored tier key, validated: one of the three fixed words, or `character:` + a real character TypeID. A
 *  key that is neither is not a tier this build can address, so it is refused rather than stored as a lever
 *  nothing draws. */
export const regexTierKeySchema = z.custom<RegexTierKey>((value): boolean => {
  if (typeof value !== "string") {
    return false;
  }
  if ((FIXED_REGEX_TIER_KEYS as readonly string[]).includes(value)) {
    return true;
  }
  return value.startsWith(CHARACTER_TIER_PREFIX) && tierCharacterIdSchema.safeParse(value.slice(CHARACTER_TIER_PREFIX.length)).success;
}, "not a regex tier key") satisfies z.ZodType<RegexTierKey>;

/**
 * The host's per-chat tier allows — a SPARSE override map (`ChatMetadata.regexTiers`). A key present with
 * `false` means "this tier does not run in this room"; a key present with `true` and an ABSENT key both mean
 * it runs. Both spellings of "on" are kept reachable on purpose: the section writes an explicit `true` when the
 * host switches a tier back on, and never has to distinguish that from a room that was never touched.
 */
export type RegexTierAllow = Partial<Record<RegexTierKey, boolean>>;

/** The stored blob. `z.partialRecord` over the validated key: an unaddressable key fails the sub-blob, which the
 *  chat-metadata parser heals to absent (every tier runs) rather than nuking its siblings. */
export const regexTierAllowSchema: z.ZodType<RegexTierAllow> = z.partialRecord(regexTierKeySchema, z.boolean());

/** THE PRECEDENCE, one home: a tier runs unless the room explicitly switched it off. Read by the server
 *  resolver, by the lever strip's switch state, and by the in-force count in the section's kicker — three
 *  readers that must never spell `?? true` differently. */
export function isRegexTierAllowed(allow: RegexTierAllow | undefined, key: RegexTierKey): boolean {
  return allow?.[key] !== false;
}

/** THE MASTER's precedence — same absent-⇒-on rule for `ChatMetadata.regexEnabled`. Its own function because
 *  the master is a different key with the same default, and a shared `?? true` would read as an accident. */
export function isRegexEnabledInChat(regexEnabled: boolean | undefined): boolean {
  return regexEnabled !== false;
}

/**
 * ONE seated character's attached scripts. The character slice is per SEAT rather than one flat list because
 * each seat is its own tier — its own lever, its own allow flag, its own group in the section (the mock design
 * §7.2). Flattening it (which is what `domain/regex/persistence/resolve-sources.ts` used to hand back) made
 * per-character allows unrepresentable: the resolver could no longer tell whose rows were whose.
 *
 * ROSTER ORDER is the slice ARRAY's order and stays load-bearing — the union feeds `executeRegexScripts`,
 * which applies its list in order, so a multi-character room's precedence is the roster's.
 */
export interface CharacterRegexSlice {
  readonly characterId: CharacterId;
  readonly scripts: readonly RegexScriptRow[];
}

/** ONE row inside a tier group — the section's row anatomy, resolved server-side so the client never re-unions
 *  (the mock design §7.1). */
export interface RegexTierRowView {
  readonly script: RegexScriptRow;
  /** The row's 0-based index WITHIN its tier — the chat tier's drag order, and every other tier's read-only
   *  junction order. Not a rank: {@link RegexTierRowView.runsAt} is the rank. */
  readonly position: number;
  /** The 1-based rank in the room's effective run order, or `null` when this row does not run here (its tier
   *  is off, the master is off, its library `enabled` is false, or an earlier tier already claimed it). The
   *  section draws the numeral only when it is a number — an off row shows `—`, never a lying rank. */
  readonly runsAt: number | null;
  /** TRUE when this same library row is attached at another tier of THIS room. Drives the `+1` chip and, on
   *  the chat tier, decides whether a detach raises the "this reaches beyond this chat" toast at all. */
  readonly attachedElsewhere: boolean;
}

/** ONE tier's group, in run order. A disallowed tier is LISTED with its rows (readable, ranks dropped) rather
 *  than omitted — the host must be able to switch back on what they switched off. */
export interface RegexTierGroupView {
  readonly scope: RegexTierKey;
  /** FALSE when the room switched this tier off. Independent of the master: the section shows both states. */
  readonly allowed: boolean;
  /**
   * THE IDENTITY THE TIER KEY DOES NOT CARRY (#1754) — a NAME the server resolved, which the client renders
   * into the tier's label (`From the preset · <name>`, the mock design §3). Absent ⇒ the client says the bare
   * word (`From the preset`), never a guess.
   *
   * WHY IT IS OPTIONAL AND WHY ONLY ONE ARM EVER FILLS IT. Three of the four keys already carry their own
   * identity: `global` and `chat` ARE their words (`Everywhere` / `This chat` — a fixed vocabulary the
   * client owns, `docs/law/vocabulary-map.md`), and `character:<id>` carries the seat id, which the
   * section resolves by an EXACT id match against the roster it already holds (`chat.getChat`). The bare
   * word `preset` carries nothing — and the only preset name a client can reach is the VIEWER's active one
   * (`chat-context-band.tsx`), which is NOT the preset this room assembles whenever the rpg GM redirect
   * fires (`domain/chat/verbs/read.ts::resolvePreviewInputs`). So the one tier whose name the client cannot
   * derive is the one the read carries a name for: the resolver that picked the preset is the one that
   * names it. Any future tier in the same position (an identity-less key) fills this same field.
   */
  readonly label?: string | undefined;
  readonly rows: readonly RegexTierRowView[];
}

/** ONE entry of the effective run order — the deduped, allow-filtered set, in the order the turn applies it. */
export interface EffectiveRegexEntry {
  readonly scriptId: RegexScriptRow["id"];
  /** 1-based rank. Position 1 runs first. */
  readonly runsAt: number;
}

/** What `chat.listEffectiveRegex` answers (host-gated, D19): the room's regex as the section draws it. The
 *  two halves are deliberately BOTH returned — the tiers half is the listing (including what is switched off),
 *  the effective half is the run order, and the ranks in the first come only from the second. */
export interface EffectiveRegexView {
  /** Whether the room's MASTER (`ChatMetadata.regexEnabled`) is on. With it off, `effective` is empty and
   *  every row's `runsAt` is null — the section says `off` in its kicker instead of a count. */
  readonly enabled: boolean;
  readonly tiers: readonly RegexTierGroupView[];
  readonly effective: readonly EffectiveRegexEntry[];
}
