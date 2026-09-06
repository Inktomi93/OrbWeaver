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
//   3. THE SUPPRESSION REPORT (#77) — a dropped write is a LOSS, and the surface that shows a turn's tool
//      calls must be able to say so instead of reporting `applied` about a write no state carries. This
//      engine is the ONE place a lock actually drops something, so it is the one place that names it: the
//      tracked entry point collects the dotted paths it suppressed and every caller (the staging accumulator,
//      the flush's fold) threads them up rather than re-diffing states to guess. A path is reported only when
//      the write it prevented would have CHANGED the value: the appliers compose WHOLE planes, so a patch
//      routinely carries a locked value byte-identically, and reporting that as a loss would make the trail
//      noise the reader learns to skip.
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
import type { LockedPatchOutcome } from "../contract/results.ts";

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
 *  (`user:<id>` / `character:<id>` / `npc:<key>`), the SAME string every other actor-addressed surface
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
 *    • the HAND door no longer sends an image at all (R1's `patchActor` derives the next row from the true
 *      head), but the policy stays: the model appliers still author less than the whole array.
 *  So a host editing one party member's meters used to DELETE every scene NPC's tracked state, and two
 *  back-to-back per-actor hand edits erased the first (the e2e-caught hand-plane loss). An actor is an
 *  identity, not list content: it leaves the plane by a real gesture (`rpg.dismissActor`), never by going
 *  unmentioned. Since R2 the element is the WHOLE person — `{actorRef, identity?, volatile}` — so the nested
 *  planes register under `…<actorKey>.volatile.<field>` and the sub-field pin grammar recurses unchanged.
 *
 *  TRACKER VALUES ARE NOT HERE, and that is the point of the unification: `trackerValues` is a RECORD keyed
 *  by tracker `key`, not an array, so the plain object walk already gives it per-tracker lock paths
 *  (`actorState.<actor>.trackerValues.<key>`, `trackerValues.<key>`) for free — the keyed-array machinery
 *  existed precisely because the old name-addressed `pools[]` array could not express one. */
const KEYED_ARRAYS: Readonly<Record<string, KeyedPlane>> = {
  quests: { keyOf: propKey("id"), omissionRemoves: true },
  // `inventory`'s per-element pins stopped being hypothetical with #78: the pack's hand door now MINTS
  // `…inventory.<id>.<field>` for the fields a host claimed, so the sub-field walk below is the live path for
  // every manual pack edit — and the element-lock removal defense is what keeps a hand-added item from being
  // deleted by a story that simply never mentions it.
  inventory: { keyOf: propKey("id"), omissionRemoves: true },
  // `presentCharacters` is NOT here since R2: it is a flat array of `actorRefKey` STRINGS (the presence plane),
  // which has no elements to correlate and no per-element lock to honor — an unkeyed array wholesale-replaces,
  // which is exactly right for a plane whose appliers always author it whole from the true base.
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

/** Where a merge pass records the paths a lock DROPPED. `null` = nobody is listening, so the walk does no
 *  extra work at all (the hot path: every read-through stage and every hand overlay). */
type SuppressionSink = string[] | null;

/** The ARBITRATION the whole walk carries: whose locks decide, and where the drops are named. One object
 *  rather than two threaded params, so the hypothetical "what would this write have done" resolve is spelled
 *  as one lock-free arbitration ({@link UNARBITRATED}) instead of two arguments that could drift apart. */
interface MergeArbitration {
  readonly locks: RpgFieldLocks | null;
  readonly sink: SuppressionSink;
}

/** No locks, no listener — the arbitration the suppression report resolves its hypothetical under. */
const UNARBITRATED: MergeArbitration = { locks: null, sink: null };

/** Record `path` as suppressed when the write the lock prevented would actually have changed the value.
 *  `would` is the value the merge WOULD have produced with no lock at or below this path — computed by
 *  re-resolving with `locks: null`, because resolving with the locks in hand returns the base unchanged and
 *  would report nothing at all. Duplicate paths are collapsed: one lock, one line in the trail. */
function reportSuppression(sink: SuppressionSink, path: string, baseValue: unknown, would: unknown | typeof SKIP): void {
  if (sink === null || would === SKIP || deepEqual(would, baseValue)) {
    return;
  }
  if (!sink.includes(path)) {
    sink.push(path);
  }
}

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
  arb: MergeArbitration;
  fieldPath: string;
}): unknown[] {
  const { baseArr, patchArr, plane, arb, fieldPath } = args;
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
    out.push(resolveKeyedElement(baseById.get(id), el, arb, `${fieldPath}.${id}`));
  }
  for (const [id, el] of baseById) {
    if (seen.has(id)) {
      continue;
    }
    const elPath = `${fieldPath}.${id}`;
    if (!plane.omissionRemoves) {
      out.push(el); // ADDITIVE plane: an unnamed element is ignorance, not a removal — nothing was suppressed
      continue;
    }
    if (hasLockAtOrBelow(elPath, arb.locks)) {
      // The patch REMOVED a pinned element and the lock re-inserted it. That is a suppressed write like any
      // other (the element's disappearance was the model's intent), so the trail names it.
      reportSuppression(arb.sink, elPath, undefined, el);
      out.push(el);
    }
  }
  return out;
}

