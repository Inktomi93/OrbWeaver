// domain/rpg/chat-ops/macro-view — the game turn's MACRO + CEL feed (parity-plus §12). PURE projection (zero
// I/O — the gather resolves the tracker view + the delta and hands them in), the same `buildTrackerView` the CP
// panel + the steering reminder read, so the macro/CEL feed never drifts from the panel (one projection, three
// consumers). Two outputs:
//   • `rpgMacros` — the string macro map (`{{rpgSceneState}}`/`{{rpgCast}}`/`{{rpgQuests}}`/`{{rpgDelta}}`) a
//     preset author weaves into their OWN prompt shape. Only the lite-relevant keys are staged; the full-mode
//     macros (`rpgMap`/`rpgMorale`/…) are ABSENT ⇒ they resolve "" (the honest empty, byte-identical to a game
//     with no full plane). A READ mirror, never a write — the rpg write path stays tools/extraction.
//   • `celBindings.rpg` — the SAME view shaped as a data-only `CelValue` tree (scalars/lists/maps, NO functions —
//     the `CelBindings` contract) so `{{expr::rpg.cast.exists(c, c.relationship == "enemy")}}` /
//     `{{expr::rpg.scene.location}}` / `{{expr::rpg.quests.filter(q, q.status == "active").size()}}` evaluate.
//     A non-game chat stages NO `rpg` binding ⇒ `{{expr::rpg.…}}` errors-to-"" (the built CEL degrade).
//
// The string projections mirror the reminder's line grammar (compact, label-as-mini-prompt) but stand alone here:
// the reminder is a monolith (all planes + the license) — a preset placing `{{rpgSceneState}}` wants JUST the
// scene, so these are per-plane. Kept in step with `substrate/reminder.ts` by design (both read the tracker view).

import type { RpgPresentCharacter, RpgQuestView, RpgSnapshotState, RpgTrackerEntry, RpgTrackerView } from "@orb/contracts/rpg";
import { rpgWeatherText, trackerReading } from "@orb/contracts/rpg";
import type { CelValue } from "@orb/kit/cel";
import type { DeltaContext } from "../contract/delta";
import type { RpgMacroFeed } from "../contract/params";
import { buildDeltaBlock } from "../substrate/delta";
import { plotLine } from "../substrate/reminder";

/** The steering display of a present character's relationship (§2.1) — the bare kind, or a custom `label`.
 *  Mirrors the reminder's `relationshipSeg` (a neutral default carries no steering signal ⇒ ""). */
function relationshipText(cast: RpgPresentCharacter): string {
  if (cast.relationship.kind === "custom") {
    return cast.relationship.label !== "" ? cast.relationship.label : "custom";
  }
  return cast.relationship.kind === "neutral" ? "" : cast.relationship.kind;
}

/** A carrier's tracker segments for the `{{rpgCast}}`/`{{rpgSceneState}}` prose forms — the BARE readings
 *  (`trackerReading`, no hint gloss): a macro a preset author places in their own prompt shape wants the datum,
 *  where the steering reminder wants the datum PLUS its meaning. One reading builder, two glosses. */
function trackerSegs(entries: readonly RpgTrackerEntry[]): string[] {
  const segs: string[] = [];
  for (const entry of entries) {
    const reading = trackerReading(entry.def, entry.value ?? undefined);
    if (reading !== null) {
      segs.push(reading);
    }
  }
  return segs;
}

/** The ambient one-liner (`Scene: <location> · <date> · day N · <weather>`), or "" when every plane is empty. */
function ambientLine(ambient: RpgTrackerView["ambient"]): string {
  if (ambient === null) {
    return "";
  }
  const parts: string[] = [];
  if (ambient.location !== "") {
    parts.push(ambient.location);
  }
  if (ambient.calendarDate !== null) {
    parts.push(ambient.calendarDate);
  }
  if (ambient.clock !== null) {
    parts.push(`day ${ambient.clock.day}`);
  }
  if (ambient.weather !== null) {
    parts.push(rpgWeatherText(ambient.weather));
  }
  return parts.length > 0 ? `Scene: ${parts.join(" · ")}` : "";
}

