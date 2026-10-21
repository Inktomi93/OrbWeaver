// The state rounds' observability and failure vocabulary: one home for every loss, strip, cancel and fallback line,
// so a degrade reads identically whichever vehicle carried the calls.

import type { ChatApi } from "@orb/contracts/inference";
import type { RpgExtraction, RpgSnapshotState, RpgStateCaptureVehicle, RpgStructuredRoundShape, RpgToolCall } from "@orb/contracts/rpg";
import { healedJournalTypes, malformedToolCallDetails, RPG_STATE_ROUND_FAILED_SUMMARY, salvagedToolCallFields, strippedToolCallKeys } from "@orb/contracts/rpg";
import type { ChatResult } from "@orb/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { ChatId } from "@orb/kit/ids";
import { logger } from "#foundation/observability";
import type { ActorRefIndex } from "#src/domain/rpg/contract/params.ts";
import { ghostTargetRefs } from "../apply.ts";

/** The warn a game's unavailable structured vehicle raises, and the code that names why. */
const STATE_VEHICLE_FALLBACK_EVENT = "rpg.toolround.vehicle_fallback";

const STRUCTURED_UNAVAILABLE_CODE = "structured-unavailable";

/** R3 — the extraction-outcome visibility log, and the ONE TAIL all three delivery vehicles run through (so a
 *  degrade reads identically whichever way the calls arrived). Emits a line when the delta writes NOTHING
 *  renderable (the silent-empty-panel signal), whenever the extraction named a GHOST actor (a target with no
 *  referent this turn — the R5 guard dropped its arg), and whenever a journal `type` was HEALED (EXT-4b).
 *  Metadata only (ref counts + names + indexes), never beat/reply text.
 *
 *  The lines are INDEPENDENT (not an either/or): since R5 drops the ghost args, a ghost-only extraction is
 *  precisely the case that also writes nothing — an `else if` would have hidden the cause behind the symptom. */
export function logExtractionOutcome(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: ChatApi | null;
  /** How many actors the model could legally have targeted — the denominator that makes a write-nothing line
   *  actionable ("nobody to write about" vs "targets existed and it wrote none"). The round arms pass their
   *  per-call `refs.actorRefs.length`; the FOLD passes `reachableActorRefs(base, roster).size`, the same menu
   *  derived from state it already holds — so it never re-resolves the ref bundle just to log. */
  readonly actorRefs: number;
  readonly base: RpgSnapshotState;
  readonly participantIndex: ActorRefIndex;
  readonly parsed: RpgExtraction;
  readonly delta: { readonly statePatch: Record<string, unknown>; readonly journal: readonly unknown[] };
}): void {
  // The party/inventory targets naming NOBODY reachable this turn — the SAME predicate the fold drops on (one
  // home, so the log can never disagree with what actually applied).
  const phantomTargets = ghostTargetRefs(args.base, args.parsed, args.participantIndex);
  if (phantomTargets.length > 0) {
    logger.warn(
      { event: "rpg.extraction.phantom", chatId: args.chatId, model: args.model, api: args.api, phantomTargets },
      "rpg extraction named ghost actor(s) with no live referent — those args were DROPPED (no cast mint)",
    );
  }
  // EXT-4b — the HEAL is visible. A journal entry whose `type` the model omitted is healed to `note` rather than
  // dropped (the nested-required blind spot), which is a silent quality loss unless it is named. Read off the
  // FOLDED extraction, so all three delivery paths report it identically (this function is their one tail).
  const healed = healedJournalTypes(args.parsed);
  if (healed.length > 0) {
    logger.warn(
      { event: "rpg.extraction.healed", chatId: args.chatId, model: args.model, api: args.api, healedJournalTypes: healed },
      "rpg extraction: journal entry(ies) omitted `type` — HEALED to note (the entry still applies)",
    );
  }
  const wroteNothing = Object.keys(args.delta.statePatch).length === 0 && args.delta.journal.length === 0;
  if (wroteNothing) {
    logger.warn(
      { event: "rpg.extraction.empty", chatId: args.chatId, model: args.model, api: args.api, actorRefs: args.actorRefs, phantomTargets },
      "rpg extraction wrote NOTHING renderable (mis-target or empty beat)",
    );
  }
}

/** The TOOL vehicles' loss log (EXT-4a — one home for both, so the cheap round and the folded turn can never
 *  report a loss differently). TWO classes, each with its own event and neither silent:
 *
 *   • DROPPED — the call's args were non-JSON or failed their schema; nothing of it applied
 *     (`malformedToolCalls`, mirroring the fold's silent `continue`s).
 *   • STRIPPED — the call PARSED and applied, minus one or more keys the schema never declared
 *     (`strippedToolCallKeys`). zod `z.object` is strip-mode, so an invented key (`update_party.mana` where a
 *     `trackerDeltas` entry belonged) used to land as a SUCCESS record with its write silently gone — a quiet
 *     delivery fork, banned by D112 (3). It is a WARN and not an error because the rest of the call still
 *     applied; `z.strictObject` would have cost the whole call, against EXT-4a's drop-as-little-as-possible.
 *
 *  Both are silent on the happy path. */
