// domain/rpg/substrate/delta — the prev→current SNAPSHOT DIFF that gives the steering license its referent
// (parity-plus §2.7). PURE (zero I/O — the gather resolves both committed snapshots and hands them in, matching
// the reminder's purity contract). The reminder carries only ABSOLUTES and the state round is ephemeral (its
// tool/extraction calls never enter the transcript), so the model is told "let the change land in the fiction"
// with no input naming WHAT changed. This block closes that gap: a compact, deterministic diff rendered in the
// reminder immediately BEFORE the license (§2.7 placement). ALWAYS ON — no knob (§13 #10, owner-FINAL): the
// license already assumes this input, so shipping the license without it is the bug this closes.
//
// The diff compares two SNAPSHOTS, so it is agnostic to what produced the change — a tool round, a reliable
// extraction, AND a host HAND EDIT all land in the snapshot, so a GM tweak lands in the fiction next turn
// (§2.7 diff coverage — a feature, per the owner). Swipe-consistency is FREE: the gather re-resolves both ends
// on the newly-selected lineage (§2.7), so the delta is always prev→current for the currently-selected chain.
//
// EXTENSIBILITY (§2.7.1) — the diff is PER-PLANE REGISTERED, not a monolith: `PLANE_DIFF_RENDERERS` is an OPEN
// ordered registry, one `PlaneDiffRenderer` per plane. A new tracked plane (P1's relationship + cast-field
// renderers are the first new registrants — §2.8/§2.1) declares its renderer and the block picks it up; the
// gather read + placement are byte-stable (graft doorway #D1). Planes with no registered renderer are silently
// skipped (the open-registry posture — a plane the block doesn't care about contributes nothing).
//
// GRACEFUL DEGRADE (§2.7.4, D79 heal posture) — the diff cannot fail on well-formed state, but it MUST NOT
// crash a turn's assembly if a malformed plane value slips past the write backstop (a hand-edit or a future
// applier bug the §10 F1 gate should catch but the delta must survive if it doesn't). Each renderer runs inside
// a per-plane guard: a throwing renderer DEGRADES that plane's lines to nothing and the OTHER planes still
// render. The block never throws, never drops whole (the DEFENSIVE arm — never a parallel healing home).

