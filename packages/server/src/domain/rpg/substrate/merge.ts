// domain/rpg/substrate/merge — the swipe-volatile plane's PURE merge + lock engine (rpg-design/05 §2.4).
// Zero I/O. Two jobs, one pass:
//
//   1. The [merge-clear] CONTRACT — the OPPOSITE of settings' `deepMergePlain` (do NOT copy that helper):
//        • `undefined` at a key ⇒ skip (don't touch — the MA-4 omit-preserves semantic)
//        • `{}` (an empty plain object) ⇒ NO-OP (leaf preserved) — NOT a leaf reset
//        • explicit `null` ⇒ leaf CLEAR (write null)
//        • a non-empty plain object over a plain-object base ⇒ recurse
//        • anything else (array / primitive / object-over-nonobject) ⇒ replace
//      (The transition test pins the `{}`-noop vs `null`-clear seam.)
//
//   2. LOCK HONORING (manual-edit-wins) — `applyLockedPatch` drops any patch path present in `fieldLocks`
//      (a presence-key `Record<dottedPath, true>`). Only `editSnapshot` (the hand-edit verb, W1b) WRITES
//      locks; tools HONOR them here. A locked path is skipped ENTIRELY (base value survives), so a
//      hand-edited field can never be overwritten by a later model tool write.
//
// Locks are DOTTED PATHS over the merged object (`location`; `quests.<questId>` per §2.5; `inventory.<id>`).
// A lock on a prefix path drops any patch at or below it (a lock on `quests` protects every quest).
//
// KEYED-ARRAY LOCK GRAMMAR (§2.5/§4.4 — per-element `<field>.<id>` locks). A tool wholesale-replaces an
// array (the [merge-clear] replace branch), so a naive merge can never honor an ELEMENT lock: `quests.q_1`
// would never bite, only the all-or-nothing `quests` prefix. The fix: some arrays are KEYED — each element
// carries a stable id/key (a plain property, or a COMPUTED projection like `actorRefKey`), and
// `<field>.<id>` addresses one element. A keyed merge correlates base↔patch elements by that key and:
//   • a WHOLE-element lock (`<field>.<id>`) pins the base element over the patch (survives a MODIFY);
//   • a base element with ANY lock at/under its element path survives a tool REMOVAL (re-inserted);
//   • a plane may be ADDITIVE (`omissionRemoves: false` — `actorState` alone), where an element the patch
//     never names survives unconditionally: nothing removes an actor by omission, and both the hand door
//     (locks off, roster-only client view) and the tool appliers author less than the whole array;
//   • a correlated pair with neither DEEP-MERGES per field (the same `mergeAt` walk, path-prefixed
//     `<field>.<id>`), so a SUB-FIELD lock (`actorState.user:u1.status`, `actorState.user:u1.pools.Mana`)
//     bites on exactly that value while unlocked sibling fields take the patch — the per-field pin (#10);
//   • an uncorrelated patch element (a new id) lands as-is.
// The registry below matches a path's FINAL SEGMENT to the element-key resolver; a new keyed plane is ONE
// entry (the extensible shape — KISS/YAGNI suspended here). Nested keyed planes (an actor's `pools` /
// `wallet` / `conditions` / `inventory`) register by the same segment vocabulary, so the grammar recurses.
// The bare `<field>` prefix lock still all-or-nothing pins the whole array.

import type { RpgFieldLocks } from "@orb/contracts/rpg";
import { actorRefKey, rpgActorRefSchema } from "@orb/contracts/rpg";
import { isPlainObject } from "@orb/kit/guards";

/** Resolve a keyed element's stable lock-segment key, or `undefined` when it has none (unaddressable). */
type ElementKeyResolver = (element: unknown) => string | undefined;

/** A plain-property key resolver (`id` / `key` / `name`). */
function propKey(prop: string): ElementKeyResolver {
  return (element) => {
    const raw = isPlainObject(element) ? element[prop] : undefined;
    return typeof raw === "string" ? raw : undefined;
  };
}

/** The `actorState` element key — the COMPUTED `actorRefKey` projection over the element's `actorRef`
 *  (`user:<id>` / `character:<id>` / `cast:<key>`), the SAME string every other actor-addressed surface
 *  uses (the Map/lock/find key, contracts/rpg/actor.ts). A malformed ref resolves no key (unaddressable). */