/** Resolve ONE correlated keyed element: a whole-element lock pins the base (a locked-but-absent base takes
 *  the patch); a base+patch object pair deep-merges per field under the element path (nested locks bite —
 *  the #10 per-field pin); anything else takes the patch element as-is. */
function resolveKeyedElement(base: unknown, el: unknown, arb: MergeArbitration, elPath: string): unknown {
  if (isPathLocked(elPath, arb.locks)) {
    if (base === undefined) {
      return el; // locked-but-absent: there is no pinned value to defend, so the patch element lands
    }
    reportSuppression(arb.sink, elPath, base, isPlainObject(base) && isPlainObject(el) ? mergeAt(base, el, UNARBITRATED, elPath) : el);
    return base;
  }
  if (isPlainObject(base) && isPlainObject(el)) {
    return mergeAt(base, el, arb, elPath);
  }
  return el;
}

/** Resolve ONE patch value against its base per the [merge-clear] contract (locks handled by the caller). */
function resolveValue(baseValue: unknown, value: unknown, arb: MergeArbitration, path: string): unknown | typeof SKIP {
  if (value === undefined) {
    return SKIP; // omit = keep
  }
  if (value === null) {
    return null; // explicit null = leaf clear
  }
  if (Array.isArray(value)) {
    const plane = KEYED_ARRAYS[lastSegment(path)];
    if (plane !== undefined && Array.isArray(baseValue)) {
      return mergeKeyedArray({ baseArr: baseValue, patchArr: value, plane, arb, fieldPath: path }); // keyed: element-lock grammar
    }
    return value; // unkeyed array = wholesale replace
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) {
      return SKIP; // `{}` = no-op (leaf preserved), NOT a reset
    }
    return isPlainObject(baseValue) ? mergeAt(baseValue, value, arb, path) : value;
  }
  return value; // primitive = replace
}

/** The [merge-clear] deep merge, lock-honoring. Recurses plain objects, dropping locked paths and applying
 *  the `{}`-noop / `null`-clear contract. `prefix` accumulates the dotted lock path; `sink` collects what the
 *  locks dropped (rule 3 above) and is `null` when nobody asked. */
function mergeAt(base: Record<string, unknown>, patch: Record<string, unknown>, arb: MergeArbitration, prefix: string): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (isPathLocked(path, arb.locks)) {
      // manual-edit-wins: a locked path never yields to a tool write. The lock-free resolve is the hypothetical
      // "what this write wanted" — the sink keeps it only when it differs from what the base already holds.
      reportSuppression(arb.sink, path, merged[key], resolveValue(merged[key], value, UNARBITRATED, path));
      continue;
    }
    const resolved = resolveValue(merged[key], value, arb, path);
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
  return mergeAt(base, patch, { locks: fieldLocks, sink: null }, "") as T;
}