import type { RpgCastField, RpgClockTime, RpgSnapshotState, TimeOfDay } from "@orb/contracts/rpg";
import { TIME_OF_DAY, TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import type { DeltaContext, PlaneDiffRenderer, RegisteredPlaneDiff } from "../contract/delta";

/** The diff heading (§2.7) — a VERSIONED constant like the license, so a copy revision is a legible bump. */
export const RPG_DELTA_HEADING = "CHANGES SINCE LAST BEAT";
/** The first-snapshot heading (§2.7 first-snapshot arm) — the born state is labelled as the scene OPENING, not
 *  as "everything just changed" (which would lie about causality on turn 1). */
export const RPG_SCENE_OPENS_HEADING = "SCENE OPENS";

/** Bind a typed `PlaneDiffRenderer<T>` into the type-erased `RegisteredPlaneDiff` the registry holds — the ONE
 *  place `select`→`render` are threaded, so the slice `T` stays private to the renderer. P1 REGISTERS its
 *  relationship + cast-field renderers by calling this in `PLANE_DIFF_RENDERERS` — no monolith edit, no cast. */
export function definePlaneDiff<T>(r: PlaneDiffRenderer<T>): RegisteredPlaneDiff {
  return { plane: r.plane, run: (prev, cur, ctx) => r.render(r.select(prev), r.select(cur), ctx) };
}

/** A signed numeric delta line: `HP 12→16 (+4)`. */
function numDelta(label: string, prev: number, cur: number): string {
  const sign = cur >= prev ? "+" : "";
  return `${label} ${prev}→${cur} (${sign}${cur - prev})`;
}

/** The `actorState` slice keyed by a stable actor string (the actor-ref key projection lives in contracts;
 *  the diff renderers key on the ref's shape directly — a `cast`/`character`/`user` ref stringifies the same
 *  way `actorRefKey` does, but the delta stays out of the contract import for a self-contained slice). */
type ActorState = RpgSnapshotState["actorState"];

/** The one stable string a volatile row's ref maps to (mirrors `actorRefKey` — a per-actor diff correlates
 *  prev↔cur rows by this). Kept local (a 3-line repeat over importing the contract fn buys the module its
 *  zero-contract-coupling; the shapes are DB-enforced XOR so the switch is total). */
function volatileKey(row: ActorState[number]): string {
  const ref = row.actorRef;
  if (ref.kind === "character") {
    return `character:${ref.characterId}`;
  }
  if (ref.kind === "user") {
    return `user:${ref.userId}`;
  }
  return `cast:${ref.castKey}`;
}

/** A per-actor renderer's shared body: correlate prev↔cur volatile rows by actor key, name each actor, and let
 *  `lines` emit that actor's plane deltas. An actor present in only one snapshot is correlated against an
 *  `undefined` counterpart so a join/leave surfaces through the per-plane lines (the ambient `present cast`
 *  join/leave is its OWN renderer; this correlates the volatile PLANES within a persisting actor). */
function perActor(
  cur: ActorState,
  prev: ActorState,
  ctx: DeltaContext,
  lines: (name: string, prevRow: ActorState[number] | undefined, curRow: ActorState[number]) => readonly string[],
): readonly string[] {
  const prevByKey = new Map(prev.map((r) => [volatileKey(r), r]));
  const out: string[] = [];
  for (const curRow of cur) {
    const name = actorLabel(curRow, ctx);
    out.push(...lines(name, prevByKey.get(volatileKey(curRow)), curRow));
  }
  return out;
}

/** A volatile row's display label. A roster actor (character/user) resolves to its display NAME through
 *  `ctx.rosterNames` (P0 fold-in #5 — "Kael HP 12→16", not "character HP 12→16"); a `cast` NPC's key IS its
 *  human-facing name. The roster join arrives as DATA (the gather resolved it), so the diff stays pure. Falls
 *  back to the generic label when the roster map has no name for the key (a gone member — never a crash). */
function actorLabel(row: ActorState[number], ctx: DeltaContext): string {
  const ref = row.actorRef;
  if (ref.kind === "cast") {
    return ref.castKey;
  }
  const named = ctx.rosterNames[volatileKey(row)];
  if (named !== undefined && named !== "") {
    return named;
  }
  return ref.kind === "character" ? "character" : "you";
}

/** HP — a per-actor signed numeric delta (`HP 12→16 (+4)`). A null↔value transition reads as a set-to. */
const hpRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "hp",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) =>
    perActor(cur, prev, ctx, (name, p, c) => {
      const pHp = p?.hp ?? null;
      if (c.hp === null) {
        return pHp !== null ? [`${name} HP → none`] : [];
      }
      if (pHp === null) {
        return [`${name} HP → ${c.hp.value}/${c.hp.max}`];
      }
      return pHp.value !== c.hp.value ? [`${name} ${numDelta("HP", pHp.value, c.hp.value)}`] : [];
    }),
};

/** Pools — per-actor per-pool signed numeric delta (`mana 5→2 (-3)`), matched by pool name. */
const poolsRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "pools",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) =>
    perActor(cur, prev, ctx, (name, p, c) => {
      const prevPools = new Map((p?.pools ?? []).map((x) => [x.name, x.value]));
      const out: string[] = [];
      for (const pool of c.pools) {
        const was = prevPools.get(pool.name);
        if (was === undefined) {
          out.push(`${name} ${pool.name} → ${pool.value}/${pool.max}`);
        } else if (was !== pool.value) {
          out.push(`${name} ${numDelta(pool.name, was, pool.value)}`);
        }
      }
      return out;
    }),
};

/** Conditions — the added/removed set per actor (`+Bleeding`, `-Poisoned`), matched by condition name. */
const conditionsRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "conditions",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) =>
    perActor(cur, prev, ctx, (name, p, c) => {
      const before = new Set((p?.conditions ?? []).map((x) => x.name));
      const after = new Set(c.conditions.map((x) => x.name));
      const added = c.conditions.filter((x) => !before.has(x.name)).map((x) => `+${x.name} (${name})`);
      const removed = [...before].filter((x) => !after.has(x)).map((x) => `-${x} (${name})`);
      return [...added, ...removed];
    }),
};

