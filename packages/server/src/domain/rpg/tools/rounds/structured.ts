// The structured state round (the vehicle a game's connection may prefer over a forced tool round), the inventory
// audit both tool vehicles run, and the fold of a round's tool calls into a state delta.

import type { ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type {
  ExtractionRefs,
  RpgRecordedToolCall,
  RpgSnapshotState,
  RpgStateRoundTool,
  RpgStructuredChanges,
  RpgStructuredRoundShape,
  RpgToolCall,
  RpgTrackerDef,
} from "@orb/contracts/rpg";
import {
  constrainExtractionSchema,
  describePatchFields,
  patchChangesToToolCalls,
  RPG_NO_CHANGES_TOOL,
  RPG_STRUCTURED_ROUND_SHAPES,
  recordToolCalls,
  rpgExtractionSchema,
  stateRoundChangesSchema,
  stateRoundPatchSchema,
  structuredChangesToToolCalls,
  toolCallsToExtraction,
} from "@orb/contracts/rpg";
import type { ForcedToolRoundInput, Resolved } from "@orb/inference";
import { forcesToolRound, GenerationObservationPersistenceError, planStructuredFor, runStructuredChat, toForcedToolRoundRequest } from "@orb/inference";
import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import type { WireReady } from "@orb/kit/json-schema";
import { projectJsonSchema } from "@orb/kit/json-schema";
import type { RpgTurnTranscriptMessage } from "#domain/chat";
import { logger } from "#foundation/observability";
import type { StateRoundPlans } from "#src/domain/rpg/contract/params.ts";
import type { RpgRoundsDeps, StructuredRound } from "#src/domain/rpg/contract/rounds.ts";
import type { RpgRunToolRound, RpgStateDelta } from "#src/domain/rpg/contract/service.ts";
import { buildActorRefIndex, extractionToStateDelta } from "../apply.ts";
import { createExtractionMints } from "../mints.ts";
import { isCancelled, logCancelled, logExtractionOutcome, logToolCallLosses, logToolRoundUsage, roundFailure, safeJson } from "./round-log.ts";

/** The structured state round's `responseFormat.name`, and the vehicle name its logs and trace carry. */
const STATE_CHANGES_SCHEMA_NAME = "rpg_state_changes";

export const STRUCTURED_ROUND_VEHICLE = "structured state round";

/** The host-facing reason a structured state round that answered outside its schema records. */
const STRUCTURED_REPLY_UNREADABLE = "the model's state reply was not a list of changes";

const INVENTORY_NAME_WHITESPACE = /\s+/u;

/** A cheap round normally gets one shot. A measured hosted-model failure skipped Inventory twice even though
 *  the latest beat named an existing key at a new location, while writing the same fact into Scene + Journal.
 *  Do not double every round: the narrow completeness pass fires only when (a) the first pass omitted the
 *  inventory tool, (b) inventory already exists, and (c) the latest committed beat names one of those items.
 *  The second model sees only update_inventory + no_changes, so it can either repair the proven ambiguity or
 *  decline it without repeating another plane.
 *
 *  TWO DECLARED LIMITS (#118 — stated, not silently inherited; both are the CONSEQUENCE of clause (b)+(c)):
 *    1. It is BLIND TO A FIRST ACQUISITION. Clause (b) requires an already-owned item and clause (c) requires
 *       the beat to NAME one, so the empty-pack miss (#76's measured Sabine beat: a thing acquired into a pack
 *       holding nothing) can never trigger this repair — the exact defect class the audit reads as if it
 *       covered. Reaching it needs an ACQUISITION-CUE detector over the beat text, and that escalation is
 *       DEFERRED by the owner's own sequencing: `c993cde338` ruled the fix prompt-first and said "measurement
 *       over real turns follows before any detector escalation". The prompt arm is now on BOTH vehicles
 *       (`rpg.extract.plane.inventory` v4 here, `rpg.extract.tool.updateInventory` v4 for the fold), and the
 *       measurement HAS run: on the empty-pack acquisition corpus the description-only (folded) teaching
 *       moved 16/20 → 19/20, which is parity with the tool round's 35/36 reference (Fisher p=1.00, against
 *       p=0.05 for the un-clauses arm), with 0/6 control false-fires. The escalation is therefore NOT
 *       triggered. Re-open it only on a measured rate whose Wilson-95 UPPER bound sits below that 97.2%
 *       reference — a heuristic, not a measurement, is what this gate must never grow on the strength of.
 *    2. It never runs on a FOLDED turn that emitted anything. A folded flush with ≥1 co-emitted call goes
 *       straight through `foldTurnToolCalls` (`domain/rpg/chat-ops/flush.ts` `resolveStateRound`), which makes
 *       ZERO model calls by construction — an audit there would resurrect exactly the second call R1/D112
 *       deleted, post-commit, on the mode most games run. A folded turn that emitted NOTHING already falls
 *       back to this round and inherits the audit with it. So the fold's write-surface repair is its TOOL
 *       DESCRIPTION, not a second pass; that is why the clause had to be ported onto the description at all. */
function needsInventoryAudit(baseState: RpgSnapshotState, transcript: readonly RpgTurnTranscriptMessage[], calls: readonly RpgToolCall[]): boolean {
  if (calls.some((call) => call.name === "update_inventory")) {
    return false;
  }
  const latestBeat = transcript.at(-1)?.content.toLocaleLowerCase() ?? "";
  if (latestBeat.length === 0) {
    return false;
  }
  return baseState.actorState.some((actor) =>
    actor.volatile.inventory.some((item) => {
      const name = item.name.trim().toLocaleLowerCase();
      if (name.length === 0) {
        return false;
      }
      if (latestBeat.includes(name)) {
        return true;
      }
      const words = name.split(INVENTORY_NAME_WHITESPACE);
      return words.length > 1 && latestBeat.includes(words.slice(-2).join(" "));
    }),
  );
}

/** Run the selective inventory pass without making the primary round own a second provider-error branch. */
async function runInventoryAudit(args: {
  readonly deps: RpgRoundsDeps;
  readonly round: ForcedToolRoundInput;
  readonly prose: ProseOverrides;
  readonly tools: ForcedToolRoundInput["tools"];
  readonly turnId: ChatTurnId;
}): Promise<readonly RpgToolCall[]> {
  const { chatId, connection } = args.round;
  try {
    const audit = await args.deps.executor.runChatTurn(
      toForcedToolRoundRequest({ ...args.round, systemPrompt: resolveProseText("rpg.extract.plane.inventory", args.prose), tools: args.tools }),
    );
    logToolRoundUsage({ chatId, api: connection.api, pass: "inventory-audit", result: audit });
    const calls = audit.toolCalls ?? [];
    args.deps.trace?.({ phase: "tool", chatId, turnId: args.turnId, vehicle: "cheap inventory audit", calls: recordToolCalls(calls) });
    return calls;
  } catch (err) {
    if (err instanceof GenerationObservationPersistenceError) {
      throw err;
    }
    logger.warn({ event: "rpg.inventory-audit.failed", chatId, model: connection.model, api: connection.api, err }, "rpg inventory audit failed");
    return [];
  }
}

/** The round's calls plus the selective inventory pass's, when {@link needsInventoryAudit} says the beat earned one. */
export async function withInventoryAudit(args: {
  readonly deps: RpgRoundsDeps;
  readonly round: ForcedToolRoundInput;
  readonly prose: ProseOverrides;
  readonly wireTools: ForcedToolRoundInput["tools"];
  readonly turnId: ChatTurnId;
  readonly baseState: RpgSnapshotState;
  readonly transcript: readonly RpgTurnTranscriptMessage[];
  readonly calls: readonly RpgToolCall[];
}): Promise<readonly RpgToolCall[]> {
  if (!needsInventoryAudit(args.baseState, args.transcript, args.calls)) {
    return args.calls;
  }
  const tools = args.wireTools.filter((tool) => tool.name === "update_inventory" || tool.name === RPG_NO_CHANGES_TOOL);
  return [...args.calls, ...(await runInventoryAudit({ deps: args.deps, round: args.round, prose: args.prose, tools, turnId: args.turnId }))];
}

/** The dedicated round's shared tail, whichever vehicle carried the calls: fold them → an RpgExtraction → the
 *  SAME state delta the structured arm produces (`no_changes` and any unknown tool contribute nothing — the
 *  quiet-turn no-op). A call the fold threw away is NAMED, the same way the folded arm names its drops (EXT-4a:
 *  equal drop semantics means equal VISIBILITY too — the dedicated round was the one vehicle that dropped silently). */
export async function foldRoundCalls(
  deps: RpgRoundsDeps,
  args: {
    readonly chatId: ChatId;
    readonly conn: Resolved<"chat">;
    readonly baseState: RpgSnapshotState;
    readonly refs: ExtractionRefs;
    readonly calls: readonly RpgToolCall[];
    readonly trackerDefs: readonly RpgTrackerDef[];
    /** A structured patch reply's entries that never formed a call: already `dropped` rows, recorded after the calls. */
    readonly unassembled?: readonly RpgRecordedToolCall[] | undefined;
    readonly vehicle: string;
    readonly events?: { readonly unparseable: string; readonly stripped: string } | undefined;
  },
): Promise<RpgStateDelta> {
  const { chatId, conn, baseState, refs, calls, trackerDefs } = args;
  logToolCallLosses({ chatId, model: conn.model, api: conn.api, calls, vehicle: args.vehicle, events: args.events });
  const extraction = toolCallsToExtraction(calls);
  const participantIndex = buildActorRefIndex(await deps.rpgChatOps.resolveRpgParticipants(chatId));
  const delta = extractionToStateDelta(baseState, extraction, createExtractionMints(deps.idSource), { participantIndex, trackerDefs });
  logExtractionOutcome({
    chatId,
    model: conn.model,
    api: conn.api,
    actorRefs: refs.actorRefs.length,
    base: baseState,
    participantIndex,
    parsed: extraction,
    delta,
  });
  return { ...delta, recordedToolCalls: [...recordToolCalls(calls), ...(args.unassembled ?? [])] };
}

/** How each shape's reply decodes back to tool calls — a mapped Record, so a new shape without a decoder fails tsc.
 *  The patch list decodes against the round's own tools (their field paths, types and per-call enums). */
const STRUCTURED_DECODERS: Readonly<Record<RpgStructuredRoundShape, (value: unknown, tools: readonly RpgStateRoundTool[]) => RpgStructuredChanges | null>> = {
  union: (value) => structuredChangesToToolCalls(value),
  patch: patchChangesToToolCalls,
};

/** One shape's response schema for a set of round tools. */
function shapeSchema(shape: RpgStructuredRoundShape, refs: ExtractionRefs, tools: readonly RpgStateRoundTool[]): WireReady {
  return shape === "union"
    ? stateRoundChangesSchema(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs), tools)
    : projectJsonSchema(stateRoundPatchSchema(tools));
}

