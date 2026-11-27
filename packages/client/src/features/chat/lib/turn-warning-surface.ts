// The chat `warning` seam as the bus reducer's three callbacks: every warning goes through the turn cadence,
// and what the cadence releases becomes a notice. One factory so the room and its CT drive the same path.
//
// A skipped host regex script names its script by id only, so the surface looks the id up in the host's own library
// before it speaks: the notice names it, and the stop store marks it on the room's roster by id and pattern. An id
// the library no longer holds is named as such and marks nothing. A turn's scripts past the server's naming cap arrive
// as one count with no id, so a later turn reports the same count again under a new seq: the notice shows the latest
// turn's count, never a sum, and a count raises it again only when it is above the last one shown. A script whose row is
// on screen reads its stop inline, so its report raises no notice.
//
// A turn's drops are said once per PRESET AND CONNECTION PAIR (`turn-warning-cadence.ts`). The turn runs the host's
// default preset, which only the host's client can read, so a member's pair carries no preset and a member's notice has
// no Params door. The room bus names the turn's provider and model and no connection row, so two rows on one provider
// and model are one connection here.

import type { ChatRegexNotAppliedWarning, ChatSettingsAdjustedWarning, ChatWarning } from "@orb/contracts/chat";
import { REGEX_NOT_APPLIED_OVERFLOW_CODE, REGEX_SCRIPT_NOT_APPLIED_CODE, SETTINGS_ADJUSTED_CODE } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ChatId, PresetId, RegexScriptId } from "@orb/kit/ids";
import type { ChatBusDeps } from "#data";
import type { NotifyAction, NotifyNotice } from "#lib";
import { isStopRowShown, noteServerStoppedScript } from "#lib";
import type { PresetKnobTarget } from "#state";
import { createTurnWarningCadence } from "./turn-warning-cadence.ts";
import { regexNotAppliedNotice, turnDropsNotice, warningNotice } from "./warning-notice.ts";

/** The next step a notice can offer, by what it is about: custom parameters are a connection property, and a
 *  Smart pick that fell back is fixed where its picker model is bound. */
export interface WarningSurfaceDeps {
  readonly warn: (notice: NotifyNotice) => void;
  readonly openConnections: NotifyAction;
  readonly openUtilityModel: NotifyAction;
  readonly openRerankModel: NotifyAction;
  /** Opens the room's This chat tab, whose Regex section lists a skipped script with its reason. */
  readonly openThisChat: NotifyAction;
  /** Lands on one script's row in that Regex section. */
  readonly openScriptRow: (scriptId: RegexScriptId) => NotifyAction;
  /** The preset the host's turns run (their default), or `null` for the built-in default or a viewer who is not the host. The
   *  bus carries neither the preset nor a connection row, and a member cannot read the host's preset. */
  readonly presetOf: (chatId: ChatId) => PresetId | null;
  /** Opens a preset's editor on its Params view, landing on `knob` when one is named. */
  readonly openParams: (presetId: PresetId, knob?: PresetKnobTarget) => NotifyAction;
  /** The host's own script with this id, or `null` when the library does not hold it or cannot be read. */
  readonly scriptOf: (scriptId: RegexScriptId) => Promise<Pick<RegexScriptRow, "id" | "name" | "findRegex"> | null>;
}

// Joins the preset and connection into the cadence's pair key; no id, provider or model holds a NUL.
const PAIR_SEPARATOR = "\u0000";

type WarningCallbacks = Required<Pick<ChatBusDeps, "onWarning" | "onTurnStarted" | "onTurnSettled">>;