/** Inventory — added / removed / qty change per actor (`+Rope`, `-Torch`, `potions ×2→×1`), matched by name. */
const inventoryRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "inventory",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) =>
    perActor(cur, prev, ctx, (name, p, c) => {
      const prevQty = new Map((p?.inventory ?? []).map((x) => [x.name, x.quantity]));
      const out: string[] = [];
      for (const item of c.inventory) {
        const was = prevQty.get(item.name);
        if (was === undefined) {
          out.push(`+${item.name} (${name})`);
        } else if (was !== item.quantity) {
          out.push(`${name} ${item.name} ×${was}→×${item.quantity}`);
        }
        prevQty.delete(item.name);
      }
      for (const [gone] of prevQty) {
        out.push(`-${gone} (${name})`);
      }
      return out;
    }),
};

/** Wallet — per-actor per-currency signed numeric delta (`gold 40→55 (+15)`), matched by currency name. */
const walletRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "wallet",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) =>
    perActor(cur, prev, ctx, (name, p, c) => {
      const prevAmt = new Map((p?.wallet ?? []).map((x) => [x.name, x.amount]));
      const out: string[] = [];
      for (const w of c.wallet) {
        const was = prevAmt.get(w.name);
        if (was === undefined) {
          out.push(`${name} ${w.name} → ${w.amount}`);
        } else if (was !== w.amount) {
          out.push(`${name} ${numDelta(w.name, was, w.amount)}`);
        }
      }
      return out;
    }),
};

/** The nearest time-of-day LABEL for a clock hour (the ONE inverse of `TIME_OF_DAY_HOURS`, mirrored from the
 *  reminder's `timeOfDayLabel` — the delta reports a `time → night` transition by the same label vocabulary the
 *  absolute state line uses, so prev/cur read consistently). */
function timeOfDayLabel(clock: RpgClockTime): TimeOfDay {
  let best: TimeOfDay = TIME_OF_DAY[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const label of TIME_OF_DAY) {
    const dist = Math.abs(TIME_OF_DAY_HOURS[label] - clock.hour);
    if (dist < bestDist) {
      bestDist = dist;
      best = label;
    }
  }
  return best;
}

/** Ambient — scene transitions + the GAME-CALENDAR-AGNOSTIC date/time-of-last-turn diff (owner ruling
 *  2026-07-27, fold-in #6). The diff reports the NEW value on any change (a transition — the prose reacts to the
 *  destination). Three orthogonal time arms, each firing only when changed, ALL able to fire together (a long
 *  rest advances day, date-string, AND time-of-day):
 *    • `date` — the free-text GAME-DEFINED calendar string, diffed as an OPAQUE string. Fantasy calendars live
 *      here ("3rd of Frostmoon" → "4th of Frostmoon" is a diff line). NEVER parsed, NEVER assigned real-world
 *      calendar semantics — the renderer treats it as a raw label.
 *    • `clock.day` — the integer day COUNTER ("day 3 → day 4").
 *    • time-of-day label — the intra-day arm (a `time → night` transition off the derived label, not the raw
 *      hour — a within-band minute tick is not a beat).
 *  Plus location + weather transitions. Never assumes a real-world calendar anywhere. */
type AmbientSlice = Pick<RpgSnapshotState, "location" | "weather" | "clock" | "calendarDate">;

/** The three orthogonal TIME arms (fold-in #6) — the day counter, the time-of-day label, and (handled by the
 *  caller) the opaque date string. All fire independently; a long rest fires several together. Hoisted so the
 *  renderer body stays under the cognitive-complexity gate. */
function timeLines(prev: AmbientSlice, cur: AmbientSlice): readonly string[] {
  const out: string[] = [];
  // The day COUNTER — an intra-game integer ("day 3 → day 4"), independent of the free-text date string.
  if (cur.clock !== null && cur.clock.day !== (prev.clock?.day ?? null)) {
    out.push(`day ${prev.clock?.day ?? "?"} → day ${cur.clock.day}`);
  }
  // The time-of-day label — the intra-day arm (derived from the hour, not the raw hour).
  if (cur.clock !== null) {
    const nextLabel = timeOfDayLabel(cur.clock);
    if (prev.clock === null || timeOfDayLabel(prev.clock) !== nextLabel) {
      out.push(`time → ${nextLabel}`);
    }
  }
  return out;
}