function actorStateKey(element: unknown): string | undefined {
  const ref = isPlainObject(element) ? element["actorRef"] : undefined;
  const parsed = rpgActorRefSchema.safeParse(ref);
  return parsed.success ? actorRefKey(parsed.data) : undefined;
}

/** One keyed plane's merge policy: how an element is addressed, and what OMITTING one from the patch means. */
interface KeyedPlane {
  readonly keyOf: ElementKeyResolver;
  /** Does a base element the patch never names mean REMOVE it?
   *  • `true` — the authored array IS the plane. Every plane with a real remove-by-omission gesture
   *    (`deleteQuest`, the pack's item removal, the tool's `presentRemove` / `removeCondition`) needs this,
   *    and only the element-lock defense below rescues a pinned element from it.
   *  • `false` — ADDITIVE: an unnamed element is IGNORANCE, not intent, so the base element survives. */
  readonly omissionRemoves: boolean;
}

/** The keyed snapshot arrays, matched by the path's FINAL SEGMENT: `quests`/`inventory` (key `id`),
 *  `presentCharacters` (`key`), `actorState` (the computed `actorRefKey` — the #10 per-field-lock wire),
 *  and the per-actor nested planes `wallet`/`conditions` (`name` — the name-addressed vocabulary, D86).
 *  Segment-matching (over full-path keys) is what lets the nested planes key under ANY actor prefix
 *  (`actorState.<key>.wallet`) without a per-actor registry re-spell.
 *
 *  `actorState` is the ONE ADDITIVE plane, because NOTHING removes an actor by omission and two writers
 *  routinely author less than the whole array:
 *    • the tool/extraction appliers only ever map-or-append over the base (`withActor`, tools/apply.ts);
 *    • the HAND door writes with `fieldLocks: null` (hand-always-wins) — which also disables the element-lock
 *      removal defense — and its client builds the overlay from the tracker view's `actors`, which carries the
 *      ROSTER half of the plane only (a `cast:` NPC's volatile row lives under `castVolatile`).
 *  So a host editing one party member's HP used to DELETE every scene NPC's tracked state, and two
 *  back-to-back per-actor hand edits erased the first (the e2e-caught hand-plane loss). An actor is an
 *  identity, not list content: it leaves the plane by a real gesture, never by going unmentioned.
 *
 *  TRACKER VALUES ARE NOT HERE, and that is the point of the unification: `trackerValues` is a RECORD keyed
 *  by tracker `key`, not an array, so the plain object walk already gives it per-tracker lock paths
 *  (`actorState.<actor>.trackerValues.<key>`, `trackerValues.<key>`) for free — the keyed-array machinery
 *  existed precisely because the old name-addressed `pools[]` array could not express one. */
const KEYED_ARRAYS: Readonly<Record<string, KeyedPlane>> = {
  quests: { keyOf: propKey("id"), omissionRemoves: true },
  inventory: { keyOf: propKey("id"), omissionRemoves: true },
  presentCharacters: { keyOf: propKey("key"), omissionRemoves: true },
  actorState: { keyOf: actorStateKey, omissionRemoves: false },
  wallet: { keyOf: propKey("name"), omissionRemoves: true },
  conditions: { keyOf: propKey("name"), omissionRemoves: true },
};

/** The final dotted segment of a lock path (`actorState.user:u1.pools` → `pools`). */
function lastSegment(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? path : path.slice(dot + 1);
}

/** Is `path` locked, directly or by a locked ancestor prefix? A lock on `quests` blocks `quests.q_1`. */
function isPathLocked(path: string, locks: RpgFieldLocks | null): boolean {
  if (locks === null || path === "") {
    return false;
  }
  if (locks[path] === true) {
    return true;
  }
  // Walk ancestor prefixes: `a.b.c` → check `a.b`, then `a`.
  let dot = path.lastIndexOf(".");
  while (dot !== -1) {
    const prefix = path.slice(0, dot);
    if (locks[prefix] === true) {
      return true;
    }
    dot = prefix.lastIndexOf(".");
  }
  return false;
}

// A sentinel the per-key resolver returns to mean "skip this key" (distinct from a real `undefined` leaf).
const SKIP = Symbol("skip");

/** Does ANY lock sit at or BELOW `path` (`path` itself, or any `path.<deeper>` key)? The removal defense:
 *  a base element carrying a sub-field lock must survive a tool removal, or the pinned value silently dies
 *  with its element. */