/** Each shape's frame slot: the union lists whole calls, the patch list single fields. */
const STRUCTURED_FRAMES: Readonly<Record<RpgStructuredRoundShape, ProseSlotId>> = {
  union: "rpg.extract.structuredRoundFrame",
  patch: "rpg.extract.patchRoundFrame",
};

/** The round's two structured schemas and the planner's answers for this connection, the schemas built at most
 *  once and only when a caller asks: a tool row that never needs a structured round never projects either. The
 *  shape is the first candidate the plan fits, in `RPG_STRUCTURED_ROUND_SHAPES` order. */
export function structuredShapes(
  conn: Resolved<"chat">,
  refs: ExtractionRefs,
  tools: readonly RpgStateRoundTool[],
): { readonly schemas: () => Readonly<Record<RpgStructuredRoundShape, WireReady>>; readonly plans: StateRoundPlans } {
  let schemas: Readonly<Record<RpgStructuredRoundShape, WireReady>> | undefined;
  const built = (): Readonly<Record<RpgStructuredRoundShape, WireReady>> => {
    schemas ??= { union: shapeSchema("union", refs, tools), patch: shapeSchema("patch", refs, tools) };
    return schemas;
  };
  const structuredShape = (): RpgStructuredRoundShape | null => {
    const shapes = built();
    const plan = planStructuredFor(conn, { formats: RPG_STRUCTURED_ROUND_SHAPES.map((shape) => ({ name: STATE_CHANGES_SCHEMA_NAME, schema: shapes[shape] })) });
    return plan.ok && plan.shape !== undefined ? (RPG_STRUCTURED_ROUND_SHAPES[plan.shape] ?? null) : null;
  };
  return { schemas: built, plans: { toolRoundForced: forcesToolRound(conn, tools), structuredShape } };
}