const ambientRenderer: PlaneDiffRenderer<AmbientSlice> = {
  plane: "ambient",
  select: (s) => ({ location: s.location, weather: s.weather, clock: s.clock, calendarDate: s.calendarDate }),
  render: (prev, cur) => {
    const out: string[] = [];
    if (cur.location !== prev.location && cur.location !== "") {
      out.push(`location → ${cur.location}`);
    }
    // The free-text game calendar — an OPAQUE string diff (no parsing, no real-world semantics ever).
    if (cur.calendarDate !== prev.calendarDate && cur.calendarDate !== null) {
      out.push(`date → ${cur.calendarDate}`);
    }
    out.push(...timeLines(prev, cur));
    if ((cur.weather?.type ?? null) !== (prev.weather?.type ?? null) && cur.weather !== null) {
      out.push(`weather → ${cur.weather.type}`);
    }
    return out;
  },
};

/** Present cast — joined / left the scene (`+Zandik enters`, `-Mari leaves`), matched by the stable cast key.
 *  (A cast member's per-field diff — mood/customFields/relationship — is P1's cast-field + relationship
 *  renderers, registered separately; this renderer reports only scene ENTRY/EXIT.) */
const presentCastRenderer: PlaneDiffRenderer<RpgSnapshotState["presentCharacters"]> = {
  plane: "presentCast",
  select: (s) => s.presentCharacters,
  render: (prev, cur) => {
    const before = new Map(prev.map((c) => [c.key, c.name]));
    const after = new Set(cur.map((c) => c.key));
    const entered = cur.filter((c) => !before.has(c.key)).map((c) => `+${c.name} enters`);
    const left = [...before].filter(([k]) => !after.has(k)).map(([, name]) => `-${name} leaves`);
    return [...entered, ...left];
  },
};

/** Quests — status flips (`quest "X" completed`) + objective progress (`X: 1/3 → 2/3`), matched by quest id. */
const questsRenderer: PlaneDiffRenderer<RpgSnapshotState["quests"]> = {
  plane: "quests",
  select: (s) => s.quests,
  render: (prev, cur) => {
    const before = new Map(prev.map((q) => [q.id, q]));
    const out: string[] = [];
    for (const q of cur) {
      const was = before.get(q.id);
      if (was === undefined) {
        out.push(`quest "${q.name}" started`);
        continue;
      }
      if (was.status !== q.status) {
        out.push(`quest "${q.name}" ${q.status}`);
      }
      const prevDone = was.objectives.filter((o) => o.completed).length;
      const curDone = q.objectives.filter((o) => o.completed).length;
      if (curDone !== prevDone && q.objectives.length > 0) {
        out.push(`${q.name}: ${prevDone}/${was.objectives.length} → ${curDone}/${q.objectives.length}`);
      }
    }
    return out;
  },
};

/** The `items` SET-delta for one widget (fold-in #4 — P0 verifier gap: the P0 renderer diffed only the numeric
 *  `.value` arm). Added / removed items produce lines (`widget +Sword`, `widget -Shield`), matched by string;
 *  a REORDER-ONLY change produces NOTHING (set membership is unchanged — order is not a beat). A first-seen list
 *  reads every item as added. */
function widgetItemLines(label: string, prevItems: readonly string[] | undefined, curItems: readonly string[]): readonly string[] {
  const before = new Set(prevItems ?? []);
  const after = new Set(curItems);
  const added = curItems.filter((x) => !before.has(x)).map((x) => `${label} +${x}`);
  const removed = [...before].filter((x) => !after.has(x)).map((x) => `${label} -${x}`);
  return [...added, ...removed];
}

/** Widgets — per-widget numeric delta (`hunger 5→2 (-3)`) AND the `items` SET-delta (fold-in #4), keyed by widget
 *  label in `widgetValues`. §2.7 table: "widgets | numeric/set delta like pools". Both arms fire independently
 *  (a widget can carry a value AND an item list). */
const widgetsRenderer: PlaneDiffRenderer<RpgSnapshotState["widgetValues"]> = {
  plane: "widgets",
  select: (s) => s.widgetValues,
  render: (prev, cur) => {
    const out: string[] = [];
    for (const [label, val] of Object.entries(cur)) {
      const was = prev[label];
      if (val.value !== undefined && was?.value !== val.value) {
        out.push(was?.value === undefined ? `${label} → ${val.value}` : numDelta(label, was.value, val.value));
      }
      if (val.items !== undefined) {
        out.push(...widgetItemLines(label, was?.items, val.items));
      }
    }
    return out;
  },
};