/** {@link applyLockedPatch} with the suppression report (#77). The two writers that must answer "what did this
 *  turn lose to a hand edit" — the staging accumulator and the flush's fold — call THIS one, so the answer is
 *  observed where the drop happens instead of re-derived from a state diff that cannot tell a lock from a
 *  model that never wrote. */
export function applyLockedPatchTracked<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>,
  fieldLocks: RpgFieldLocks | null,
): LockedPatchOutcome<T> {
  const suppressed: string[] = [];
  return { state: mergeAt(base, patch, { locks: fieldLocks, sink: suppressed }, "") as T, suppressed };
}

// ── REBASING A PATCH ONTO A DIFFERENT HEAD (HAND-EDIT-VS-FLUSH) ───────────────────────────────────
//
// EVERY applier in `tools/apply.ts` is a READ-MODIFY-WRITE against the base it was handed, not an author of a
// delta: `applyPresencePatch` emits `presentCharacters` AND `actorState` as WHOLE ARRAYS, `applyUpdateScene`
// emits `[...state.recentEvents, beat]`, `applyUpsertQuest` emits the whole `quests` array, and party/inventory
// map over the whole `actorState`. The registry note above says an unkeyed array wholesale-replacing is "exactly
// right for a plane whose appliers always author it whole FROM THE TRUE BASE" — and that is the load-bearing
// clause. At FOLD time the round's base is no longer true: a hand edit landed after it was read.
//
// So the flush's fold cannot replay a staged patch verbatim onto the hand head. A round that merely mentions the
// scene carries every on-stage actor in its patch, and replaying that re-inserted an actor the host had just
// DISMISSED — silently, because the removal verbs deliberately CLEAR their locks (the symmetric grammar), so
// there was no pin left to stop it. Stripping the composed planes is not enough either: a partial array on an
// `omissionRemoves` plane reads as "delete everything else".
//
// THE REBASE IS A THREE-WAY MERGE over the data the fold already holds — the round's BASE (what the applier
// composed from), the round's PATCH (what it composed), and the HAND HEAD (what is true now):
//   • what the round ADDED or CHANGED (differs from its base) is the round's real intent → it lands;
//   • what the round REMOVED (in its base, absent from its patch) is also real intent → it is removed from the
//     head too;
//   • what the round merely CARRIED (byte-identical to its base) is NOT intent — it is an artifact of composing
//     whole planes — so it never resurrects an element the head no longer has.
// The residual is exactly the boarded tombstone row and no wider: if the round genuinely CHANGED the very datum
// the human removed in the same window, that is a real write against a released lock and it wins.
//
// RECORDS AND SCALARS ARE NOT REBASED, deliberately. `trackerValues`, `plot` and `clock` are composed from base
// too, but they are merged by the plain-object walk (never wholesale) and there is no remove-with-lock-release
// gesture for them: every hand write to those planes AUTO-LOCKS the path it touched, and a lock already drops
// the patch at that path. Arrays are the exposure precisely because `dismissActor`/`deleteQuest` are the two
// gestures that release the pin they would otherwise be protected by.

/** Structural equality over the plain-JSON snapshot planes (no classes, no cycles — these values are parsed
 *  from JSON columns). Used only to tell an applier's CARRIED element from one it actually wrote. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    return aKeys.length === Object.keys(b).length && aKeys.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}

/** Rebase a KEYED array plane (`quests`, `actorState`, `inventory`, …) — elements correlate by their registry
 *  key, which is unique within the plane, so the three sides can be compared element-wise. */