/** Build the structured round in `shape`. The system prompt is `lead` (the tool round's own header, plane teaching
 *  and refs — or the inventory audit's plane) plus the shape's frame and every tool with its description and, for the
 *  patch list, the field paths it may name. They ride the prompt because a grammar-only wire (Ollama `format`) never
 *  shows the model the schema. */
export function structuredRound(
  shape: RpgStructuredRoundShape,
  schema: WireReady,
  tools: readonly RpgStateRoundTool[],
  frame: { readonly lead: string; readonly prose: ProseOverrides },
): StructuredRound {
  const toolLines = tools.map((tool) =>
    shape === "patch" && tool.name !== RPG_NO_CHANGES_TOOL
      ? `${tool.name}: ${tool.description}\n  fields: ${describePatchFields(tool).join(", ")}`
      : `${tool.name}: ${tool.description}`,
  );
  const framing = [resolveProseText(STRUCTURED_FRAMES[shape], frame.prose), ...toolLines].join("\n");
  return {
    shape,
    tools,
    format: { name: STATE_CHANGES_SCHEMA_NAME, schema },
    systemPrompt: [frame.lead, framing].join("\n\n"),
  };
}

/** What one structured state call came back with. */
type StructuredCalls =
  | { readonly kind: "calls"; readonly calls: readonly RpgToolCall[]; readonly unassembled: readonly RpgRecordedToolCall[] }
  | { readonly kind: "failed"; readonly err: unknown }
  | { readonly kind: "cancelled" };