export function createWarningSurface(deps: WarningSurfaceDeps): WarningCallbacks {
  const cadence = createTurnWarningCadence();
  const actionFor = new Map<ChatWarning["code"], NotifyAction>([
    ["custom_parameters_ignored", deps.openConnections],
    ["smart_arbitration_degraded", deps.openUtilityModel],
    ["speaker_rerank_unavailable", deps.openRerankModel],
  ]);
  // A dropped setting is the preset's: its notice offers the preset's Params, for the host who owns that preset. A banned
  // phrase list the server cannot ban as written is fixed in its own knob, so the door lands there.
  const paramsDoor = (warnings: readonly ChatWarning[], chatId: ChatId): NotifyAction | undefined => {
    const presetId = deps.presetOf(chatId);
    if (presetId === null || !warnings.some(namesParamsSetting)) {
      return undefined;
    }
    return warnings.some(isUnbannablePhrases) ? deps.openParams(presetId, BANNED_PHRASES_KNOB) : deps.openParams(presetId);
  };
  // A tokenizer that could not answer is the connection's to fix, for the host and a member alike.
  const tokenizerDoor = (warnings: readonly ChatWarning[]): NotifyAction | undefined => (warnings.some(isUnansweredPhrases) ? deps.openConnections : undefined);
  const raise = (notice: NotifyNotice, warnings: readonly ChatWarning[], chatId: ChatId): void => {
    const action =
      warnings.map((warning) => actionFor.get(warning.code)).find((found) => found !== undefined) ?? tokenizerDoor(warnings) ?? paramsDoor(warnings, chatId);
    deps.warn(action === undefined ? notice : { ...notice, action });
  };
  // Each skipped script's latest report this session, by id, in the order first reported.
  const skipped = new Map<RegexScriptId, { readonly name: string | null } & Pick<ChatRegexNotAppliedWarning, "cause" | "pass">>();
  // The latest turn's count of scripts past the naming cap, and the count the notice last showed.
  let more = 0;
  let shownMore = 0;
  const raiseRegexNotice = (): void => {
    shownMore = more;
    // The notice names the newest script, so its action lands on that script's row; a script the library no longer
    // holds has no row, and a count alone names none.
    const [newest] = [...skipped].reverse();
    const action = newest === undefined || newest[1].name === null ? deps.openThisChat : deps.openScriptRow(newest[0]);
    deps.warn({ ...regexNotAppliedNotice([...skipped.values()], more), action });
  };
  const raiseSkipped = async (warning: ChatRegexNotAppliedWarning): Promise<void> => {
    const script = await deps.scriptOf(warning.scriptId);
    if (script !== null) {
      noteServerStoppedScript(script, warning.cause, warning.pass);
    }
    skipped.set(warning.scriptId, { name: script?.name ?? null, cause: warning.cause, pass: warning.pass });
    // A row on screen shows this stop inline, so a notice beside it would say it twice.
    if (script === null || !isStopRowShown(script)) {
      raiseRegexNotice();
    }
  };
  return {
    onTurnStarted: (chatId, turn): void => cadence.turnStarted(chatId, [deps.presetOf(chatId) ?? "", turn.provider, turn.model].join(PAIR_SEPARATOR)),
    onWarning: (warning, chatId): void => {
      const now = cadence.warning(chatId, warning);
      if (now === null) {
        return;
      }
      if (now.code === REGEX_NOT_APPLIED_OVERFLOW_CODE) {
        more = now.count;
        if (more > shownMore) {
          raiseRegexNotice();
        }
        return;
      }
      if (now.code === REGEX_SCRIPT_NOT_APPLIED_CODE) {
        // `scriptOf` settles to null on a failed read, so a rejection here is this module's own defect.
        raiseSkipped(now).catch(globalThis.reportError);
        return;
      }
      raise(warningNotice(now), [now], chatId);
    },
    onTurnSettled: (chatId): void => {
      const drops = cadence.turnSettled(chatId);
      if (drops !== null) {
        raise(turnDropsNotice(drops), drops, chatId);
      }
    },
  };
}

const BANNED_PHRASES_KNOB = "bannedStrings" satisfies PresetKnobTarget;

/** Banned phrases the server cannot ban as written: the preset's list is what to change. */
function isUnbannablePhrases(warning: ChatWarning): boolean {
  return warning.code === SETTINGS_ADJUSTED_CODE && warning.knob === BANNED_PHRASES_KNOB && warning.cause === "sequence";
}

/** Banned phrases the server's tokenizer could not check: the connection's tokenize endpoint is what to fix. */
function isUnansweredPhrases(warning: ChatWarning): boolean {
  return warning.code === SETTINGS_ADJUSTED_CODE && warning.knob === BANNED_PHRASES_KNOB && warning.cause === "tokenizer";
}

/** Does this warning name a setting the preset's Params holds? */
function namesParamsSetting(warning: ChatWarning): boolean {
  return warning.code === SETTINGS_ADJUSTED_CODE && adjustmentNamesParamsSetting(warning.adjustment);
}

/** Total over the adjustment classes, so a new class fails `tsc` until it says whether Params can fix it: the rest are
 *  tool, cache and prompt-shape facts of the connection or the turn. */
function adjustmentNamesParamsSetting(adjustment: ChatSettingsAdjustedWarning["adjustment"]): boolean {
  switch (adjustment) {
    case "sampling_knob_dropped":
    case "sampling_knob_conflict":
    case "effort_dropped":
    case "adaptive_budget_dropped":
    case "display_dropped":
    case "verbosity_dropped":
    case "reasoning_mandatory_clamp":
    case "reasoning_budget_clamped":
    case "carry_reasoning_downgraded":
    case "provider_compatibility_mode":
      return true;
    case "dynamic_context_demoted":
    case "tool_result_error_dropped":
    case "reasoning_dropped_for_prefill":
    case "prefill_reasoning_dropped":
    case "prefill_suppressed_by_tools":
    case "tool_choice_downgraded":
    case "cache_control_adjusted":
      return false;
    default:
      return assertNeverAdjustment(adjustment);
  }
}

function assertNeverAdjustment(adjustment: never): never {
  throw new Error(`namesParamsSetting: unhandled adjustment ${JSON.stringify(adjustment)}`);
}
