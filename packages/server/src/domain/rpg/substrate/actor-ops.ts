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

import type { RpgActorOp, RpgActorOpField, RpgActorVolatile, RpgInventoryItem, RpgTrackerValue } from "@orb/contracts/rpg";
import { RPG_TRACKER_VALUE_EMPTY, rpgActorLockBase } from "@orb/contracts/rpg";
import type { ApplyActorOpsResult } from "../contract/results";

/** The empty volatile row a FIRST hand write on an actor with no state row seeds. The ONE home for "a fresh
 *  actor's zero state" — the tool appliers mint through here too, so a hand-minted and a model-minted row can
 *  never be born different shapes. */
export function emptyActorVolatile(actorRef: RpgActorVolatile["actorRef"]): RpgActorVolatile {
  return { actorRef, hp: null, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" };
}

/** Which volatile FIELD each op writes — the lock-path segment and the `RPG_ACTOR_OP_FIELDS` vocabulary in one
 *  mapped-type Record: a new op arm fails `tsc` here (§5.5 string-union dispatch), and a renamed volatile field
 *  fails at the tuple the values are pinned to. */
const OP_FIELD: Readonly<Record<RpgActorOp["op"], RpgActorOpField>> = {
  setStatus: "status",
  setHp: "hp",
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

/** The lock path one op stamps: `actorState.<actorKey>.<field>[.<element>]` (the ONE grammar, shared with the
 *  panel's pin reader through `rpgActorLockBase`). */
function lockPathFor(actor: RpgActorVolatile, op: RpgActorOp): string {
  return `${rpgActorLockBase(actor.actorRef)}.${OP_FIELD[op.op]}${lockSub(op)}`;
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

/** Apply ONE op to a row. `null` = refused (the caller composes the reason from the op).
 *
 *  Dispatches on the CLEAN `RpgActorOp["op"]` string union via the local binding — NOT on `op.op` directly:
 *  biome's `noUnnecessaryConditions` cannot narrow a `z.infer` zod discriminated union (proven in-tree — see
 *  `domain/automation/engine/arm-executors.ts`, which switches the same way for the same reason), so
 *  `switch (op.op)` reads every case as unreachable. Switching on the bare string union keeps `default: never`
 *  as the exhaustiveness pin (a new op arm fails `tsc`) with NO suppression; the per-arm `as Op<…>` cast is the
 *  price of narrowing off the string rather than the object, sound by construction. */
function applyOne(actor: RpgActorVolatile, op: RpgActorOp, mintItemId: () => string): RpgActorVolatile | null {
  const kind: RpgActorOp["op"] = op.op;
  switch (kind) {
    case "setStatus":
      return { ...actor, status: (op as Op<"setStatus">).status };
    case "setHp":
      return { ...actor, hp: (op as Op<"setHp">).hp };
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

function assertNever(value: never): never {
  throw new Error(`unhandled actor op: ${JSON.stringify(value)}`);
}

/** The op-name → refusal wording for the two "you named something that isn't there" arms. A refusal a human
 *  reads must say WHICH datum, or the panel just moves the guess. */
function missingReason(op: RpgActorOp): string {
  if (op.op === "removeCondition") {
    return `no condition named "${op.name}" on this actor`;
  }
  if (op.op === "patchItem" || op.op === "removeItem") {
    return `no inventory item "${op.id}" on this actor`;
  }
  return `op ${op.op} could not be applied`;
}

/** Apply the hand's ops IN ORDER to one actor's row. Total: every op either produces a next row or refuses as
 *  DATA (nothing partial is returned — the verb writes all of it or none of it). The lock paths are the FINE
 *  per-op pins, de-duplicated in first-touch order. */
export function applyActorOps(base: RpgActorVolatile, ops: readonly RpgActorOp[], mintItemId: () => string): ApplyActorOpsResult {
  let actor = base;
  const lockPaths: string[] = [];
  for (const op of ops) {
    const next = applyOne(actor, op, mintItemId);
    if (next === null) {
      return { ok: false, reason: missingReason(op) };
    }
    actor = next;
    const path = lockPathFor(actor, op);
    if (!lockPaths.includes(path)) {
      lockPaths.push(path);
    }
  }
  return { ok: true, actor, lockPaths };
}
