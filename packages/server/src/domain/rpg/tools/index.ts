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
// SHARED-PLANE PROOF: these tools and the structured extraction schema (`@orb/contracts/rpg` extraction.ts)
// are the SAME 7 plane shapes exposed two ways — the extraction schema DERIVES from these same arg schemas, so
// an extraction is "a batch of the tool calls the model would otherwise have made" (§4.6). Both funnel
// through the ONE accumulator flush (W1a invariant).
//
// `roll_dice` is the odd one: ZERO state (bake-once — the ToolCallRecord on the variant IS the canon stamp).
// It rolls via the injected CSPRNG (`ctx.randomInt`) and returns the total + faces; no staging.

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import {
  addJournalEntryArgsSchema,
  RPG_BASELINE_TOOL_DESCRIPTIONS,
  rollDiceArgsSchema,
  setTrackerArgsSchema,
  updateInventoryArgsSchema,
  updatePartyArgsSchema,
  updateSceneArgsSchema,
  upsertQuestArgsSchema,
} from "@orb/contracts/rpg";
import type { ChatTurnId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import type { ToolDefinition, ToolExecutionContext, ToolHandlerResult } from "#domain/tool-use";
import type { ActorRefIndex } from "../contract/params.ts";
import type { RpgContext, RpgGameRow } from "../contract/service.ts";
import { snapshotRowToState } from "../contract/service.ts";
import { findGameByChat } from "../persistence/games.ts";
import { resolveSnapshotForTurn } from "../persistence/snapshots.ts";
import { defaultSnapshotState } from "../substrate/default-state.ts";
import {
  applySetTracker,
  applyUpdateInventory,
  applyUpdateParty,
  applyUpdateScene,
  applyUpsertQuest,
  buildActorRefIndex,
  toStagedJournalEntry,
} from "./apply.ts";
import { rollNotation } from "./dice.ts";

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
 *  tracker view + reminder read (never an orphan `npc:<name>`). */
async function participantIndexFor(ctx: RpgContext, game: RpgGameRow): Promise<ActorRefIndex> {
  return buildActorRefIndex(await ctx.resolveParticipants(game.chatId));
}

/** Build the 7 rpg tool defs closing over `ctx` (registered at compose, W1c-b). */
export function rpgToolDefinitions(ctx: RpgContext): readonly ToolDefinition[] {
  return [
    rpgTool({
      name: "update_party",
      description: RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_party") ?? "",
      argsSchema: updatePartyArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "update_party");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        // TOTAL since R3 — the one refusal arm (`hpDelta` on a null-hp actor) left with `hp`'s demotion to an
        // ordinary tracker, whose per-actor key enum makes the illegal write untypeable instead of refusable.
        ctx.staging.stage(resolved.turn.turnId, applyUpdateParty(state, args, await participantIndexFor(ctx, resolved.turn.game)));
        return { ok: true, value: { targetRef: args.targetRef } };
      },
    }),
    rpgTool({
      name: "update_inventory",
      description: RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_inventory") ?? "",
      argsSchema: updateInventoryArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "update_inventory");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        const patch = applyUpdateInventory(state, args, () => newId(), await participantIndexFor(ctx, resolved.turn.game));
        ctx.staging.stage(resolved.turn.turnId, patch);
        return { ok: true, value: { targetRef: args.targetRef } };
      },
    }),
    rpgTool({
      name: "update_scene",
      description: RPG_BASELINE_TOOL_DESCRIPTIONS.get("update_scene") ?? "",
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
        ctx.staging.stage(resolved.turn.turnId, { ...applyUpdateScene(state, args, await participantIndexFor(ctx, resolved.turn.game)) });
        return { ok: true, value: {} };
      },
    }),
    rpgTool({
      name: "set_tracker",
      description: RPG_BASELINE_TOOL_DESCRIPTIONS.get("set_tracker") ?? "",
      argsSchema: setTrackerArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec): Promise<ToolHandlerResult> => {
        const resolved = await resolveToolTurn(ctx, exec, "set_tracker");
        if (!resolved.ok) {
          return resolved.result;
        }
        const state = await effectiveState(ctx, resolved.turn.game, resolved.turn.turnId);
        ctx.staging.stage(resolved.turn.turnId, applySetTracker(state, args));
        return { ok: true, value: { key: args.key } };
      },
    }),
    rpgTool({
      name: "upsert_quest",
      description: RPG_BASELINE_TOOL_DESCRIPTIONS.get("upsert_quest") ?? "",
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
      description: RPG_BASELINE_TOOL_DESCRIPTIONS.get("add_journal_entry") ?? "",
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
      // PROSE-1 slot (#578): `rpg.extract.tool.rollDice`, resolved to its shipped default at module load —
      // the same "no game, no preset in scope" posture as its six siblings (`RPG_BASELINE_TOOL_DESCRIPTIONS`).
      description: RPG_BASELINE_TOOL_DESCRIPTIONS.get("roll_dice") ?? "",
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
