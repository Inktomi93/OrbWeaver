// Unit: the turn-warning cadence (features/chat/lib/turn-warning-cadence). One notice per turn, raised only
// when that turn's drops differ from the previous turn's on the same connection; standing conditions once per
// session; events of one turn alone every time. The rendered half is `turn-warning-cadence.ct.tsx`.

import type { ChatWarning } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTurnWarningCadence } from "../../../../../packages/client/src/features/chat/lib/turn-warning-cadence.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_ctcadence0000000001");
const SONNET = "openrouter\u0000anthropic/claude-sonnet-5";
const QWEN = "vllm\u0000Qwen/Qwen3-32B";

const TOP_P: ChatWarning = { code: "settings_adjusted", adjustment: "sampling_knob_dropped", knob: "topP" };
const EFFORT: ChatWarning = { code: "settings_adjusted", adjustment: "effort_dropped" };

/** One whole turn on `connection`: start, each warning, settle. Returns what reached the user. */
function turn(
  cadence: ReturnType<typeof createTurnWarningCadence>,
  connection: string,
  warnings: readonly ChatWarning[],
): { readonly now: readonly ChatWarning[]; readonly grouped: readonly ChatWarning[] | null } {
  cadence.turnStarted(CHAT, connection);
  const now = warnings.map((warning) => cadence.warning(CHAT, warning)).filter((warning): warning is ChatWarning => warning !== null);
  return { now, grouped: cadence.turnSettled(CHAT) };
}

test("a turn's drops are held and released together, once, when the turn settles", () => {
  const cadence = createTurnWarningCadence();
  expect(turn(cadence, SONNET, [TOP_P, EFFORT])).toEqual({ now: [], grouped: [EFFORT, TOP_P] });
});

test("the same drops again on the same connection raise nothing, in any order and with repeats", () => {
  const cadence = createTurnWarningCadence();
  turn(cadence, SONNET, [TOP_P, EFFORT]);
  expect(turn(cadence, SONNET, [EFFORT, TOP_P, EFFORT]).grouped).toBeNull();
});

test("a changed set raises the new set, and a connection keeps its own history", () => {
  const cadence = createTurnWarningCadence();
  turn(cadence, SONNET, [TOP_P]);
  expect(turn(cadence, QWEN, [TOP_P]).grouped).toEqual([TOP_P]);
  expect(turn(cadence, SONNET, [TOP_P, EFFORT]).grouped).toEqual([EFFORT, TOP_P]);
  // A clean turn resets the baseline without a notice, so the drops returning are news again.
  expect(turn(cadence, SONNET, []).grouped).toBeNull();
  expect(turn(cadence, SONNET, [TOP_P]).grouped).toEqual([TOP_P]);
});

test("an event of one turn alone is raised every time, and a standing condition once per session", () => {
  const cadence = createTurnWarningCadence();
  const refused: ChatWarning = { code: "provider_refused" };
  const background: ChatWarning = { code: "background_task_degraded" };
  expect(turn(cadence, SONNET, [refused, background]).now).toEqual([refused, background]);
  expect(turn(cadence, SONNET, [refused, background]).now).toEqual([refused]);
});

test("a grouped drop with no turn this tab saw start is raised at once rather than lost", () => {
  const cadence = createTurnWarningCadence();
  expect(cadence.warning(CHAT, TOP_P)).toEqual(TOP_P);
  expect(cadence.turnSettled(CHAT)).toBeNull();
});