export function logToolCallLosses(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: ChatApi | null;
  readonly calls: readonly RpgToolCall[];
  readonly vehicle: string;
  /** The caller's event namespace, mirroring `logStrippedKeys`. Omitted ⇒ the IN-TURN namespace, which is what
   *  both turn vehicles have always emitted (their call sites are byte-unchanged); the host resync passes its
   *  own `rpg.resync.*` pair so a catch-up round's losses stay on the resync's trail. */
  readonly events?: { readonly unparseable: string; readonly stripped: string } | undefined;
}): void {
  const events = args.events ?? { unparseable: "rpg.extraction.unparseable", stripped: "rpg.extraction.stripped" };
  // The DETAIL arm, not the names one: a tool name alone is unactionable (12 identical `update_scene` drops
  // cost a live session hours before a schema probe found the offending field). `droppedIssues` carries the
  // failing path, the expectation, and the value the model actually sent.
  const droppedDetails = malformedToolCallDetails(args.calls);
  if (droppedDetails.length > 0) {
    logger.warn(
      {
        event: events.unparseable,
        chatId: args.chatId,
        model: args.model,
        api: args.api,
        droppedTools: droppedDetails.map((detail) => detail.name),
        droppedIssues: droppedDetails.flatMap((detail) => detail.issues.map((issue) => `${detail.name}.${issue}`)),
      },
      `rpg ${args.vehicle}: tool call(s) with unusable args — DROPPED (every other call this turn still applies)`,
    );
  }
  // The THIRD loss class (EXT-4a salvage): fields whose VALUES the schema rejected, dropped so the rest of
  // the call could apply. Distinct from STRIPPED (a key the schema never declared) — this one means the model
  // tried to write something real and the vocabulary had no room for it, which is how a closed enum with a
  // hole in it announces itself (`update_scene.weather` on an indoor scene).
  const salvaged = salvagedToolCallFields(args.calls);
  if (salvaged.length > 0) {
    logger.warn(
      { event: events.unparseable, chatId: args.chatId, model: args.model, api: args.api, salvagedFields: salvaged },
      `rpg ${args.vehicle}: field(s) with unusable values DROPPED — the rest of the call applied (a closed vocabulary may be missing a member)`,
    );
  }
  logStrippedKeys({ ...args, event: events.stripped, stripped: strippedToolCallKeys(args.calls) });
}

/** The STRIP log, one home for all four emitters (cheap round · folded turn · structured extraction · resync)
 *  so an invented key reads identically whichever vehicle carried it. `event` is the caller's own namespace
 *  (`rpg.extraction.stripped` / `rpg.resync.stripped`) — the resync keeps its own trail, as it does for every
 *  other class. Silent on the happy path. */
export function logStrippedKeys(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: ChatApi | null;
  readonly vehicle: string;
  readonly event: string;
  readonly stripped: readonly string[];
}): void {
  if (args.stripped.length === 0) {
    return;
  }
  logger.warn(
    { event: args.event, chatId: args.chatId, model: args.model, api: args.api, strippedKeys: args.stripped },
    `rpg ${args.vehicle}: the model sent key(s) the schema does not declare — those writes were DROPPED (everything else applied)`,
  );
}

/** The DEDICATED state round's economics record (spec §10.1a). That section's claim — "the state round's
 *  economics ARE recorded, in the provider-observability plane" — was only true for the STRUCTURED vehicles:
 *  `runStructuredTurn`'s surfaces emit `provider.structured-item` per item, and the agent-sdk arm emits
 *  `provider.turn`. The cheap tool round rides the CHAT role on a stateless backend (vLLM / OpenRouter),
 *  which emits NEITHER — so its tokens and cost left no record at all unless a wire capture happened to be
 *  armed. This is that record: same fields as the `provider.*-item` precedent (model + tokens + duration +
 *  finishReason) plus the cost the `ChatUsage` carries, emitted from the round's own vehicle so the event
 *  name says which one billed. Metadata only — never prompt/reply/extraction text. The FAILURE arm is
 *  already named by `rpg.toolround.failed` (a throw has no usage to report). */