/** The display form of a relationship — the bare kind, or a `custom` label (glossed with the M1 hint when the
 *  host configured one for that label: `vassal (sworn to serve but resentful)`). A custom kind with no label
 *  falls back to "custom"; a non-custom kind ignores the label (the built-ins carry their meaning). */
function relationshipDisplay(rel: RpgSnapshotState["presentCharacters"][number]["relationship"], ctx: DeltaContext): string {
  if (rel.kind !== "custom") {
    return rel.kind;
  }
  const label = rel.label !== "" ? rel.label : "custom";
  const hint = ctx.relationshipHints[label];
  return hint !== undefined && hint !== "" ? `${label} (${hint})` : label;
}

/** Relationship (feature 1, §2.1) — a per-cast stance TRANSITION (`Mari: friend → wary`), matched by cast key.
 *  This line IS the steering loop's closed signal (the delta block's referent for "let the change land"). A
 *  first-seen cast member with a non-default stance reads as a set-to; a NEUTRAL default is silent (no beat). */
const relationshipRenderer: PlaneDiffRenderer<RpgSnapshotState["presentCharacters"]> = {
  plane: "relationship",
  select: (s) => s.presentCharacters,
  render: (prev, cur, ctx) => {
    const before = new Map(prev.map((c) => [c.key, c]));
    const out: string[] = [];
    for (const c of cur) {
      const was = before.get(c.key);
      const nextDisp = relationshipDisplay(c.relationship, ctx);
      if (was === undefined) {
        if (c.relationship.kind !== "neutral" || c.relationship.label !== "") {
          out.push(`${c.name}: ${nextDisp}`); // a cast member arriving with a stance already set
        }
        continue;
      }
      const prevDisp = relationshipDisplay(was.relationship, ctx);
      if (prevDisp !== nextDisp) {
        out.push(`${c.name}: ${prevDisp} → ${nextDisp}`);
      }
    }
    return out;
  },
};

/** One cast member's tracked-field diff lines (§2.8), joined against the host-defined field SCHEMAS. A `meter`
 *  field diffs numerically (`Mari suspicion 3→7 (+4)` — the stored string parses to a number); a `text` field
 *  diffs as a transition (`Mari trust: guarded → open`). Only DEFINED fields diff (an orphan value from a deleted
 *  field-schema is skipped — the read projects only defined fields). A first-seen value reads as a set-to. */
/** One tracked cast-field's diff line (§2.8) — a `meter` numerically (`Mari suspicion 3→7 (+4)`), a `text` field
 *  as a transition (`Mari trust: guarded → open`). Returns null when there is no line (a non-numeric meter value,
 *  or no meaningful change). `was`/`cur` are the STORED string values (a meter parses to a number). */
function castFieldLine(name: string, field: RpgCastField, was: string | undefined, cur: string): string | null {
  if (field.kind === "meter") {
    const curN = Number.parseInt(cur, 10);
    if (Number.isNaN(curN)) {
      return null; // a non-numeric meter value — never a NaN line
    }
    const wasN = was === undefined ? undefined : Number.parseInt(was, 10);
    return wasN === undefined || Number.isNaN(wasN) ? `${name} ${field.label} → ${curN}` : `${name} ${numDelta(field.label, wasN, curN)}`;
  }
  return was === undefined ? `${name} ${field.label}: ${cur}` : `${name} ${field.label}: ${was} → ${cur}`;
}

function castFieldLines(
  name: string,
  prevFields: Readonly<Record<string, string>> | undefined,
  curFields: Readonly<Record<string, string>>,
  ctx: DeltaContext,
): readonly string[] {
  const out: string[] = [];
  for (const field of ctx.castFields) {
    const cur = curFields[field.key];
    const was = prevFields?.[field.key];
    if (cur === undefined || was === cur) {
      continue;
    }
    const line = castFieldLine(name, field, was, cur);
    if (line !== null) {
      out.push(line);
    }
  }
  return out;
}

/** Cast-fields (feature C, §2.8) — per-cast tracked-field deltas over the host-defined schemas, matched by cast
 *  key. Registered WITH the relationship renderer (both are cast-plane diffs). Silent when no fields are defined
 *  (`ctx.castFields` empty — the feature-off arm). */