function hasLockAtOrBelow(path: string, locks: RpgFieldLocks | null): boolean {
  if (locks === null) {
    return false;
  }
  if (isPathLocked(path, locks)) {
    return true;
  }
  const prefix = `${path}.`;
  return Object.keys(locks).some((key) => key.startsWith(prefix));
}

/** Merge a keyed array under the `<field>.<id>` lock grammar (the header's four-rule contract): a
 *  whole-element lock pins the base element; a correlated pair deep-merges per field (nested locks bite —
 *  the #10 per-field pin); an unnamed base element survives when the plane is ADDITIVE or when it carries
 *  any lock at/under its path (appended at the tail, deterministically); an unkeyed/uncorrelated patch
 *  element lands as-is. */
function mergeKeyedArray(args: {
  baseArr: readonly unknown[];
  patchArr: readonly unknown[];
  plane: KeyedPlane;
  locks: RpgFieldLocks | null;
  fieldPath: string;
}): unknown[] {
  const { baseArr, patchArr, plane, locks, fieldPath } = args;
  const keyOf = plane.keyOf;
  const baseById = new Map<string, unknown>();
  for (const el of baseArr) {
    const id = keyOf(el);
    if (id !== undefined) {
      baseById.set(id, el);
    }
  }
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const el of patchArr) {
    const id = keyOf(el);
    if (id === undefined) {
      out.push(el); // an unaddressable element — nothing to correlate or lock against
      continue;
    }
    seen.add(id);
    out.push(resolveKeyedElement(baseById.get(id), el, locks, `${fieldPath}.${id}`));
  }
  for (const [id, el] of baseById) {
    if (seen.has(id)) {
      continue;
    }
    if (!plane.omissionRemoves || hasLockAtOrBelow(`${fieldPath}.${id}`, locks)) {
      out.push(el); // additive plane, or the patch dropped a locked element — keep it (removal defeated)
    }
  }
  return out;
}

/** Resolve ONE correlated keyed element: a whole-element lock pins the base (a locked-but-absent base takes
 *  the patch); a base+patch object pair deep-merges per field under the element path (nested locks bite —
 *  the #10 per-field pin); anything else takes the patch element as-is. */
function resolveKeyedElement(base: unknown, el: unknown, locks: RpgFieldLocks | null, elPath: string): unknown {
  if (isPathLocked(elPath, locks)) {
    return base ?? el;
  }
  if (isPlainObject(base) && isPlainObject(el)) {
    return mergeAt(base, el, locks, elPath);
  }
  return el;
}

/** Resolve ONE patch value against its base per the [merge-clear] contract (locks handled by the caller). */
function resolveValue(baseValue: unknown, value: unknown, locks: RpgFieldLocks | null, path: string): unknown | typeof SKIP {
  if (value === undefined) {
    return SKIP; // omit = keep
  }
  if (value === null) {
    return null; // explicit null = leaf clear
  }
  if (Array.isArray(value)) {
    const plane = KEYED_ARRAYS[lastSegment(path)];
    if (plane !== undefined && Array.isArray(baseValue)) {
      return mergeKeyedArray({ baseArr: baseValue, patchArr: value, plane, locks, fieldPath: path }); // keyed: element-lock grammar
    }
    return value; // unkeyed array = wholesale replace
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) {
      return SKIP; // `{}` = no-op (leaf preserved), NOT a reset
    }
    return isPlainObject(baseValue) ? mergeAt(baseValue, value, locks, path) : value;
  }
  return value; // primitive = replace
}

/** The [merge-clear] deep merge, lock-honoring. Recurses plain objects, dropping locked paths and applying
 *  the `{}`-noop / `null`-clear contract. `prefix` accumulates the dotted lock path. */
function mergeAt(base: Record<string, unknown>, patch: Record<string, unknown>, locks: RpgFieldLocks | null, prefix: string): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (isPathLocked(path, locks)) {
      continue; // manual-edit-wins: a locked path never yields to a tool write
    }
    const resolved = resolveValue(merged[key], value, locks, path);
    if (resolved !== SKIP) {
      merged[key] = resolved;
    }
  }
  return merged;
}

/** Apply a tool-authored patch over the current snapshot state, honoring locks and the [merge-clear]
 *  contract. `base`/`patch` are the composed snapshot state as plain JSON (the accumulator's overlay unit);
 *  `fieldLocks` rides on the state. Returns a NEW object (base untouched). */
export function applyLockedPatch<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>, fieldLocks: RpgFieldLocks | null): T {
  return mergeAt(base, patch, fieldLocks, "") as T;
}