/** One present-cast line — `<emoji> <name> — <mood> — <relationship> — <fields…>`. `withEmoji` drops the emoji
 *  prefix (the `{{rpgCast}}` form leads with the bare name; `{{rpgSceneState}}` leads with the emoji). */
function castMemberLine(c: RpgPresentCharacter, trackers: readonly RpgTrackerEntry[], withEmoji: boolean): string {
  const head = withEmoji && c.emoji !== "" ? `${c.emoji} ${c.name}` : c.name;
  const segs: string[] = [head];
  if (c.mood !== "") {
    segs.push(c.mood);
  }
  const rel = relationshipText(c);
  if (rel !== "") {
    segs.push(rel);
  }
  segs.push(...trackerSegs(trackers));
  return `- ${segs.join(" — ")}`;
}

/** One party actor's sheet+volatile line — `<name> — <class> — Lv N — HP v/m — <trackers>`. */
function actorLine(a: RpgTrackerView["actors"][number]): string {
  const segs: string[] = [a.name];
  if (a.sheet.className !== "") {
    segs.push(a.sheet.className);
  }
  if (a.sheet.level !== null) {
    segs.push(`Lv ${a.sheet.level}`);
  }
  const v = a.volatile;
  if (v !== null) {
    if (v.hp !== null) {
      segs.push(`HP ${v.hp.value}/${v.hp.max}`);
    }
    segs.push(...trackerSegs(a.trackers.map((def) => ({ def, value: v.trackerValues[def.key] ?? null }))));
  }
  return `- ${segs.join(" — ")}`;
}

/** `{{rpgSceneState}}` — the ambient line + present cast + recent beats (the scene the reminder renders, minus the
 *  party sheets which are `{{rpgCast}}`'s job). Empty planes are omitted; a wholly-empty scene returns "". */
function sceneStateString(view: RpgTrackerView): string {
  const lines: string[] = [];
  const ambient = ambientLine(view.ambient);
  if (ambient !== "") {
    lines.push(ambient);
  }
  // The P5 plot spine (same line grammar as the reminder's Story line — one helper, two consumers).
  if (view.plot !== null) {
    lines.push(`Story: ${plotLine(view.plot)}`);
  }
  if (view.cast.length > 0) {
    lines.push("Present:");
    lines.push(...view.cast.map((c) => castMemberLine(c, view.castTrackers[c.key] ?? [], true)));
  }
  if (view.recentBeats.length > 0) {
    lines.push("Recent beats:");
    lines.push(...view.recentBeats.map((b) => `- ${b}`));
  }
  return lines.join("\n");
}

/** `{{rpgCast}}` — the party actor sheets (name/class/level/HP/trackers) + the present cast with relationship +
 *  custom fields. The identity+volatile planes the panel's Party + Present tabs render. */
function castString(view: RpgTrackerView): string {
  const lines: string[] = [];
  if (view.actors.length > 0) {
    lines.push("Party:");
    lines.push(...view.actors.map(actorLine));
  }
  if (view.cast.length > 0) {
    lines.push("Present:");
    lines.push(...view.cast.map((c) => castMemberLine(c, view.castTrackers[c.key] ?? [], false)));
  }
  return lines.join("\n");
}

/** `{{rpgQuests}}` — the ACTIVE quests + their open objectives (the reminder's active-quests block). */
function questsString(quests: readonly RpgQuestView[]): string {
  const active = quests.filter((q) => q.status === "active");
  if (active.length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const q of active) {
    lines.push(`- ${q.name}`);
    for (const o of q.objectives.filter((obj) => !obj.completed)) {
      lines.push(`  ○ ${o.text}`);
    }
  }
  return lines.join("\n");
}