const castFieldRenderer: PlaneDiffRenderer<RpgSnapshotState["presentCharacters"]> = {
  plane: "castFields",
  select: (s) => s.presentCharacters,
  render: (prev, cur, ctx) => {
    if (ctx.castFields.length === 0) {
      return [];
    }
    const before = new Map(prev.map((c) => [c.key, c]));
    const out: string[] = [];
    for (const c of cur) {
      out.push(...castFieldLines(c.name, before.get(c.key)?.customFields, c.customFields, ctx));
    }
    return out;
  },
};

/** The OPEN, ordered per-plane diff registry (§2.7.1). The delta block = the ordered concat of each renderer's
 *  lines over the two snapshots. P1 REGISTERS its relationship + cast-field renderers HERE (they are cast-plane
 *  diffs — the relationship renderer emits `Mari: friend → wary`, which is BOTH this block's steering line AND
 *  feature 1's closed-loop signal). Order mirrors the §2.7 table: numeric planes, sets, ambient, cast, quests,
 *  widgets. `journal beats` + `level` are EXCLUDED by construction (no renderer — §2.7: a beat is an append not
 *  a mutation; level is hand-only identity the prose doesn't react to). */
export const PLANE_DIFF_RENDERERS: readonly RegisteredPlaneDiff[] = [
  definePlaneDiff(hpRenderer),
  definePlaneDiff(poolsRenderer),
  definePlaneDiff(conditionsRenderer),
  definePlaneDiff(inventoryRenderer),
  definePlaneDiff(walletRenderer),
  definePlaneDiff(ambientRenderer),
  definePlaneDiff(presentCastRenderer),
  definePlaneDiff(relationshipRenderer),
  definePlaneDiff(castFieldRenderer),
  definePlaneDiff(questsRenderer),
  definePlaneDiff(widgetsRenderer),
];

/** Run one registered renderer inside the §2.7.4 defensive guard: a renderer that throws on a malformed plane
 *  value degrades to NO lines (the other planes still render); the block never throws. Returns the plane's
 *  lines (empty on no-change OR a degraded plane). */
function renderPlane(r: RegisteredPlaneDiff, prev: RpgSnapshotState, cur: RpgSnapshotState, ctx: DeltaContext): readonly string[] {
  try {
    return r.run(prev, cur, ctx);
  } catch {
    // §2.7.4 D79-heal DEFENSIVE arm: a malformed prev/cur shape degrades THIS plane's line, never the block.
    return [];
  }
}

/** The delta block over two committed snapshots (§2.7). Returns the assembled block, or `null` to OMIT it
 *  entirely (the no-change / empty-open arm — §2.7 byte-stable omission; a "no changes" line is a
 *  manufacture-a-change footgun the omission avoids). `prev === null` = the first snapshot on this lineage: the
 *  block renders the born state as `SCENE OPENS:` (not a delta — turn 1 has no prior beat), omitted when the
 *  born state is empty. */
export function buildDeltaBlock(prev: RpgSnapshotState | null, cur: RpgSnapshotState, ctx: DeltaContext): string | null {
  if (prev === null) {
    return buildFirstSnapshotBlock(cur);
  }
  const lines: string[] = [];
  for (const r of PLANE_DIFF_RENDERERS) {
    lines.push(...renderPlane(r, prev, cur, ctx));
  }
  if (lines.length === 0) {
    return null; // no-change — OMIT the block (byte-stable quiet-turn signal)
  }
  return `${RPG_DELTA_HEADING}: ${lines.join(" · ")}`;
}

/** The first-snapshot arm (§2.7): the born state as a one-line SCENE OPENS summary (setting + who's present),
 *  NOT a delta over an empty prior (which would read as "everything just changed"). Omitted (null) when the
 *  born state carries nothing worth opening on. */
function buildFirstSnapshotBlock(cur: RpgSnapshotState): string | null {
  const parts: string[] = [];
  if (cur.location !== "") {
    parts.push(cur.location);
  }
  if (cur.presentCharacters.length > 0) {
    parts.push(`with ${cur.presentCharacters.map((c) => c.name).join(", ")}`);
  }
  const active = cur.quests.filter((q) => q.status === "active");
  if (active.length > 0) {
    parts.push(`quest: ${active.map((q) => q.name).join(", ")}`);
  }
  if (parts.length === 0) {
    return null; // an empty born state has no scene to open on (§2.7 first-snapshot omit)
  }
  return `${RPG_SCENE_OPENS_HEADING}: ${parts.join(" · ")}`;
}
