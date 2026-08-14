// domain/rpg/substrate/delta — the prev→current SNAPSHOT DIFF that gives the steering license its referent
// (parity-plus §2.7). PURE (zero I/O — the gather resolves both committed snapshots and hands them in, matching
// the reminder's purity contract). The reminder carries only ABSOLUTES and the state round is ephemeral (its
// tool/extraction calls never enter the transcript), so the model is told "let the change land in the fiction"
// with no input naming WHAT changed. This block closes that gap: a compact, deterministic diff rendered in the
// reminder immediately BEFORE the license (§2.7 placement). ALWAYS ON — no knob (§13 #10, owner-FINAL): the
// license already assumes this input, so shipping the license without it is the bug this closes.
//
// The diff compares two SNAPSHOTS, so it is agnostic to what produced the change — a tool round, a folded
// turn's own calls, AND a host HAND EDIT all land in the snapshot, so a GM tweak lands in the fiction next turn
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

import { PROSE_SLOTS, resolveProse } from "@orb/contracts/prose";
import type { RpgSnapshotState, RpgTrackerDef, RpgTrackerValue } from "@orb/contracts/rpg";
import { clockTimeOfDay, rpgWeatherText, trackerCeiling, trackerNumber } from "@orb/contracts/rpg";
import type { DeltaContext, PlaneDiffRenderer, RegisteredPlaneDiff } from "../contract/delta.ts";

/** The diff heading (§2.7) — a VERSIONED PROSE-1 slot (`rpg.delta.changesHeading`, `macros:"none"`) so a copy
 *  revision is a legible `version` bump. This exported const is the DERIVED default (the byte-reference tests
 *  read); `buildDeltaBlock` resolves the slot against `ctx.prose` so a host override lands. */
export const RPG_DELTA_HEADING = PROSE_SLOTS["rpg.delta.changesHeading"].text;
/** The first-snapshot heading (§2.7 first-snapshot arm) — the born state is labelled as the scene OPENING, not
 *  as "everything just changed" (which would lie about causality on turn 1). A `rpg.delta.sceneOpensHeading`
 *  slot; the const is the derived default. */
export const RPG_SCENE_OPENS_HEADING = PROSE_SLOTS["rpg.delta.sceneOpensHeading"].text;

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

/** An actor row's display label. A roster actor (character/user) resolves to its display NAME through
 *  `ctx.rosterNames` (P0 fold-in #5 — "Kael Vitality 12→16", not "character Vitality 12→16"); a `cast` NPC
 *  carries her own (`identity.name`, R2 — the slug key is deliberately NOT a display name). The roster join
 *  arrives as DATA (the gather resolved it), so the diff stays pure. Falls back to the generic label when the
 *  roster map has no name for the key (a gone member — never a crash). */
function actorLabel(row: ActorState[number], ctx: DeltaContext): string {
  const ref = row.actorRef;
  if (ref.kind === "cast") {
    return row.identity?.name ?? ref.castKey;
  }
  const named = ctx.rosterNames[volatileKey(row)];
  if (named !== undefined && named !== "") {
    return named;
  }
  return ref.kind === "character" ? "character" : "you";
}

// There is NO `hp` renderer (R3): health is an ordinary `meter` tracker, so its delta line is emitted by
// {@link actorTrackersRenderer} through the ONE `trackerLine` grammar — which also means it finally carries
// the def's steering HINT, which the bespoke arm never did.

/** Append the def's steering HINT to a delta line (R5b): `Kael Mana 5→2 (-3) — fuels spellcasting`. The
 *  delta block is the license's referent ("let the change land in the fiction"), so a line that says WHAT
 *  moved without saying what it MEANS is the exact R4b class — a bare tracked number that reads as noise.
 *  An em-dash tail (not the reminder's parenthetical) because the reading itself already carries parens. */
function withHint(line: string, def: RpgTrackerDef): string {
  return def.hint === "" ? line : `${line} — ${def.hint}`;
}

/** ONE tracker's diff line, SHAPE-aware. A `meter` diffs numerically (`Mana 5→2 (-3)`); `text`/`list` diff as
 *  a transition (`trust: guarded → open`). Returns null when nothing legible changed (an unset→unset tracker,
 *  a non-numeric meter). The ONE tracker diff — it replaced the pool renderer, the cast-field renderer AND
 *  the widget renderer, which had three different ideas of what "changed" meant. */
