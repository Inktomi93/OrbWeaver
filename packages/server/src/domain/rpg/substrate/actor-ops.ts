// domain/rpg/substrate/actor-ops — the PURE op applier for the per-actor volatile plane (the actor-state
// review §5 R1). Zero I/O: it takes ONE actor's CURRENT row (read by the caller from the TRUE resolved head)
// plus the hand's ops, and returns the next row + the FINE lock paths those ops earn. The verb
// (`verbs/patch-actor.ts`) does the head resolve, the write, and the authority; this module owns the
// arithmetic, so the whole op vocabulary is unit-testable without a db.
//
// WHY OPS AND NOT AN IMAGE. The hand door used to ask the client for the plane's whole array image. The client
// can only SEE the plane in projections (the participant half + `castVolatile`; the offstage rows appear in
// neither), so every image it could build was partial — and each of the three shipped defects was that
// contract failing a different way (a partial image deleting unnamed actors; unvalidated image keys; a
// FABRICATED empty row wiping a populated NPC). The fourth, latent, one is the stale-image clobber: the image
// carried every actor's every field as READ AT QUERY TIME, so a model flush landing between the panel's read
// and the human's click was overwritten field-by-field for every actor in it. An op names ONE datum, and the
// row it is applied to is read at WRITE time — the blast radius is the datum the human actually touched, and
// "hand always wins" stops being a merge flag (`fieldLocks: null`) and becomes a property of the applier.
//
// ERRORS-AS-DATA (the `editSnapshot` precedent, `ad60f455`): an op naming an item/condition the actor does not
// carry is REFUSED with a reason, never a silent no-op. A stale panel click is the reachable case, and "I did
// nothing and I'm not telling you" is the exact class this door exists to kill.

import type { RpgActorEntry, RpgActorOp, RpgActorOpField, RpgActorRef, RpgActorVolatile, RpgInventoryItem, RpgTrackerValue } from "@orb/contracts/rpg";
import { RPG_TRACKER_VALUE_EMPTY, rpgActorIdentityLockBase, rpgActorVolatileLockBase } from "@orb/contracts/rpg";
import type { ApplyActorOpsResult } from "../contract/results.ts";

/** The empty ACTOR ROW a first write on an actor with no state row seeds — zero volatile state, plus (for a
 *  `npc` ref only) a born IDENTITY whose display name falls back to the slug until something authors a real
 *  one. An npc IS an identity-bearing person by construction: born without one, the very first
 *  `presentUpsert`/`setIdentityText` would have nothing to write onto. A participant actor is born WITHOUT an
 *  identity and stays that way — her name is chat's, her standing prose the sheet's — which is what
 *  makes the identity ops' refusal arm meaningful rather than a shape accident.
 *
 *  The ONE home for "a fresh actor's zero state": the tool appliers mint through here too, so a hand-minted and
 *  a model-minted row can never be born different shapes. */