/** The `rpg` CEL tree (§12) — the tracker view shaped as a data-only `CelValue` map so `{{expr::rpg.…}}` reads it.
 *  Scalars/lists/maps only (no functions). The documented read-set: `rpg.scene.*`, `rpg.cast[].relationship`,
 *  `rpg.quests[].status`, `rpg.delta.*` — the shape IS the tracker view, so it stays in sync by construction. */
function rpgCelTree(view: RpgTrackerView, deltaText: string): CelValue {
  const ambient = view.ambient;
  return {
    scene: {
      location: ambient !== null ? ambient.location : "",
      // The CANONICAL type, deliberately NOT the display label: a `{{expr}}` predicate wants the closed
      // vocabulary (`rpg.scene.weather == "storm"` is now total), where the prose line above wants the flavor.
      weather: ambient?.weather !== null && ambient?.weather !== undefined ? ambient.weather.type : "",
      day: ambient?.clock !== null && ambient?.clock !== undefined ? ambient.clock.day : 0,
    },
    cast: view.cast.map((c) => ({
      name: c.name,
      mood: c.mood,
      // The custom `label` is the reachable relationship for a custom kind; the bare kind otherwise. So an
      // `{{expr}}` predicate reads `c.relationship == "enemy"` OR a custom `c.relationship == "vassal"` uniformly.
      relationship: celRelationship(c),
    })),
    quests: view.quests.map((q) => ({
      name: q.name,
      status: q.status,
      objectivesOpen: q.objectives.filter((o) => !o.completed).length,
      objectivesTotal: q.objectives.length,
    })),
    // The P5 plot plane for `{{expr::rpg.plot.act}}` / `rpg.plot.actTitle` predicates. A plot-less game
    // reads act 0 + empty titles (data-only degrade — never an absent key that errors a whole expr chain).
    plot: {
      act: view.plot !== null ? view.plot.act : 0,
      title: view.plot !== null ? view.plot.title : "",
      actTitle: view.plot?.acts[view.plot.act - 1]?.title ?? "",
      acts: view.plot !== null ? view.plot.acts.map((a) => a.title) : [],
    },
    delta: { text: deltaText },
  };
}

/** The relationship value a `{{expr}}` predicate reads — the custom `label` (or "custom" if unlabelled) for a
 *  custom kind, the bare kind token otherwise. Distinct from `relationshipText` (which blanks a neutral default
 *  for the steering PROSE); CEL wants the literal kind so `c.relationship == "neutral"` is reachable. */
function celRelationship(c: RpgPresentCharacter): string {
  if (c.relationship.kind !== "custom") {
    return c.relationship.kind;
  }
  return c.relationship.label !== "" ? c.relationship.label : "custom";
}

/** Build the macro + CEL feed from the resolved tracker view + the delta lineage (§12). PURE — the gather resolves
 *  the view + hands in the delta context (the same `rosterNames`/`trackerDefs`/`relationshipHints` the reminder
 *  uses). Only lite-relevant string macros are staged (full-mode keys stay absent ⇒ ""); the CEL `rpg` tree
 *  carries the whole scene/cast/quests/delta read surface. */
export function buildRpgMacroFeed(args: {
  readonly view: RpgTrackerView;
  readonly prevSnapshot: RpgSnapshotState | null;
  readonly curSnapshot: RpgSnapshotState;
  readonly deltaContext: DeltaContext;
}): RpgMacroFeed {
  // The §2.7 delta line, reachable as a macro so a preset can place it (and as `rpg.delta.text` for `{{expr}}`).
  // null (no-change / non-game-empty) ⇒ "" — the byte-stable quiet-turn signal (never a "no changes" line).
  const deltaText = buildDeltaBlock(args.prevSnapshot, args.curSnapshot, args.deltaContext) ?? "";
  return {
    macros: {
      rpgSceneState: sceneStateString(args.view),
      rpgCast: castString(args.view),
      rpgQuests: questsString(args.view.quests),
      rpgDelta: deltaText,
    },
    rpg: rpgCelTree(args.view, deltaText),
  };
}