function trackerLine(prefix: string, def: RpgTrackerDef, was: RpgTrackerValue | undefined, cur: RpgTrackerValue | undefined): string | null {
  const head = prefix === "" ? "" : `${prefix} `;
  if (def.shape === "meter") {
    const curN = trackerNumber(cur);
    if (curN === null) {
      return null;
    }
    const wasN = trackerNumber(was);
    if (wasN === null) {
      // The EFFECTIVE ceiling (this carrier's override, else the def default) — the ONE resolver.
      const ceiling = trackerCeiling(def, cur);
      return withHint(`${head}${def.label} → ${curN}${ceiling === null ? "" : `/${ceiling}`}`, def);
    }
    return wasN === curN ? null : withHint(`${head}${numDelta(def.label, wasN, curN)}`, def);
  }
  const curText = trackerText(def, cur);
  const wasText = trackerText(def, was);
  if (curText === null || curText === wasText) {
    return null;
  }
  return withHint(wasText === null ? `${head}${def.label}: ${curText}` : `${head}${def.label}: ${wasText} → ${curText}`, def);
}

/** A text/list tracker's comparable rendering (the list joined, so a membership change is one transition
 *  line rather than the widget renderer's separate +/− pair — one grammar for every shape). */
function trackerText(def: RpgTrackerDef, value: RpgTrackerValue | undefined): string | null {
  if (def.shape === "list") {
    const items = value?.items ?? null;
    return items === null || items.length === 0 ? null : items.join(", ");
  }
  const raw = value?.value ?? null;
  return raw === null ? null : String(raw);
}

/** The ACTOR-subject tracker deltas — every carried tracker on every actor, diffed by `key` (never by label:
 *  a rename is not a beat). Silent when the game defines no trackers. */
const actorTrackersRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "trackers",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) => {
    if (ctx.trackerDefs.length === 0) {
      return [];
    }
    const actorDefs = ctx.trackerDefs.filter((d) => d.subject === "actor");
    return perActor(cur, prev, ctx, (name, p, c) => {
      const out: string[] = [];
      for (const def of actorDefs) {
        const line = trackerLine(name, def, p?.volatile.trackerValues[def.key], c.volatile.trackerValues[def.key]);
        if (line !== null) {
          out.push(line);
        }
      }
      return out;
    });
  },
};

/** The GAME-subject tracker deltas (the retired widget renderer) — the same ONE tracker diff, unprefixed
 *  (a game tracker belongs to nobody in particular). */
const gameTrackersRenderer: PlaneDiffRenderer<RpgSnapshotState["trackerValues"]> = {
  plane: "gameTrackers",
  select: (s) => s.trackerValues,
  render: (prev, cur, ctx) => {
    const out: string[] = [];
    for (const def of ctx.trackerDefs) {
      if (def.subject !== "game") {
        continue;
      }
      const line = trackerLine("", def, prev[def.key], cur[def.key]);
      if (line !== null) {
        out.push(line);
      }
    }
    return out;
  },
};