export function emptyActorEntry(actorRef: RpgActorRef): RpgActorEntry {
  const volatile: RpgActorVolatile = { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" };
  if (actorRef.kind !== "npc") {
    return { actorRef, volatile };
  }
  return { actorRef, identity: { name: actorRef.npcKey, emoji: "", mood: "", relationship: { kind: "neutral", label: "" } }, volatile };
}

/** The IDENTITY-half op arms (R2) — the ones that write `entry.identity` rather than `entry.volatile`, and
 *  therefore pin under a different lock base. Derived by EXCLUSION from the op union, so a new volatile arm is
 *  volatile by default and a new identity arm must be named here or `tsc` reds at {@link OP_FIELD}. */
const IDENTITY_OP_NAMES = ["setIdentityText", "setRelationship"] as const satisfies readonly RpgActorOp["op"][];
type IdentityOpName = (typeof IDENTITY_OP_NAMES)[number];
type VolatileOpName = Exclude<RpgActorOp["op"], IdentityOpName>;

/** Is this op an identity-half write? A membership test over the tuple above (never a second literal list). */
function isIdentityOp(op: RpgActorOp): op is Extract<RpgActorOp, { op: IdentityOpName }> {
  return (IDENTITY_OP_NAMES as readonly string[]).includes(op.op);
}

/** Which volatile FIELD each op writes — the lock-path segment and the `RPG_ACTOR_OP_FIELDS` vocabulary in one
 *  mapped-type Record: a new op arm fails `tsc` here (§5.5 string-union dispatch), and a renamed volatile field
 *  fails at the tuple the values are pinned to. */
const OP_FIELD: Readonly<Record<VolatileOpName, RpgActorOpField>> = {
  setStatus: "status",
  setTracker: "trackerValues",
  addCondition: "conditions",
  removeCondition: "conditions",
  addItem: "inventory",
  patchItem: "inventory",
  removeItem: "inventory",
  setWalletAmount: "wallet",
};

/** The FINE sub-segment an op appends under its field, or `""` for a plane-level pin.
 *
 *  RECORD-KEYED planes pin per element (`trackerValues.<key>`, `wallet.<name>`) because the panel renders a
 *  per-element pin + Release for them. `conditions` stays PLANE-level even though the merge engine keys its
 *  elements: the panel's Release affordance for that plane is the section pin (`the conditions`), so a
 *  per-element lock there would be a pin the host can SEE stopping the story and CANNOT release — a trap.
 *  Per-element pins follow the per-element Release UI, not the reverse.
 *
 *  `inventory` LEFT this rule the day the pack grew that UI (#78, owner ruling 2026-08-16), and it had to: the
 *  plane-level pin meant ONE hand-added item fenced the model out of the WHOLE pack forever — measured live, a
 *  perfect model update (the `location` of the very item the host had added) was folded away in silence, which
 *  turns seeding your pack by hand into permanently disabling inventory tracking. Its pins are minted per ITEM,
 *  per CLAIMED FIELD by {@link inventoryLockPaths}, and the Pack renders a per-item chip + Release for exactly
 *  those paths — so the rule above is satisfied, not overruled. */
function lockSub(op: RpgActorOp): string {
  if (op.op === "setTracker") {
    return `.${op.key}`;
  }
  if (op.op === "setWalletAmount") {
    return `.${op.name}`;
  }
  return "";
}

/** The item FIELDS a hand inventory op CLAIMED — the keys it actually authored, never the server's defaults.
 *  An `addItem` naming only `{name}` claims the name: the story is still free to write the quantity it
 *  observes, the description it invents and the place it says the thing ended up. That is the whole point of
 *  the granularity — the hand pins what the hand said, and nothing else. */
function claimedItemFields(op: Extract<RpgActorOp, { op: "addItem" | "patchItem" }>): readonly string[] {
  const authored = op.op === "addItem" ? op.item : op.patch;
  return Object.entries(authored)
    .filter(([, value]) => value !== undefined)
    .map(([field]) => field);
}

/** The pins one INVENTORY op earns, under the keyed-element grammar the merge engine already speaks
 *  (`…inventory.<itemId>.<field>` — `substrate/merge.ts`'s KEYED-ARRAY lock rules, no new vocabulary).
 *  `removeItem` earns none: it RELEASES instead (see {@link ApplyActorOpsResult.lockReleases}). */
function inventoryLockPaths(ref: RpgActorRef, op: Extract<RpgActorOp, { op: "addItem" | "patchItem" }>, itemId: string): readonly string[] {
  const base = `${rpgActorVolatileLockBase(ref)}.${OP_FIELD[op.op]}.${itemId}`;
  return claimedItemFields(op).map((field) => `${base}.${field}`);
}

/** The lock paths one op stamps — `actorState.<actorKey>.volatile.<field>[.<element>[.<field>]]` for a volatile
 *  write, `actorState.<actorKey>.identity.<field>` for an identity one (the ONE grammar, shared with the
 *  panel's pin reader through the two exported lock bases). The `volatile`/`identity` segment is not
 *  decoration: the merge walks the stored JSON, so a path that skipped it would pin nothing. Most ops earn
 *  exactly one path; an inventory write earns one per field it claimed. */
function lockPathsFor(ref: RpgActorRef, op: RpgActorOp, itemId: string | undefined): readonly string[] {
  if (op.op === "setRelationship") {
    return [`${rpgActorIdentityLockBase(ref)}.relationship`];
  }
  if (op.op === "setIdentityText") {
    return [`${rpgActorIdentityLockBase(ref)}.${op.field}`];
  }
  if (op.op === "removeItem") {
    return []; // a removal releases; it never pins (the `deleteQuest`/`dismissActor` symmetric grammar)
  }
  if ((op.op === "addItem" || op.op === "patchItem") && itemId !== undefined) {
    return inventoryLockPaths(ref, op, itemId);
  }
  return [`${rpgActorVolatileLockBase(ref)}.${OP_FIELD[op.op]}${lockSub(op)}`];
}

/** The lock-path PREFIX a removal op releases (its element's own path and everything under it), or `undefined`
 *  when the op removes nothing. The verb expands it against the head's stored locks — a removed element must
 *  leave no ghost lock behind, or the host keeps a pin the panel can no longer render and can never release
 *  (`verbs/dismiss-actor.ts` does the identical expansion for a whole actor). */
function lockReleaseFor(ref: RpgActorRef, op: RpgActorOp): string | undefined {
  return op.op === "removeItem" ? `${rpgActorVolatileLockBase(ref)}.${OP_FIELD[op.op]}.${op.id}` : undefined;
}

/** An omitted datum KEEPS the current one; an explicit `null` is a real VALUE (a cleared ceiling, an unset
 *  reading, an emptied string), so this is an `undefined` test and can never be `??`/`||` — a nullish fallback
 *  here would silently drop every deliberate clear the ops exist to express. */
function keep<T>(next: T | undefined, current: T): T {
  if (next === undefined) {
    return current;
  }
  return next;
}

/** Overlay one tracked value, keeping it TOTAL (`{value,items,max}` whole — the snapshot merge recurses into
 *  this object, so a partial write would strand the previous reading's siblings on the new one). */
function writeTracker(
  values: RpgActorVolatile["trackerValues"],
  key: string,
  patch: Extract<RpgActorOp, { op: "setTracker" }>["value"],
): RpgActorVolatile["trackerValues"] {
  const current: RpgTrackerValue = { ...RPG_TRACKER_VALUE_EMPTY, ...values[key] };
  return { ...values, [key]: { value: keep(patch.value, current.value), items: keep(patch.items, current.items), max: keep(patch.max, current.max) } };
}

/** One op arm, narrowed off the string union (see `applyOne`'s header for why the cast is there). */
type Op<K extends RpgActorOp["op"]> = Extract<RpgActorOp, { op: K }>;

/** What ONE volatile op produced: the next volatile half, plus the KEYED ELEMENT it touched when the op
 *  addresses one (an inventory write). The id is carried OUT of the applier rather than re-derived by the lock
 *  code, because an `addItem`'s id is minted inside the write — a second derivation could name an element the
 *  write never produced, which is the one way an item pin could point at nothing. */
interface VolatileWrite {
  readonly volatile: RpgActorVolatile;
  readonly itemId?: string;
}

/** The same, lifted to the ROW (identity ops touch no keyed element, so they carry no id). */
interface AppliedOp {
  readonly entry: RpgActorEntry;
  readonly itemId?: string;
}

/** The CONDITIONS arm. `addCondition` is a NAME-keyed upsert (the model applier's own semantics — re-adding a
 *  standing condition re-authors it instead of minting a duplicate chip); `removeCondition` REFUSES a name the
 *  actor does not carry (a stale panel click deserves a sentence, not a silent no-op). */
function applyConditionOp(actor: RpgActorVolatile, op: Op<"addCondition"> | Op<"removeCondition">): RpgActorVolatile | null {
  if (op.op === "removeCondition") {
    return actor.conditions.some((c) => c.name === op.name) ? { ...actor, conditions: actor.conditions.filter((c) => c.name !== op.name) } : null;
  }
  const existing = actor.conditions.find((c) => c.name === op.condition.name);
  const next = {
    name: op.condition.name,
    stat: op.condition.stat ?? existing?.stat ?? null,
    modifier: op.condition.modifier ?? existing?.modifier ?? 0,
    turnsLeft: op.condition.turnsLeft ?? existing?.turnsLeft ?? null,
  };
  return { ...actor, conditions: [...actor.conditions.filter((c) => c.name !== op.condition.name), next] };
}

/** The INVENTORY arm. `addItem` mints the id SERVER-side (injected mint — determinism), exactly as the model's
 *  `update_inventory` add arm does: a hand caller never names an item's identity. It hands that id BACK on the
 *  {@link VolatileWrite} instead of keeping it private, so the pin the caller stamps and the element this write
 *  produced can never name different items. `patchItem`/`removeItem` REFUSE an id the actor does not carry. */
function applyItemOp(actor: RpgActorVolatile, op: Op<"addItem"> | Op<"patchItem"> | Op<"removeItem">, mintItemId: () => string): VolatileWrite | null {
  if (op.op === "addItem") {
    const itemId = mintItemId();
    const item: RpgInventoryItem = {
      id: itemId,
      name: op.item.name,
      description: op.item.description ?? "",
      quantity: op.item.quantity ?? 1,
      location: op.item.location ?? "",
      type: op.item.type ?? "",
      ...(op.item.icon === undefined ? {} : { icon: op.item.icon }),
    };
    return { volatile: { ...actor, inventory: [...actor.inventory, item] }, itemId };
  }
  if (!actor.inventory.some((it) => it.id === op.id)) {
    return null;
  }
  if (op.op === "removeItem") {
    return { volatile: { ...actor, inventory: actor.inventory.filter((it) => it.id !== op.id) }, itemId: op.id };
  }
  const patch = op.patch;
  const patched = (it: RpgInventoryItem): RpgInventoryItem => ({
    ...it,
    name: keep(patch.name, it.name),
    description: keep(patch.description, it.description),
    quantity: keep(patch.quantity, it.quantity),
    location: keep(patch.location, it.location),
    type: keep(patch.type, it.type),
    ...(patch.icon === undefined ? {} : { icon: patch.icon }),
  });
  return { volatile: { ...actor, inventory: actor.inventory.map((it) => (it.id === op.id ? patched(it) : it)) }, itemId: op.id };
}

/** The WALLET arm — an UPSERT: the purse slot a hand sets into existence is the same gesture as editing it
 *  (the model's wallet-delta applier appends an absent slot too — one behavior, two writers). */
function applyWalletOp(actor: RpgActorVolatile, op: Op<"setWalletAmount">): RpgActorVolatile {
  const has = actor.wallet.some((w) => w.name === op.name);
  const wallet = has
    ? actor.wallet.map((w) => (w.name === op.name ? { ...w, amount: op.amount } : w))
    : [...actor.wallet, { name: op.name, amount: op.amount }];
  return { ...actor, wallet };
}

/** Apply ONE VOLATILE op to a row's volatile half. `null` = refused (the caller composes the reason).
 *
 *  Dispatches on the CLEAN `VolatileOpName` string union via the local binding — NOT on `op.op` directly:
 *  biome's `noUnnecessaryConditions` cannot narrow a `z.infer` zod discriminated union (proven in-tree — see
 *  `domain/automation/engine/arm-executors.ts`, which switches the same way for the same reason), so
 *  `switch (op.op)` reads every case as unreachable. Switching on the bare string union keeps `default: never`
 *  as the exhaustiveness pin (a new op arm fails `tsc`) with NO suppression; the per-arm `as Op<…>` cast is the
 *  price of narrowing off the string rather than the object, sound by construction. */
function applyVolatileOp(actor: RpgActorVolatile, op: Extract<RpgActorOp, { op: VolatileOpName }>, mintItemId: () => string): VolatileWrite | null {
  const kind: VolatileOpName = op.op;
  switch (kind) {
    case "setStatus":
      return { volatile: { ...actor, status: (op as Op<"setStatus">).status } };
    case "setTracker": {
      const set = op as Op<"setTracker">;
      return { volatile: { ...actor, trackerValues: writeTracker(actor.trackerValues, set.key, set.value) } };
    }
    case "addCondition":
    case "removeCondition": {
      const written = applyConditionOp(actor, op as Op<"addCondition"> | Op<"removeCondition">);
      return written === null ? null : { volatile: written };
    }
    case "addItem":
    case "patchItem":
    case "removeItem":
      return applyItemOp(actor, op as Op<"addItem"> | Op<"patchItem"> | Op<"removeItem">, mintItemId);
    case "setWalletAmount":
      return { volatile: applyWalletOp(actor, op as Op<"setWalletAmount">) };
    default:
      return assertNever(kind);
  }
}

/** Apply ONE IDENTITY op (R2). `null` = refused, and the reachable refusal is the honest one: a PARTICIPANT actor
 *  carries no identity half at all (her name is chat's, her standing prose the sheet's), so writing
 *  one would mint a second name home for the same person — exactly the split R2 exists to dissolve. */
function applyIdentityOp(entry: RpgActorEntry, op: Extract<RpgActorOp, { op: IdentityOpName }>): RpgActorEntry | null {
  const identity = entry.identity;
  if (identity === undefined) {
    return null;
  }
  if (op.op === "setRelationship") {
    // A non-custom kind CLEARS the label (the built-ins carry their own meaning) — the same rule the model
    // applier's `mergeRelationship` follows, so hand and story write the identical shape.
    const kind = op.relationship.kind;
    return { ...entry, identity: { ...identity, relationship: { kind, label: kind === "custom" ? op.relationship.label : "" } } };
  }
  const text = op.text.trim();
  // `name` is the ONE identity field with a floor: an empty display name would render a nameless card and an
  // unaddressable reminder line, so a blank rename is refused rather than written.
  if (op.field === "name" && text === "") {
    return null;
  }
  return { ...entry, identity: { ...identity, [op.field]: text } };
}

function assertNever(value: never): never {
  throw new Error(`unhandled actor op: ${JSON.stringify(value)}`);
}

/** The op-name → refusal wording for the "you named something that isn't there" arms. A refusal a human reads
 *  must say WHICH datum, or the panel just moves the guess. */
function missingReason(op: RpgActorOp): string {
  if (op.op === "removeCondition") {
    return `no condition named "${op.name}" on this actor`;
  }
  if (op.op === "patchItem" || op.op === "removeItem") {
    return `no inventory item "${op.id}" on this actor`;
  }
  if (op.op === "setIdentityText" && op.field === "name") {
    return "an actor's display name cannot be blank";
  }
  if (isIdentityOp(op)) {
    // PROSE-OK: "a refusal a human reads" (this fn's own header) — never a model prompt
    return "this actor carries no identity of its own — a roster member's name and standing prose live on the chat roster and its sheet";
  }
  return `op ${op.op} could not be applied`;
}

/** The volatile arm lifted back onto the ROW (which half an op writes is a detail of the op, never of the
 *  caller — {@link applyActorOps} sees one shape). */
function nextEntry(entry: RpgActorEntry, op: Extract<RpgActorOp, { op: VolatileOpName }>, mintItemId: () => string): AppliedOp | null {
  const written = applyVolatileOp(entry.volatile, op, mintItemId);
  if (written === null) {
    return null;
  }
  const next = { ...entry, volatile: written.volatile };
  return written.itemId === undefined ? { entry: next } : { entry: next, itemId: written.itemId };
}

/** The identity arm in the same shape (no keyed element — an identity field is addressed by its own name). */
function nextIdentityEntry(entry: RpgActorEntry, op: Extract<RpgActorOp, { op: IdentityOpName }>): AppliedOp | null {
  const next = applyIdentityOp(entry, op);
  return next === null ? null : { entry: next };
}

/** Apply the hand's ops IN ORDER to one actor's ROW (identity half + volatile half). Total: every op either
 *  produces a next row or refuses as DATA (nothing partial is returned — the verb writes all of it or none of
 *  it). The lock paths are the FINE per-op pins, de-duplicated in first-touch order; an op that REMOVES a keyed
 *  element contributes a release prefix instead, so the pins its element carried leave with it. */
export function applyActorOps(base: RpgActorEntry, ops: readonly RpgActorOp[], mintItemId: () => string): ApplyActorOpsResult {
  let entry = base;
  const lockPaths: string[] = [];
  const lockReleases: string[] = [];
  for (const op of ops) {
    const applied = isIdentityOp(op) ? nextIdentityEntry(entry, op) : nextEntry(entry, op, mintItemId);
    if (applied === null) {
      return { ok: false, reason: missingReason(op) };
    }
    entry = applied.entry;
    for (const path of lockPathsFor(entry.actorRef, op, applied.itemId)) {
      if (!lockPaths.includes(path)) {
        lockPaths.push(path);
      }
    }
    const release = lockReleaseFor(entry.actorRef, op);
    if (release !== undefined && !lockReleases.includes(release)) {
      lockReleases.push(release);
    }
  }
  return { ok: true, actor: entry, lockPaths, lockReleases };
}