/** Ask for one structured state reply and decode it to tool calls. A provider throw and a reply outside the shape
 *  are both `failed` (logged on the caller's own events); a cancel read off the signal is not a failure. Entries that
 *  were not a change, and patch entries that could not form an argument, are warned about by name. */
export async function requestStructuredCalls(
  deps: RpgRoundsDeps,
  args: {
    readonly conn: Resolved<"chat">;
    readonly chatId: ChatId;
    readonly signal: AbortSignal | undefined;
    readonly userPrompt: string;
    readonly round: StructuredRound;
    readonly events: { readonly failed: string; readonly unparseable: string };
  },
): Promise<StructuredCalls> {
  const { conn, chatId, signal, round } = args;
  const line = { chatId, model: conn.model, api: conn.api, vehicle: STRUCTURED_ROUND_VEHICLE, shape: round.shape };
  let text: string;
  try {
    text = await runStructuredChat(deps.executor, {
      connection: conn,
      chatId,
      systemPrompt: round.systemPrompt,
      userPrompt: args.userPrompt,
      responseFormat: round.format,
      signal,
    });
  } catch (err) {
    if (err instanceof GenerationObservationPersistenceError) {
      throw err;
    }
    if (signal !== undefined && isCancelled(signal)) {
      logCancelled({ chatId, model: conn.model, api: conn.api, vehicle: STRUCTURED_ROUND_VEHICLE, preflight: false });
      return { kind: "cancelled" };
    }
    logger.warn({ event: args.events.failed, ...line, err }, "rpg structured state round failed");
    return { kind: "failed", err };
  }
  let changes: RpgStructuredChanges | null;
  // A decoder fault on model output is this round's warned `failed`, never an exception out of the flush.
  try {
    changes = STRUCTURED_DECODERS[round.shape](safeJson(text), round.tools);
  } catch (err) {
    logger.warn({ event: args.events.unparseable, ...line, err }, "rpg structured state round: the reply could not be decoded — nothing applied");
    return { kind: "failed", err };
  }
  // A reply that addresses none of the round's tools (every entry unreadable, or only tools the round does not offer)
  // has no usable call: it is the round failing, never a quiet beat, as an empty downgraded tool round is retried.
  // A reply whose values were all refused still addressed real tools: those are recorded drops.
  const offered = new Set(round.tools.map((tool) => tool.name));
  if (changes === null || ![...changes.calls, ...changes.unassembled].some((call) => offered.has(call.name))) {
    logger.warn({ event: args.events.unparseable, ...line }, "rpg structured state round: the reply was not a list of changes — nothing applied");
    return { kind: "failed", err: new Error(STRUCTURED_REPLY_UNREADABLE) };
  }
  if (changes.unreadable > 0 || changes.dropped.length > 0) {
    logger.warn(
      { event: args.events.unparseable, ...line, unreadableEntries: changes.unreadable, droppedFields: changes.dropped },
      "rpg structured state round: entries that were not a change, or could not be placed in a call, were DROPPED (every other change still applies)",
    );
  }
  return { kind: "calls", calls: changes.calls, unassembled: changes.unassembled };
}

