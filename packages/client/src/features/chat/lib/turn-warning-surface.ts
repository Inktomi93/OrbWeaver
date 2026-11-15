// The chat `warning` seam as the bus reducer's three callbacks: every warning goes through the turn cadence,
// and what the cadence releases becomes a notice. One factory so the room and its CT drive the same path.
//
// A skipped host regex script names its script by id only, so the surface looks the id up in the host's own library
// before it speaks: the notice names it, and the stop store marks it on the room's roster by id and pattern. An id
// the library no longer holds is named as such and marks nothing. A turn's scripts past the server's naming cap arrive
// as one count with no id, which adds to the same notice; the bus's seq guard keeps a replayed one from adding twice.

import type { ChatRegexNotAppliedWarning, ChatWarning } from "@orb/contracts/chat";
import { REGEX_NOT_APPLIED_OVERFLOW_CODE, REGEX_SCRIPT_NOT_APPLIED_CODE } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { ChatBusDeps } from "#data";
import type { NotifyAction, NotifyNotice } from "#lib";
import { noteServerStoppedScript } from "#lib";
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
  /** The host's own script with this id, or `null` when the library does not hold it or cannot be read. */
  readonly scriptOf: (scriptId: RegexScriptId) => Promise<Pick<RegexScriptRow, "id" | "name" | "findRegex"> | null>;
}

type WarningCallbacks = Required<Pick<ChatBusDeps, "onWarning" | "onTurnStarted" | "onTurnSettled">>;

export function createWarningSurface(deps: WarningSurfaceDeps): WarningCallbacks {
  const cadence = createTurnWarningCadence();
  const actionFor = new Map<ChatWarning["code"], NotifyAction>([
    ["custom_parameters_ignored", deps.openConnections],
    ["smart_arbitration_degraded", deps.openUtilityModel],
    ["speaker_rerank_unavailable", deps.openRerankModel],
  ]);
  const raise = (notice: NotifyNotice, warnings: readonly ChatWarning[]): void => {
    const action = warnings.map((warning) => actionFor.get(warning.code)).find((found) => found !== undefined);
    deps.warn(action === undefined ? notice : { ...notice, action });
  };
  // Each skipped script's latest report this session, by id, in the order first reported.
  const skipped = new Map<RegexScriptId, { readonly name: string | null } & Pick<ChatRegexNotAppliedWarning, "cause" | "pass">>();
  // The scripts this session's turns reported past the naming cap.
  let more = 0;
  const raiseRegexNotice = (): void => {
    deps.warn({ ...regexNotAppliedNotice([...skipped.values()], more), action: deps.openThisChat });
  };
  const raiseSkipped = async (warning: ChatRegexNotAppliedWarning): Promise<void> => {
    const script = await deps.scriptOf(warning.scriptId);
    if (script !== null) {
      noteServerStoppedScript(script, warning.cause, warning.pass);
    }
    skipped.set(warning.scriptId, { name: script?.name ?? null, cause: warning.cause, pass: warning.pass });
    raiseRegexNotice();
  };
  return {
    onTurnStarted: (chatId, turn): void => cadence.turnStarted(chatId, `${turn.provider}\u0000${turn.model}`),
    onWarning: (warning, chatId): void => {
      const now = cadence.warning(chatId, warning);
      if (now === null) {
        return;
      }
      if (now.code === REGEX_NOT_APPLIED_OVERFLOW_CODE) {
        more += now.count;
        raiseRegexNotice();
        return;
      }
      if (now.code === REGEX_SCRIPT_NOT_APPLIED_CODE) {
        // `scriptOf` settles to null on a failed read, so a rejection here is this module's own defect.
        raiseSkipped(now).catch(globalThis.reportError);
        return;
      }
      raise(warningNotice(now), [now]);
    },
    onTurnSettled: (chatId): void => {
      const drops = cadence.turnSettled(chatId);
      if (drops !== null) {
        raise(turnDropsNotice(drops), drops);
      }
    },
  };
}