export function logToolRoundUsage(args: {
  readonly chatId: ChatId;
  readonly api: ChatApi | null;
  readonly pass: "primary" | "inventory-audit" | "resync";
  readonly result: ChatResult;
}): void {
  const { usage } = args.result;
  logger.info(
    {
      event: "rpg.toolround.usage",
      chatId: args.chatId,
      api: args.api,
      pass: args.pass,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      reasoningTokens: usage.reasoningTokens,
      costUsd: usage.costUsd,
      durationMs: args.result.durationApiMs,
      finishReason: args.result.finishReason,
    },
    "rpg cheap tool round billed",
  );
}

/** Re-READ a signal's LIVE abort flag. Deliberately a call, not a bare `signal.aborted`: the checker models
 *  `aborted` as a plain boolean and narrows it, so the SECOND read — the one inside the `catch`, which is the
 *  read that actually decides cancelled-vs-failed — is reported as always-false dead code. In reality the flag
 *  flips ASYNCHRONOUSLY while the model call is in flight. A call keeps the re-read honest instead of
 *  suppressing a rule that is (reasonably) confused by a mutable getter. */
export function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** The CANCELLED-round line, one home for both in-turn vehicles (the caller aborted the turn while the round was
 *  queued or in flight). `info`, not `warn`: a cancellation is a correct, user-initiated outcome, and filing it
 *  beside `rpg.extraction.failed` / `rpg.toolround.failed` would poison the stream those warns exist to make
 *  readable. It is not SILENT either — a round that spent tokens and wrote nothing must be visible, and
 *  `preflight` says whether any spend happened at all (`true` = the abort beat the call, so nothing was billed).
 *  The vehicle is named because the two arms bill on different provider trails. */
export function logCancelled(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: ChatApi | null;
  readonly vehicle: string;
  readonly preflight: boolean;
}): void {
  logger.info(
    { event: "rpg.stateround.cancelled", chatId: args.chatId, model: args.model, api: args.api, vehicle: args.vehicle, preflight: args.preflight },
    args.preflight
      ? `rpg ${args.vehicle} cancelled before its model call — nothing billed, no state written`
      : `rpg ${args.vehicle} cancelled in flight (the caller aborted the turn) — no state written`,
  );
}

/** THE STATE ROUND'S FAILURE SENTENCE (#1468 item 2) — the resync/populate `*_FAILED_REASON` precedent, one
 *  vehicle down. It rides `RpgStateDelta.failure` to the flush, which settles the turn `failed` and writes it
 *  onto the turn's durable record, where the person who just played the turn reads it under "Game actions on
 *  this turn". The SUMMARY half is `contracts/rpg`'s ({@link RPG_STATE_ROUND_FAILED_SUMMARY}) because the
 *  member-facing projection serves it BARE — the provider tail appended here is host-only. Vehicle-FREE on
 *  purpose: which of the two rounds carried the call is operator vocabulary (the `rpg.toolround.failed` /
 *  `rpg.extraction.failed` warn beside each catch names it), while THIS text answers "why is my panel
 *  unchanged". */
export function roundFailure(err: unknown): string {
  return `${RPG_STATE_ROUND_FAILED_SUMMARY}: ${errorMessage(err)}`;
}

/** Parse structured-output text to a value, or `null` on non-JSON (the schema parse then fails → empty). */
export function safeJson(text: string): unknown {
  // `null` reaches the salvage decoders, which report it as a `root` drop, and
  // each caller logs a non-empty drop with `logger.warn` (`rpg.extraction.unparseable`, rounds/extraction.ts:95; the
  // other three callers log at their own sites). Ends if a caller stops logging a root drop.
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The game asked for a structured round (`stateCaptureVehicle: "structured"`) and the row cannot give one — no
 *  structured output, or no shape fits its grammar — so the round runs as tool calls. LOUD, with a named code: the
 *  host chose a vehicle and is not getting it. */
export function warnIfStructuredUnavailable(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: ChatApi | null;
  readonly vehicle: RpgStateCaptureVehicle;
}): void {
  if (args.vehicle !== "structured") {
    return;
  }
  logger.warn(
    { event: STATE_VEHICLE_FALLBACK_EVENT, code: STRUCTURED_UNAVAILABLE_CODE, chatId: args.chatId, model: args.model, api: args.api },
    "rpg state round: the game asks for a structured reply but this model cannot give one — running tool calls instead",
  );
}

/** The structured-fallback line: a tool round whose `required` went out as `auto` came back with nothing usable,
 *  so the beat is asked again as a structured round. A WARN, because it is a second billed call. */
export function logStructuredFallback(args: {
  readonly chatId: ChatId;
  readonly model: string;
  readonly api: ChatApi | null;
  readonly shape: RpgStructuredRoundShape;
  readonly calls: number;
  readonly event: string;
}): void {
  logger.warn(
    { event: args.event, chatId: args.chatId, model: args.model, api: args.api, shape: args.shape, toolCalls: args.calls },
    "rpg state round: the downgraded tool round returned no usable call — retrying once as a structured round",
  );
}
