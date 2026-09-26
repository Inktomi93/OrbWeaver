// The turn-warning CADENCE (inference program §5.3a): the engine emits one `warning` event per drop, so a
// turn's drops are held until the turn settles and raised as ONE notice, and only when the set differs from
// the previous turn's on the same connection — the turn's provider and model, which is what the room bus carries.

import type { ChatWarning, ChatWarningCode } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";

const CADENCES = ["each", "turn-grouped", "once-per-session"] as const;
type Cadence = (typeof CADENCES)[number];

/** How often each code may reach the user. `turn-grouped` is a per-turn drop the same settings repeat every
 *  turn; `once-per-session` is a standing condition of the account; `each` is an event of this turn alone.
 *  Exhaustive: a new `ChatWarningCode` fails `tsc` here until it is classified. */
function cadenceOf(code: ChatWarningCode): Cadence {
  switch (code) {
    case "settings_adjusted":
    case "image_dropped":
    case "video_dropped":
    case "tools_unsupported":
    case "structured_output_unsupported":
    case "guided_placed_as_injection":
    case "custom_parameters_ignored":
      return "turn-grouped";
    case "background_task_degraded":
    case "smart_arbitration_degraded":
      return "once-per-session";
    case "memory_build_failed":
    case "memory_rerank_unavailable":
    case "retrieval_index_unavailable":
    case "prompt_transform_skipped":
    case "image_edit_dropped":
    case "compaction_failed":
    case "context_trimmed_no_summary":
    case "provider_refused":
    case "reply_image_failed":
      return "each";
    default:
      return assertNeverCode(code);
  }
}

function assertNeverCode(code: never): never {
  throw new Error(`cadenceOf: unhandled ChatWarningCode ${JSON.stringify(code)}`);
}

export interface TurnWarningCadence {
  /** A turn began on this chat; `connectionKey` names what it runs on. */
  readonly turnStarted: (chatId: ChatId, connectionKey: string) => void;
  /** One `warning` event. Returns the warning to raise now, or `null` when it is held or already said. */
  readonly warning: (chatId: ChatId, warning: ChatWarning) => ChatWarning | null;
  /** The turn ended (completed or aborted). Returns the turn's held drops when they differ from the previous
   *  turn's on the same connection, else `null`. */
  readonly turnSettled: (chatId: ChatId) => readonly ChatWarning[] | null;
}

interface OpenTurn {
  readonly connectionKey: string;
  readonly held: ChatWarning[];
}

export function createTurnWarningCadence(): TurnWarningCadence {
  const open = new Map<ChatId, OpenTurn>();
  const lastSetByConnection = new Map<string, string>();
  const saidThisSession = new Set<ChatWarningCode>();

  return {
    turnStarted: (chatId, connectionKey): void => {
      open.set(chatId, { connectionKey, held: [] });
    },
    warning: (chatId, warning): ChatWarning | null => {
      const cadence = cadenceOf(warning.code);
      if (cadence === "once-per-session") {
        if (saidThisSession.has(warning.code)) {
          return null;
        }
        saidThisSession.add(warning.code);
        return warning;
      }
      const turn = open.get(chatId);
      // A grouped drop outside any turn this tab saw start (a reconnect mid-turn) has no set to compare with.
      if (cadence === "each" || turn === undefined) {
        return warning;
      }
      turn.held.push(warning);
      return null;
    },
    turnSettled: (chatId): readonly ChatWarning[] | null => {
      const turn = open.get(chatId);
      open.delete(chatId);
      if (turn === undefined) {
        return null;
      }
      const drops = distinctDrops(turn.held);
      const signature = JSON.stringify(drops.map(([key]) => key));
      const previous = lastSetByConnection.get(turn.connectionKey);
      lastSetByConnection.set(turn.connectionKey, signature);
      // A clean first turn sets the baseline silently; a clean turn after drops is a change worth nothing to say.
      if (drops.length === 0 || signature === previous) {
        return null;
      }
      return drops.map(([, warning]) => warning);
    },
  };
}

/** The set, order-free and duplicate-free: the same drops in another order are the same set. */
function distinctDrops(warnings: readonly ChatWarning[]): readonly (readonly [string, ChatWarning])[] {
  const byKey = new Map(warnings.map((warning): [string, ChatWarning] => [stableStringify(warning), warning]));
  return [...byKey.entries()].toSorted(([a], [b]) => (a < b ? -1 : 1));
}