/** The cheap round as ONE structured call (the primary vehicle, or the retry after an empty downgraded tool round),
 *  then the shared tail. `priorCalls` are the retried round's own calls, kept on the record beside the new ones. */
export async function runStructuredStateRound(
  deps: RpgRoundsDeps,
  args: {
    readonly input: Parameters<RpgRunToolRound>[0];
    readonly refs: ExtractionRefs;
    readonly round: StructuredRound;
    readonly userPrompt: string;
    readonly priorCalls: readonly RpgToolCall[];
  },
): Promise<RpgStateDelta> {
  const { chatId, turnId, baseState, turnConnection, signal } = args.input;
  const conn = turnConnection.connection;
  const result = await requestStructuredCalls(deps, {
    conn,
    chatId,
    signal,
    userPrompt: args.userPrompt,
    round: args.round,
    events: { failed: "rpg.toolround.failed", unparseable: "rpg.toolround.unparseable" },
  });
  if (result.kind === "cancelled") {
    return { statePatch: {}, journal: [] };
  }
  if (result.kind === "failed") {
    return { statePatch: {}, journal: [], failure: roundFailure(result.err) };
  }
  deps.trace?.({ phase: "tool", chatId, turnId, vehicle: STRUCTURED_ROUND_VEHICLE, calls: [...recordToolCalls(result.calls), ...result.unassembled] });
  const answered = [...args.priorCalls, ...result.calls];
  const audit = needsInventoryAudit(baseState, turnConnection.transcript, answered)
    ? await structuredInventoryAudit(deps, { input: args.input, refs: args.refs, round: args.round, userPrompt: args.userPrompt })
    : { calls: [], unassembled: [] };
  return await foldRoundCalls(deps, {
    chatId,
    conn,
    baseState,
    refs: args.refs,
    calls: [...answered, ...audit.calls],
    trackerDefs: args.input.trackerDefs,
    unassembled: [...result.unassembled, ...audit.unassembled],
    vehicle: STRUCTURED_ROUND_VEHICLE,
  });
}

/** The selective inventory pass ({@link needsInventoryAudit}) in the round's own structured shape: the same narrowed
 *  tools and plane prompt the tool round's audit uses. Its failure costs only the audit, as on the tool round. */
async function structuredInventoryAudit(
  deps: RpgRoundsDeps,
  args: { readonly input: Parameters<RpgRunToolRound>[0]; readonly refs: ExtractionRefs; readonly round: StructuredRound; readonly userPrompt: string },
): Promise<{ readonly calls: readonly RpgToolCall[]; readonly unassembled: readonly RpgRecordedToolCall[] }> {
  const { chatId, turnId, turnConnection, signal } = args.input;
  const prose = turnConnection.prose;
  const tools = args.round.tools.filter((tool) => tool.name === "update_inventory" || tool.name === RPG_NO_CHANGES_TOOL);
  const round = structuredRound(args.round.shape, shapeSchema(args.round.shape, args.refs, tools), tools, {
    lead: resolveProseText("rpg.extract.plane.inventory", prose),
    prose,
  });
  const result = await requestStructuredCalls(deps, {
    conn: turnConnection.connection,
    chatId,
    signal,
    userPrompt: args.userPrompt,
    round,
    events: { failed: "rpg.inventory-audit.failed", unparseable: "rpg.inventory-audit.unparseable" },
  });
  if (result.kind !== "calls") {
    return { calls: [], unassembled: [] };
  }
  deps.trace?.({ phase: "tool", chatId, turnId, vehicle: "structured inventory audit", calls: [...recordToolCalls(result.calls), ...result.unassembled] });
  return { calls: result.calls, unassembled: result.unassembled };
}
