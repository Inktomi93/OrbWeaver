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
// THE STRING PROJECTIONS ARE THE REMINDER'S LINES — this file COMPOSES `substrate/reminder.ts`'s exported
// builders (`ambientLine`/`actorLine`/`npcHeader`/`gameTrackerLine`/`questLine`/`plotLine`) rather
// than carrying its own. A file that carries its own line grammar drifts into a strict subset of the
// reminder's: no volatile plane on ANY carrier (hp · wallet · carrying · status · conditions), none of the
// standing guides, no attribute readings, no sheet flavor, no game-subject readings, no quest status/
// description, no time-of-day, no weather description — each a field the host or the model can WRITE that
// would reach this surface nowhere, the reachability class. What stays per-plane
// is the ASSEMBLY (which blocks a given macro carries), never the line grammar.
//
// WHAT THIS SURFACE DELIBERATELY DOES NOT STAGE: the two VOCABULARY lines (`Trackers: …`/`Attributes: …`) and
// the steering license. They are the reminder's once-per-turn teach and the reminder ships on EVERY game turn
// regardless of what a preset places, so repeating them inside a per-plane fragment would re-multiply exactly
// the prose the vocabulary split exists to collapse. The tracker HINT still reaches a preset author through
// `{{rpgDelta}}` (the delta line glosses each reading).

import type { ProseOverrides } from "@orb/contracts/prose";
import type { RpgActorView, RpgDateMode, RpgQuestView, RpgSnapshotState, RpgStatProfile, RpgTrackerView } from "@orb/contracts/rpg";
import { RPG_NPC_GUIDE_FIELDS } from "@orb/contracts/rpg";
import type { CelValue } from "@orb/kit/cel";
import type { DeltaContext } from "../contract/delta.ts";
import type { RpgMacroFeed } from "../contract/params.ts";
import { buildDeltaBlock } from "../substrate/delta.ts";
import { actorLine, ambientLine, gameTrackerLine, npcHeader, plotLine, questLine } from "../substrate/reminder.ts";

/** The scene-npcs, in the reminder's own partition (R2): npc-kind actors who stand on stage. */
function onStage(view: RpgTrackerView): readonly RpgActorView[] {
  return view.actors.filter((a) => a.actorRef.kind === "npc" && a.presence);
}

/** The shared render context the `{{rpgCast}}`/`{{rpgSceneState}}` string builders thread — bundled into ONE
 *  object so each builder stays under the param cap. `statProfile` + `relationshipHints` come from the game
 *  config; `prose` is the turn PRESET's `promptConfig.prose` (threaded through the gather), so the npc header
 *  resolves the SAME host override the reminder's `Present:` header does (two surfaces, one vocabulary). */
interface NpcRenderCtx {
  readonly statProfile: RpgStatProfile;
  readonly relationshipHints: Readonly<Record<string, string>>;
  readonly prose: ProseOverrides;
}

/** The `Present:` block both string macros carry — the guide-teaching header + one whole {@link actorLine} per
 *  member (identity · carried trackers · the volatile plane · the standing guides). */
function npcBlock(view: RpgTrackerView, ctx: NpcRenderCtx): string[] {
  const npcs = onStage(view);
  return [npcHeader(npcs, ctx.prose), ...npcs.map((a) => actorLine(a, ctx.statProfile.attributes, ctx.relationshipHints))];
}

/** `{{rpgSceneState}}` — the scene the world is in: ambient · plot · present characters · the GAME-subject tracker
 *  readings (which belong to no actor, so they fall through the party/npc split unless this block carries
 *  them) · recent beats. The party sheets are `{{rpgCast}}`'s job. Empty planes are omitted; a wholly-empty
 *  scene returns "". */
function sceneStateString(view: RpgTrackerView, dateMode: RpgDateMode, ctx: NpcRenderCtx): string {
  const lines: string[] = [];
  if (view.ambient !== null) {
    const ambient = ambientLine(view.ambient, dateMode);
    if (ambient !== "") {
      lines.push(`Scene: ${ambient}`);
    }
  }
  // The P5 plot spine (same line grammar as the reminder's Story line — one helper, two consumers).
  if (view.plot !== null) {
    lines.push(`Story: ${plotLine(view.plot)}`);
  }
  if (view.cast.length > 0) {
    lines.push(...npcBlock(view, ctx));
  }
  if (view.gameTrackers.length > 0) {
    lines.push("Game trackers:", ...view.gameTrackers.map(gameTrackerLine));
  }
  if (view.recentBeats.length > 0) {
    lines.push("Recent beats:", ...view.recentBeats.map((b) => `- ${b}`));
  }
  return lines.join("\n");
}

/** `{{rpgCast}}` — the people: the party actors' whole lines (identity · attribute readings · carried trackers ·
 *  the volatile plane · the sheet's flavor continuation) + the present characters. The identity+volatile planes the
 *  panel's Party + Present tabs render. */
