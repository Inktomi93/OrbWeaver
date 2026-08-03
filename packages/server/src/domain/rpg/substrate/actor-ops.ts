// domain/rpg/substrate/actor-ops — the PURE op applier for the per-actor volatile plane (the actor-state
// review §5 R1). Zero I/O: it takes ONE actor's CURRENT row (read by the caller from the TRUE resolved head)
// plus the hand's ops, and returns the next row + the FINE lock paths those ops earn. The verb
// (`verbs/patch-actor.ts`) does the head resolve, the write, and the authority; this module owns the
// arithmetic, so the whole op vocabulary is unit-testable without a db.
//
// WHY OPS AND NOT AN IMAGE. The hand door used to ask the client for the plane's whole array image. The client
// can only SEE the plane in projections (the roster half + `castVolatile`; the offstage rows appear in
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
 *  `cast` ref only) a born IDENTITY whose display name falls back to the slug until something authors a real
 *  one. A cast actor IS an identity-bearing person by construction: born without one, the very first
 *  `presentUpsert`/`setIdentityText` would have nothing to write onto. A roster actor is born WITHOUT an
 *  identity and stays that way — her name is the chat roster's, her standing prose the sheet's — which is what
 *  makes the identity ops' refusal arm meaningful rather than a shape accident.
 *
 *  The ONE home for "a fresh actor's zero state": the tool appliers mint through here too, so a hand-minted and
 *  a model-minted row can never be born different shapes. */
export function emptyActorEntry(actorRef: RpgActorRef): RpgActorEntry {
  const volatile: RpgActorVolatile = { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" };
  if (actorRef.kind !== "cast") {
    return { actorRef, volatile };
  }
  return { actorRef, identity: { name: actorRef.castKey, emoji: "", mood: "", relationship: { kind: "neutral", label: "" } }, volatile };
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
 *  per-element pin + Release for them. The two ARRAY planes (`conditions`, `inventory`) stay PLANE-level even
 *  though the merge engine keys their elements: the panel's Release affordance for them is the section pin
 *  (`the conditions` / `the pack`), so a per-element lock would be a pin the host can SEE stopping the story
 *  and CANNOT release — a trap. Per-element pins here follow the per-element Release UI, not the reverse. */
function lockSub(op: RpgActorOp): string {
  if (op.op === "setTracker") {
    return `.${op.key}`;
  }
  if (op.op === "setWalletAmount") {
    return `.${op.name}`;
  }
  return "";
}

/** The lock path one op stamps — `actorState.<actorKey>.volatile.<field>[.<element>]` for a volatile write,
 *  `actorState.<actorKey>.identity.<field>` for an identity one (the ONE grammar, shared with the panel's pin
 *  reader through the two exported lock bases). The `volatile`/`identity` segment is not decoration: the merge
 *  walks the stored JSON, so a path that skipped it would pin nothing. */
function lockPathFor(ref: RpgActorRef, op: RpgActorOp): string {
  if (op.op === "setRelationship") {
    return `${rpgActorIdentityLockBase(ref)}.relationship`;
  }
  if (op.op === "setIdentityText") {
    return `${rpgActorIdentityLockBase(ref)}.${op.field}`;
  }
  return `${rpgActorVolatileLockBase(ref)}.${OP_FIELD[op.op]}${lockSub(op)}`;
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
 *  `update_inventory` add arm does: a hand caller never names an item's identity. `patchItem`/`removeItem`
 *  REFUSE an id the actor does not carry. */
function applyItemOp(actor: RpgActorVolatile, op: Op<"addItem"> | Op<"patchItem"> | Op<"removeItem">, mintItemId: () => string): RpgActorVolatile | null {
  if (op.op === "addItem") {
    const item: RpgInventoryItem = {
      id: mintItemId(),
      name: op.item.name,
      description: op.item.description ?? "",
      quantity: op.item.quantity ?? 1,
      location: op.item.location ?? "",
      type: op.item.type ?? "",
      ...(op.item.icon === undefined ? {} : { icon: op.item.icon }),
    };
    return { ...actor, inventory: [...actor.inventory, item] };
  }
  if (!actor.inventory.some((it) => it.id === op.id)) {
    return null;
  }
  if (op.op === "removeItem") {
    return { ...actor, inventory: actor.inventory.filter((it) => it.id !== op.id) };
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
  return { ...actor, inventory: actor.inventory.map((it) => (it.id === op.id ? patched(it) : it)) };
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
function applyVolatileOp(actor: RpgActorVolatile, op: Extract<RpgActorOp, { op: VolatileOpName }>, mintItemId: () => string): RpgActorVolatile | null {
  const kind: VolatileOpName = op.op;
  switch (kind) {
    case "setStatus":
      return { ...actor, status: (op as Op<"setStatus">).status };
    case "setTracker": {
      const set = op as Op<"setTracker">;
      return { ...actor, trackerValues: writeTracker(actor.trackerValues, set.key, set.value) };
    }
    case "addCondition":
    case "removeCondition":
      return applyConditionOp(actor, op as Op<"addCondition"> | Op<"removeCondition">);
    case "addItem":
    case "patchItem":
    case "removeItem":
      return applyItemOp(actor, op as Op<"addItem"> | Op<"patchItem"> | Op<"removeItem">, mintItemId);
    case "setWalletAmount":
      return applyWalletOp(actor, op as Op<"setWalletAmount">);
    default:
      return assertNever(kind);
  }
}

/** Apply ONE IDENTITY op (R2). `null` = refused, and the reachable refusal is the honest one: a ROSTER actor
 *  carries no identity half at all (her name is the chat roster's, her standing prose the sheet's), so writing
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
    return "this actor carries no identity of its own — a roster member's name and standing prose live on the chat roster and its sheet";
  }
  return `op ${op.op} could not be applied`;
}

/** The volatile arm lifted back onto the ROW (which half an op writes is a detail of the op, never of the
 *  caller — {@link applyActorOps} sees one shape). */
function nextEntry(entry: RpgActorEntry, op: Extract<RpgActorOp, { op: VolatileOpName }>, mintItemId: () => string): RpgActorEntry | null {
  const volatile = applyVolatileOp(entry.volatile, op, mintItemId);
  return volatile === null ? null : { ...entry, volatile };
}

/** Apply the hand's ops IN ORDER to one actor's ROW (identity half + volatile half). Total: every op either
 *  produces a next row or refuses as DATA (nothing partial is returned — the verb writes all of it or none of
 *  it). The lock paths are the FINE per-op pins, de-duplicated in first-touch order. */
export function applyActorOps(base: RpgActorEntry, ops: readonly RpgActorOp[], mintItemId: () => string): ApplyActorOpsResult {
  let entry = base;
  const lockPaths: string[] = [];
  for (const op of ops) {
    const next = isIdentityOp(op) ? applyIdentityOp(entry, op) : nextEntry(entry, op, mintItemId);
    if (next === null) {
      return { ok: false, reason: missingReason(op) };
    }
    entry = next;
    const path = lockPathFor(entry.actorRef, op);
    if (!lockPaths.includes(path)) {
      lockPaths.push(path);
    }
  }
  return { ok: true, actor: entry, lockPaths };
}
