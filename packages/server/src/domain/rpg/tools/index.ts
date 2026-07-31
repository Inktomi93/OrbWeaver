// domain/rpg/tools — the 7 cheap-mode D48 state tool DEFINITIONS (rpg-design/05 §4.5). Registered ONCE at
// entry/compose into the ONE `toolUse` registry (the imagery precedent, `compose/imagery.ts:163-170`; W1c-b
// wires it — this wave authors the DEFS + a factory). Each handler CLOSES OVER the `RpgContext` (db + staging
// accumulator + id mints) and STAGES into the `ChatTurnId` accumulator (W1a's store): resolve the game by
// `exec.chatId`, ensure the turn's bucket from the resolution-ladder base, read the CURRENT effective plane
// (read-through — tool 2 sees tool 1's write), apply the delta (pure `./apply`), stage the absolute patch.
// `onTurnCompleted` flushes the accumulator to a clone-forward snapshot (`chat-ops/flush.ts`); abort clears it.
//
// `capability: null` (member floor — the turn runs under the host principal; the OWNING verbs re-gate on their
// own read/write paths, §4.5). Args are the projection-clean `@orb/contracts/rpg` schemas (top-level z.object,
// no `.transform()`/branded ids — the registry projects them to JSON Schema at registration).
//
// SHARED-PLANE PROOF: these tools and the reliable-mode extraction schema (`@orb/contracts/rpg` extraction.ts)
// are the SAME 7 plane shapes exposed two ways — the extraction schema DERIVES from these same arg schemas, so
// a reliable extraction is "a batch of the tool calls the model would otherwise have made" (§4.6). Both funnel
// through the ONE accumulator flush (W1a invariant).
//
// `roll_dice` is the odd one: ZERO state (bake-once — the ToolCallRecord on the variant IS the canon stamp).
// It rolls via the injected CSPRNG (`ctx.randomInt`) and returns the total + faces; no staging.

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import {
  addJournalEntryArgsSchema,
  rollDiceArgsSchema,
  setWidgetValueArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "@orb/contracts/rpg";
import type { ChatTurnId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import type { ToolDefinition, ToolExecutionContext, ToolHandlerResult } from "#domain/tool-use";
import type { RpgContext, RpgGameRow } from "../contract/service";
import { snapshotRowToState } from "../contract/service";
import { findGameByChat } from "../persistence/games";
import { resolveSnapshotForTurn } from "../persistence/snapshots";
import { defaultSnapshotState } from "../substrate/default-state";
import type { RosterRefIndex } from "./apply";
import {
  applySetWidgetValue,
  applyUpdateInventory,
  applyUpdateParty,
  applyUpdateScene,
  applyUpsertQuest,
  buildRosterRefIndex,
  toStagedJournalEntry,
} from "./apply";
import { rollNotation } from "./dice";

/** The sanctioned erasure (the imagery/buddy precedent): a typed `ToolDefinition<A>` is unassignable to
 *  `ToolDefinition<unknown>` (handler contravariance), so mint with its own `A` and widen for the array;
 *  `register<A>` re-narrows. */
function rpgTool<A>(def: ToolDefinition<A>): ToolDefinition {
  return def as ToolDefinition;
}

/** The turn context a stateful tool needs — the game + the turn's ephemeral id. Resolved once per invocation
 *  from the exec context; `null` when the tool fired off-chat or on a non-game chat (an errors-as-data denial,
 *  never a crash). */
interface ToolTurn {
  readonly game: RpgGameRow;
  readonly turnId: ChatTurnId;
}

/** Resolve the game + turn for a stateful tool invocation. Returns an `ok:false` legality result the model
 *  narrates when there is no chat, no turn correlation, or no game on the chat. */
async function resolveToolTurn(
  ctx: RpgContext,
  exec: ToolExecutionContext,
  tool: string,
): Promise<{ ok: true; turn: ToolTurn } | { ok: false; result: ToolHandlerResult }> {
  if (exec.chatId === null || exec.turnId === null) {
    return { ok: false, result: { ok: false, error: `${tool} requires a chat turn context` } };
  }
  const game = await findGameByChat(ctx.db, exec.chatId);
  if (game === undefined) {
    return { ok: false, result: { ok: false, error: `${tool}: this chat is not an rpg game` } };
  }
  return { ok: true, turn: { game, turnId: exec.turnId } };
}

/** Seed the turn's accumulator bucket from the resolution-ladder base (idempotent per turn) and return the
 *  CURRENT effective state — the read-through a stateful tool applies its delta over. */
async function effectiveState(ctx: RpgContext, game: RpgGameRow, turnId: ChatTurnId): Promise<RpgSnapshotState> {
  const row = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
  const base = row === undefined ? defaultSnapshotState() : snapshotRowToState(row);
  return ctx.staging.ensure(turnId, base);
}

/** The name→roster-ref index for the actor-targeting tools (F2): resolve the chat's roster once and index it by
 *  name, so `update_party`/`update_inventory` land a party-member write under its roster key — the SAME key the
 *  tracker view + reminder read (never an orphan `cast:<name>`). */
async function rosterIndexFor(ctx: RpgContext, game: RpgGameRow): Promise<RosterRefIndex> {
  return buildRosterRefIndex(await ctx.resolveRoster(game.chatId));
}

/** Build the 7 rpg tool defs closing over `ctx` (registered at compose, W1c-b). */
export function rpgToolDefinitions(ctx: RpgContext): readonly ToolDefinition[] {
  return [
    rpgTool({
      name: "update_party",
      description:
        "Update a party member or scene NPC's live state: pool deltas (e.g. mana -1), add/remove a named " +
        "condition, an HP delta, or a status line. `targetRef` is the actor's NAME. Call after any beat that " +
        "changes a tracked value.",
      argsSchema: updatePartyArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "update_party");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        const applied = applyUpdateParty(state, args, await rosterIndexFor(ctx, resolved.turn.game));
        if (!applied.ok) {
          return { ok: false, error: applied.error };
        }
        ctx.staging.stage(resolved.turn.turnId, applied.patch);
        return { ok: true, value: { targetRef: args.targetRef } };
      },
    }),
    rpgTool({
      name: "update_inventory",
      description:
        "Add or remove items in an actor's inventory, or adjust their wallet (named currency deltas). " +
        "`targetRef` is the actor's NAME. Use for loot, purchases, spending, and gifts.",
      argsSchema: updateInventoryArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "update_inventory");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        const patch = applyUpdateInventory(state, args, () => newId(), await rosterIndexFor(ctx, resolved.turn.game));
        ctx.staging.stage(resolved.turn.turnId, patch);
        return { ok: true, value: { targetRef: args.targetRef } };
      },
    }),
    rpgTool({
      name: "update_scene",
      description:
        "Update the shared scene: location, calendar date, time of day, weather, present cast (a patch — " +
        "omitted fields keep), append a recent-events beat, or advance the plot (`plot`: the current act " +
        "number, the story title, or the current act's title/summary). Call when the scene moves or changes — " +
        "and specifically whenever the beat spends time (rest, travel, a cut to later), so `timeOfDay` advances " +
        "through the day, `weather` turns with the sky, and `day` ticks over when the night passes. `weather.type` " +
        "is one of clear/cloudy/rain/storm/snow/fog/wind/ash — pick the closest; put the vivid phrasing in " +
        '`weather.label` ("torrential sleet"), which is what the reader sees.',
      argsSchema: updateSceneArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "update_scene");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        // ScenePatch is a named partial (no index signature) — cast to the [merge-clear] patch shape the
        // accumulator overlays (the staging.ts domain-internal cast pattern).
        ctx.staging.stage(resolved.turn.turnId, { ...applyUpdateScene(state, args) });
        return { ok: true, value: {} };
      },
    }),
    rpgTool({
      name: "set_widget_value",
      description: "Set a custom HUD widget's value, max, or item list. `widgetRef` is the widget's label. Use for free-form meters the game defines.",
      argsSchema: setWidgetValueArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "set_widget_value");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        ctx.staging.stage(resolved.turn.turnId, applySetWidgetValue(state, args));
        return { ok: true, value: { widgetRef: args.widgetRef } };
      },
    }),
    rpgTool({
      name: "upsert_quest",
      description:
        "Create, update, complete, or fail a quest (addressed by NAME). Optionally set a description and " +
        "objective lines. Use when the plot introduces or resolves a goal.",
      argsSchema: upsertQuestArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "upsert_quest");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        const patch = applyUpsertQuest(
          state,
          args,
          () => ctx.ids.quest(),
          () => newId(),
        );
        ctx.staging.stage(resolved.turn.turnId, patch);
        return { ok: true, value: { name: args.name, action: args.action } };
      },
    }),
    rpgTool({
      name: "add_journal_entry",
      description:
        "Append a journal entry recording a story beat (a typed title + content). Use to log location changes, NPC meetings, combat, and notable events.",
      argsSchema: addJournalEntryArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "add_journal_entry");
        if (!resolved.ok) {
          return resolved.result;
        }
        // A journal entry does not touch the snapshot planes, but the accumulator bucket must exist so the
        // entry rides the SAME take-or-clear as any staged state (abort discards it, commit stamps it).
        await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        ctx.staging.stageJournal(resolved.turn.turnId, toStagedJournalEntry(args));
        return { ok: true, value: { title: args.title } };
      },
    }),
    rpgTool({
      name: "roll_dice",
      description:
        "Roll dice (e.g. `2d6+1`). Bake-once: the roll is server-authoritative and returned for you to narrate. Zero state — the roll is recorded on this message.",
      argsSchema: rollDiceArgsSchema,
      capability: null,
      source: "builtin",
      handler: (args, _exec): Promise<ToolHandlerResult> => {
        const rolled = rollNotation(args.notation, ctx.randomInt);
        if (rolled === null) {
          return Promise.resolve({ ok: false, error: `roll_dice: could not parse notation "${args.notation}" (expected e.g. 2d6+1)` });
        }
        return Promise.resolve({
          ok: true,
          value: { notation: args.notation, total: rolled.total, faces: rolled.faces, ...(args.reason !== undefined ? { reason: args.reason } : {}) },
        });
      },
    }),
  ];
}