function castString(view: RpgTrackerView, ctx: NpcRenderCtx): string {
  const lines: string[] = [];
  // The same participant/npc partition the reminder makes off the one actor list (R2) — never a second rule.
  const party = view.actors.filter((a) => a.actorRef.kind !== "npc");
  if (party.length > 0) {
    lines.push("Party:", ...party.map((a) => actorLine(a, ctx.statProfile.attributes, ctx.relationshipHints)));
  }
  if (view.cast.length > 0) {
    lines.push(...npcBlock(view, ctx));
  }
  return lines.join("\n");
}

/** `{{rpgQuests}}` — the ACTIVE quests, each as the reminder's whole quest line (name · status · description ·
 *  its open objectives). */
function questsString(quests: readonly RpgQuestView[]): string {
  const active = quests.filter((q) => q.status === "active");
  return active.map(questLine).join("\n");
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
    cast: onStage(view).map((a) => ({
      name: a.name,
      mood: a.identity?.mood ?? "",
      // The custom `label` is the reachable relationship for a custom kind; the bare kind otherwise. So an
      // `{{expr}}` predicate reads `c.relationship == "enemy"` OR a custom `c.relationship == "vassal"` uniformly.
      relationship: celRelationship(a),
      ...celGuides(a),
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

/** The three STANDING guides (RV-11) as CEL leaves, DERIVED from `RPG_NPC_GUIDE_FIELDS` — never re-spelled
 *  here, so a fourth guide reaches `{{expr::rpg.cast…}}` the moment it joins the tuple (and a rename fails
 *  `tsc` at the tuple's own `satisfies`, not silently at this projection).
 *
 *  They were the last WRITABLE npc fields no macro/CEL consumer could read: the extraction round is asked
 *  for appearance + outfit + thoughts on every beat, the steering reminder prints them and the Scene tab's
 *  `NpcGuides` renders them, but a preset author's predicate could only see name/mood/relationship. The
 *  optional leaves project as `""` (the data-only degrade the whole tree uses — an absent key errors a whole
 *  expr chain, a "" reads as "the story hasn't written one"). */
function celGuides(actor: RpgActorView): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of RPG_NPC_GUIDE_FIELDS) {
    out[field] = actor.identity?.[field] ?? "";
  }
  return out;
}

/** The relationship value a `{{expr}}` predicate reads — the custom `label` (or "custom" if unlabelled) for a
 *  custom kind, the bare kind token otherwise. Distinct from the reminder's `relationshipSeg` (which blanks a
 *  neutral default and glosses a custom label with its host hint, for the steering PROSE); CEL wants the literal
 *  kind so `c.relationship == "neutral"` is reachable. */
function celRelationship(actor: RpgActorView): string {
  const rel = actor.identity?.relationship;
  if (rel === undefined) {
    return "";
  }
  if (rel.kind !== "custom") {
    return rel.kind;
  }
  return rel.label !== "" ? rel.label : "custom";
}

/** Build the macro + CEL feed from the resolved tracker view + the delta lineage (§12). PURE — the gather resolves
 *  the view + hands in the delta context (the same `participantNames`/`trackerDefs`/`relationshipHints` the reminder
 *  uses). Only lite-relevant string macros are staged (full-mode keys stay absent ⇒ ""); the CEL `rpg` tree
 *  carries the whole scene/cast/quests/delta read surface.
 *
 *  `dateMode` + `statProfile` are the two config reads the composed reminder lines need — the SAME two the
 *  gather hands `buildLiteReminder`, so the host's date ruling and attribute vocabulary govern both surfaces
 *  identically. The custom-relationship hints ride `deltaContext` (already the game's one hint map). */
export function buildRpgMacroFeed(args: {
  readonly view: RpgTrackerView;
  readonly prevSnapshot: RpgSnapshotState | null;
  readonly curSnapshot: RpgSnapshotState;
  readonly deltaContext: DeltaContext;
  readonly dateMode: RpgDateMode;
  readonly statProfile: RpgStatProfile;
}): RpgMacroFeed {
  // The §2.7 delta line, reachable as a macro so a preset can place it (and as `rpg.delta.text` for `{{expr}}`).
  // null (no-change / non-game-empty) ⇒ "" — the byte-stable quiet-turn signal (never a "no changes" line).
  const deltaText = buildDeltaBlock(args.prevSnapshot, args.curSnapshot, args.deltaContext) ?? "";
  // PROSE-1 — the cast-header override rides the SAME preset prose the delta headings do (threaded on
  // `deltaContext`), so both macro surfaces resolve it without a second feed input.
  const npcCtx: NpcRenderCtx = {
    statProfile: args.statProfile,
    relationshipHints: args.deltaContext.relationshipHints,
    prose: args.deltaContext.prose ?? {},
  };
  return {
    macros: {
      rpgSceneState: sceneStateString(args.view, args.dateMode, npcCtx),
      rpgCast: castString(args.view, npcCtx),
      rpgQuests: questsString(args.view.quests),
      rpgDelta: deltaText,
    },
    rpg: rpgCelTree(args.view, deltaText),
  };
}
