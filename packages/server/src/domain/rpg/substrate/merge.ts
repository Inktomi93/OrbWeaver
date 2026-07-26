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
// carries a stable id/key property, and `<field>.<id>` addresses one element. For those, after the tool's
// wholesale replace, we RE-ASSERT every base element whose `<field>.<id>` is locked back onto the merged
// array (re-inserting it if the tool dropped it) — so a locked element survives both a tool MODIFY and a
// tool REMOVAL, while unlocked siblings take the patch. The registry below maps each keyed field to the
// element property that names its lock segment; a new keyed plane is ONE entry (the extensible shape —
// KISS/YAGNI suspended here). The bare `<field>` prefix lock still all-or-nothing pins the whole array.

import type { RpgFieldLocks } from "@orb/contracts/rpg";
import { isPlainObject } from "@orb/kit/guards";

/** The keyed snapshot arrays: `field → the element property that names its `<field>.<id>` lock segment`.
 *  `quests` (key `id`) is the spec-committed proven case (§2.5/§4.4). `inventory` (`id`) and
 *  `presentCharacters` (`key`) carry stable minted plain-property keys too, so per-element hand-locks on
 *  those planes bite by the SAME grammar — registered now rather than left to re-spell at their verb wave.
 *  `actorState` is a DOCUMENTED FORWARD-SEAM, NOT registered: its element key is a COMPUTED `actorRefKey`
 *  projection (not a plain property), and how `editSnapshot` addresses a per-actor sub-field is an unfixed
 *  W1b decision — registering a guessed key shape now would be the re-spell the registry exists to avoid. */
const KEYED_ARRAYS: Readonly<Record<string, string>> = {
  quests: "id",
  inventory: "id",
  presentCharacters: "key",
};

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

/** The stable lock-segment key of a keyed-array element, or `undefined` if it has none (unaddressable). */
function elementKey(element: unknown, keyProp: string): string | undefined {
  const raw = isPlainObject(element) ? element[keyProp] : undefined;
  return typeof raw === "string" ? raw : undefined;
}

/** Merge a keyed array under the `<field>.<id>` lock grammar. The tool wholesale-replaces (`args.patchArr`
 *  is the new array); then every BASE element whose `<field>.<id>` is locked is RE-ASSERTED — overwriting
 *  the patch's version of that id (survives a MODIFY) and re-inserting it if the patch dropped it (survives
 *  a REMOVAL). Unlocked siblings take the patch as-is. Order: patch order, with any re-inserted locked base
 *  elements appended (a locked element the tool removed returns, deterministically at the tail). */
function mergeKeyedArray(args: {
  baseArr: readonly unknown[];
  patchArr: readonly unknown[];
  keyProp: string;
  locks: RpgFieldLocks | null;
  fieldPath: string;
}): unknown[] {
  const { baseArr, patchArr, keyProp, locks, fieldPath } = args;
  const lockedBaseById = new Map<string, unknown>();
  for (const el of baseArr) {
    const id = elementKey(el, keyProp);
    if (id !== undefined && isPathLocked(`${fieldPath}.${id}`, locks)) {
      lockedBaseById.set(id, el);
    }
  }
  if (lockedBaseById.size === 0) {
    return [...patchArr]; // no element locks — the tool's replace stands
  }
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const el of patchArr) {
    const id = elementKey(el, keyProp);
    if (id !== undefined && lockedBaseById.has(id)) {
      out.push(lockedBaseById.get(id)); // locked: pin the base value over the tool's edit
      seen.add(id);
    } else {
      out.push(el); // unlocked sibling: take the patch
    }
  }
  for (const [id, el] of lockedBaseById) {
    if (!seen.has(id)) {
      out.push(el); // the tool dropped a locked element — re-insert it (removal defeated)
    }
  }
  return out;
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
    const keyProp = KEYED_ARRAYS[path];
    if (keyProp !== undefined && Array.isArray(baseValue)) {
      return mergeKeyedArray({ baseArr: baseValue, patchArr: value, keyProp, locks, fieldPath: path }); // keyed: element-lock grammar
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
