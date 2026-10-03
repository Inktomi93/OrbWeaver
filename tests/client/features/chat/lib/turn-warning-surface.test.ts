// Unit: the chat warning seam (features/chat/lib/turn-warning-surface). Each notice carries the one next step that
// fixes it: a Smart pick that fell back opens the picker model's role, custom parameters open Connections, and
// anything else offers no action.

import type { ChatWarning } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWarningSurface } from "../../../../../packages/client/src/features/chat/lib/turn-warning-surface.ts";
import type { NotifyAction, NotifyNotice } from "../../../../../packages/client/src/lib/notify.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_ctsurface000000001");
const action = (label: string): NotifyAction => ({ label, onClick: (): void => undefined });
const DEPS = { openConnections: action("connections"), openUtilityModel: action("utility"), openRerankModel: action("rerank") } as const;

function raisedFor(warning: ChatWarning): NotifyNotice | undefined {
  const raised: NotifyNotice[] = [];
  const surface = createWarningSurface({ ...DEPS, warn: (notice): void => void raised.push(notice) });
  surface.onWarning(warning, CHAT);
  return raised[0];
}

test("a Smart pick that fell back offers the door to the model it needed", () => {
  expect(raisedFor({ code: "smart_arbitration_degraded" })?.action).toBe(DEPS.openUtilityModel);
  expect(raisedFor({ code: "speaker_rerank_unavailable" })?.action).toBe(DEPS.openRerankModel);
});

test("custom parameters still open Connections, and a notice with no fix offers no action", () => {
  expect(raisedFor({ code: "custom_parameters_ignored" })?.action).toBe(DEPS.openConnections);
  expect(raisedFor({ code: "compaction_failed" })?.action).toBeUndefined();
});