function rebaseKeyedArray(patch: readonly unknown[], base: readonly unknown[], head: readonly unknown[], keyOf: ElementKeyResolver): unknown[] {
  const patchKeys = new Set(patch.map(keyOf));
  // What the round REMOVED: in its base, gone from its patch. Real intent — honor it against the head too.
  const removed = new Set(base.map(keyOf).filter((key) => key !== undefined && !patchKeys.has(key)));
  const result = head.filter((element) => !removed.has(keyOf(element)));
  for (const element of patch) {
    const key = keyOf(element);
    const baseTwin = base.find((candidate) => keyOf(candidate) === key);
    const at = result.findIndex((candidate) => keyOf(candidate) === key);
    if (at !== -1) {
      result[at] = element; // the head still has it — the round's version lands (a carry is identical anyway)
      continue;
    }
    if (baseTwin !== undefined && deepEqual(element, baseTwin)) {
      continue; // pure CARRY of something the head no longer has — the human removed it; do not resurrect
    }
    result.push(element); // a genuine add, or a genuine change to something the head dropped (tombstone residual)
  }
  return result;
}

/** A flat array element's bucket key for the multiset counts (`presentCharacters` holds `actorRefKey` strings;
 *  a beat is its text). Non-strings are compared structurally so the helper is total. */
function flatKey(element: unknown): string {
  return typeof element === "string" ? element : JSON.stringify(element);
}

/** Count occurrences per element — MULTISET, not set: `recentEvents` may legitimately carry the same beat text
 *  twice (a model can narrate a line again), and collapsing that would silently rewrite the story. */
function counts(items: readonly unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = flatKey(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** The multiset SURPLUS of `a` over `b` — how many extra copies of each element `a` carries. Used both ways:
 *  base-over-patch is what the round REMOVED, patch-over-base is what it ADDED. */
function surplus(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, n] of a) {
    const extra = n - (b.get(key) ?? 0);
    if (extra > 0) {
      out.set(key, extra);
    }
  }
  return out;
}

/** Take up to `budget[key]` copies of each element out of `items`, preserving order (multiset difference). */
function withoutCopies(items: readonly unknown[], budget: Map<string, number>): unknown[] {
  const left = new Map(budget);
  const kept: unknown[] = [];
  for (const element of items) {
    const key = flatKey(element);
    const remaining = left.get(key) ?? 0;
    if (remaining > 0) {
      left.set(key, remaining - 1);
      continue;
    }
    kept.push(element);
  }
  return kept;
}

/** The elements of `items` that fall within `budget[key]` copies, in order — the mirror of {@link withoutCopies}. */
function onlyCopies(items: readonly unknown[], budget: Map<string, number>): unknown[] {
  const left = new Map(budget);
  const taken: unknown[] = [];
  for (const element of items) {
    const key = flatKey(element);
    const remaining = left.get(key) ?? 0;
    if (remaining > 0) {
      left.set(key, remaining - 1);
      taken.push(element);
    }
  }
  return taken;
}

/** Rebase an UNKEYED array plane by multiset difference: the round's ADDS are appended to the head and its
 *  REMOVES are taken out of it, while everything it merely carried leaves the head's own contents alone. */
function rebaseFlatArray(patch: readonly unknown[], base: readonly unknown[], head: readonly unknown[]): unknown[] {
  const patchCounts = counts(patch);
  const baseCounts = counts(base);
  return [...withoutCopies(head, surplus(baseCounts, patchCounts)), ...onlyCopies(patch, surplus(patchCounts, baseCounts))];
}

/** Rebase a staged patch composed against `base` so it can be replayed onto `head` without re-asserting the
 *  parts of `base` the applier merely carried. Top-level ARRAY planes only — see the block comment above for
 *  why records and scalars are deliberately left to the lock grammar. */
export function rebasePatchOntoHead(patch: Record<string, unknown>, base: Record<string, unknown>, head: Record<string, unknown>): Record<string, unknown> {
  const rebased: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const baseValue = base[key];
    const headValue = head[key];
    if (Array.isArray(value) && Array.isArray(baseValue) && Array.isArray(headValue)) {
      const keyOf = KEYED_ARRAYS[lastSegment(key)]?.keyOf;
      rebased[key] = keyOf === undefined ? rebaseFlatArray(value, baseValue, headValue) : rebaseKeyedArray(value, baseValue, headValue, keyOf);
      continue;
    }
    rebased[key] = value;
  }
  return rebased;
}