/** Conditions — the added/removed set per actor (`+Bleeding`, `-Poisoned`), matched by condition name. */
const conditionsRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "conditions",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) =>
    perActor(cur, prev, ctx, (name, p, c) => {
      const before = new Set((p?.volatile.conditions ?? []).map((x) => x.name));
      const after = new Set(c.volatile.conditions.map((x) => x.name));
      const added = c.volatile.conditions.filter((x) => !before.has(x.name)).map((x) => `+${x.name} (${name})`);
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
      const prevQty = new Map((p?.volatile.inventory ?? []).map((x) => [x.name, x.quantity]));
      const out: string[] = [];
      for (const item of c.volatile.inventory) {
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
      const prevAmt = new Map((p?.volatile.wallet ?? []).map((x) => [x.name, x.amount]));
      const out: string[] = [];
      for (const w of c.volatile.wallet) {
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

/** Ambient — scene transitions + the GAME-CALENDAR-AGNOSTIC date/time-of-last-turn diff (fold-in #6). The
 *  diff reports the NEW value on any change (a transition — the prose reacts to the
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
  // The time-of-day label — the intra-day arm (the hour's RANGE, not the raw hour: a within-band tick is
  // not a beat, and the boundaries are the contract's one home so prev/cur can never be named by two rules).
  // A clock with a day but NO time reads `null` and emits nothing: "the story stopped stating an hour" is
  // not a transition to narrate, and `time → ?` would be a beat the story never had.
  const nextLabel = clockTimeOfDay(cur.clock);
  if (nextLabel !== null && clockTimeOfDay(prev.clock) !== nextLabel) {
    out.push(`time → ${nextLabel}`);
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
    // Diffed on the DISPLAYED text (`label` when the model wrote one, else the type): a re-labelled sky
    // ("a thin drizzle" → "torrential rain") is a real weather beat even when both bin to `rain`.
    const curWeather = cur.weather === null ? null : rpgWeatherText(cur.weather);
    if (curWeather !== (prev.weather === null ? null : rpgWeatherText(prev.weather)) && curWeather !== null) {
      out.push(`weather → ${curWeather}`);
    }
    return out;
  },
};

/** The PRESENCE slice a scene entry/exit diff needs (R2): who is on stage, plus the actor plane the display
 *  names come off (a presence entry is a bare `actorRefKey` — the name lives on its actor row). */
interface PresenceSlice {
  readonly present: readonly string[];
  readonly actors: ActorState;
}

/** THE presence-key → display NAME resolution, and the only one. A presence entry is a bare `actorRefKey`
 *  (R2), so every surface that prints "who is on stage" has to join it back to its actor row — and the join
 *  MUST go through {@link actorLabel}, because a ROSTER actor carries no identity by design: her name lives in
 *  `ctx.rosterNames`, not on the row. Spelling the join a second time is how a branded `character:chr_…` id
 *  reached the model prompt in the SCENE OPENS block (the projection-clean law's exact failure: "an id is
 *  never model-facing"). One helper, both readers. */
function presenceName(key: string, actors: ActorState, ctx: DeltaContext): string {
  const row = actors.find((a) => volatileKey(a) === key);
  return row === undefined ? key : actorLabel(row, ctx);
}

/** Present cast — joined / left the scene (`+Zandik enters`, `-Mari leaves`), matched by actor-ref key. (A
 *  member's per-field diff — mood/relationship — is the relationship renderer, registered separately; this one
 *  reports only scene ENTRY/EXIT.) A LEAVE line is now the WHOLE of what departure means: the NPC's state,
 *  guides and stance all stay on her actor row (R2), so nothing else can diff on the way out. */
const presentCastRenderer: PlaneDiffRenderer<PresenceSlice> = {
  plane: "presentCast",
  select: (s) => ({ present: s.presentCharacters, actors: s.actorState }),
  render: (prev, cur, ctx) => {
    const before = new Set(prev.present);
    const after = new Set(cur.present);
    const entered = cur.present.filter((k) => !before.has(k)).map((k) => `+${presenceName(k, cur.actors, ctx)} enters`);
    const left = prev.present.filter((k) => !after.has(k)).map((k) => `-${presenceName(k, prev.actors, ctx)} leaves`);
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

/** The display form of a relationship — the bare kind, or a `custom` label (glossed with the M1 hint when the
 *  host configured one for that label: `vassal (sworn to serve but resentful)`). A custom kind with no label
 *  falls back to "custom"; a non-custom kind ignores the label (the built-ins carry their meaning). */
function relationshipDisplay(rel: NonNullable<ActorState[number]["identity"]>["relationship"], ctx: DeltaContext): string {
  if (rel.kind !== "custom") {
    return rel.kind;
  }
  const label = rel.label !== "" ? rel.label : "custom";
  const hint = ctx.relationshipHints[label];
  return hint !== undefined && hint !== "" ? `${label} (${hint})` : label;
}

/** Relationship (feature 1, §2.1) — a per-cast stance TRANSITION (`Mari: friend → wary`), matched by the
 *  ACTOR's ref key. Since R2 the stance rides the actor row, so it survives departure: a returning NPC's turn
 *  is a real transition line instead of the silent reset-from-blank the destroyed presence row produced. This
 *  line IS the steering loop's closed signal (the delta block's referent for "let the change land"). A
 *  first-seen actor with a non-default stance reads as a set-to; a NEUTRAL default is silent (no beat). */
const relationshipRenderer: PlaneDiffRenderer<ActorState> = {
  plane: "relationship",
  select: (s) => s.actorState,
  render: (prev, cur, ctx) => {
    const before = new Map(prev.map((a) => [volatileKey(a), a.identity]));
    const out: string[] = [];
    for (const actor of cur) {
      const identity = actor.identity;
      if (identity === undefined) {
        continue; // a roster actor carries no stance of its own
      }
      const was = before.get(volatileKey(actor));
      const nextDisp = relationshipDisplay(identity.relationship, ctx);
      if (was === undefined) {
        if (identity.relationship.kind !== "neutral" || identity.relationship.label !== "") {
          out.push(`${identity.name}: ${nextDisp}`); // an actor arriving with a stance already set
        }
        continue;
      }
      const prevDisp = relationshipDisplay(was.relationship, ctx);
      if (prevDisp !== nextDisp) {
        out.push(`${identity.name}: ${prevDisp} → ${nextDisp}`);
      }
    }
    return out;
  },
};

/** The plot label the diff names an act by — the act's title, else `act N`. */
function actLabel(plot: NonNullable<RpgSnapshotState["plot"]>, act: number): string {
  const title = plot.acts[act - 1]?.title ?? "";
  return title !== "" ? `act ${act} "${title}"` : `act ${act}`;
}

/** Plot (P5) — the campaign-scale transitions: the plane appearing (`plot begins`), an act ADVANCE
 *  (`act 1 → act 2 "The Bone Key"`), and a story retitle. Act title/summary edits within the same act are
 *  silent (authoring polish, not a beat the prose must land). */
const plotRenderer: PlaneDiffRenderer<RpgSnapshotState["plot"]> = {
  plane: "plot",
  select: (s) => s.plot,
  render: (prev, cur) => {
    if (cur === null) {
      return [];
    }
    const out: string[] = [];
    if (prev === null) {
      out.push(cur.title !== "" ? `story begins: "${cur.title}" — ${actLabel(cur, cur.act)}` : `story begins — ${actLabel(cur, cur.act)}`);
      return out;
    }
    if (cur.act !== prev.act) {
      out.push(`${actLabel(prev, prev.act)} → ${actLabel(cur, cur.act)}`);
    }
    if (cur.title !== prev.title && cur.title !== "") {
      out.push(`story titled "${cur.title}"`);
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
  definePlaneDiff(actorTrackersRenderer),
  definePlaneDiff(conditionsRenderer),
  definePlaneDiff(inventoryRenderer),
  definePlaneDiff(walletRenderer),
  definePlaneDiff(ambientRenderer),
  definePlaneDiff(presentCastRenderer),
  definePlaneDiff(relationshipRenderer),
  definePlaneDiff(questsRenderer),
  definePlaneDiff(plotRenderer),
  definePlaneDiff(gameTrackersRenderer),
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
    return buildFirstSnapshotBlock(cur, ctx);
  }
  const lines: string[] = [];
  for (const r of PLANE_DIFF_RENDERERS) {
    lines.push(...renderPlane(r, prev, cur, ctx));
  }
  if (lines.length === 0) {
    return null; // no-change — OMIT the block (byte-stable quiet-turn signal)
  }
  return `${resolveProse("rpg.delta.changesHeading", ctx.prose ?? {}).text}: ${lines.join(" · ")}`;
}

/** The first-snapshot arm (§2.7): the born state as a one-line SCENE OPENS summary (setting + who's present),
 *  NOT a delta over an empty prior (which would read as "everything just changed"). Omitted (null) when the
 *  born state carries nothing worth opening on.
 *
 *  It takes the `DeltaContext` for ONE reason and it is load-bearing: the presence plane stores ref KEYS, and a
 *  ROSTER actor's name lives in `ctx.rosterNames`, not on her row. Resolving without it printed the raw
 *  `character:chr_…`/`user:usr_…` key into the model's prompt on turn 1 of effectively every new game (the
 *  establish-when-unset arm forces a non-empty cast, and the model habitually lists the roster character). */
function buildFirstSnapshotBlock(cur: RpgSnapshotState, ctx: DeltaContext): string | null {
  const parts: string[] = [];
  if (cur.location !== "") {
    parts.push(cur.location);
  }
  if (cur.presentCharacters.length > 0) {
    parts.push(`with ${cur.presentCharacters.map((key) => presenceName(key, cur.actorState, ctx)).join(", ")}`);
  }
  const active = cur.quests.filter((q) => q.status === "active");
  if (active.length > 0) {
    parts.push(`quest: ${active.map((q) => q.name).join(", ")}`);
  }
  if (parts.length === 0) {
    return null; // an empty born state has no scene to open on (§2.7 first-snapshot omit)
  }
  return `${resolveProse("rpg.delta.sceneOpensHeading", ctx.prose ?? {}).text}: ${parts.join(" · ")}`;
}
